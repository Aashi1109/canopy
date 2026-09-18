import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { registerHooks } from "node:module";
import test from "node:test";
import { sql } from "drizzle-orm";

const runtimeUrl = new URL("../db/runtime.ts", import.meta.url).href;
const failure = new Error("private query failure");
const result = { rows: [{ value: "private result" }] };
const spans = [];
let failTracing = false;
let failSpanEnd = false;
globalThis.__databaseTracingSentry = {
  startInactiveSpan(options) {
    if (failTracing) throw new Error("Tracing unavailable");
    const span = { options, ended: 0 };
    spans.push(span);
    return {
      setStatus(status) {
        span.status = status;
      },
      end() {
        span.ended++;
        if (failSpanEnd) throw new Error("Tracing unavailable");
      },
    };
  },
};
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

globalThis.__databaseTracingPg = { Pool, types: { builtins: {}, getTypeParser: () => (value) => value } };
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@sentry/core" && context.parentURL === runtimeUrl) {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export const {startInactiveSpan} = globalThis.__databaseTracingSentry",
      };
    }
    if (specifier === "pg") {
      return { shortCircuit: true, url: "data:text/javascript,export default globalThis.__databaseTracingPg" };
    }
    return nextResolve(specifier, context);
  },
});
const { createDatabase, sqlClient } = await import(runtimeUrl);
hooks.deregister();
delete globalThis.__databaseTracingPg;
delete globalThis.__databaseTracingSentry;

test("database spans cover pooled and transaction queries without altering results", async () => {
  try {
    assert.equal(await sqlClient.query("SELECT private_column", ["private parameter"]), result);
    assert.equal(spans.length, 1);
    await assert.rejects(sqlClient.query("FAIL"), (error) => error === failure);
    assert.equal(spans.length, 2);

    const db = createDatabase({});
    assert.equal(await db.transaction((tx) => tx.execute(sql`select 1`)), result);
    assert.equal(spans.length, 5, "begin, query and commit each emit once");
    await assert.rejects(
      db.transaction((tx) => tx.execute(sql.raw("FAIL"))),
      /Failed query/,
    );
    assert.equal(spans.length, 8, "begin, failed query and rollback each emit once");

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
    assert.equal(spans.length, 12);
    assert.equal(connections, 1, "reusing a connection does not add another observer");
    assert.deepEqual(
      spans.map((span) => (span.status.code === 2 ? "error" : "success")),
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
    for (const span of spans) {
      assert.deepEqual(span.options, {
        name: "db.query",
        op: "db.query",
        onlyIfParent: true,
        attributes: { "db.system": "postgresql" },
      });
      assert.equal(span.ended, 1);
    }
    assert.ok(!JSON.stringify(spans).includes("private"), "SQL, parameters, results and errors are never recorded");

    const submittable = { submit() {} };
    assert.equal(client.query(submittable), submittable);
    assert.equal(spans.length, 12, "custom query lifecycles are left untouched");
    failSpanEnd = true;
    assert.equal(await client.query("select 1"), result);
    await assert.rejects(client.query("FAIL"), (error) => error === failure);
    await callbackQuery((callback) => ["select 1", callback], null);
    await callbackQuery((callback) => ["FAIL", callback], failure);
    assert.ok(
      spans.every((span) => span.ended === 1),
      "span completion failures never alter query results",
    );
    failTracing = true;
    assert.equal(await client.query("select 1"), result);
    await assert.rejects(client.query("FAIL"), (error) => error === failure);
    client.release();
  } finally {
    await sqlClient.end();
  }
});
