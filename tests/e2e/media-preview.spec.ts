import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";
import { AuthPage } from "./pages/AuthPage";

test("full-screen preview contains caller content and restores focus on exit", async ({ page }) => {
  await new AuthPage(page).signIn(E2E_ACCOUNTS.admin.email, E2E_PASSWORD, "http://localhost:3000/admin/design-system");
  const trigger = page.getByRole("button", { name: "Open full-screen preview" });
  await trigger.click();
  const preview = page.getByRole("dialog", { name: "Preview example" });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Caller-owned content" })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Exit preview" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(preview.getByRole("button", { name: "Exit preview" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await preview.getByRole("button", { name: "Exit preview" }).click();
  await expect(preview).toBeHidden();
  await expect(trigger).toBeFocused();
});
