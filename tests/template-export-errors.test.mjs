import { afterAll, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => {
  const shared = { session: { user: { id: "admin" } }, rows: [], reads: 0, captured: [] };
  globalThis.__templateExportErrorsTest = shared;
  return shared;
});

vi.mock("@sentry/core", () => ({
  captureException: (error) => state.captured.push(error),
}));
vi.mock("@/lib/auth/session.ts", () => {
  class AuthServiceError extends Error {}
  return {
    AuthServiceError,
    getSession: async () => {
      if (state.authFailure) throw new AuthServiceError(state.authFailure);
      return state.session;
    },
  };
});
vi.mock("@/lib/admin/index.ts", () => ({
  requirePermission: async () => {
    if (state.permissionFailure) throw state.permissionFailure;
  },
}));
vi.mock("@/db/index.ts", () => ({
  eq: () => null,
  invoiceTemplatesTable: { id: "id" },
  db: {
    select() {
      state.reads++;
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: async () => {
          if ("failure" in state) throw state.failure;
          return state.rows;
        },
      };
      return chain;
    },
  },
}));

const { GET } = await import("@/app/api/admin/templates/[id]/export/route.ts");

afterAll(() => {
  delete globalThis.__templateExportErrorsTest;
});

const call = () =>
  GET(new Request("https://app.test/api/admin/templates/id/export"), { params: Promise.resolve({ id: "id" }) });

beforeEach(() => {
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
    expect(state.captured.at(-1)).toBe(failure);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: failure?.message || "Unable to export template" });
  }
  delete state.failure;
});

test("template export authorization failures retain status and never read templates", async () => {
  state.reads = 0;
  state.authFailure = "Session service timed out";
  const unavailable = await call();
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toEqual({ error: state.authFailure });
  expect(state.captured.length).toBe(1);
  expect(state.captured[0].message).toBe(state.authFailure);
  delete state.authFailure;
  const session = state.session;
  state.session = null;
  const unauthenticated = await call();
  expect(unauthenticated.status).toBe(401);
  expect(await unauthenticated.json()).toEqual({ error: "Authentication required" });
  state.session = session;
  state.permissionFailure = new Error("Missing permission: templates.view");
  const forbidden = await call();
  expect(forbidden.status).toBe(403);
  expect(await forbidden.json()).toEqual({ error: state.permissionFailure.message });
  delete state.permissionFailure;
  expect(state.reads).toBe(0);
  const missing = await call();
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({ error: "Not found" });
  expect(state.captured.length, "expected authorization failures are not reported").toBe(1);
});
