import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "next/dist/build/swc/index.js";

const pageUrl = new URL("../app/auth/profile/page.tsx", import.meta.url).href;
const returnToUrl = new URL("../app/auth/_lib/returnTo.ts", import.meta.url).href;
const previousAppUrl = process.env.APP_URL;
const state = { host: "localhost:3000", session: null, queries: 0 };
globalThis.__profilePageNavigationTest = state;
const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === pageUrl) {
      if (specifier === "next/headers")
        return stub(
          "export async function headers(){return new Headers({host:globalThis.__profilePageNavigationTest.host})}",
        );
      if (specifier === "next/navigation")
        return stub('export function redirect(location){throw Object.assign(new Error("REDIRECT"),{location})}');
      if (specifier === "@/lib/auth/index.ts")
        return stub(
          "export const auth={api:{async getSession(){const state=globalThis.__profilePageNavigationTest;state.queries++;return state.session}}}",
        );
      if (specifier === "@/lib/auth/session.ts") return stub("export async function isAdminUser(){return true}");
      if (specifier === "@/components/ui/index.tsx")
        return stub(
          "const Part=({children})=>children; export {Part as H1,Part as Muted,Part as Overline,Part as AccountNavigation,Part as AppContainer,Part as ProductHeader,Part as StatusBadge};",
        );
      if (specifier === "@/components/canopy/CanopyFooter") return stub("export function CanopyFooter(){return null}");
      if (specifier === "./components/ProfileBackLink")
        return stub("export function ProfileBackLink({fallbackHref}){return 'Back: '+fallbackHref}");
      if (specifier === "./ProfileManager")
        return stub("export function ProfileManager({initialUser}){return 'Profile: '+initialUser.name}");
      if (specifier === "../_lib/returnTo") return next(returnToUrl, context);
    }
    if ([pageUrl, returnToUrl].includes(context.parentURL) && specifier.startsWith("@/lib/"))
      return next(new URL(`../${specifier.slice(2)}`, import.meta.url).href, context);
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
const { default: ProfilePage } = await import(pageUrl);
test.beforeEach(() => {
  process.env.APP_URL = "http://localhost:3000";
  Object.assign(state, { host: "localhost:3000", session: null, queries: 0 });
});
test.after(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
  hooks.deregister();
  delete globalThis.__profilePageNavigationTest;
});
const page = (params = {}) => ProfilePage({ searchParams: Promise.resolve(params) });
const session = {
  user: { id: "user-1", name: "Jordan", email: "jordan@example.test", emailVerified: true },
  session: { id: "session-1" },
};

test("local admin profile moves to the parent host before checking its session", async () => {
  state.host = "admin.localhost:3000";
  const returnTo = "http://admin.localhost:3000/users?role=editor#people";
  const expected = `http://localhost:3000/auth/profile?${new URLSearchParams({ returnTo })}`;
  for (const current of [null, session]) {
    state.session = current;
    await assert.rejects(page({ returnTo }), (error) => error.location === expected);
  }
  assert.equal(state.queries, 0);
});

test("local profile forwarding retains only the validated return destination", async () => {
  state.host = "admin.localhost:3000";
  await assert.rejects(
    page({ returnTo: ["/admin/tools?section=assets", "https://attacker.invalid"], next: "https://attacker.invalid" }),
    (error) => {
      const destination = new URL(error.location);
      assert.equal(destination.origin, "http://localhost:3000");
      assert.equal(destination.pathname, "/auth/profile");
      assert.deepEqual(
        [...destination.searchParams],
        [["returnTo", "http://admin.localhost:3000/tools?section=assets"]],
      );
      return true;
    },
  );
  await assert.rejects(
    page({ returnTo: "https://attacker.invalid" }),
    (error) => error.location === "http://localhost:3000/auth/profile?returnTo=%2F",
  );
});

test("parent profile keeps its sign-in gate and authenticated profile rendering", async () => {
  const returnTo = "http://admin.localhost:3000/users";
  const profileReturnTo = `/auth/profile?${new URLSearchParams({ returnTo })}`;
  await assert.rejects(
    page({ returnTo }),
    (error) => error.location === `/auth?${new URLSearchParams({ returnTo: profileReturnTo })}`,
  );
  assert.equal(state.queries, 1);
  state.session = session;
  const html = renderToStaticMarkup(await page({ returnTo }));
  assert.match(html, /Profile: Jordan/);
  assert.match(html, /Back: http:\/\/admin\.localhost:3000\/users/);
  assert.equal(state.queries, 2);
});

test("production, named localhost, and unregistered hosts do not use the local profile forwarding", async () => {
  state.session = session;
  for (const [appUrl, host] of [
    ["https://example.test", "admin.example.test"],
    ["http://smarttools.localhost:3000", "admin.smarttools.localhost:3000"],
    ["http://localhost:3000", "admin.localhost.attacker.test:3000"],
    ["http://localhost:3000", "admin.localhost:3001"],
  ]) {
    process.env.APP_URL = appUrl;
    state.host = host;
    assert.match(renderToStaticMarkup(await page()), /Profile: Jordan/, host);
  }
  assert.equal(state.queries, 4);
});
