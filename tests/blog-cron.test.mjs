import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";
import { handleBlogPublishRequest, runBlogPublishCron } from "../lib/blog/cron.ts";

const secret = "test-blog-scheduler-secret-for-tests";
const path = "/api/internal/blog/publish-due";
const counts = { attempted: 3, published: 2, failed: 1, remaining: 4 };
const request = (authorization, method = "POST") =>
  new Request(`https://smarttools.test${path}`, {
    method,
    headers: authorization ? { authorization } : {},
  });

test("publishing authenticates before invoking domain logic and returns only safe counts", async () => {
  let calls = 0;
  const publish = async () => {
    calls++;
    return { ...counts, privateError: "database-password" };
  };
  for (const authorization of [
    undefined,
    "Basic example",
    "Bearer wrong",
    `Bearer ${secret}, extra`,
    `Bearer ${secret} extra`,
  ]) {
    const response = await handleBlogPublishRequest(request(authorization), secret, publish);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  for (const configured of [undefined, "", "   ", "secret with spaces"]) {
    const response = await handleBlogPublishRequest(request(`Bearer ${secret}`), configured, publish);
    assert.equal(response.status, 503);
  }
  assert.equal(calls, 0);
  const response = await handleBlogPublishRequest(request(`bearer ${secret}`), secret, publish);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), counts);
  assert.equal(calls, 1);
});

test("GET cannot publish and failed domain requests never expose internal error details", async () => {
  let calls = 0;
  const publish = async () => {
    calls++;
    throw new Error("postgres://private-password@database");
  };
  const get = await handleBlogPublishRequest(request(`Bearer ${secret}`, "GET"), secret, publish);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
  assert.equal(calls, 0);
  const failed = await handleBlogPublishRequest(request(`Bearer ${secret}`), secret, publish);
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "[hidden]" });
  assert.equal(calls, 1);
});

test("publishing returns the original failure message with a default for empty errors", async () => {
  for (const [error, expected] of [
    [new Error("Publishing connection timed out"), "Publishing connection timed out"],
    [new Error(""), "Blog publishing is temporarily unavailable."],
  ]) {
    const response = await handleBlogPublishRequest(request(`Bearer ${secret}`), secret, async () => {
      throw error;
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: expected });
  }
});

test("scheduled handler uses its service binding and awaits the authenticated POST result", async () => {
  let received;
  const env = {
    APP_URL: "https://app.example.test/ignored-path",
    BLOG_SCHEDULER_SECRET: secret,
    WORKER_SELF_REFERENCE: {
      async fetch(req) {
        received = req;
        return Response.json(counts);
      },
    },
  };
  assert.deepEqual(await runBlogPublishCron(env), counts);
  assert.equal(received.url, `https://app.example.test${path}`);
  assert.equal(received.method, "POST");
  assert.equal(received.headers.get("authorization"), `Bearer ${secret}`);
  assert.equal(received.redirect, "manual");
  assert.ok(received.signal instanceof AbortSignal);
});

test("remote target is explicit, uses HTTPS, and cannot forward credentials through redirects", async () => {
  let received;
  let bindingCalls = 0;
  const env = {
    APP_URL: "https://cloudflare.example.test",
    BLOG_SCHEDULER_SECRET: secret,
    BLOG_PUBLISH_URL: `https://docker.example.test${path}`,
    WORKER_SELF_REFERENCE: {
      fetch() {
        bindingCalls++;
        throw new Error("should not use binding");
      },
    },
  };
  const fetchRemote = async (req) => {
    received = req;
    return Response.json(counts);
  };
  assert.deepEqual(await runBlogPublishCron(env, fetchRemote), counts);
  assert.equal(received.url, env.BLOG_PUBLISH_URL);
  assert.equal(received.redirect, "manual");
  assert.equal(bindingCalls, 0);
  await assert.rejects(
    runBlogPublishCron(
      env,
      async () =>
        new Response(null, {
          status: 307,
          headers: { location: "https://untrusted.example.test" },
        }),
    ),
    /HTTP 307/,
  );
});

test("invalid cron configuration fails before sending any secret", async () => {
  let calls = 0;
  const fetchRemote = async () => {
    calls++;
    return Response.json(counts);
  };
  for (const target of [
    `http://docker.example.test${path}`,
    `https://user:pass@docker.example.test${path}`,
    `https://docker.example.test${path}?next=https://untrusted.test`,
    `https://docker.example.test${path}#fragment`,
    "https://docker.example.test/wrong-path",
    "invalid",
  ]) {
    await assert.rejects(
      runBlogPublishCron({ BLOG_SCHEDULER_SECRET: secret, BLOG_PUBLISH_URL: target }, fetchRemote),
      /configuration/,
    );
  }
  await assert.rejects(
    runBlogPublishCron({ BLOG_PUBLISH_URL: `https://docker.example.test${path}` }, fetchRemote),
    /configuration/,
  );
  await assert.rejects(runBlogPublishCron({ BLOG_SCHEDULER_SECRET: secret }), /configuration/);
  assert.equal(calls, 0);
});

test("cron consumes successful responses and rejects unsafe, oversized or failed outcomes", async () => {
  const env = {
    BLOG_SCHEDULER_SECRET: secret,
    BLOG_PUBLISH_URL: `https://docker.example.test${path}`,
  };
  const response = Response.json(counts);
  assert.deepEqual(await runBlogPublishCron(env, async () => response), counts);
  assert.equal(response.bodyUsed, true);
  for (const value of [null, {}, { ...counts, published: -1 }, { ...counts, remaining: 1.5 }]) {
    await assert.rejects(
      runBlogPublishCron(env, async () => Response.json(value)),
      /invalid response/,
    );
  }
  await assert.rejects(
    runBlogPublishCron(env, async () => new Response("x".repeat(4097))),
    /invalid response/,
  );
  await assert.rejects(
    runBlogPublishCron(env, async () => new Response("private database error", { status: 503 })),
    /HTTP 503/,
  );
  await assert.rejects(
    runBlogPublishCron(env, async () => {
      throw new Error(`Secret ${secret}`);
    }),
    {
      message: "Blog publishing request failed.",
    },
  );
});

test("deployment configuration schedules publishing twice per hour", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.deepEqual(config.triggers.crons, ["*/30 * * * *"]);
});

test("actual Worker schedule re-enters the fetch database wrapper through its self binding", async (t) => {
  const workerUrl = new URL("../worker.ts", import.meta.url).href;
  const state = { wrapped: 0, dispatched: 0, databaseUrl: null, counts };
  globalThis.__blogCronWorkerTest = state;
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL === workerUrl && specifier === "./lib/blog/cron") {
        return { shortCircuit: true, url: new URL("../lib/blog/cron.ts", import.meta.url).href };
      }
      if (context.parentURL === workerUrl && specifier === "@canopy/database/runtime") {
        return {
          shortCircuit: true,
          url: `data:text/javascript,${encodeURIComponent(`
          export async function withDatabaseRequest(handler, waitUntil, databaseUrl) {
            const state = globalThis.__blogCronWorkerTest;
            state.wrapped++;
            state.databaseUrl = databaseUrl;
            return handler(waitUntil);
          }
        `)}`,
        };
      }
      if (context.parentURL === workerUrl && specifier === "./.open-next/worker.js") {
        return {
          shortCircuit: true,
          url: `data:text/javascript,${encodeURIComponent(`
          export default { async fetch(request, env, ctx) {
            const state = globalThis.__blogCronWorkerTest;
            if (!state.wrapped) throw new Error("Database wrapper was bypassed");
            state.dispatched++;
            ctx.waitUntil(Promise.resolve());
            return Response.json(state.counts);
          } };
        `)}`,
        };
      }
      return nextResolve(specifier, context);
    },
  });
  try {
    const { default: worker } = await import(workerUrl);
    const waits = [];
    const logs = [];
    t.mock.method(console, "warn", (...args) => logs.push(args));
    const env = {
      BLOG_SCHEDULER_SECRET: secret,
      HYPERDRIVE: { connectionString: "postgres://local/test-only" },
      WORKER_SELF_REFERENCE: {
        fetch: (req) => worker.fetch(req, env, { waitUntil: (task) => waits.push(task) }),
      },
    };
    await worker.scheduled({}, env);
    await Promise.all(waits);
    assert.equal(state.wrapped, 1);
    assert.equal(state.dispatched, 1);
    assert.equal(state.databaseUrl, env.HYPERDRIVE.connectionString);
    assert.equal(waits.length, 1);
    assert.deepEqual(logs, [["Blog scheduled publishing has failed posts", counts]]);
  } finally {
    hooks.deregister();
    delete globalThis.__blogCronWorkerTest;
  }
});
