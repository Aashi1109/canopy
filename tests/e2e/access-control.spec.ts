import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";
import { AuthPage } from "./pages/AuthPage";

test("a regular account shares its session but cannot enter Admin", async ({ page }) => {
  await new AuthPage(page).signIn(
    E2E_ACCOUNTS.user.email,
    E2E_PASSWORD,
    "http://localhost:3000/admin",
  );
  await expect(page).toHaveURL("http://localhost:3000/admin/denied");

  await page.goto("http://localhost:3000/paperwork");
  await expect(page.getByRole("link", { name: E2E_ACCOUNTS.user.name })).toBeVisible();
});

test("a custom role combines explicit grants and denies missing ones", async ({ page }) => {
  await new AuthPage(page).signIn(
    E2E_ACCOUNTS.viewer.email,
    E2E_PASSWORD,
    "http://localhost:3000/admin/tools",
  );
  await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible();

  await page.goto("http://localhost:3000/admin/roles");
  await expect(page).toHaveURL("http://localhost:3000/admin/denied");
});

test("the Admin header highlights the current section", async ({ page }) => {
  await new AuthPage(page).signIn(
    E2E_ACCOUNTS.admin.email,
    E2E_PASSWORD,
    "http://localhost:3000/admin/templates",
  );

  const navigation = page.getByRole("navigation", { name: "Admin sections" });
  await expect(navigation.getByRole("link", { name: "Templates" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(navigation.getByRole("link", { name: "Tools" })).not.toHaveAttribute("aria-current");

  await navigation.getByRole("link", { name: "Roles" }).click();
  await expect(page).toHaveURL("http://localhost:3000/admin/roles");
  await expect(navigation.getByRole("link", { name: "Roles" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(navigation.getByRole("link", { name: "Templates" })).not.toHaveAttribute(
    "aria-current",
  );
});

test("an Admin can disable a tool and its direct route is blocked", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "mutation runs once");

  await new AuthPage(page).signIn(
    E2E_ACCOUNTS.admin.email,
    E2E_PASSWORD,
    "http://localhost:3000/admin/tools",
  );
  const tool = page.locator("article").filter({ hasText: "JSON Formatter" });
  await expect(tool).toBeVisible();

  try {
    await tool.getByRole("button", { name: "Disable" }).click();
    await expect(tool.getByRole("button", { name: "Enable" })).toBeVisible();
    const blocked = await page.goto("http://localhost:3000/devtools/json-formatter");
    expect(blocked?.status()).toBe(404);
  } finally {
    await page.goto("http://localhost:3000/admin/tools");
    const currentTool = page.locator("article").filter({ hasText: "JSON Formatter" });
    const enable = currentTool.getByRole("button", { name: "Enable" });
    if (await enable.isVisible()) await enable.click();
  }
});
