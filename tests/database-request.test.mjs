import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { sql } from "drizzle-orm";

const runtimeUrl = new URL("../packages/database/src/runtime.ts", import.meta.url).href;
const bootstrapUrl = new URL("../db/bootstrap.ts", import.meta.url).href;
const clients = [];
globalThis.__databaseRequestClients = clients;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === bootstrapUrl && specifier === "./index") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export const db = globalThis.__bootstrapDb",
      };
    }
    if (context.parentURL === bootstrapUrl && specifier === "./schema") {
      return { shortCircuit: true, url: new URL("../db/schema.ts", import.meta.url).href };
    }
    if (specifier === "postgres" && context.parentURL?.startsWith(runtimeUrl)) {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`
          export default function postgres(url, options) {
            const clients = globalThis.__databaseRequestClients;
            const client = Object.assign(() => client.unsafe(), {
              id: clients.length + 1, url, options: { ...options, parsers: {}, serializers: {} },
              closed: false, commits: 0, rollbacks: 0, queries: 0,
              unsafe() {
                if (client.closed) throw new Error("Query after close");
                client.queries++;
                const rows = [{ clientId: client.id }];
                return Object.assign(Promise.resolve(client.gate).then(() => rows), { values: () => Promise.resolve(rows) });
              },
              async begin(callback) {
                try { const value = await callback(client); client.commits++; return value; }
                catch (error) { client.rollbacks++; throw error; }
              },
              async end() { client.closed = true; },
            });
            clients.push(client);
            return client;
          }
        `)}`,
      };
    }
    return nextResolve(specifier, context);
  },
});
const { createDatabase, sqlClient, withDatabaseRequest } = await import(runtimeUrl);
// The Worker and Next server have separate module instances in production.
const duplicateRuntime = await import(`${runtimeUrl}?second-bundle`);
const db = createDatabase({});
const otherDb = duplicateRuntime.createDatabase({});
globalThis.__bootstrapDb = db;
const { ensureDatabaseBootstrapped } = await import(bootstrapUrl);
hooks.deregister();
const query = async (database = db) => (await database.execute(sql`select 1`))[0].clientId;
const deferred = () => Promise.withResolvers();

test("database pools stay inside their request through transactions, streams and cleanup", async () => {
  const originalUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  assert.equal(clients.length, 0, "imports must not open or configure a pool");
  await assert.rejects(
    withDatabaseRequest(
      async () => {
        await query();
        return new Response(null, { status: 204 });
      },
      () => {},
    ),
    /DATABASE_URL is required/,
  );
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
        assert.equal(db.$client.url, "postgres://hyperdrive/first");
        assert.equal(await query(otherDb), firstId, "separate bundles share request state");
        assert.equal((await sqlClient`select 1`)[0].clientId, firstId);
        assert.equal(await db.transaction(query), firstId);
        await assert.rejects(
          db.transaction(async () => {
            throw new Error("rollback");
          }),
          /rollback/,
        );
        return new Response(null, { status: 204 });
      },
      waitUntil,
      "postgres://hyperdrive/first",
    );
    const second = await withDatabaseRequest(
      async () => {
        const id = await query();
        assert.notEqual(id, firstId);
        assert.equal(db.$client.url, "postgres://hyperdrive/second");
        barrier.resolve();
        return new Response("second");
      },
      waitUntil,
      "postgres://hyperdrive/second",
    );
    await first;
    assert.equal(await second.text(), "second");
    await Promise.all(waits.splice(0));
    assert.ok(clients.every((client) => client.closed));
    assert.equal(clients[0].commits, 1);
    assert.equal(clients[0].rollbacks, 1);

    const streamGate = deferred();
    const backgroundGate = deferred();
    let streamedClient;
    const streaming = await withDatabaseRequest(async (background) => {
      const id = await query();
      assert.equal(
        db.$client.url,
        process.env.DATABASE_URL,
        "unbound requests use the environment URL",
      );
      streamedClient = clients.find((client) => client.id === id);
      background(backgroundGate.promise.then(() => query()));
      return new Response(
        new ReadableStream({
          async start(controller) {
            await streamGate.promise;
            assert.equal(await query(), id, "queries after fetch returns retain request state");
            controller.enqueue(new TextEncoder().encode("streamed"));
            controller.close();
          },
        }),
        { headers: { "x-test": "preserved" } },
      );
    }, waitUntil);
    assert.equal(streamedClient.closed, false);
    assert.equal(streaming.headers.get("x-test"), "preserved");
    streamGate.resolve();
    assert.equal(await streaming.text(), "streamed");
    assert.equal(streamedClient.closed, false, "background work retains the pool");
    backgroundGate.resolve();
    await Promise.all(waits.splice(0));
    assert.equal(streamedClient.closed, true);

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
      if (failure === "throw") await assert.rejects(run, /throw/);
      else {
        const response = await run;
        if (failure === "cancel") await response.body.cancel();
        else await assert.rejects(response.text(), /stream error/);
      }
      await Promise.all(waits.splice(0));
      assert.equal(clients.at(-1).closed, true, failure);
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
      assert.equal(client.queries, 3, "one bootstrap per request client");
      return new Response(null, { status: 204 });
    }, waitUntil);
    await bootstrapStarted.promise;
    await withDatabaseRequest(async () => {
      const client = db.$client;
      await ensureDatabaseBootstrapped();
      assert.equal(client.queries, 3, "concurrent requests do not share pending database I/O");
      bootstrapGate.resolve();
      return new Response(null, { status: 204 });
    }, waitUntil);
    await blockedBootstrap;
    await Promise.all(waits.splice(0));

    delete process.env.DATABASE_URL;
    await withDatabaseRequest(
      async () => {
        await query();
        assert.equal(db.$client.url, "postgres://hyperdrive/without-env");
        return new Response(null, { status: 204 });
      },
      waitUntil,
      "postgres://hyperdrive/without-env",
    );
    await Promise.all(waits.splice(0));
    process.env.DATABASE_URL = "postgres://localhost/test";
    const nodeId = await query();
    assert.equal(
      db.$client.url,
      process.env.DATABASE_URL,
      "request bindings do not leak into Node pooling",
    );
    assert.equal(await query(), nodeId, "Node development retains its pooled connection");
    const execute = db.execute;
    db.execute = async () => [{ clientId: "replacement" }];
    assert.equal(await query(), "replacement", "existing Node clients remain mutable");
    db.execute = execute;
    assert.equal(await query(), nodeId);
    await sqlClient.end();
  } finally {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    delete globalThis.__databaseRequestClients;
    delete globalThis.__bootstrapDb;
  }
});
