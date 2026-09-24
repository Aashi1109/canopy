import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const previousAppUrl = process.env.APP_URL;
const state = vi.hoisted(() => {
  const shared = { host: "localhost:3000", session: null, queries: 0 };
  globalThis.__profilePageNavigationTest = shared;
  return shared;
});

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: state.host }),
}));
vi.mock("next/navigation", () => ({
  redirect: (location) => {
    throw Object.assign(new Error("REDIRECT"), { location });
  },
}));
vi.mock("@/lib/auth/index.ts", () => ({
  auth: {
    api: {
      async getSession() {
        state.queries++;
        return state.session;
      },
    },
  },
}));
vi.mock("@/lib/auth/session.ts", () => ({
  isAdminUser: async () => true,
}));
vi.mock("@/components/ui/index.tsx", () => {
  const Part = ({ children }) => children;
  return {
    H1: Part,
    Muted: Part,
    Overline: Part,
    AccountNavigation: Part,
    AppContainer: Part,
    ProductHeader: Part,
    StatusBadge: Part,
  };
});
vi.mock("@/components/canopy/CanopyFooter", () => ({ CanopyFooter: () => null }));
vi.mock("@/app/auth/profile/components/ProfileBackLink", () => ({
  ProfileBackLink: ({ fallbackHref }) => "Back: " + fallbackHref,
}));
vi.mock("@/app/auth/profile/ProfileManager", () => ({
  ProfileManager: ({ initialUser }) => "Profile: " + initialUser.name,
}));

const { default: ProfilePage } = await import("@/app/auth/profile/page.tsx");

beforeEach(() => {
  process.env.APP_URL = "http://localhost:3000";
  Object.assign(state, { host: "localhost:3000", session: null, queries: 0 });
});
afterAll(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
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
    await expect(page({ returnTo })).rejects.toMatchObject({ location: expected });
  }
  expect(state.queries).toBe(0);
});

test("local profile forwarding retains only the validated return destination", async () => {
  state.host = "admin.localhost:3000";
  let error;
  try {
    await page({
      returnTo: ["/admin/tools?section=assets", "https://attacker.invalid"],
      next: "https://attacker.invalid",
    });
  } catch (thrown) {
    error = thrown;
  }
  expect(error).toBeDefined();
  const destination = new URL(error.location);
  expect(destination.origin).toBe("http://localhost:3000");
  expect(destination.pathname).toBe("/auth/profile");
  expect([...destination.searchParams]).toEqual([["returnTo", "http://admin.localhost:3000/tools?section=assets"]]);
  await expect(page({ returnTo: "https://attacker.invalid" })).rejects.toMatchObject({
    location: "http://localhost:3000/auth/profile?returnTo=%2F",
  });
});

test("parent profile keeps its sign-in gate and authenticated profile rendering", async () => {
  const returnTo = "http://admin.localhost:3000/users";
  const profileReturnTo = `/auth/profile?${new URLSearchParams({ returnTo })}`;
  await expect(page({ returnTo })).rejects.toMatchObject({
    location: `/auth?${new URLSearchParams({ returnTo: profileReturnTo })}`,
  });
  expect(state.queries).toBe(1);
  state.session = session;
  const html = renderToStaticMarkup(await page({ returnTo }));
  expect(html).toMatch(/Profile: Jordan/);
  expect(html).toMatch(/Back: http:\/\/admin\.localhost:3000\/users/);
  expect(state.queries).toBe(2);
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
    expect(renderToStaticMarkup(await page()), host).toMatch(/Profile: Jordan/);
  }
  expect(state.queries).toBe(4);
});
