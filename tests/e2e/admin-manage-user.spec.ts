import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";
import { AuthPage } from "./pages/AuthPage";

test("manage user preserves collapsed role edits and discards them on cancel", async ({
  page,
  baseURL,
}) => {
  await new AuthPage(page).signIn(
    E2E_ACCOUNTS.admin.email,
    E2E_PASSWORD,
    new URL(`/admin/users?q=${encodeURIComponent(E2E_ACCOUNTS.user.email)}`, baseURL).href,
  );
  const trigger = page.getByRole("button", {
    name: `Manage ${E2E_ACCOUNTS.user.name}`,
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("alertdialog", { name: "Manage user" });
  const roles = dialog.getByRole("button", { name: "Roles", exact: true });
  const admin = dialog.getByRole("checkbox", { name: "Admin", exact: true });
  const original = await admin.isChecked();
  await admin.setChecked(!original);
  await roles.click();
  await expect(roles).toHaveAttribute("aria-expanded", "false");
  await expect(admin).toBeHidden();
  await roles.focus();
  await page.keyboard.press("Enter");
  await expect(admin).toBeChecked({ checked: !original });
  await expect(dialog.getByRole("checkbox", { name: /User · Required/ })).toBeDisabled();
  await dialog.getByRole("button", { name: "Account access", exact: true }).click();
  await expect(admin).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(admin).toBeChecked({ checked: original });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
