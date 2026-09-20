import assert from "node:assert/strict";
import test from "node:test";
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
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  for (const configured of [undefined, "", "   ", "secret with spaces"]) {
    const response = await handleAssistantMaintenanceRequest(request(`Bearer ${secret}`), configured, cleanup);
    assert.equal(response.status, 503);
  }
  assert.equal(calls, 0);
  const response = await handleAssistantMaintenanceRequest(request(`bearer ${secret}`), secret, cleanup);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), counts);
  assert.equal(calls, 1);
});

test("GET cannot clean up and failed domain requests never expose internal error details", async () => {
  let calls = 0;
  const cleanup = async () => {
    calls++;
    throw new Error("postgres://private-password@database");
  };
  const get = await handleAssistantMaintenanceRequest(request(`Bearer ${secret}`, "GET"), secret, cleanup);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
  assert.equal(calls, 0);
  const failed = await handleAssistantMaintenanceRequest(request(`Bearer ${secret}`), secret, cleanup);
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "[hidden]" });
  assert.equal(calls, 1);
});

test("maintenance returns the original failure message with a default for empty errors", async () => {
  for (const [error, expected] of [
    [new Error("Publishing connection timed out"), "Publishing connection timed out"],
    [new Error(""), "Assistant maintenance is temporarily unavailable."],
  ]) {
    const response = await handleAssistantMaintenanceRequest(request(`Bearer ${secret}`), secret, async () => {
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
    ASSISTANT_SCHEDULER_SECRET: secret,
    WORKER_SELF_REFERENCE: {
      async fetch(req) {
        received = req;
        return Response.json(counts);
      },
    },
  };
  assert.deepEqual(await runAssistantMaintenanceCron(env), counts);
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
  assert.deepEqual(await runAssistantMaintenanceCron(env, fetchRemote), counts);
  assert.equal(received.url, env.ASSISTANT_MAINTENANCE_URL);
  assert.equal(received.redirect, "manual");
  assert.equal(bindingCalls, 0);
  await assert.rejects(
    runAssistantMaintenanceCron(
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
      runAssistantMaintenanceCron(
        { ASSISTANT_SCHEDULER_SECRET: secret, ASSISTANT_MAINTENANCE_URL: target },
        fetchRemote,
      ),
      /configuration/,
    );
  }
  await assert.rejects(
    runAssistantMaintenanceCron({ ASSISTANT_MAINTENANCE_URL: `https://docker.example.test${path}` }, fetchRemote),
    /configuration/,
  );
  await assert.rejects(runAssistantMaintenanceCron({ ASSISTANT_SCHEDULER_SECRET: secret }), /configuration/);
  assert.equal(calls, 0);
});

test("cron consumes successful responses and rejects unsafe, oversized or failed outcomes", async () => {
  const env = {
    ASSISTANT_SCHEDULER_SECRET: secret,
    ASSISTANT_MAINTENANCE_URL: `https://docker.example.test${path}`,
  };
  const response = Response.json(counts);
  assert.deepEqual(await runAssistantMaintenanceCron(env, async () => response), counts);
  assert.equal(response.bodyUsed, true);
  for (const value of [null, {}, { ...counts, files: -1 }, { ...counts, runs: 1.5 }]) {
    await assert.rejects(
      runAssistantMaintenanceCron(env, async () => Response.json(value)),
      /invalid response/,
    );
  }
  await assert.rejects(
    runAssistantMaintenanceCron(env, async () => new Response("x".repeat(4097))),
    /invalid response/,
  );
  await assert.rejects(
    runAssistantMaintenanceCron(env, async () => new Response("private database error", { status: 503 })),
    /HTTP 503/,
  );
  await assert.rejects(
    runAssistantMaintenanceCron(env, async () => {
      throw new Error(`Secret ${secret}`);
    }),
    {
      message: "Assistant maintenance request failed.",
    },
  );
});
