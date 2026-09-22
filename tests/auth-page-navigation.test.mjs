import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "next/dist/build/swc/index.js";

const pageUrl = new URL("../app/auth/page.tsx", import.meta.url).href;
const returnToUrl = new URL("../app/auth/_lib/returnTo.ts", import.meta.url).href;
const previousAppUrl = process.env.APP_URL;
process.env.APP_URL = "https://smarttools.test";
const state = { session: null, error: null, host: "smarttools.test" };
globalThis.__authPageNavigationTest = state;
const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === pageUrl) {
      if (specifier === "next/headers")
        return stub(
          "export async function headers(){return new Headers({host:globalThis.__authPageNavigationTest.host})}",
        );
      if (specifier === "next/navigation")
        return stub('export function redirect(location){throw Object.assign(new Error("REDIRECT"),{location})}');
      if (specifier === "@/lib/auth/index.ts")
        return stub(
          "export const auth={api:{async getSession(){const s=globalThis.__authPageNavigationTest;if(s.error)throw s.error;return s.session}}}",
        );
      if (specifier === "./AuthPanel")
        return stub(
          "export function AuthPanel({initialMode,returnTo}){return `Form: ${initialMode}; Return: ${returnTo}`}",
        );
      if (specifier === "./components/AuthChrome")
        return stub("export function AuthScreen({children}){return children}");
      if (specifier === "./components/AdminSignInScreen")
        return stub(
          "export function AdminSignInScreen({returnTo,publicSiteUrl,initialError,googleSignInUrl}){return `Admin sign-in; Return: ${returnTo}; Public: ${publicSiteUrl}; Error: ${initialError ?? ''}${googleSignInUrl ? '; Google: ' + googleSignInUrl : ''}`}",
        );
      if (specifier === "./_lib/security")
        return { shortCircuit: true, url: new URL("../app/auth/_lib/security.ts", import.meta.url).href };
      if (specifier === "./_lib/returnTo") return { shortCircuit: true, url: returnToUrl };
    }
    if ([pageUrl, returnToUrl].includes(context.parentURL) && specifier === "@/lib/config/config.ts")
      return { shortCircuit: true, url: new URL("../lib/config/config.ts", import.meta.url).href };
    if ([pageUrl, returnToUrl].includes(context.parentURL) && specifier === "@/lib/routing/subdomains.ts")
      return { shortCircuit: true, url: new URL("../lib/routing/subdomains.ts", import.meta.url).href };
    if (context.parentURL === pageUrl && specifier === "@/lib/auth/localSession.ts")
      return { shortCircuit: true, url: new URL("../lib/auth/localSession.ts", import.meta.url).href };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url !== pageUrl) return next(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: transformSync(readFileSync(new URL(url), "utf8"), {
        filename: new URL(url).pathname,
        jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } } },
        module: { type: "es6" },
      }).code,
    };
  },
});
const { default: AuthPage } = await import(pageUrl);
test.after(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
  hooks.deregister();
  delete globalThis.__authPageNavigationTest;
});
test.beforeEach(() => {
  state.session = null;
  state.error = null;
  state.host = "smarttools.test";
  process.env.APP_URL = "https://smarttools.test";
});
const page = (params = {}) => AuthPage({ searchParams: Promise.resolve(params) });
const signedIn = () => {
  state.session = { user: { id: "user-1", status: "active" } };
};
const expectRedirect = (params, destination) => assert.rejects(page(params), (error) => error.location === destination);

test("guests can use sign-in, sign-up, and password recovery", async () => {
  for (const mode of ["sign-in", "sign-up", "forgot"]) {
    assert.equal(renderToStaticMarkup(await page({ mode, returnTo: "/devtools" })), `Form: ${mode}; Return: /devtools`);
  }
});

test("guests returning to admin see its sign-in screen with a validated destination", async () => {
  for (const destination of ["/admin/tools", "https://admin.smarttools.test/tools"]) {
    assert.equal(
      renderToStaticMarkup(await page({ returnTo: destination })),
      "Admin sign-in; Return: https://admin.smarttools.test/tools; Public: https://smarttools.test; Error: ",
    );
  }
});

test("direct admin auth visits default to the admin root in every form mode", async () => {
  state.host = "admin.smarttools.test";
  for (const mode of [undefined, "sign-up", "forgot"]) {
    assert.equal(
      renderToStaticMarkup(await page({ mode })),
      "Admin sign-in; Return: https://admin.smarttools.test/; Public: https://smarttools.test; Error: ",
    );
  }
  signedIn();
  await expectRedirect({}, "https://admin.smarttools.test/");
});

test("admin sign-in also works with same-host IP route fallback", async () => {
  process.env.APP_URL = "http://127.0.0.1:3000";
  state.host = "127.0.0.1:3000";
  assert.equal(
    renderToStaticMarkup(await page({ returnTo: "/admin/users" })),
    "Admin sign-in; Return: /admin/users; Public: http://127.0.0.1:3000; Error: ",
  );
  assert.equal(
    renderToStaticMarkup(await page({ returnTo: "/administrator" })),
    "Form: sign-in; Return: /administrator",
  );
});

test("localhost keeps its normal sign-in page while admin checks for the shared login", async () => {
  process.env.APP_URL = "http://localhost:3000";
  state.host = "localhost:3000";
  assert.equal(renderToStaticMarkup(await page()), "Form: sign-in; Return: /");

  state.host = "admin.localhost:3000";
  const startUrl = `/api/auth/local-session?${new URLSearchParams({
    step: "start",
    returnTo: "http://admin.localhost:3000/",
    mode: "check",
  })}`;
  await expectRedirect({}, startUrl);
  signedIn();
  await expectRedirect({}, "http://admin.localhost:3000/");
});

test("checked local admin guests can initiate Google through the localhost handoff", async () => {
  process.env.APP_URL = "http://localhost:3000";
  state.host = "admin.localhost:3000";
  const markup = renderToStaticMarkup(await page({ localChecked: "1", returnTo: "http://admin.localhost:3000/users" }));
  assert.match(markup, /^Admin sign-in; Return: http:\/\/admin\.localhost:3000\/users;/);
  assert.match(markup, /Google: \/api\/auth\/local-session\?/);
  assert.match(markup, /mode=google/);
});

test("untrusted destinations cannot select admin or escape its safe default", async () => {
  assert.equal(
    renderToStaticMarkup(await page({ returnTo: "https://admin.untrusted.test/" })),
    "Form: sign-in; Return: /",
  );
  state.host = "admin.smarttools.test";
  assert.equal(
    renderToStaticMarkup(await page({ returnTo: "https://untrusted.test/" })),
    "Admin sign-in; Return: https://admin.smarttools.test/; Public: https://smarttools.test; Error: ",
  );
});

test("admin callback errors are sanitized before rendering", async () => {
  state.host = "admin.smarttools.test";
  const markup = renderToStaticMarkup(await page({ error: "provider-secret-error" }));
  assert.match(markup, /Unable to complete that request/);
  assert.doesNotMatch(markup, /provider-secret-error/);
});

test("signed-in users leave every auth form mode for the product by default", async () => {
  signedIn();
  for (const mode of [undefined, "sign-in", "sign-up", "forgot"]) await expectRedirect({ mode }, "/");
});

test("signed-in users retain valid local and same-origin return destinations", async () => {
  signedIn();
  for (const destination of [
    "/devtools/markdown-previewer",
    "/auth/profile?returnTo=%2Fadmin",
    "https://smarttools.test/media",
  ]) {
    await expectRedirect({ returnTo: destination }, destination);
  }
  await expectRedirect({ returnTo: "/admin/tools" }, "https://admin.smarttools.test/tools");
  await expectRedirect({ returnTo: ["/paperwork", "https://untrusted.test"] }, "/paperwork");
});

test("unsafe and self-referencing auth return destinations fall back without redirect loops", async () => {
  signedIn();
  for (const destination of [
    "https://untrusted.test",
    "//untrusted.test",
    "javascript:alert(1)",
    "/\\untrusted.test",
    "/auth",
    "/auth/",
    "/%61uth",
    "/auth%2f",
    "/\n/untrusted.test",
    "/%invalid",
    "/auth?mode=sign-up",
    "/auth#sign-in",
    "/admin/auth?mode=sign-up",
    "/tools/../auth",
    "https://smarttools.test/auth?returnTo=%2Fauth",
  ])
    await expectRedirect({ returnTo: destination }, "/");
});

test("suspended sessions go to account recovery instead of auth forms or the return URL", async () => {
  state.session = { user: { id: "user-1", status: "suspended" } };
  await expectRedirect({ returnTo: "/admin" }, "/account/suspended");
});

test("an unavailable session service does not treat a signed-in user as a guest", async () => {
  state.error = new Error("Session lookup unavailable");
  await assert.rejects(page(), (error) => error === state.error);
});
