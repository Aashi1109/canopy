import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "next/dist/build/swc/index.js";

const pageUrl = new URL("../app/auth/page.tsx", import.meta.url).href;
const returnToUrl = new URL("../app/auth/_lib/returnTo.ts", import.meta.url).href;
const state = { session: null, error: null };
globalThis.__authPageNavigationTest = state;
const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === pageUrl) {
      if (specifier === "next/headers") return stub("export async function headers(){return new Headers()}");
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
      if (specifier === "./_lib/security")
        return { shortCircuit: true, url: new URL("../app/auth/_lib/security.ts", import.meta.url).href };
      if (specifier === "./_lib/returnTo") return { shortCircuit: true, url: returnToUrl };
    }
    if (context.parentURL === returnToUrl && specifier === "@/lib/config/config.ts")
      return stub('export default {appUrl:"https://smarttools.test"}');
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
  hooks.deregister();
  delete globalThis.__authPageNavigationTest;
});
test.beforeEach(() => {
  state.session = null;
  state.error = null;
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

test("signed-in users leave every auth form mode for the product by default", async () => {
  signedIn();
  for (const mode of [undefined, "sign-in", "sign-up", "forgot"]) await expectRedirect({ mode }, "/");
});

test("signed-in users retain valid local and same-origin return destinations", async () => {
  signedIn();
  for (const destination of [
    "/admin/tools",
    "/devtools/markdown-previewer",
    "/auth/profile?returnTo=%2Fadmin",
    "https://smarttools.test/media",
  ]) {
    await expectRedirect({ returnTo: destination }, destination);
  }
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
