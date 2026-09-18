import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { registerHooks } from "node:module";
import test from "node:test";
import { sql } from "drizzle-orm";

const runtimeUrl = new URL("../packages/database/src/runtime.ts", import.meta.url).href;
const failure = new Error("private query failure");
const result = { rows: [{ value: "private result" }] };
let connections = 0;
class Pool extends EventEmitter {
  async connect() {
    if (!this.client) {
      connections++;
      this.client = {
        release() {},
        query(config, values, callback) {
          if (typeof config?.submit === "function") return config;
          if (config === "THROW") throw failure;
          const text = typeof config === "string" ? config : config.text;
          const done = callback ?? (typeof values === "function" ? values : config.callback);
          if (done) {
            queueMicrotask(() => done.call(this, text === "FAIL" ? failure : null, result));
            return undefined;
          }
          return text === "FAIL" ? Promise.reject(failure) : Promise.resolve(result);
        },
      };
      this.emit("connect", this.client);
    }
    return this.client;
  }
  async query(...args) {
    const client = await this.connect();
    try {
      return await client.query(...args);
    } finally {
      client.release();
    }
  }
  async end() {}
}

globalThis.__databaseMetricsPg = { Pool, types: { builtins: {}, getTypeParser: () => (value) => value } };
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "pg") {
      return { shortCircuit: true, url: "data:text/javascript,export default globalThis.__databaseMetricsPg" };
    }
    return nextResolve(specifier, context);
  },
});
const { createDatabase, sqlClient } = await import(runtimeUrl);
hooks.deregister();
delete globalThis.__databaseMetricsPg;

test("database duration metrics cover pooled and transaction queries without altering results", async () => {
  const ipcKey = Symbol.for("@vercel/rusty-runtime-ipc");
  const previousIpc = globalThis[ipcKey];
  const events = [];
  globalThis[ipcKey] = { sendMetric: (...event) => events.push(event) };
  try {
    assert.equal(await sqlClient.query("SELECT private_column", ["private parameter"]), result);
    assert.equal(events.length, 1);
    await assert.rejects(sqlClient.query("FAIL"), (error) => error === failure);
    assert.equal(events.length, 2);

    const db = createDatabase({});
    assert.equal(await db.transaction((tx) => tx.execute(sql`select 1`)), result);
    assert.equal(events.length, 5, "begin, query and commit each emit once");
    await assert.rejects(
      db.transaction((tx) => tx.execute(sql.raw("FAIL"))),
      /Failed query/,
    );
    assert.equal(events.length, 8, "begin, failed query and rollback each emit once");

    const client = await sqlClient.connect();
    const callbackQuery = (makeArgs, error) =>
      new Promise((resolve, reject) => {
        const callback = function (actualError, actualResult) {
          try {
            assert.equal(actualError, error);
            assert.equal(actualResult, result);
            assert.equal(this, client, "callback receiver is preserved");
            resolve();
          } catch (failure) {
            reject(failure);
          }
        };
        assert.equal(client.query(...makeArgs(callback)), undefined, "callback overload keeps its return value");
      });
    await callbackQuery((callback) => ["select 1", callback], null);
    await callbackQuery((callback) => ["FAIL", ["private parameter"], callback], failure);
    await callbackQuery((callback) => [{ text: "select 1", callback }], null);
    assert.throws(
      () => client.query("THROW"),
      (error) => error === failure,
    );
    assert.equal(events.length, 12);
    assert.equal(connections, 1, "reusing a connection does not add another observer");
    assert.deepEqual(
      events.map((event) => event[2].status),
      [
        "success",
        "error",
        "success",
        "success",
        "success",
        "success",
        "error",
        "success",
        "success",
        "error",
        "success",
        "error",
      ],
    );
    for (const [name, duration, tags] of events) {
      assert.equal(name, "db.query.duration_ms");
      assert.ok(Number.isFinite(duration) && duration >= 0);
      assert.deepEqual(Object.keys(tags), ["status"], "only bounded non-sensitive metadata is emitted");
    }
    assert.ok(!JSON.stringify(events).includes("private"));

    const submittable = { submit() {} };
    assert.equal(client.query(submittable), submittable);
    assert.equal(events.length, 12, "custom query lifecycles are left untouched");
    globalThis[ipcKey] = {
      sendMetric() {
        throw new Error("observer unavailable");
      },
    };
    assert.equal(await client.query("select 1"), result);
    await assert.rejects(client.query("FAIL"), (error) => error === failure);
    await callbackQuery((callback) => ["select 1", callback], null);
    await callbackQuery((callback) => ["FAIL", callback], failure);
    client.release();
  } finally {
    await sqlClient.end();
    if (previousIpc === undefined) delete globalThis[ipcKey];
    else globalThis[ipcKey] = previousIpc;
  }
});
