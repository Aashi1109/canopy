import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

const previousAppUrl = process.env.APP_URL;
process.env.APP_URL = "https://smarttools.test";
const state = { session: null, error: null, host: "smarttools.test" };
globalThis.__authPageNavigationTest = state;

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: globalThis.__authPageNavigationTest.host }),
}));
vi.mock("next/navigation", () => ({
  redirect(location) {
    throw Object.assign(new Error("REDIRECT"), { location });
  },
}));
vi.mock("@/lib/auth/index.ts", () => ({
  auth: {
    api: {
      async getSession() {
        const s = globalThis.__authPageNavigationTest;
        if (s.error) throw s.error;
        return s.session;
      },
    },
  },
}));
vi.mock("@/app/auth/AuthPanel.tsx", () => ({
  AuthPanel: ({ initialMode, returnTo }) => `Form: ${initialMode}; Return: ${returnTo}`,
}));
vi.mock("@/app/auth/components/AuthChrome.tsx", () => ({
  AuthScreen: ({ children }) => children,
}));
vi.mock("@/app/auth/components/AdminSignInScreen.tsx", () => ({
  AdminSignInScreen: ({ returnTo, publicSiteUrl, initialError, googleSignInUrl }) =>
    `Admin sign-in; Return: ${returnTo}; Public: ${publicSiteUrl}; Error: ${initialError ?? ""}${
      googleSignInUrl ? "; Google: " + googleSignInUrl : ""
    }`,
}));

const { default: AuthPage } = await import("@/app/auth/page.tsx");

afterAll(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
  delete globalThis.__authPageNavigationTest;
});
beforeEach(() => {
  state.session = null;
  state.error = null;
  state.host = "smarttools.test";
  process.env.APP_URL = "https://smarttools.test";
});
const page = (params = {}) => AuthPage({ searchParams: Promise.resolve(params) });
const signedIn = () => {
  state.session = { user: { id: "user-1", status: "active" } };
};
const expectRedirect = (params, destination) => expect(page(params)).rejects.toMatchObject({ location: destination });

test("guests can use sign-in, sign-up, and password recovery", async () => {
  for (const mode of ["sign-in", "sign-up", "forgot"]) {
    expect(renderToStaticMarkup(await page({ mode, returnTo: "/devtools" }))).toBe(`Form: ${mode}; Return: /devtools`);
  }
});

test("guests returning to admin see its sign-in screen with a validated destination", async () => {
  for (const destination of ["/admin/tools", "https://admin.smarttools.test/tools"]) {
    expect(renderToStaticMarkup(await page({ returnTo: destination }))).toBe(
      "Admin sign-in; Return: https://admin.smarttools.test/tools; Public: https://smarttools.test; Error: ",
    );
  }
});

test("direct admin auth visits default to the admin root in every form mode", async () => {
  state.host = "admin.smarttools.test";
  for (const mode of [undefined, "sign-up", "forgot"]) {
    expect(renderToStaticMarkup(await page({ mode }))).toBe(
      "Admin sign-in; Return: https://admin.smarttools.test/; Public: https://smarttools.test; Error: ",
    );
  }
  signedIn();
  await expectRedirect({}, "https://admin.smarttools.test/");
});

test("admin sign-in also works with same-host IP route fallback", async () => {
  process.env.APP_URL = "http://127.0.0.1:3000";
  state.host = "127.0.0.1:3000";
  expect(renderToStaticMarkup(await page({ returnTo: "/admin/users" }))).toBe(
    "Admin sign-in; Return: /admin/users; Public: http://127.0.0.1:3000; Error: ",
  );
  expect(renderToStaticMarkup(await page({ returnTo: "/administrator" }))).toBe(
    "Form: sign-in; Return: /administrator",
  );
});

test("localhost keeps its normal sign-in page while admin checks for the shared login", async () => {
  process.env.APP_URL = "http://localhost:3000";
  state.host = "localhost:3000";
  expect(renderToStaticMarkup(await page())).toBe("Form: sign-in; Return: /");

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
  expect(markup).toMatch(/^Admin sign-in; Return: http:\/\/admin\.localhost:3000\/users;/);
  expect(markup).toMatch(/Google: \/api\/auth\/local-session\?/);
  expect(markup).toMatch(/mode=google/);
});

test("untrusted destinations cannot select admin or escape its safe default", async () => {
  expect(renderToStaticMarkup(await page({ returnTo: "https://admin.untrusted.test/" }))).toBe(
    "Form: sign-in; Return: /",
  );
  state.host = "admin.smarttools.test";
  expect(renderToStaticMarkup(await page({ returnTo: "https://untrusted.test/" }))).toBe(
    "Admin sign-in; Return: https://admin.smarttools.test/; Public: https://smarttools.test; Error: ",
  );
});

test("admin callback errors are sanitized before rendering", async () => {
  state.host = "admin.smarttools.test";
  const markup = renderToStaticMarkup(await page({ error: "provider-secret-error" }));
  expect(markup).toMatch(/Unable to complete that request/);
  expect(markup).not.toMatch(/provider-secret-error/);
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
  await expect(page()).rejects.toBe(state.error);
});
