import { expect, test } from "vitest";
import { handleAssistantMaintenanceRequest, runAssistantMaintenanceCron } from "../lib/assistant/cron.ts";

const secret = "test-assistant-scheduler-secret-for-tests";
const path = "/api/internal/assistant/maintenance";
const counts = { files: 3, runs: 2, failed: 1 };
const request = (authorization, method = "POST") =>
  new Request(`https://smarttools.test${path}`, {
    method,
    headers: authorization ? { authorization } : {},
  });

test("maintenance authenticates before invoking domain logic and returns only safe counts", async () => {
  let calls = 0;
  const cleanup = async () => {
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
    const response = await handleAssistantMaintenanceRequest(request(authorization), secret, cleanup);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  for (const configured of [undefined, "", "   ", "secret with spaces"]) {
    const response = await handleAssistantMaintenanceRequest(request(`Bearer ${secret}`), configured, cleanup);
    expect(response.status).toBe(503);
  }
  expect(calls).toBe(0);
  const response = await handleAssistantMaintenanceRequest(request(`bearer ${secret}`), secret, cleanup);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(counts);
  expect(calls).toBe(1);
});

test("GET cannot clean up and failed domain requests never expose internal error details", async () => {
  let calls = 0;
  const cleanup = async () => {
    calls++;
    throw new Error("postgres://private-password@database");
  };
  const get = await handleAssistantMaintenanceRequest(request(`Bearer ${secret}`, "GET"), secret, cleanup);
  expect(get.status).toBe(405);
  expect(get.headers.get("allow")).toBe("POST");
  expect(calls).toBe(0);
  const failed = await handleAssistantMaintenanceRequest(request(`Bearer ${secret}`), secret, cleanup);
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({ error: "[hidden]" });
  expect(calls).toBe(1);
});

test("maintenance returns the original failure message with a default for empty errors", async () => {
  for (const [error, expected] of [
    [new Error("Publishing connection timed out"), "Publishing connection timed out"],
    [new Error(""), "Assistant maintenance is temporarily unavailable."],
  ]) {
    const response = await handleAssistantMaintenanceRequest(request(`Bearer ${secret}`), secret, async () => {
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
    ASSISTANT_SCHEDULER_SECRET: secret,
    WORKER_SELF_REFERENCE: {
      async fetch(req) {
        received = req;
        return Response.json(counts);
      },
    },
  };
  expect(await runAssistantMaintenanceCron(env)).toEqual(counts);
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
    ASSISTANT_SCHEDULER_SECRET: secret,
    ASSISTANT_MAINTENANCE_URL: `https://docker.example.test${path}`,
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
  expect(await runAssistantMaintenanceCron(env, fetchRemote)).toEqual(counts);
  expect(received.url).toBe(env.ASSISTANT_MAINTENANCE_URL);
  expect(received.redirect).toBe("manual");
  expect(bindingCalls).toBe(0);
  await expect(
    runAssistantMaintenanceCron(
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
      runAssistantMaintenanceCron(
        { ASSISTANT_SCHEDULER_SECRET: secret, ASSISTANT_MAINTENANCE_URL: target },
        fetchRemote,
      ),
    ).rejects.toThrow(/configuration/);
  }
  await expect(
    runAssistantMaintenanceCron({ ASSISTANT_MAINTENANCE_URL: `https://docker.example.test${path}` }, fetchRemote),
  ).rejects.toThrow(/configuration/);
  await expect(runAssistantMaintenanceCron({ ASSISTANT_SCHEDULER_SECRET: secret })).rejects.toThrow(/configuration/);
  expect(calls).toBe(0);
});

test("cron consumes successful responses and rejects unsafe, oversized or failed outcomes", async () => {
  const env = {
    ASSISTANT_SCHEDULER_SECRET: secret,
    ASSISTANT_MAINTENANCE_URL: `https://docker.example.test${path}`,
  };
  const response = Response.json(counts);
  expect(await runAssistantMaintenanceCron(env, async () => response)).toEqual(counts);
  expect(response.bodyUsed).toBe(true);
  for (const value of [null, {}, { ...counts, files: -1 }, { ...counts, runs: 1.5 }]) {
    await expect(runAssistantMaintenanceCron(env, async () => Response.json(value))).rejects.toThrow(
      /invalid response/,
    );
  }
  await expect(runAssistantMaintenanceCron(env, async () => new Response("x".repeat(4097)))).rejects.toThrow(
    /invalid response/,
  );
  await expect(
    runAssistantMaintenanceCron(env, async () => new Response("private database error", { status: 503 })),
  ).rejects.toThrow(/HTTP 503/);
  await expect(
    runAssistantMaintenanceCron(env, async () => {
      throw new Error(`Secret ${secret}`);
    }),
  ).rejects.toMatchObject({
    message: "Assistant maintenance request failed.",
  });
});
