// @vitest-environment jsdom
import { expect, test } from "vitest";
import { createRequire } from "node:module";
import { setTimeout } from "node:timers/promises";
import { startInactiveSpan } from "@sentry/core";
import {
  initializeSentry,
  measureServerAction,
  sanitizeSentryError,
  sentryOptions,
} from "../lib/observability/sentry.ts";

const require = createRequire(import.meta.url);
const Sentry = require("@sentry/nextjs");
const { getRedirectError } = require("next/dist/client/components/redirect.js");

test("Sentry preserves actions and redirects, marks failures, and correlates child timings", async () => {
  const value = { ok: true, data: "private action result" };
  expect(await measureServerAction("disabled", async () => value)).toBe(value);
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
    expect(
      await measureServerAction("test.success", async () => {
        const span = startInactiveSpan({ name: "db.query", op: "db.query", onlyIfParent: true });
        await setTimeout(5);
        span.end();
        return value;
      }),
    ).toBe(value);
    for (const result of [{ ok: false }, { status: "error" }, { error: "private failure" }]) {
      expect(await measureServerAction("test.handled", async () => result)).toBe(result);
    }
    const failure = new Error("Failed query: select secret from users\nparams: private-token");
    await (async () => {
      let __err;
      try {
        await measureServerAction("test.thrown", async () => {
          throw failure;
        });
      } catch (__e) {
        __err = __e;
      }
      expect(__err).toBeDefined();
      expect(((error) => error === failure)(__err)).toBe(true);
    })();
    const redirect = getRedirectError("/admin", "replace", 303);
    await (async () => {
      let __err;
      try {
        await measureServerAction("test.redirect", async () => {
          throw redirect;
        });
      } catch (__e) {
        __err = __e;
      }
      expect(__err).toBeDefined();
      expect(((error) => error === redirect)(__err)).toBe(true);
    })();
    await Sentry.flush(2000);

    const items = envelopes.flatMap(([, entries]) => entries);
    const transactions = items.filter(([header]) => header.type === "transaction").map(([, event]) => event);
    const success = transactions.find((event) => event.transaction === "serverAction/test.success");
    expect(success).toBeTruthy();
    expect(success.release).toBe(process.env.NODE_ENV ?? "development");
    const query = success.spans.find((span) => span.description === "db.query");
    expect(query.trace_id).toBe(success.contexts.trace.trace_id);
    expect(query.parent_span_id).toBe(success.contexts.trace.span_id);
    expect(query.timestamp > query.start_timestamp).toBeTruthy();
    const handled = transactions.filter((event) => event.transaction === "serverAction/test.handled");
    expect(handled.length).toBe(3);
    expect(handled.every((event) => event.contexts.trace.status === "internal_error")).toBeTruthy();
    expect(transactions.find((event) => event.transaction === "serverAction/test.redirect").contexts.trace.status).toBe(
      "ok",
    );
    const errors = items.filter(([header]) => header.type === "event").map(([, event]) => event);
    expect(errors.length, "redirects and returned failures do not generate duplicate error issues").toBe(1);
    expect(errors[0].release).toBe(process.env.NODE_ENV ?? "development");
    expect(errors[0].exception.values[0].value).toBe("Database query failed");
    expect(errors[0].exception.values[0].stacktrace.frames.length > 0).toBeTruthy();
    expect(JSON.stringify(envelopes)).not.toMatch(/private action result|private failure|private-token|select secret/);

    const initialUrl = `https://smarttools.lol/devtools/json-formatter#share=${encodeURIComponent(
      JSON.stringify({ v: 1, input: "initial-private-input" }),
    )}`;
    const nextUrl = `https://smarttools.lol/devtools/json-formatter#share=${encodeURIComponent(
      JSON.stringify({ v: 1, input: "edited-private-input" }),
    )}`;
    Sentry.addBreadcrumb({ category: "navigation", data: { from: initialUrl, to: nextUrl } });
    Sentry.captureEvent({
      message: "Shared tool failed to render",
      // HttpContext attaches the initial browser URL to this field before beforeSend.
      request: { url: initialUrl },
      exception: { values: [{ type: "Error", value: `Unable to open ${nextUrl}` }] },
    });
    const pageSpan = startInactiveSpan({
      name: "shared tool page",
      op: "pageload",
      attributes: { "url.full": initialUrl },
    });
    pageSpan.end();
    await Sentry.flush(2000);
    const updatedItems = envelopes.flatMap(([, entries]) => entries);
    expect(updatedItems.some(([header, event]) => header.type === "event" && event.request?.url)).toBe(true);
    expect(
      updatedItems.some(([header, event]) => header.type === "transaction" && event.transaction === "shared tool page"),
    ).toBe(true);
    expect(JSON.stringify(envelopes)).toContain("/devtools/json-formatter");
    expect(JSON.stringify(envelopes)).not.toMatch(/initial-private-input|edited-private-input|%7B/);
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
  expect(sanitizeSentryError(event)).toBe(event);
  expect(event.exception.values[2].value).toBe("Connection timed out");
  expect(JSON.stringify(event)).not.toMatch(/session-secret|redis-password|private-token|select token/);
  expect(sentryOptions.beforeBreadcrumb({ category: "console", message: "private SQL" })).toBe(null);
});

test("shared URL inputs are removed from error, navigation and trace telemetry without losing the route", () => {
  const sharedUrl = `https://smarttools.lol/devtools/text-case-converter#share=${encodeURIComponent(
    JSON.stringify({ v: 1, input: "Private input: don't collect me", settings: { mode: "upper" } }),
  )}`;
  const safeUrl = "https://smarttools.lol/devtools/text-case-converter#share=[Filtered]";
  const event = {
    request: { url: sharedUrl },
    message: `Could not load ${sharedUrl}`,
    logentry: { message: `Loading ${sharedUrl}` },
    exception: {
      values: [
        {
          value: `Unable to open ${sharedUrl} after navigation`,
          stacktrace: { frames: [{ filename: sharedUrl, abs_path: sharedUrl, lineno: 12 }] },
        },
      ],
    },
    breadcrumbs: [{ category: "navigation", data: { from: sharedUrl, to: "/devtools/color-picker#preview" } }],
    contexts: { trace: { data: { "url.full": sharedUrl, "http.status_code": 200 } } },
  };
  expect(sentryOptions.beforeSend(event)).toBe(event);
  expect(event.request.url).toBe(safeUrl);
  expect(event.exception.values[0].value).toBe(`Unable to open ${safeUrl} after navigation`);
  expect(event.exception.values[0].stacktrace.frames[0]).toEqual({ filename: safeUrl, abs_path: safeUrl, lineno: 12 });
  expect(event.breadcrumbs[0].data.to).toBe("/devtools/color-picker#preview");
  expect(event.contexts.trace.data["http.status_code"]).toBe(200);
  expect(JSON.stringify(event)).not.toMatch(/Private|collect|%7B/);

  const breadcrumb = { category: "navigation", data: { from: sharedUrl, to: sharedUrl } };
  expect(sentryOptions.beforeBreadcrumb(breadcrumb).data).toEqual({ from: safeUrl, to: safeUrl });
  const span = { description: `GET ${sharedUrl}`, data: { "url.full": sharedUrl, "http.url": sharedUrl } };
  expect(sentryOptions.beforeSendSpan(span)).toEqual({
    description: `GET ${safeUrl}`,
    data: { "url.full": safeUrl, "http.url": safeUrl },
  });
  const transaction = {
    type: "transaction",
    transaction: sharedUrl,
    request: { url: sharedUrl },
    contexts: { trace: { data: { "url.full": sharedUrl } } },
    spans: [{ description: `GET ${sharedUrl}`, data: { "http.url": sharedUrl } }],
  };
  expect(sentryOptions.beforeSendTransaction(transaction)).toBe(transaction);
  expect(transaction.transaction).toBe(safeUrl);
  expect(JSON.stringify(transaction)).not.toMatch(/Private|collect|%7B/);
});

test("the local sign-in handoff never starts telemetry that could capture its ticket", () => {
  const previousWindow = globalThis.window;
  const previousEnabled = sentryOptions.enabled;
  const previousClient = Sentry.getClient();
  globalThis.window = { location: { pathname: "/auth/local-session", hash: "#token=private-ticket" } };
  sentryOptions.enabled = true;
  try {
    initializeSentry();
    expect(Sentry.getClient()).toBe(previousClient);
  } finally {
    sentryOptions.enabled = previousEnabled;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
