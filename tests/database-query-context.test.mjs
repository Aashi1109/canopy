import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";

// runtime.ts gets the fake pg/sentry via globals set inside the test; the test itself
// uses the real pg (vi.importActual) to subclass pg.Pool.
vi.mock("pg", () => ({ default: globalThis.__contextPg }));
vi.mock("@sentry/core", () => {
  const { startInactiveSpan } = globalThis.__contextSentry;
  return { startInactiveSpan };
});

test("queued pool queries retain caller context and finish during configuration reloads", async (t) => {
  const { default: pg } = await vi.importActual("pg");
  const originalUrl = process.env.DATABASE_URL;
  t.onTestFinished(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });
  const context = new AsyncLocalStorage();
  const spans = [];
  const pools = [];
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
      // Force contention independently of the production pool size.
      super({ ...options, max: 1, Client });
      pools.push(this);
    }
  }
  globalThis.__contextPg = { ...pg, Pool };
  globalThis.__contextSentry = {
    startInactiveSpan() {
      spans.push(context.getStore());
      return { setStatus() {}, end() {} };
    },
  };
  const { sqlClient } = await import("@/db/runtime.ts");
  delete globalThis.__contextPg;
  delete globalThis.__contextSentry;
  try {
    const names = ["request-a", "request-b"];
    const results = await Promise.all(names.map((name) => context.run(name, () => sqlClient.query(name))));
    expect(results.map((result) => result.rows[0].text)).toEqual(names);
    expect(spans, "queued requests must not inherit the releasing request's parent span").toEqual(names);

    await Promise.all(
      ["callback-a", "callback-b"].map((name) =>
        context.run(
          name,
          () =>
            new Promise((resolve, reject) => {
              const returned = sqlClient.query(name, (error, result) => {
                try {
                  expect(error).toBe(undefined);
                  expect(context.getStore()).toBe(name);
                  expect(result.rows[0].text).toBe(name);
                  resolve();
                } catch (error) {
                  reject(error);
                }
              });
              expect(returned, "callback queries keep their return contract").toBe(undefined);
            }),
        ),
      ),
    );
    expect(spans.slice(-2)).toEqual(["callback-a", "callback-b"]);

    const holder = await sqlClient.connect();
    const checkout = context.run(
      "checkout",
      () =>
        new Promise((resolve, reject) => {
          expect(
            sqlClient.connect((error, client, release) => {
              try {
                expect(error).toBe(undefined);
                expect(context.getStore()).toBe("checkout");
                expect(client).toBe(holder);
                expect(release).toBe(client.release);
                release();
                resolve();
              } catch (error) {
                reject(error);
              }
            }),
          ).toBe(undefined);
        }),
    );
    holder.release();
    await checkout;

    const active = await sqlClient.connect();
    const previousPool = pools[0];
    const queued = context.run("queued-before-reload", () => sqlClient.query("queued-before-reload"));
    expect(previousPool.waitingCount).toBe(1);
    process.env.DATABASE_URL = "postgres://localhost/reloaded-context-test";
    expect((await sqlClient.query("after-reload")).rows[0].text).toBe("after-reload");
    expect(pools.length).toBe(2);
    expect(previousPool.ending, "queued requests keep their old pool available").toBe(false);
    expect((await active.query("active-before-reload")).rows[0].text).toBe("active-before-reload");
    active.release();
    expect((await queued).rows[0].text).toBe("queued-before-reload");
    expect(spans.at(-1), "queued requests retain their context across reloads").toBe("queued-before-reload");
    await vi.waitFor(() => expect(previousPool.ended, "the replaced pool closes after draining").toBe(true));
  } finally {
    await sqlClient.end();
  }
  await expect(sqlClient.connect()).rejects.toThrow(/Cannot use a pool after calling end/);
  const returned = sqlClient.connect((error) => {
    expect(error.message).toMatch(/Cannot use a pool after calling end/);
    return "callback result";
  });
  expect(returned).toBe("callback result");
});
