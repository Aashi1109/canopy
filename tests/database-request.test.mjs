import { beforeAll, expect, test, vi } from "vitest";

const clients = [];
globalThis.__databaseRequestClients = clients;

// Fake pg Pool that records checkouts/commits/rollbacks per request client.
vi.mock("pg", async () => {
  const { EventEmitter } = await import("node:events");
  class Pool extends EventEmitter {
    constructor(options) {
      super();
      const clients = globalThis.__databaseRequestClients;
      Object.assign(this, {
        id: clients.length + 1,
        url: options.connectionString,
        options,
        closed: false,
        commits: 0,
        rollbacks: 0,
        queries: 0,
        checkouts: 0,
        releases: 0,
      });
      clients.push(this);
    }
    async query(config) {
      if (this.closed) throw new Error("Query after close");
      this.queries++;
      await this.gate;
      const text = typeof config === "string" ? config : config.text;
      if (text === "commit") this.commits++;
      if (text === "rollback") this.rollbacks++;
      return { rows: [{ clientId: this.id }], rowCount: 1 };
    }
    async connect() {
      this.checkouts++;
      let released = false;
      return {
        query: this.query.bind(this),
        release: () => {
          if (released) throw new Error("Client released twice");
          released = true;
          this.releases++;
        },
      };
    }
    async end() {
      if (this.checkouts !== this.releases) throw new Error("Client still checked out");
      this.closed = true;
    }
  }
  const types = { builtins: {}, getTypeParser: () => (value) => value };
  return { Pool, types, default: { Pool, types } };
});

// bootstrap imports db from paperwork; back it with the runtime db created below.
vi.mock("@/db/paperwork.ts", () => ({
  get db() {
    return globalThis.__bootstrapDb;
  },
}));

let createDatabase, sqlClient, withDatabaseRequest, db, otherDb, ensureDatabaseBootstrapped, sql;
beforeAll(async () => {
  ({ sql } = await import("drizzle-orm"));
  ({ createDatabase, sqlClient, withDatabaseRequest } = await import("@/db/runtime.ts"));
  // The Worker and Next server have separate module instances in production.
  const duplicateRuntime = await import("@/db/runtime.ts?second-bundle");
  db = createDatabase({});
  otherDb = duplicateRuntime.createDatabase({});
  globalThis.__bootstrapDb = db;
  ({ ensureDatabaseBootstrapped } = await import("@/db/bootstrap.ts"));
});
const query = async (database = db) => (await database.execute(sql`select 1`)).rows[0].clientId;
const deferred = () => Promise.withResolvers();

test("database pools stay inside their request through transactions, streams and cleanup", async () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalPoolMax = process.env.DATABASE_POOL_MAX;
  process.env.DATABASE_POOL_MAX = "4";
  delete process.env.DATABASE_URL;
  expect(clients.length, "imports must not open or configure a pool").toBe(0);
  await expect(
    withDatabaseRequest(
      async () => {
        await query();
        return new Response(null, { status: 204 });
      },
      () => {},
    ),
  ).rejects.toThrow(/DATABASE_URL is required/);
  process.env.DATABASE_URL = "postgres://localhost/test";
  try {
    const waits = [];
    const waitUntil = (task) => waits.push(task);
    const barrier = deferred();
    let firstId;
    const first = withDatabaseRequest(
      async () => {
        firstId = await query();
        await barrier.promise;
        expect(db.$client.url).toBe("postgres://hyperdrive/first");
        expect(await query(otherDb), "separate bundles share request state").toBe(firstId);
        expect((await sqlClient.query("select 1")).rows[0].clientId).toBe(firstId);
        expect(await db.transaction(query)).toBe(firstId);
        await expect(
          db.transaction(async () => {
            throw new Error("rollback");
          }),
        ).rejects.toThrow(/rollback/);
        return new Response(null, { status: 204 });
      },
      waitUntil,
      "postgres://hyperdrive/first",
    );
    const second = await withDatabaseRequest(
      async () => {
        const id = await query();
        expect(id).not.toBe(firstId);
        expect(db.$client.url).toBe("postgres://hyperdrive/second");
        barrier.resolve();
        return new Response("second");
      },
      waitUntil,
      "postgres://hyperdrive/second",
    );
    await first;
    expect(await second.text()).toBe("second");
    await Promise.all(waits.splice(0));
    expect(clients.every((client) => client.closed)).toBeTruthy();
    expect(clients[0].commits).toBe(1);
    expect(clients[0].rollbacks).toBe(1);
    expect(clients[0].checkouts).toBe(2);
    expect(clients[0].releases, "committed and rolled-back transactions release their connections").toBe(2);
    expect(
      clients.every((client) => client.options.max === 5),
      "request pools stay bounded",
    ).toBeTruthy();

    const streamGate = deferred();
    const backgroundGate = deferred();
    let streamedClient;
    const streaming = await withDatabaseRequest(async (background) => {
      const id = await query();
      expect(db.$client.url, "unbound requests use the environment URL").toBe(process.env.DATABASE_URL);
      streamedClient = clients.find((client) => client.id === id);
      background(backgroundGate.promise.then(() => query()));
      return new Response(
        new ReadableStream({
          async start(controller) {
            await streamGate.promise;
            expect(await query(), "queries after fetch returns retain request state").toBe(id);
            controller.enqueue(new TextEncoder().encode("streamed"));
            controller.close();
          },
        }),
        { headers: { "x-test": "preserved" } },
      );
    }, waitUntil);
    expect(streamedClient.closed).toBe(false);
    expect(streaming.headers.get("x-test")).toBe("preserved");
    streamGate.resolve();
    expect(await streaming.text()).toBe("streamed");
    expect(streamedClient.closed, "background work retains the pool").toBe(false);
    backgroundGate.resolve();
    await Promise.all(waits.splice(0));
    expect(streamedClient.closed).toBe(true);

    for (const failure of ["throw", "stream error", "cancel"]) {
      const run = withDatabaseRequest(async () => {
        await query();
        if (failure === "throw") throw new Error(failure);
        return new Response(
          new ReadableStream({
            start(controller) {
              if (failure === "stream error") controller.error(new Error(failure));
            },
          }),
        );
      }, waitUntil);
      if (failure === "throw") await expect(run).rejects.toThrow(/throw/);
      else {
        const response = await run;
        if (failure === "cancel") await response.body.cancel();
        else await expect(response.text()).rejects.toThrow(/stream error/);
      }
      await Promise.all(waits.splice(0));
      expect(clients.at(-1).closed, failure).toBe(true);
    }

    const bootstrapStarted = deferred();
    const bootstrapGate = deferred();
    const blockedBootstrap = withDatabaseRequest(async () => {
      const client = db.$client;
      client.gate = bootstrapGate.promise;
      const pending = ensureDatabaseBootstrapped();
      const sameRequest = ensureDatabaseBootstrapped();
      bootstrapStarted.resolve();
      await Promise.all([pending, sameRequest]);
      expect(client.queries, "one bootstrap per request client").toBe(3);
      return new Response(null, { status: 204 });
    }, waitUntil);
    await bootstrapStarted.promise;
    await withDatabaseRequest(async () => {
      const client = db.$client;
      await ensureDatabaseBootstrapped();
      expect(client.queries, "concurrent requests do not share pending database I/O").toBe(3);
      bootstrapGate.resolve();
      return new Response(null, { status: 204 });
    }, waitUntil);
    await blockedBootstrap;
    await Promise.all(waits.splice(0));

    delete process.env.DATABASE_URL;
    await withDatabaseRequest(
      async () => {
        await query();
        expect(db.$client.url).toBe("postgres://hyperdrive/without-env");
        return new Response(null, { status: 204 });
      },
      waitUntil,
      "postgres://hyperdrive/without-env",
    );
    await Promise.all(waits.splice(0));
    process.env.DATABASE_URL = "postgres://localhost/test";
    const nodeId = await query();
    expect(db.$client.options.max, "Node pools use the configured connection limit").toBe(4);
    expect(db.$client.options.idleTimeoutMillis).toBe(20_000);
    expect(db.$client.options.connectionTimeoutMillis).toBe(10_000);
    expect(db.$client.listenerCount("error") > 0, "idle connection errors have a handler").toBeTruthy();
    expect(db.$client.url, "request bindings do not leak into Node pooling").toBe(process.env.DATABASE_URL);
    expect(await query(), "Node development retains its pooled connection").toBe(nodeId);
    const execute = db.execute;
    db.execute = async () => ({ rows: [{ clientId: "replacement" }] });
    expect(await query(), "existing Node clients remain mutable").toBe("replacement");
    db.execute = execute;
    expect(await query()).toBe(nodeId);
    await sqlClient.end();
  } finally {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    if (originalPoolMax === undefined) delete process.env.DATABASE_POOL_MAX;
    else process.env.DATABASE_POOL_MAX = originalPoolMax;
    delete globalThis.__databaseRequestClients;
    delete globalThis.__bootstrapDb;
  }
});
