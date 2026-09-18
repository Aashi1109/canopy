import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import { startInactiveSpan } from "@sentry/core";
import { measureServerAction, sanitizeSentryError, sentryOptions } from "../lib/observability/sentry.ts";

const require = createRequire(import.meta.url);
const Sentry = require("@sentry/nextjs");
const { getRedirectError } = require("next/dist/client/components/redirect.js");

test("Sentry preserves actions and redirects, marks failures, and correlates child timings", async () => {
  const value = { ok: true, data: "private action result" };
  assert.equal(await measureServerAction("disabled", async () => value), value);
  const envelopes = [];
  Sentry.init({
    ...sentryOptions,
    dsn: "https://public@example.invalid/1",
    enabled: true,
    tracesSampleRate: 1,
    defaultIntegrations: [],
    transport: () => ({
      send: async (envelope) => {
        envelopes.push(envelope);
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
  try {
    assert.equal(
      await measureServerAction("test.success", async () => {
        const span = startInactiveSpan({ name: "db.query", op: "db.query", onlyIfParent: true });
        await setTimeout(5);
        span.end();
        return value;
      }),
      value,
    );
    for (const result of [{ ok: false }, { status: "error" }, { error: "private failure" }]) {
      assert.equal(await measureServerAction("test.handled", async () => result), result);
    }
    const failure = new Error("Failed query: select secret from users\nparams: private-token");
    await assert.rejects(
      measureServerAction("test.thrown", async () => {
        throw failure;
      }),
      (error) => error === failure,
    );
    const redirect = getRedirectError("/admin", "replace", 303);
    await assert.rejects(
      measureServerAction("test.redirect", async () => {
        throw redirect;
      }),
      (error) => error === redirect,
    );
    await Sentry.flush(2000);

    const items = envelopes.flatMap(([, entries]) => entries);
    const transactions = items.filter(([header]) => header.type === "transaction").map(([, event]) => event);
    const success = transactions.find((event) => event.transaction === "serverAction/test.success");
    assert.ok(success);
    const query = success.spans.find((span) => span.description === "db.query");
    assert.equal(query.trace_id, success.contexts.trace.trace_id);
    assert.equal(query.parent_span_id, success.contexts.trace.span_id);
    assert.ok(query.timestamp > query.start_timestamp);
    const handled = transactions.filter((event) => event.transaction === "serverAction/test.handled");
    assert.equal(handled.length, 3);
    assert.ok(handled.every((event) => event.contexts.trace.status === "internal_error"));
    assert.equal(
      transactions.find((event) => event.transaction === "serverAction/test.redirect").contexts.trace.status,
      "ok",
    );
    const errors = items.filter(([header]) => header.type === "event").map(([, event]) => event);
    assert.equal(errors.length, 1, "redirects and returned failures do not generate duplicate error issues");
    assert.equal(errors[0].exception.values[0].value, "Database query failed");
    assert.ok(errors[0].exception.values[0].stacktrace.frames.length > 0);
    assert.doesNotMatch(JSON.stringify(envelopes), /private action result|private failure|private-token|select secret/);
  } finally {
    await Sentry.close(2000);
  }
});

test("error sanitization preserves useful messages while removing connection credentials and bound SQL data", () => {
  const event = {
    exception: {
      values: [
        { value: "Failed query: select token from auth_sessions\nparams: session-secret" },
        { value: "connect rediss://default:redis-password@example.invalid:6379 token=private-token failed" },
        { value: "Connection timed out" },
      ],
    },
  };
  assert.equal(sanitizeSentryError(event), event);
  assert.equal(event.exception.values[2].value, "Connection timed out");
  assert.doesNotMatch(JSON.stringify(event), /session-secret|redis-password|private-token|select token/);
  assert.equal(sentryOptions.beforeBreadcrumb({ category: "console", message: "private SQL" }), null);
});
