import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const sessionUrl = new URL("../packages/auth/src/session.ts", import.meta.url).href;
const fixture = {
  session: null,
  authorizations: new Map(),
  authError: null,
  authorizationError: null,
  queries: 0,
  headers: null,
};
globalThis.__smarttoolsSessionTest = fixture;
const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === sessionUrl && specifier === "./auth.ts") {
      return {
        shortCircuit: true,
        url: moduleUrl(`
        const fixture = globalThis.__smarttoolsSessionTest;
        export const auth = { api: { async getSession({ headers }) {
          fixture.headers = headers;
          if (fixture.authError) throw fixture.authError;
          return fixture.session;
        } } };
      `),
      };
    }
    if (context.parentURL === sessionUrl && specifier === "@smarttools/control-plane") {
      return {
        shortCircuit: true,
        url: moduleUrl(`
        const fixture = globalThis.__smarttoolsSessionTest;
        export class AuthorizationError extends Error {}
        export async function getUserAuthorization(userId) {
          fixture.queries++;
          if (fixture.authorizationError) throw fixture.authorizationError;
          const result = fixture.authorizations.get(userId);
          if (!result) throw new AuthorizationError("Access denied");
          return result;
        }
      `),
      };
    }
    return nextResolve(specifier, context);
  },
});
const { AuthServiceError, getSession, getOptionalSession, isAdminUser } = await import(sessionUrl);
hooks.deregister();

test("account session uses active users' effective Admin entry grants, including custom roles", async (t) => {
  t.after(() => {
    delete globalThis.__smarttoolsSessionTest;
  });
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
    assert.deepEqual(await getSession(headers), {
      session: { id: "session-1" },
      user: { id: "user-1", name: "Ashish", status, isAdmin: expected },
    });
    assert.equal(await isAdminUser("user-1"), expected);
    assert.equal(fixture.headers, headers);
  }
  fixture.authorizations.set("user-1", {
    roles: [{ id: "user" }, { id: "custom" }],
    access: { admin: { enter: true } },
  });
  assert.equal(await isAdminUser("user-1"), true, "entry permission may come from any assigned role");
  fixture.authorizations.get("user-1").access = { admin: { enter: false } };
  assert.equal(await isAdminUser("user-1"), false, "revocation is reflected on the next lookup");
  fixture.authorizations.set("user-1", { roles: [], access: {} });
  assert.equal((await getSession(headers)).user.isAdmin, false);

  fixture.session = null;
  const queries = fixture.queries;
  assert.equal(await getSession(headers), null);
  assert.equal(fixture.queries, queries);

  fixture.authError = new Error("auth unavailable");
  await assert.rejects(
    getSession(headers),
    (error) => error instanceof AuthServiceError && error.cause === fixture.authError,
  );
  assert.equal(await getOptionalSession(headers), null);
  fixture.authError = null;
  fixture.session = { session: { id: "session-1" }, user: { id: "user-1", name: "Ashish" } };
  fixture.authorizationError = new Error("database unavailable");
  await assert.rejects(isAdminUser("user-1"), (error) => error === fixture.authorizationError);
  await assert.rejects(
    getSession(headers),
    (error) => error instanceof AuthServiceError && error.cause === fixture.authorizationError,
  );
  assert.equal(await getOptionalSession(headers), null);
});
