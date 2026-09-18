import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter } from "node:events";
import { registerHooks } from "node:module";
import test from "node:test";
import pg from "pg";

test("queued pool queries and checkouts retain the caller's trace context", async () => {
  const context = new AsyncLocalStorage();
  const spans = [];
  class Client extends EventEmitter {
    _queryable = true;
    _ending = false;
    connect(callback) {
      setImmediate(callback);
    }
    query(text, values, callback) {
      const done = callback ?? (typeof values === "function" ? values : undefined);
      const execute = (finish) => setImmediate(() => finish(null, { rows: [{ text }] }));
      if (done) {
        execute(done);
        return undefined;
      }
      return new Promise((resolve) => execute((_error, result) => resolve(result)));
    }
    end(callback) {
      callback?.();
    }
    ref() {}
    unref() {}
  }
  class Pool extends pg.Pool {
    constructor(options) {
      super({ ...options, Client });
    }
  }
  globalThis.__contextPg = { ...pg, Pool };
  globalThis.__contextSentry = {
    startInactiveSpan() {
      spans.push(context.getStore());
      return { setStatus() {}, end() {} };
    },
  };
  const runtimeUrl = new URL("../packages/database/src/runtime.ts", import.meta.url).href;
  const hooks = registerHooks({
    resolve(specifier, location, nextResolve) {
      if (location.parentURL === runtimeUrl && ["pg", "@sentry/core"].includes(specifier)) {
        return {
          shortCircuit: true,
          url:
            specifier === "pg"
              ? "data:text/javascript,export default globalThis.__contextPg"
              : "data:text/javascript,export const {startInactiveSpan} = globalThis.__contextSentry",
        };
      }
      return nextResolve(specifier, location);
    },
  });
  const { sqlClient } = await import(runtimeUrl);
  hooks.deregister();
  delete globalThis.__contextPg;
  delete globalThis.__contextSentry;
  try {
    const names = ["request-a", "request-b"];
    const results = await Promise.all(names.map((name) => context.run(name, () => sqlClient.query(name))));
    assert.deepEqual(
      results.map((result) => result.rows[0].text),
      names,
    );
    assert.deepEqual(spans, names, "queued requests must not inherit the releasing request's parent span");

    await Promise.all(
      ["callback-a", "callback-b"].map((name) =>
        context.run(
          name,
          () =>
            new Promise((resolve, reject) => {
              const returned = sqlClient.query(name, (error, result) => {
                try {
                  assert.equal(error, undefined);
                  assert.equal(context.getStore(), name);
                  assert.equal(result.rows[0].text, name);
                  resolve();
                } catch (error) {
                  reject(error);
                }
              });
              assert.equal(returned, undefined, "callback queries keep their return contract");
            }),
        ),
      ),
    );
    assert.deepEqual(spans.slice(-2), ["callback-a", "callback-b"]);

    const holder = await sqlClient.connect();
    const checkout = context.run(
      "checkout",
      () =>
        new Promise((resolve, reject) => {
          assert.equal(
            sqlClient.connect((error, client, release) => {
              try {
                assert.equal(error, undefined);
                assert.equal(context.getStore(), "checkout");
                assert.equal(client, holder);
                assert.equal(release, client.release);
                release();
                resolve();
              } catch (error) {
                reject(error);
              }
            }),
            undefined,
          );
        }),
    );
    holder.release();
    await checkout;
  } finally {
    await sqlClient.end();
  }
  await assert.rejects(sqlClient.connect(), /Cannot use a pool after calling end/);
  const returned = sqlClient.connect((error) => {
    assert.match(error.message, /Cannot use a pool after calling end/);
    return "callback result";
  });
  assert.equal(returned, "callback result");
});
