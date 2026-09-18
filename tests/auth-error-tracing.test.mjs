import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { APIError } from "better-auth/api";

const state = { options: null, captured: [] };
globalThis.__authErrorTracingTest = state;
const authUrl = new URL("../lib/auth/auth.ts", import.meta.url).href;
const stubs = {
  "better-auth":
    "export const betterAuth = options => { globalThis.__authErrorTracingTest.options = options; return {}; };",
  "@sentry/core": "export const captureException = error => globalThis.__authErrorTracingTest.captured.push(error);",
  "../authorization/index.ts": "export const assertCanDeleteUser = () => {};",
  "../../db/index.ts": `
    export const authAccount = {}, authSession = {}, authUser = {}, authVerification = {}, userRolesTable = {}, db = {};
    export const and = () => {}, countDistinct = () => {}, eq = () => {};
  `,
  "better-auth/adapters/drizzle": "export const drizzleAdapter = () => {};",
  "./cachedUserAdapter.ts": "export const cachedUserAdapter = adapter => adapter;",
  "./email.ts": "export const sendAuthEmail = async () => {};",
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = context.parentURL === authUrl ? stubs[specifier] : undefined;
    return source === undefined
      ? nextResolve(specifier, context)
      : { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` };
  },
});
try {
  await import(authUrl);
} finally {
  hooks.deregister();
}
test.after(() => {
  delete globalThis.__authErrorTracingTest;
});

test("authentication reports unexpected and server errors while keeping expected auth failures quiet", (t) => {
  const log = t.mock.method(console, "error", () => {});
  const report = state.options.onAPIError.onError;
  for (const status of [302, 400, 401, 403, 404, 409, 422, 429]) {
    assert.equal(report(new APIError(status, { message: "Expected authentication failure" })), undefined);
  }
  assert.deepEqual(state.captured, []);
  assert.equal(log.mock.callCount(), 0);

  const cause = new Error("Database failed with sensitive connection details");
  const errors = [cause, new APIError("INTERNAL_SERVER_ERROR", { cause }), new APIError(503, { cause })];
  for (const error of errors) assert.equal(report(error), undefined);
  assert.deepEqual(state.captured, errors, "report original errors so stack and cause remain available");
  assert.deepEqual(
    log.mock.calls.map(({ arguments: args }) => args),
    errors.map(() => ["Authentication request failed"]),
  );
});
