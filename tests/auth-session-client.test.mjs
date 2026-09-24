import { afterAll, beforeEach, expect, test, vi } from "vitest";

const fixture = {
  session: null,
  authorizations: new Map(),
  authError: null,
  authorizationError: null,
  queries: 0,
  headers: null,
  sessionQuery: null,
};
globalThis.__canopySessionTest = fixture;

vi.mock("@/lib/auth/auth.ts", () => ({
  auth: {
    api: {
      async getSession({ headers, query }) {
        const fixture = globalThis.__canopySessionTest;
        fixture.headers = headers;
        fixture.sessionQuery = query;
        if (fixture.authError) throw fixture.authError;
        return fixture.session;
      },
    },
  },
}));
vi.mock("@/lib/admin/index.ts", () => {
  class AuthorizationError extends Error {}
  return {
    AuthorizationError,
    async getUserAuthorization(userId) {
      const fixture = globalThis.__canopySessionTest;
      fixture.queries++;
      if (fixture.authorizationError) throw fixture.authorizationError;
      const result = fixture.authorizations.get(userId);
      if (!result) throw new AuthorizationError("Access denied");
      return result;
    },
  };
});

const { AuthServiceError, getSession, getOptionalSession, isAdminUser } = await import("@/lib/auth/session.ts");

afterAll(() => {
  delete globalThis.__canopySessionTest;
});
beforeEach(() => {
  fixture.session = null;
  fixture.authorizations.clear();
  fixture.authError = null;
  fixture.authorizationError = null;
  fixture.queries = 0;
});

test("sessions can omit admin enrichment while default callers still receive it", async () => {
  const headers = new Headers({ cookie: "session=test" });
  fixture.session = {
    session: { id: "session-1" },
    user: { id: "user-1", name: "Ashish", status: "active" },
  };
  fixture.authorizations.set("user-1", { access: { admin: { enter: true } } });

  expect(await getSession(headers, { includeAdmin: false })).toEqual(fixture.session);
  expect(fixture.queries).toBe(0);
  expect(fixture.headers).toBe(headers);
  expect(fixture.sessionQuery).toEqual({ disableCookieCache: true });
  expect((await getSession(headers)).user.isAdmin).toBe(true);
  expect(fixture.queries).toBe(1);
});

test("omitting admin enrichment still checks current session status and authentication failures", async () => {
  const headers = new Headers();
  fixture.session = {
    session: { id: "session-1" },
    user: { id: "user-1", name: "Ashish", status: "active" },
  };
  fixture.authorizationError = new Error("unused authorization service unavailable");
  expect((await getSession(headers, { includeAdmin: false })).user.status).toBe("active");
  fixture.session.user.status = "suspended";
  expect((await getSession(headers, { includeAdmin: false })).user.status).toBe("suspended");
  expect(fixture.sessionQuery).toEqual({ disableCookieCache: true });
  fixture.session = null;
  expect(await getSession(headers, { includeAdmin: false })).toBe(null);
  fixture.authError = new Error("auth unavailable");
  await expect(getSession(headers, { includeAdmin: false })).rejects.toSatisfy(
    (error) => error instanceof AuthServiceError && error.cause === fixture.authError,
  );
  expect(fixture.queries).toBe(0);
});

test("account session uses active users' effective Admin entry grants, including custom roles", async () => {
  const headers = new Headers({ cookie: "session=test" });
  fixture.session = {
    session: { id: "session-1" },
    user: { id: "user-1", name: "Ashish", status: "active" },
  };

  for (const [status, roleId, id, access, expected] of [
    ["active", "admin", "user-1", { admin: { enter: true } }, true],
    ["active", "custom", "user-1", { admin: { enter: true }, tools: { view: true } }, true],
    ["active", "user", "user-1", {}, false],
    ["active", "custom", "user-1", { tools: { view: true } }, false],
    ["active", "admin", "user-1", { admin: { enter: false } }, false],
    ["suspended", "custom", "user-1", { admin: { enter: true } }, false],
    ["active", "custom", "other-user", { admin: { enter: true } }, false],
  ]) {
    fixture.session.user.status = status;
    fixture.authorizations.clear();
    if (status === "active") fixture.authorizations.set(id, { roles: [{ id: roleId }], access });
    expect(await getSession(headers)).toEqual({
      session: { id: "session-1" },
      user: { id: "user-1", name: "Ashish", status, isAdmin: expected },
    });
    expect(await isAdminUser("user-1")).toBe(expected);
    expect(fixture.headers).toBe(headers);
  }
  fixture.authorizations.set("user-1", {
    roles: [{ id: "user" }, { id: "custom" }],
    access: { admin: { enter: true } },
  });
  expect(await isAdminUser("user-1"), "entry permission may come from any assigned role").toBe(true);
  fixture.authorizations.get("user-1").access = { admin: { enter: false } };
  expect(await isAdminUser("user-1"), "revocation is reflected on the next lookup").toBe(false);
  fixture.authorizations.set("user-1", { roles: [], access: {} });
  expect((await getSession(headers)).user.isAdmin).toBe(false);

  fixture.session = null;
  const queries = fixture.queries;
  expect(await getSession(headers)).toBe(null);
  expect(fixture.queries).toBe(queries);

  fixture.authError = new Error("auth unavailable");
  await expect(getSession(headers)).rejects.toSatisfy(
    (error) => error instanceof AuthServiceError && error.cause === fixture.authError,
  );
  expect(await getOptionalSession(headers)).toBe(null);
  fixture.authError = null;
  fixture.session = { session: { id: "session-1" }, user: { id: "user-1", name: "Ashish" } };
  fixture.authorizationError = new Error("database unavailable");
  await expect(isAdminUser("user-1")).rejects.toSatisfy((error) => error === fixture.authorizationError);
  await expect(getSession(headers)).rejects.toSatisfy(
    (error) => error instanceof AuthServiceError && error.cause === fixture.authorizationError,
  );
  expect(await getOptionalSession(headers)).toBe(null);
});
