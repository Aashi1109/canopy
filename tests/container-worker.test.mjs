import { afterEach, beforeEach, expect, test, vi } from "vitest";

const cron = vi.hoisted(() => ({
  publish: vi.fn(),
  maintain: vi.fn(),
}));

vi.mock("@cloudflare/containers", () => ({
  Container: class {
    constructor(ctx, env) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));
vi.mock("../lib/blog/cron", () => ({ runBlogPublishCron: cron.publish }));
vi.mock("../lib/assistant/cron.ts", () => ({ runAssistantMaintenanceCron: cron.maintain }));

import worker, { CanopyContainer } from "../worker.ts";

function environment() {
  const container = { fetch: vi.fn().mockResolvedValue(new Response("container response")) };
  return {
    APP_URL: "https://smarttools.example",
    DATABASE_URL: "postgres://test-user:test-password@database.example/canopy",
    BETTER_AUTH_SECRET: "test-auth-secret-only",
    CANOPY_CONTAINER: { getByName: vi.fn().mockReturnValue(container) },
    container,
  };
}

beforeEach(() => {
  cron.publish.mockResolvedValue({ attempted: 1, published: 1, failed: 0, remaining: 0 });
  cron.maintain.mockResolvedValue({ files: 1, runs: 1, failed: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("requests reuse the named container while retaining request data and auth headers", async () => {
  const env = environment();
  const request = new Request("https://smarttools.example/api/tools/run?language=fr&download=1", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-session-token",
      Cookie: "smarttools.session_token=test-session-cookie",
      Origin: "https://smarttools.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: "test input" }),
  });

  await worker.fetch(request, env);
  await worker.fetch(new Request("https://smarttools.example/account"), env);

  expect(env.CANOPY_CONTAINER.getByName.mock.calls).toEqual([["canopy"], ["canopy"]]);
  expect(env.container.fetch).toHaveBeenCalledTimes(2);
  const forwarded = env.container.fetch.mock.calls[0][0];
  expect(forwarded).toBeInstanceOf(Request);
  expect(forwarded).not.toBe(request);
  expect(forwarded.url).toBe(request.url);
  expect(forwarded.method).toBe("POST");
  expect(forwarded.redirect).toBe("manual");
  expect(forwarded.headers.get("authorization")).toBe("Bearer test-session-token");
  expect(forwarded.headers.get("cookie")).toBe("smarttools.session_token=test-session-cookie");
  expect(forwarded.headers.get("origin")).toBe("https://smarttools.example");
  expect(forwarded.headers.get("content-type")).toBe("application/json");
  expect(await forwarded.json()).toEqual({ text: "test input" });
});

test.each([
  ["https://smarttools.example/tools", "smarttools.example", "https", "443"],
  ["https://smarttools.example:8443/tools", "smarttools.example:8443", "https", "8443"],
  ["http://localhost:8787/tools", "localhost:8787", "http", "8787"],
  ["http://smarttools.example/tools", "smarttools.example", "http", "80"],
])(
  "forwarding derives host and protocol from %s and replaces spoofed proxy headers",
  async (url, host, protocol, port) => {
    const env = environment();
    const request = new Request(url, {
      headers: {
        Host: "attacker.example",
        Forwarded: "for=192.0.2.1;host=attacker.example;proto=http",
        "X-Forwarded-Host": "attacker.example",
        "X-Forwarded-Proto": "http",
        "X-Forwarded-Port": "9999",
        "X-Forwarded-For": "192.0.2.1",
        "X-Real-IP": "192.0.2.2",
        "CF-Connecting-IP": "203.0.113.10",
        "cf-container-target-port": "9229",
      },
    });

    await worker.fetch(request, env);
    const headers = env.container.fetch.mock.calls[0][0].headers;

    expect(headers.get("host")).toBe(host);
    expect(headers.get("x-forwarded-host")).toBe(host);
    expect(headers.get("x-forwarded-proto")).toBe(protocol);
    expect(headers.get("x-forwarded-port")).toBe(port);
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.10");
    expect(headers.get("x-real-ip")).toBe("203.0.113.10");
    expect(headers.has("forwarded")).toBe(false);
    expect(headers.has("cf-container-target-port")).toBe(false);
  },
);

test("forwarding removes untrusted client IP headers when Cloudflare did not supply an IP", async () => {
  const env = environment();
  await worker.fetch(
    new Request("https://smarttools.example", {
      headers: { "X-Forwarded-For": "192.0.2.1", "X-Real-IP": "192.0.2.2" },
    }),
    env,
  );

  const headers = env.container.fetch.mock.calls[0][0].headers;
  expect(headers.has("x-forwarded-for")).toBe(false);
  expect(headers.has("x-real-ip")).toBe(false);
});

test("request uploads begin forwarding before the body completes and retain cancellation", async () => {
  const env = environment();
  const abort = new AbortController();
  let upload;
  const body = new ReadableStream({
    start(controller) {
      upload = controller;
    },
  });
  const request = new Request("https://smarttools.example/api/upload", {
    method: "POST",
    body,
    duplex: "half",
    signal: abort.signal,
  });

  await worker.fetch(request, env);
  const forwarded = env.container.fetch.mock.calls[0][0];
  expect(forwarded.bodyUsed).toBe(false);
  upload.enqueue(new TextEncoder().encode("upload content"));
  upload.close();
  expect(await forwarded.text()).toBe("upload content");
  expect(forwarded.signal.aborted).toBe(false);
  abort.abort();
  expect(forwarded.signal.aborted).toBe(true);
});

test("streaming responses pass through without buffering or changing headers and status", async () => {
  const env = environment();
  let output;
  const body = new ReadableStream({
    start(controller) {
      output = controller;
    },
  });
  const headers = new Headers({ "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
  headers.append("Set-Cookie", "session=first; Path=/; HttpOnly; Secure");
  headers.append("Set-Cookie", "preference=second; Path=/; Secure");
  const containerResponse = new Response(body, { status: 202, headers });
  env.container.fetch.mockResolvedValue(containerResponse);

  const response = await worker.fetch(new Request("https://smarttools.example/api/assistant"), env);

  expect(response).toBe(containerResponse);
  expect(response.bodyUsed).toBe(false);
  expect(response.status).toBe(202);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  expect(response.headers.getSetCookie()).toEqual([
    "session=first; Path=/; HttpOnly; Secure",
    "preference=second; Path=/; Secure",
  ]);
  output.enqueue(new TextEncoder().encode("data: test event\n\n"));
  output.close();
  expect(await response.text()).toBe("data: test event\n\n");
});

test("redirect and application error responses are returned unchanged", async () => {
  const env = environment();
  for (const containerResponse of [
    new Response(null, { status: 307, headers: { Location: "https://accounts.example/callback" } }),
    Response.json({ error: "Invalid input" }, { status: 422 }),
  ]) {
    env.container.fetch.mockResolvedValue(containerResponse);
    const response = await worker.fetch(new Request("https://smarttools.example/api/auth"), env);
    expect(response).toBe(containerResponse);
  }
});

test("container transport failures return a retryable response without disclosing internal details", async () => {
  const env = environment();
  env.container.fetch.mockRejectedValue(
    new Error("connection failed: postgres://private-user:private-secret@database"),
  );

  const response = await worker.fetch(new Request("https://smarttools.example/tools"), env);

  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  const message = await response.text();
  expect(message).toMatch(/unavailable|retry|try again/i);
  expect(message).not.toMatch(/postgres|private-user|private-secret|connection failed/i);
});

test("container setup forwards supported runtime settings and excludes Worker bindings and deployment secrets", () => {
  const runtimeSettings = {
    APP_URL: "https://smarttools.example",
    DATABASE_URL: "postgres://test@database.example/canopy",
    BETTER_AUTH_SECRET: "test-auth-secret-only",
    DATABASE_POOL_MAX: "3",
    REDIS_URL: "redis://cache.example:6379",
    CACHE_ENABLED: "false",
    AUTH_COOKIE_PREFIX: "canopy",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    EMAIL_PROVIDER: "cloudflare",
    CLOUDFLARE_EMAIL_ACCOUNT_ID: "test-email-account",
    CLOUDFLARE_EMAIL_API_TOKEN: "test-email-token",
    ACCOUNTS_EMAIL: "accounts@smarttools.example",
    SUPPORT_EMAIL: "support@smarttools.example",
    CLOUDINARY_CLOUD_NAME: "test-cloud",
    CLOUDINARY_API_KEY: "test-cloudinary-key",
    CLOUDINARY_API_SECRET: "test-cloudinary-secret",
    CLOUDINARY_URL: "cloudinary://test-key:test-secret@test-cloud",
    SCHEDULER_SECRET: "test-scheduler-secret",
    AI_ENABLED: "true",
    AI_PROVIDER: "openai",
    AI_TITLE_MODEL: "test-title-model",
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL: "test-model",
    VERCEL_ENV: "production",
    GA_MEASUREMENT_ID: "G-TEST",
    GA_ENABLE_IN_DEVELOPMENT: "false",
    AHREFS_API_KEY: "test-ahrefs-key",
    GEMINI_API_KEY: "test-gemini-key",
  };
  const excludedSettings = {
    CLOUDFLARE_API_TOKEN: "test-deploy-token",
    CLOUDFLARE_ACCOUNT_ID: "test-deploy-account",
    SENTRY_AUTH_TOKEN: "test-build-sentry-token",
    BLOG_PUBLISH_URL: "https://smarttools.example/api/internal/blog/publish-due",
    ASSISTANT_MAINTENANCE_URL: "https://smarttools.example/api/internal/assistant/maintenance",
    CI: "true",
    PLAYWRIGHT_APP_URL: "http://test-runner:3000",
    WORKER_SELF_REFERENCE: { fetch: vi.fn() },
    CANOPY_CONTAINER: { getByName: vi.fn() },
    DB: { connectionString: "postgres://old-worker-binding" },
    UNKNOWN_SECRET: "test-unknown-secret",
  };
  const container = new CanopyContainer(
    {},
    {
      ...runtimeSettings,
      ...excludedSettings,
      NODE_ENV: "development",
      PORT: "9229",
      HOSTNAME: "127.0.0.1",
    },
  );

  expect(container.defaultPort).toBe(3000);
  expect(container.sleepAfter).toBe("5m");
  expect(container.enableInternet).toBe(true);
  expect(container.envVars).toMatchObject({
    ...runtimeSettings,
    NODE_ENV: "production",
    PORT: "3000",
    HOSTNAME: "0.0.0.0",
  });
  for (const key of Object.keys(excludedSettings)) expect(container.envVars).not.toHaveProperty(key);
});

test.each(["APP_URL", "DATABASE_URL", "BETTER_AUTH_SECRET"])(
  "container startup fails safely when required %s is missing or blank",
  (key) => {
    for (const value of [undefined, "", "   "]) {
      const env = { ...environment(), [key]: value };
      expect(() => new CanopyContainer({}, env)).toThrow("Container runtime configuration is incomplete.");
    }
  },
);

test("configured cron schedules continue to dispatch the correct maintenance helper", async () => {
  const env = environment();
  vi.spyOn(console, "info").mockImplementation(() => {});

  await worker.scheduled({ cron: "*/30 * * * *" }, env);
  expect(cron.publish).toHaveBeenCalledExactlyOnceWith(env);
  expect(cron.maintain).not.toHaveBeenCalled();
  await worker.scheduled({ cron: "0 0,12 * * *" }, env);
  expect(cron.maintain).toHaveBeenCalledExactlyOnceWith(env);
  await worker.scheduled({ cron: "0 1 * * *" }, env);
  expect(cron.publish).toHaveBeenCalledTimes(1);
  expect(cron.maintain).toHaveBeenCalledTimes(1);
  expect(env.container.fetch).not.toHaveBeenCalled();
});
