import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";

async function signIn(page: Page, email: string, returnTo: string) {
  await page.goto(`/auth?${new URLSearchParams({ returnTo })}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/auth");
}

async function openAccountMenu(page: Page) {
  await page.getByRole("button", { name: /^Open (?:navigation and )?account menu for / }).click();
  const menu = page.getByRole("menu").or(page.getByRole("group", { name: "Account", exact: true }));
  await expect(menu).toBeVisible();
  return menu;
}

function accountLink(menu: Locator, name: string) {
  return menu.getByRole("menuitem", { name, exact: true }).or(menu.getByRole("link", { name, exact: true }));
}

test("admin account navigation returns to the product from root and nested admin pages", async ({ page }) => {
  await signIn(page, E2E_ACCOUNTS.admin.email, "/admin");

  for (const path of ["/admin", "/admin/tools"]) {
    await page.goto(path);
    const adminMenu = await openAccountMenu(page);
    const backToProduct = accountLink(adminMenu, "Back to product");
    await expect(backToProduct).toHaveAttribute("href", "/");
    await expect(accountLink(adminMenu, "Admin page")).toHaveCount(0);
    await expect(accountLink(adminMenu, "My profile")).toBeVisible();
    await expect(adminMenu.getByRole("menuitem", { name: "Log out", exact: true })).toBeVisible();
    await backToProduct.click();
    await expect(page).toHaveURL((url) => url.pathname === "/");

    const productMenu = await openAccountMenu(page);
    const adminPage = accountLink(productMenu, "Admin page");
    await expect(adminPage).toHaveAttribute("href", "/admin");
    await expect(accountLink(productMenu, "Back to product")).toHaveCount(0);
    await adminPage.click();
    await expect(page).toHaveURL((url) => url.pathname === "/admin");
  }
});

test("an admin with limited permissions can return to the product from an access-denied page", async ({ page }) => {
  await signIn(page, E2E_ACCOUNTS.viewer.email, "/admin/roles");
  await expect(page).toHaveURL((url) => url.pathname === "/admin/denied");
  const menu = await openAccountMenu(page);
  const backToProduct = accountLink(menu, "Back to product");
  await expect(backToProduct).toHaveAttribute("href", "/");
  await expect(accountLink(menu, "Admin page")).toHaveCount(0);
  await backToProduct.click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
});

test("regular accounts have no admin navigation on product or access-denied pages", async ({ page }) => {
  await signIn(page, E2E_ACCOUNTS.user.email, "/");

  for (const path of ["/", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL((url) => url.pathname === (path === "/admin" ? "/admin/denied" : "/"));
    const menu = await openAccountMenu(page);
    await expect(accountLink(menu, "Admin page")).toHaveCount(0);
    await expect(accountLink(menu, "Back to product")).toHaveCount(0);
    await expect(accountLink(menu, "My profile")).toBeVisible();
    await page.keyboard.press("Escape");
  }
});
