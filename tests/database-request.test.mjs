import { AsyncLocalStorage } from "node:async_hooks";
import { beforeAll, expect, test, vi } from "vitest";

const clients = [];
globalThis.__databaseRequestClients = clients;

// Fake pg Pool that records persistent pooling and transaction lifecycles.
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
    connect(callback) {
      this.checkouts++;
      let released = false;
      const client = {
        query: this.query.bind(this),
        release: () => {
          if (released) throw new Error("Client released twice");
          released = true;
          this.releases++;
        },
      };
      if (callback) {
        this.completeCheckout = () => callback(null, client, client.release);
        return;
      }
      return Promise.resolve(client);
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

let createDatabase, sqlClient, db, otherDb, ensureDatabaseBootstrapped, sql;
let isDatabaseConfigured, assertDatabaseConfigured;
beforeAll(async () => {
  ({ sql } = await import("drizzle-orm"));
  ({ createDatabase, sqlClient } = await import("@/db/runtime.ts"));
  ({ isDatabaseConfigured, assertDatabaseConfigured } = await import("@/db/index.ts"));
  db = createDatabase({});
  otherDb = createDatabase({});
  globalThis.__bootstrapDb = db;
  ({ ensureDatabaseBootstrapped } = await import("@/db/bootstrap.ts"));
});
const query = async (database = db) => (await database.execute(sql`select 1`)).rows[0].clientId;

test("database readiness reads Node configuration without opening a pool", () => {
  const originalUrl = process.env.DATABASE_URL;
  try {
    delete process.env.DATABASE_URL;
    expect(isDatabaseConfigured()).toBe(false);
    expect(assertDatabaseConfigured).toThrow(/DATABASE_URL is required/);
    process.env.DATABASE_URL = "postgres://localhost/test";
    expect(isDatabaseConfigured()).toBe(true);
    expect(assertDatabaseConfigured).not.toThrow();
    expect(clients.length, "imports and readiness checks must not create clients").toBe(0);
  } finally {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  }
});

test("Node database consumers reuse a bounded pool through queries, transactions and bootstrap", async () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalPoolMax = process.env.DATABASE_POOL_MAX;
  process.env.DATABASE_URL = "postgres://localhost/test";
  process.env.DATABASE_POOL_MAX = "4";
  try {
    const separateRuntime = await import("@/db/runtime.ts?separate-bundle");
    const separateDb = separateRuntime.createDatabase({});
    const ids = await Promise.all([
      query(),
      query(otherDb),
      query(separateDb),
      sqlClient.query("select 1").then((r) => r.rows[0].clientId),
      separateRuntime.sqlClient.query("select 1").then((r) => r.rows[0].clientId),
    ]);
    expect(new Set(ids).size, "concurrent consumers in separate server bundles share one pool").toBe(1);
    expect(clients.length).toBe(1);
    const client = clients[0];
    expect(db.$client).toBe(otherDb.$client);
    expect(db.$client).toBe(separateDb.$client);
    expect(client.url).toBe(process.env.DATABASE_URL);
    expect(client.options.max).toBe(4);
    expect(client.options.idleTimeoutMillis).toBe(20_000);
    expect(client.options.connectionTimeoutMillis).toBe(10_000);
    expect(client.listenerCount("error") > 0, "idle connection errors have a handler").toBeTruthy();

    expect(await db.transaction(query)).toBe(ids[0]);
    await expect(
      db.transaction(async () => {
        throw new Error("rollback");
      }),
    ).rejects.toThrow(/rollback/);
    expect(client.commits).toBe(1);
    expect(client.rollbacks).toBe(1);
    expect(client.checkouts).toBe(2);
    expect(client.releases, "commits and rollbacks release their connections").toBe(2);
    expect(await query(), "failed transactions do not close the shared pool").toBe(ids[0]);
    expect(client.closed).toBe(false);

    const beforeBootstrap = client.queries;
    const gate = Promise.withResolvers();
    client.gate = gate.promise;
    const pending = [ensureDatabaseBootstrapped(), ensureDatabaseBootstrapped()];
    gate.resolve();
    await Promise.all(pending);
    await ensureDatabaseBootstrapped();
    expect(client.queries - beforeBootstrap, "concurrent requests share one schema bootstrap").toBe(3);

    const context = new AsyncLocalStorage();
    let checkedOut;
    const callbackFinished = new Promise((resolve, reject) => {
      context.run("request waiting for checkout", () => {
        sqlClient.connect((error, checkout, release) => {
          if (error) return reject(error);
          checkedOut = context.getStore();
          release();
          resolve();
        });
      });
    });
    context.run("request releasing another connection", () => client.completeCheckout());
    await callbackFinished;
    expect(checkedOut, "queued checkouts retain the waiting request's tracing context").toBe(
      "request waiting for checkout",
    );
    expect(client.checkouts).toBe(client.releases);

    const execute = db.execute;
    db.execute = async () => ({ rows: [{ clientId: "replacement" }] });
    expect(await query(), "database method overrides remain supported").toBe("replacement");
    db.execute = execute;
    expect(await query()).toBe(ids[0]);

    process.env.DATABASE_URL = "postgres://localhost/reconfigured";
    const reloadedRuntime = await import("@/db/runtime.ts?env-reload");
    const reloadedDb = reloadedRuntime.createDatabase({});
    const afterUrlChange = await Promise.all([query(), query(separateDb), query(reloadedDb)]);
    expect(new Set(afterUrlChange).size, "old and reloaded database wrappers use the same replacement pool").toBe(1);
    expect(afterUrlChange[0]).not.toBe(ids[0]);
    expect(clients.length).toBe(2);
    expect(clients[0].closed, "a replaced pool is closed").toBe(true);
    expect(clients[1].url).toBe("postgres://localhost/reconfigured");
    expect(db.$client).toBe(reloadedDb.$client);

    process.env.DATABASE_POOL_MAX = "2";
    expect(await query()).not.toBe(afterUrlChange[0]);
    expect(clients.length).toBe(3);
    expect(clients[1].closed).toBe(true);
    expect(clients[2].options.max).toBe(2);
    expect(await query(separateDb)).toBe(clients[2].id);
    expect(clients.length, "unchanged connection settings keep reusing the pool").toBe(3);

    vi.spyOn(clients[2], "end").mockRejectedValueOnce(new Error("private connection detail"));
    const warnings = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.DATABASE_POOL_MAX = "3";
    expect(await query(), "a failed old-pool close does not prevent replacement queries").toBe(4);
    expect(warnings.mock.calls).toEqual([["Replaced database pool failed to close."]]);
    warnings.mockRestore();
  } finally {
    await sqlClient.end();
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    if (originalPoolMax === undefined) delete process.env.DATABASE_POOL_MAX;
    else process.env.DATABASE_POOL_MAX = originalPoolMax;
    delete globalThis.__databaseRequestClients;
    delete globalThis.__bootstrapDb;
  }
});
