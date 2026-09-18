import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { NextRequest } from "next/server.js";
import nextTesting from "next/experimental/testing/server.js";

const { unstable_doesMiddlewareMatch: doesProxyMatch } = nextTesting;

const proxyUrl = new URL("../proxy.ts", import.meta.url).href;
const fixture = { session: null, error: null, queries: 0 };
globalThis.__accountAccessTest = fixture;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === proxyUrl && specifier === "./lib/auth/index.ts") {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`
        export const auth = { api: { async getSession({ query }) {
          const fixture = globalThis.__accountAccessTest;
          fixture.queries++;
          if (!query.disableCookieCache) throw new Error("Must read current status");
          if (fixture.error) throw fixture.error;
          return fixture.session;
        } } };
      `)}`,
      };
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});
const { proxy, config } = await import(proxyUrl);
hooks.deregister();

test("suspension blocks pages, actions and APIs while preserving identity and logout", async (t) => {
  t.after(() => {
    delete globalThis.__accountAccessTest;
  });
  const request = (path, method = "GET", cookie = "smarttools.session_token=test") =>
    new NextRequest(`http://localhost:3000${path}`, { method, headers: { cookie } });
  assert.equal((await proxy(request("/", "GET", ""))).headers.get("x-middleware-next"), "1");
  assert.equal(fixture.queries, 0);
  for (const session of [null, { user: { status: "active" } }]) {
    fixture.session = session;
    assert.equal((await proxy(request("/paperwork"))).headers.get("x-middleware-next"), "1");
  }
  fixture.session = { user: { status: "suspended" } };
  for (const path of [
    "/",
    "/paperwork",
    "/devtools/json-formatter",
    "/media",
    "/admin",
    "/admin/denied",
    "/auth",
    "/auth/profile",
    "/media/file.pdf",
  ]) {
    assert.ok(doesProxyMatch({ config, url: path }));
    const response = await proxy(request(path));
    assert.equal(response.headers.get("location"), "http://localhost:3000/account/suspended");
    assert.equal(response.status, 303);
  }
  for (const path of [
    "/api/tools/search",
    "/api/paperwork/invoices",
    "/api/auth/update-user",
    "/api/auth/delete-user",
    "/api/auth/sign-out/extra",
  ]) {
    assert.ok(doesProxyMatch({ config, url: path }));
    const response = await proxy(request(path, "POST"));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "ACCOUNT_SUSPENDED");
  }
  assert.equal((await proxy(request("/admin", "POST"))).status, 403);
  assert.equal((await proxy(request("/account/suspended", "POST"))).status, 403);
  for (const [path, method] of [
    ["/account/suspended", "GET"],
    ["/account/suspended", "HEAD"],
    ["/api/auth/get-session", "GET"],
    ["/api/auth/sign-out", "POST"],
  ]) {
    assert.equal((await proxy(request(path, method))).headers.get("x-middleware-next"), "1");
  }
  fixture.error = new Error("database unavailable");
  const unavailable = await proxy(request("/paperwork"));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "database unavailable" });
  fixture.error = new Error("");
  assert.deepEqual(await (await proxy(request("/paperwork"))).json(), {
    error: "Unable to check account access. Please try again.",
  });
  assert.equal((await proxy(request("/api/auth/sign-out", "POST"))).headers.get("x-middleware-next"), "1");
  for (const path of ["/_next/static/chunks/app.js", "/_next/image", "/favicon.ico"]) {
    assert.equal(doesProxyMatch({ config, url: path }), false);
  }
});
