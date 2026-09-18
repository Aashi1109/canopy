import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const state = { session: { user: { id: "admin" } }, rows: [], reads: 0, captured: [] };
globalThis.__templateExportErrorsTest = state;
const routeUrl = new URL("../app/api/admin/templates/[id]/export/route.ts", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
    if (decodeURI(context.parentURL ?? "") === decodeURI(routeUrl)) {
      if (specifier === "@sentry/core")
        return stub(
          "export const captureException = error => globalThis.__templateExportErrorsTest.captured.push(error);",
        );
      if (specifier === "@/lib/auth/session.ts")
        return stub(`
        export class AuthServiceError extends Error {}
        export async function getSession() {
          const state = globalThis.__templateExportErrorsTest;
          if (state.authFailure) throw new AuthServiceError(state.authFailure);
          return state.session;
        }
      `);
      if (specifier === "@/lib/admin/index.ts")
        return stub(`
        export async function requirePermission() {
          if (globalThis.__templateExportErrorsTest.permissionFailure) throw globalThis.__templateExportErrorsTest.permissionFailure;
        }
      `);
      if (specifier === "@/db/index.ts")
        return stub(`
        export const eq = () => null, invoiceTemplatesTable = { id: "id" };
        export const db = { select() {
          const state = globalThis.__templateExportErrorsTest;
          state.reads++;
          const chain = { from: () => chain, where: () => chain, limit: async () => {
            if ("failure" in state) throw state.failure;
            return state.rows;
          }};
          return chain;
        }};
      `);
      if (specifier === "@/utils/errorMessage")
        return nextResolve(new URL("../utils/errorMessage.ts", import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { GET } = await import(routeUrl);
hooks.deregister();
test.after(() => {
  delete globalThis.__templateExportErrorsTest;
});
const call = () =>
  GET(new Request("https://app.test/api/admin/templates/id/export"), { params: Promise.resolve({ id: "id" }) });
test.beforeEach(() => {
  state.captured = [];
});

test("template export returns caught messages or fallback without error object properties", async () => {
  for (const failure of [
    new Error("Database timed out"),
    { message: "Database timed out", stack: "private stack" },
    undefined,
    new Error(""),
  ]) {
    state.failure = failure;
    const response = await call();
    assert.equal(state.captured.at(-1), failure);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: failure?.message || "Unable to export template" });
  }
  delete state.failure;
});

test("template export authorization failures retain status and never read templates", async () => {
  state.reads = 0;
  state.authFailure = "Session service timed out";
  const unavailable = await call();
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: state.authFailure });
  assert.equal(state.captured.length, 1);
  assert.equal(state.captured[0].message, state.authFailure);
  delete state.authFailure;
  const session = state.session;
  state.session = null;
  const unauthenticated = await call();
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(await unauthenticated.json(), { error: "Authentication required" });
  state.session = session;
  state.permissionFailure = new Error("Missing permission: templates.view");
  const forbidden = await call();
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), { error: state.permissionFailure.message });
  delete state.permissionFailure;
  assert.equal(state.reads, 0);
  const missing = await call();
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Not found" });
  assert.equal(state.captured.length, 1, "expected authorization failures are not reported");
});
