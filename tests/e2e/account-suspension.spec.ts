import { expect, test, type Page } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";

async function signIn(page: Page, email: string, returnTo: string) {
  await page.goto(`/auth?${new URLSearchParams({ returnTo })}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/auth");
}

test("suspension preserves login but blocks product access until reactivation", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const adminContext = await browser.newContext({ baseURL });
  const admin = await adminContext.newPage();
  await signIn(admin, E2E_ACCOUNTS.admin.email, "/admin/users");
  const account = admin.locator("details").filter({ hasText: E2E_ACCOUNTS.user.email });

  async function setStatus(status: "active" | "suspended") {
    await admin.goto(`/admin/users?${new URLSearchParams({ q: E2E_ACCOUNTS.user.email })}`);
    await account.locator("summary").click();
    const action = account.getByRole("button", {
      name: status === "active" ? "Reactivate account" : /^Suspend/,
    });
    if (await action.count()) {
      await action.click();
      await expect(
        account.getByRole("button", {
          name: status === "active" ? /^Suspend/ : "Reactivate account",
        }),
      ).toBeAttached();
    }
  }

  try {
    await setStatus("active");
    await signIn(page, E2E_ACCOUNTS.user.email, "/admin");
    await expect(page).toHaveURL(`${baseURL}/admin/denied`);
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "SmartTools home" })).toBeVisible();
    await expect(header.getByRole("button", { name: /Open account menu/ })).toBeVisible();
    await expect(header.getByRole("link", { name: "Saved", exact: true })).toHaveCount(0);
    await expect(header.getByRole("button", { name: /Search/ })).toHaveCount(0);
    await expect(header.getByRole("navigation", { name: "Tool suites" })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("admin-denied.png"), fullPage: true });

    await setStatus("suspended");
    const retainedSession = await page.request.get("/api/auth/get-session");
    expect((await retainedSession.json()).user.email).toBe(E2E_ACCOUNTS.user.email);

    for (const path of [
      "/",
      "/paperwork",
      "/devtools",
      "/media",
      "/admin",
      "/admin/denied",
      "/auth/profile",
      "/devtools/json-formatter",
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(`${baseURL}/account/suspended`);
      await expect(page.getByRole("heading", { name: /suspended/i })).toBeVisible();
    }

    expect((await page.request.get("/api/tools/search?q=json")).status()).toBe(403);
    const profileUpdate = await page.request.post("/api/auth/update-user", {
      headers: { Origin: baseURL! },
      data: { name: "Suspension must prevent this change" },
    });
    expect(profileUpdate.status()).toBe(403);
    const unchangedSession = await page.request.get("/api/auth/get-session");
    expect((await unchangedSession.json()).user.name).toBe(E2E_ACCOUNTS.user.name);

    await page.getByRole("link", { name: "Check access again" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Access checked. Your account is still suspended.",
    );
    await page.waitForLoadState("networkidle");
    await expect(header.getByRole("link", { name: "SmartTools home" })).toBeVisible();
    await expect(header.getByRole("button", { name: /Open account menu/ })).toBeVisible();
    await expect(header.getByRole("link", { name: "Saved", exact: true })).toHaveCount(0);
    await expect(header.getByRole("button", { name: /Search/ })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("account-suspended.png"), fullPage: true });
    await page.route("**/api/auth/sign-out", (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.getByRole("button", { name: "Switch account" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Couldn’t log out. Please try again." }),
    ).toBeVisible();
    await expect(page).toHaveURL(`${baseURL}/account/suspended?checked=1`);
    await page.getByRole("button", { name: /Open account menu/ }).click();
    await expect(page.getByRole("menuitem", { name: "My profile" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Admin page" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page.getByRole("menu").getByRole("alert")).toContainText(
      "Couldn’t log out. Please try again.",
    );
    await expect(page).toHaveURL(`${baseURL}/account/suspended?checked=1`);
    await page.unroute("**/api/auth/sign-out");
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(`${baseURL}/auth`);
    expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();

    await signIn(page, E2E_ACCOUNTS.user.email, "/paperwork");
    await expect(page).toHaveURL(`${baseURL}/account/suspended`);
    await page.getByRole("button", { name: "Switch account" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/auth");
    expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
    await signIn(page, E2E_ACCOUNTS.user.email, "/devtools");
    await expect(page).toHaveURL(`${baseURL}/account/suspended`);
    await setStatus("active");
    await page.getByRole("link", { name: "Check access again" }).click();
    await expect(page).toHaveURL(`${baseURL}/`);
    expect((await page.request.get("/api/tools/search?q=json")).status()).toBe(200);
  } finally {
    await setStatus("active");
    await adminContext.close();
  }
});

test("credential forms never put passwords in a URL without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("/auth");
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill("native-submit@example.test");
    await page.getByLabel("Password", { exact: true }).fill("synthetic-test-password");
    const navigation = page.waitForRequest(
      (request) => request.isNavigationRequest() && request.frame() === page.mainFrame(),
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const request = await navigation;
    expect(request.method()).toBe("POST");
    expect(new URL(request.url()).searchParams.has("password")).toBe(false);
  } finally {
    await context.close();
  }
});
