import { EventEmitter } from "node:events";
import { beforeAll, expect, test, vi } from "vitest";

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

// Sentry stub captured at factory eval (when runtime.ts imports it), mirroring the
// original data-URL destructure so the globals can be cleared afterwards.
vi.mock("@sentry/core", () => {
  const { startInactiveSpan } = globalThis.__databaseTracingSentry;
  return { startInactiveSpan };
});
vi.mock("pg", () => ({ default: globalThis.__databaseTracingPg }));

let createDatabase, sqlClient, sql;
beforeAll(async () => {
  ({ sql } = await import("drizzle-orm"));
  ({ createDatabase, sqlClient } = await import("@/db/runtime.ts"));
  delete globalThis.__databaseTracingPg;
  delete globalThis.__databaseTracingSentry;
});

test("database spans cover pooled and transaction queries without altering results", async () => {
  try {
    expect(await sqlClient.query("SELECT private_column", ["private parameter"])).toBe(result);
    expect(spans.length).toBe(1);
    await expect(sqlClient.query("FAIL")).rejects.toBe(failure);
    expect(spans.length).toBe(2);

    const db = createDatabase({});
    expect(await db.transaction((tx) => tx.execute(sql`select 1`))).toBe(result);
    expect(spans.length, "begin, query and commit each emit once").toBe(5);
    await expect(db.transaction((tx) => tx.execute(sql.raw("FAIL")))).rejects.toThrow(/Failed query/);
    expect(spans.length, "begin, failed query and rollback each emit once").toBe(8);

    const client = await sqlClient.connect();
    const callbackQuery = (makeArgs, error) =>
      new Promise((resolve, reject) => {
        const callback = function (actualError, actualResult) {
          try {
            expect(actualError).toBe(error);
            expect(actualResult).toBe(result);
            expect(this, "callback receiver is preserved").toBe(client);
            resolve();
          } catch (failure) {
            reject(failure);
          }
        };
        expect(client.query(...makeArgs(callback)), "callback overload keeps its return value").toBe(undefined);
      });
    await callbackQuery((callback) => ["select 1", callback], null);
    await callbackQuery((callback) => ["FAIL", ["private parameter"], callback], failure);
    await callbackQuery((callback) => [{ text: "select 1", callback }], null);
    expect(() => client.query("THROW")).toThrow(failure);
    expect(spans.length).toBe(12);
    expect(connections, "reusing a connection does not add another observer").toBe(1);
    expect(spans.map((span) => (span.status.code === 2 ? "error" : "success"))).toEqual([
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
    ]);
    for (const span of spans) {
      expect(span.options).toEqual({
        name: "db.query",
        op: "db.query",
        onlyIfParent: true,
        attributes: { "db.system": "postgresql" },
      });
      expect(span.ended).toBe(1);
    }
    expect(
      !JSON.stringify(spans).includes("private"),
      "SQL, parameters, results and errors are never recorded",
    ).toBeTruthy();

    const submittable = { submit() {} };
    expect(client.query(submittable)).toBe(submittable);
    expect(spans.length, "custom query lifecycles are left untouched").toBe(12);
    failSpanEnd = true;
    expect(await client.query("select 1")).toBe(result);
    await expect(client.query("FAIL")).rejects.toBe(failure);
    await callbackQuery((callback) => ["select 1", callback], null);
    await callbackQuery((callback) => ["FAIL", callback], failure);
    expect(
      spans.every((span) => span.ended === 1),
      "span completion failures never alter query results",
    ).toBeTruthy();
    failTracing = true;
    expect(await client.query("select 1")).toBe(result);
    await expect(client.query("FAIL")).rejects.toBe(failure);
    client.release();
  } finally {
    await sqlClient.end();
  }
});
