import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  context: vi.fn(),
  binding: vi.fn(),
  getPolicy: vi.fn(),
  savePolicy: vi.fn(),
}));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: mocks.context }));
vi.mock("../lib/auth/session", () => ({
  getSession: mocks.getSession,
  AuthServiceError: class AuthServiceError extends Error {},
}));
vi.mock("../lib/routing/requestOrigin", () => ({
  isSameOriginRequest: (request) => request.headers.get("origin") === new URL(request.url).origin,
}));
vi.mock("../lib/downloaders/policy", () => ({
  getDownloadPolicy: mocks.getPolicy,
  saveDownloadPolicy: mocks.savePolicy,
}));

import { AuthServiceError } from "../lib/auth/session";
import { DownloadError } from "../lib/downloaders/contracts.ts";
import { handleDownloadRequest } from "../lib/downloaders/http.ts";
import { createGuestCookie, readGuestOwner, verifyCapability } from "../lib/downloaders/security.ts";

const secret = "fixture-guest-secret-".repeat(3);
const accountId = "10000000-0000-4000-8000-000000000001";
const jobId = "20000000-0000-4000-8000-000000000001";
const requestId = "30000000-0000-4000-8000-000000000001";
const createInput = {
  platform: "youtube",
  url: "https://www.youtube.com/watch?v=abcdefghijk",
  quality: "720",
  requestId,
};
const cookie = createGuestCookie(secret).split(";")[0];
const guest = readGuestOwner(new Headers({ cookie }), [secret]);

function request(method = "POST", body = {}, headers = {}) {
  return new Request("https://canopy.example/api/downloads", {
    method,
    headers: { origin: "https://canopy.example", "content-type": "application/json", cookie, ...headers },
    ...(method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(null);
  mocks.context.mockResolvedValue({
    cf: {},
    env: {
      DOWNLOADERS: { fetch: mocks.binding },
      DOWNLOADERS_GUEST_SECRET: secret,
      DOWNLOADERS_NETWORK_SECRET: "fixture-network-secret-".repeat(3),
    },
  });
  mocks.binding.mockImplementation(async () => Response.json({ job: { id: jobId } }));
  mocks.getPolicy.mockResolvedValue({ version: 1 });
  mocks.savePolicy.mockResolvedValue({ version: 2 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("API timing omits invalid IDs, source data, identity and raw failures", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    expect((await handleDownloadRequest(request("GET"), "status", { jobId: "private-invalid-id" })).status).toBe(400);
    expect(
      (await handleDownloadRequest(request("POST", { ...createInput, requestId: "private-request-id" }), "create"))
        .status,
    ).toBe(400);
    mocks.getSession.mockResolvedValue({ user: { id: accountId, status: "active" } });
    mocks.binding.mockRejectedValue(new Error("private-upstream-failure"));
    expect((await handleDownloadRequest(request("POST", createInput), "create")).status).toBe(503);
    const events = log.mock.calls.map(([line]) => JSON.parse(line));
    expect(events).toHaveLength(3);
    expect(events[0].jobId).toBeUndefined();
    expect(events[1].requestId).toBeUndefined();
    expect(events[2]).toMatchObject({ event: "downloader_timing", stage: "api", action: "create", requestId });
    expect(events.every((event) => Number.isFinite(event.durationMs) && event.durationMs >= 0)).toBe(true);
    const output = JSON.stringify(events);
    for (const privateValue of [
      "private-invalid-id",
      "private-request-id",
      "private-upstream-failure",
      createInput.url,
      accountId,
      guest.id,
      cookie,
      secret,
    ]) {
      expect(output).not.toContain(privateValue);
    }
  } finally {
    log.mockRestore();
  }
});

test("Server-Timing exposes numeric stage durations only in development and preserves the response", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    vi.stubEnv("DOWNLOADERS_LOCAL", "false");
    for (const mode of ["development", "production"]) {
      vi.stubEnv("NODE_ENV", mode);
      const response = await handleDownloadRequest(request("POST", createInput), "create");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ job: { id: jobId } });
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      if (mode === "development") {
        expect(response.headers.get("server-timing")).toMatch(
          /^environment;dur=\d+, identity;dur=\d+, worker;dur=\d+$/,
        );
      } else {
        expect(response.headers.get("server-timing")).toBeNull();
      }
    }
  } finally {
    log.mockRestore();
  }
});

test("format inspection forwards the bounded flag without allowing an initial format selection", async () => {
  expect((await handleDownloadRequest(request("POST", { ...createInput, inspect: true }), "create")).status).toBe(200);
  const forwarded = await mocks.binding.mock.calls[0][0].json();
  expect(forwarded.input).toEqual({ ...createInput, inspect: true });
  mocks.binding.mockClear();
  expect(
    (await handleDownloadRequest(request("POST", { ...createInput, selectedFormat: "18" }), "create")).status,
  ).toBe(400);
  expect(mocks.binding).not.toHaveBeenCalled();
});

test("format selection forwards only the selected ID and server-established owner", async () => {
  const response = await handleDownloadRequest(request("POST", { formatId: "137+140" }), "select", { jobId });
  expect(response.status).toBe(200);
  const forwarded = mocks.binding.mock.calls[0][0];
  expect(forwarded.url).toBe("https://downloaders.internal/select");
  expect(await forwarded.json()).toEqual({ owners: [guest], jobId, formatId: "137+140" });
});

test.each([
  { formatId: "best", owner: accountId },
  { formatId: "bestvideo/best" },
  { formatId: "18", url: createInput.url },
  {},
])("rejects injected or malformed selection %j", async (body) => {
  expect((await handleDownloadRequest(request("POST", body), "select", { jobId })).status).toBe(400);
  expect(mocks.binding).not.toHaveBeenCalled();
});

test("cross-origin format selection is rejected before invoking the Worker", async () => {
  expect(
    (
      await handleDownloadRequest(
        request("POST", { formatId: "18" }, { origin: "https://attacker.example" }),
        "select",
        { jobId },
      )
    ).status,
  ).toBe(403);
  expect(mocks.binding).not.toHaveBeenCalled();
});

test("missing execution configuration rejects before submission without suggesting a timed retry", async () => {
  mocks.context.mockResolvedValue({ env: { DOWNLOADERS_GUEST_SECRET: secret } });
  const response = await handleDownloadRequest(request("POST", createInput), "create");
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "DOWNLOADS_NOT_CONFIGURED", retryable: false } });
  expect(response.headers.get("retry-after")).toBeNull();
  expect(mocks.binding).not.toHaveBeenCalled();
});

test("development forwards only to a configured loopback Worker with a body-bound capability", async () => {
  mocks.context.mockResolvedValue({ env: {}, cf: {} });
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DOWNLOADERS_LOCAL", "true");
  vi.stubEnv("DOWNLOADERS_LOCAL_ORIGIN", "http://127.0.0.1:8788");
  vi.stubEnv("DOWNLOADERS_CONTROL_SECRET", secret);
  vi.stubEnv("DOWNLOADERS_GUEST_SECRET", secret);
  vi.stubEnv("DOWNLOADERS_NETWORK_SECRET", secret);
  const fetcher = vi.fn(async () => Response.json({ job: { id: jobId } }, { status: 202 }));
  vi.stubGlobal("fetch", fetcher);
  const response = await handleDownloadRequest(request("POST", createInput), "create");
  expect(response.status).toBe(202);
  expect(mocks.context).not.toHaveBeenCalled();
  const [forwarded] = fetcher.mock.calls[0];
  expect(forwarded.url).toBe("http://127.0.0.1:8788/create");
  const body = await forwarded.text();
  expect(JSON.parse(body).owners).toEqual([guest]);
  const proof = verifyCapability(forwarded.headers.get("authorization").slice(7), [secret]);
  expect(proof).toMatchObject({
    purpose: "download-local-control-v1",
    path: "/create",
    bodyHash: createHash("sha256").update(body).digest("hex"),
  });
  expect(forwarded.redirect).toBe("manual");
});

test("the local artifact endpoint forwards its signed redirect without following or rejecting it", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DOWNLOADERS_LOCAL", "true");
  vi.stubEnv("DOWNLOADERS_LOCAL_ORIGIN", "http://127.0.0.1:8788");
  vi.stubEnv("DOWNLOADERS_CONTROL_SECRET", secret);
  vi.stubEnv("DOWNLOADERS_GUEST_SECRET", secret);
  const location = "http://127.0.0.1:8788/__download-storage/sealed/fixture?capability=fixture";
  const fetcher = vi.fn(async (forwarded) => {
    if (forwarded.redirect === "error") throw new TypeError("Redirect disallowed");
    if (forwarded.redirect === "follow") return new Response("media bytes");
    return new Response(null, { status: 303, headers: { Location: location } });
  });
  vi.stubGlobal("fetch", fetcher);
  const response = await handleDownloadRequest(request("GET"), "artifact", {
    jobId,
    artifactId: "40000000-0000-4000-8000-000000000001",
  });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(location);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(await response.text()).toBe("");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0].url).toBe("http://127.0.0.1:8788/artifact");
});

test.each([
  ["production", "http://localhost:8788"],
  ["development", "https://attacker.example"],
  ["development", "http://localhost.attacker.example:8788"],
  ["development", "http://user:password@localhost:8788"],
])("local execution cannot escape its development loopback boundary: %s %s", async (mode, origin) => {
  mocks.context.mockRejectedValue(new Error("No Workers context"));
  vi.stubEnv("NODE_ENV", mode);
  vi.stubEnv("DOWNLOADERS_LOCAL", "true");
  vi.stubEnv("DOWNLOADERS_LOCAL_ORIGIN", origin);
  vi.stubEnv("DOWNLOADERS_CONTROL_SECRET", secret);
  vi.stubEnv("DOWNLOADERS_GUEST_SECRET", secret);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const response = await handleDownloadRequest(request("POST", createInput), "create");
  expect(response.status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
});

test("authentication outage never downgrades an existing signed guest to anonymous execution", async () => {
  mocks.getSession.mockRejectedValue(new AuthServiceError("sensitive internal detail"));
  const response = await handleDownloadRequest(request("POST", createInput), "create");
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "AUTH_UNAVAILABLE" } });
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(mocks.binding).not.toHaveBeenCalled();
});

test("a generic auth failure is also closed and sanitized", async () => {
  mocks.getSession.mockRejectedValue(new Error("cookie=private upstream credential"));
  const response = await handleDownloadRequest(request(), "guest");
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("credential");
  expect(response.headers.get("set-cookie")).toBeNull();
});

test("sign-in retains valid guest proof for old jobs while new jobs use the account", async () => {
  mocks.getSession.mockResolvedValue({ user: { id: accountId, status: "active" } });
  await handleDownloadRequest(request("GET"), "status", { jobId });
  const statusInput = await mocks.binding.mock.calls[0][0].json();
  expect(statusInput.owners).toEqual([{ kind: "account", id: accountId }, guest]);
  await handleDownloadRequest(request("POST", createInput), "create");
  const create = await mocks.binding.mock.calls[1][0].json();
  expect(create.owners).toEqual([{ kind: "account", id: accountId }]);
  expect(create.input).toEqual(createInput);
});

test("suspended accounts cannot fall back to their retained guest proof", async () => {
  mocks.getSession.mockResolvedValue({ user: { id: accountId, status: "suspended" } });
  const response = await handleDownloadRequest(request("POST", createInput), "create");
  expect(response.status).toBe(403);
  expect(mocks.binding).not.toHaveBeenCalled();
});

test("tampered guest identity and invalid resource IDs never reach the binding", async () => {
  const tampered = cookie.slice(0, -1) + (cookie.endsWith("a") ? "b" : "a");
  expect((await handleDownloadRequest(request("GET", {}, { cookie: tampered }), "status", { jobId })).status).toBe(401);
  expect((await handleDownloadRequest(request("GET"), "status", { jobId: "../other-owner" })).status).toBe(400);
  expect(mocks.binding).not.toHaveBeenCalled();
});

test("mutations reject missing or cross-origin CSRF proof and real oversized bodies", async () => {
  for (const origin of ["", "https://attacker.example"]) {
    expect((await handleDownloadRequest(request("POST", createInput, { origin }), "create")).status).toBe(403);
  }
  expect((await handleDownloadRequest(request("POST", " ".repeat(8193)), "create")).status).toBe(413);
  expect((await handleDownloadRequest(request("POST", "{}", { "content-type": "text/plain" }), "guest")).status).toBe(
    415,
  );
  expect(mocks.binding).not.toHaveBeenCalled();
});

test("arbitrary owner or quota fields cannot be forwarded in a create request", async () => {
  for (const extra of [
    { owners: [{ kind: "account", id: accountId }] },
    { ownerId: accountId },
    { networkHash: "forged" },
    { daily: 999999 },
  ]) {
    expect((await handleDownloadRequest(request("POST", { ...createInput, ...extra }), "create")).status).toBe(400);
  }
  expect(mocks.binding).not.toHaveBeenCalled();
});

test("new guest proof is an opaque Secure host cookie and response is private", async () => {
  const response = await handleDownloadRequest(request("POST", {}, { cookie: "" }), "guest");
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toContain("__Host-canopy-downloader=");
  expect(setCookie).toContain("Secure; HttpOnly; SameSite=Lax");
  expect(setCookie).not.toContain("Domain=");
  const actual = readGuestOwner(new Headers({ cookie: setCookie.split(";")[0] }), [secret]);
  const { owner } = await response.json();
  expect(owner.kind).toBe("guest");
  expect(owner.id).not.toBe(actual.id);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

test("admin policy uses the authenticated actor and returns permission denial", async () => {
  expect((await handleDownloadRequest(request("GET"), "policy")).status).toBe(401);
  expect(mocks.getPolicy).not.toHaveBeenCalled();
  mocks.getSession.mockResolvedValue({ user: { id: accountId, status: "active" } });
  mocks.getPolicy.mockRejectedValue(new DownloadError("FORBIDDEN", "Permission denied.", 403));
  const denied = await handleDownloadRequest(request("GET"), "policy");
  expect(denied.status).toBe(403);
  expect(mocks.getPolicy).toHaveBeenCalledWith(accountId);
  const update = {
    expectedVersion: 1,
    guest: { daily: 5, active: 1, queued: 1 },
    account: { daily: 10, active: 2, queued: 2 },
    actorUserId: "forged",
  };
  mocks.savePolicy.mockRejectedValue(new DownloadError("FORBIDDEN", "Permission denied.", 403));
  expect((await handleDownloadRequest(request("POST", update), "policy")).status).toBe(403);
  expect(mocks.savePolicy).toHaveBeenCalledWith(accountId, update);
  expect(mocks.binding).not.toHaveBeenCalled();
});
