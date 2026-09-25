import { readFile } from "node:fs/promises";
import JSON5 from "next/dist/compiled/json5/index.js";
import { expect, test, vi } from "vitest";
import { handleBlogPublishRequest, runBlogPublishCron } from "@/lib/blog/cron.ts";

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
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  for (const configured of [undefined, "", "   ", "secret with spaces"]) {
    const response = await handleBlogPublishRequest(request(`Bearer ${secret}`), configured, publish);
    expect(response.status).toBe(503);
  }
  expect(calls).toBe(0);
  const response = await handleBlogPublishRequest(request(`bearer ${secret}`), secret, publish);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(counts);
  expect(calls).toBe(1);
});

test("GET cannot publish and failed domain requests never expose internal error details", async () => {
  let calls = 0;
  const publish = async () => {
    calls++;
    throw new Error("postgres://private-password@database");
  };
  const get = await handleBlogPublishRequest(request(`Bearer ${secret}`, "GET"), secret, publish);
  expect(get.status).toBe(405);
  expect(get.headers.get("allow")).toBe("POST");
  expect(calls).toBe(0);
  const failed = await handleBlogPublishRequest(request(`Bearer ${secret}`), secret, publish);
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({ error: "[hidden]" });
  expect(calls).toBe(1);
});

test("publishing returns the original failure message with a default for empty errors", async () => {
  for (const [error, expected] of [
    [new Error("Publishing connection timed out"), "Publishing connection timed out"],
    [new Error(""), "Blog publishing is temporarily unavailable."],
  ]) {
    const response = await handleBlogPublishRequest(request(`Bearer ${secret}`), secret, async () => {
      throw error;
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: expected });
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
  expect(await runBlogPublishCron(env)).toEqual(counts);
  expect(received.url).toBe(`https://app.example.test${path}`);
  expect(received.method).toBe("POST");
  expect(received.headers.get("authorization")).toBe(`Bearer ${secret}`);
  expect(received.redirect).toBe("manual");
  expect(received.signal instanceof AbortSignal).toBeTruthy();
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
  expect(await runBlogPublishCron(env, fetchRemote)).toEqual(counts);
  expect(received.url).toBe(env.BLOG_PUBLISH_URL);
  expect(received.redirect).toBe("manual");
  expect(bindingCalls).toBe(0);
  await expect(
    runBlogPublishCron(
      env,
      async () =>
        new Response(null, {
          status: 307,
          headers: { location: "https://untrusted.example.test" },
        }),
    ),
  ).rejects.toThrow(/HTTP 307/);
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
    await expect(
      runBlogPublishCron({ BLOG_SCHEDULER_SECRET: secret, BLOG_PUBLISH_URL: target }, fetchRemote),
    ).rejects.toThrow(/configuration/);
  }
  await expect(
    runBlogPublishCron({ BLOG_PUBLISH_URL: `https://docker.example.test${path}` }, fetchRemote),
  ).rejects.toThrow(/configuration/);
  await expect(runBlogPublishCron({ BLOG_SCHEDULER_SECRET: secret })).rejects.toThrow(/configuration/);
  expect(calls).toBe(0);
});

test("cron consumes successful responses and rejects unsafe, oversized or failed outcomes", async () => {
  const env = {
    BLOG_SCHEDULER_SECRET: secret,
    BLOG_PUBLISH_URL: `https://docker.example.test${path}`,
  };
  const response = Response.json(counts);
  expect(await runBlogPublishCron(env, async () => response)).toEqual(counts);
  expect(response.bodyUsed).toBe(true);
  for (const value of [null, {}, { ...counts, published: -1 }, { ...counts, remaining: 1.5 }]) {
    await expect(runBlogPublishCron(env, async () => Response.json(value))).rejects.toThrow(/invalid response/);
  }
  await expect(runBlogPublishCron(env, async () => new Response("x".repeat(4097)))).rejects.toThrow(/invalid response/);
  await expect(
    runBlogPublishCron(env, async () => new Response("private database error", { status: 503 })),
  ).rejects.toThrow(/HTTP 503/);
  await expect(
    runBlogPublishCron(env, async () => {
      throw new Error(`Secret ${secret}`);
    }),
  ).rejects.toThrow("Blog publishing request failed.");
});

test("deployment schedules publishing twice per hour and maintenance twice daily, with dev disabled", async () => {
  const config = JSON5.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  expect(config.triggers.crons).toEqual(["*/30 * * * *", "0 0,12 * * *"]);
  expect(config.env.dev.triggers.crons).toEqual([]);
});

test.each(["DB", undefined])("actual Worker schedule uses %s through its fetch database wrapper", async (binding) => {
  const maintenanceCounts = { files: 2, runs: 3, failed: 0 };
  const state = {
    wrapped: 0,
    dispatched: 0,
    databaseUrl: null,
    counts,
    maintenanceCounts,
    paths: [],
    publishStatus: 200,
    maintenanceStatus: 200,
  };
  globalThis.__blogCronWorkerTest = state;
  vi.resetModules();
  vi.doMock("@/db/runtime.ts", () => ({
    async withDatabaseRequest(handler, waitUntil, databaseUrl) {
      const state = globalThis.__blogCronWorkerTest;
      state.wrapped++;
      state.databaseUrl = databaseUrl;
      return handler(waitUntil);
    },
  }));
  vi.doMock("@/.open-next/worker.js", () => ({
    default: {
      async fetch(request, env, ctx) {
        const state = globalThis.__blogCronWorkerTest;
        if (!state.wrapped) throw new Error("Database wrapper was bypassed");
        state.dispatched++;
        ctx.waitUntil(Promise.resolve());
        const path = new URL(request.url).pathname;
        state.paths.push(path);
        const maintenance = path === "/api/internal/assistant/maintenance";
        return Response.json(maintenance ? state.maintenanceCounts : state.counts, {
          status: maintenance ? state.maintenanceStatus : state.publishStatus,
        });
      },
    },
  }));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const { default: worker } = await import("@/worker.ts");
    const waits = [];
    const logs = [];
    warn.mockImplementation((...args) => logs.push(args));
    const env = {
      BLOG_SCHEDULER_SECRET: secret,
      ...(binding ? { [binding]: { connectionString: "postgres://local/test-only" } } : {}),
      WORKER_SELF_REFERENCE: {
        fetch: (req) => worker.fetch(req, env, { waitUntil: (task) => waits.push(task) }),
      },
    };
    await worker.scheduled({ cron: "*/30 * * * *" }, env);
    await Promise.all(waits);
    expect(state.wrapped).toBe(1);
    expect(state.dispatched).toBe(1);
    expect(state.databaseUrl).toBe(binding ? env[binding].connectionString : undefined);
    expect(waits.length).toBe(1);
    expect(logs).toEqual([["Blog scheduled publishing has failed posts", counts]]);
    expect(state.paths).toEqual([path]);
    expect(info).not.toHaveBeenCalled();

    state.paths.length = 0;
    state.publishStatus = 503;
    await expect(worker.scheduled({ cron: "*/30 * * * *" }, env)).rejects.toThrow(
      /Blog publishing request returned HTTP 503/,
    );
    expect(state.paths).toEqual([path]);

    state.paths.length = 0;
    delete env.BLOG_SCHEDULER_SECRET;
    env.ASSISTANT_SCHEDULER_SECRET = "test-assistant-secret";
    await worker.scheduled({ cron: "0 0,12 * * *" }, env);
    await Promise.all(waits);
    expect(state.wrapped).toBe(3);
    expect(state.dispatched).toBe(3);
    expect(state.databaseUrl).toBe(binding ? env[binding].connectionString : undefined);
    expect(state.paths).toEqual(["/api/internal/assistant/maintenance"]);
    expect(info).toHaveBeenCalledExactlyOnceWith("Assistant maintenance completed", maintenanceCounts);
    expect(logs).toHaveLength(1);

    state.paths.length = 0;
    state.maintenanceStatus = 503;
    await expect(worker.scheduled({ cron: "0 0,12 * * *" }, env)).rejects.toThrow(
      /Assistant maintenance request returned HTTP 503/,
    );
    expect(state.paths).toEqual(["/api/internal/assistant/maintenance"]);

    state.paths.length = 0;
    delete env.ASSISTANT_SCHEDULER_SECRET;
    await worker.scheduled({ cron: "0 * * * *" }, env);
    expect(state.paths).toEqual([]);
    expect(state.wrapped).toBe(4);
    expect(state.dispatched).toBe(4);
  } finally {
    warn.mockRestore();
    info.mockRestore();
    vi.doUnmock("@/db/runtime.ts");
    vi.doUnmock("@/.open-next/worker.js");
    vi.resetModules();
    delete globalThis.__blogCronWorkerTest;
  }
});
