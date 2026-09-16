import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";
import { AuthPage } from "./pages/AuthPage";

test("custom role membership searches, preserves selections, cancels and adds a role", async ({
  page,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "role lifecycle runs once");
  const name = `Membership ${randomUUID()}`;
  const user = E2E_ACCOUNTS.user;
  await new AuthPage(page).signIn(E2E_ACCOUNTS.admin.email, E2E_PASSWORD, new URL("/admin/roles", baseURL).href);
  await page.getByRole("textbox", { name: /^Role name\b/ }).fill(name);
  await page.getByRole("textbox", { name: /^Description\b/ }).fill("Temporary membership test role.");
  await page.getByRole("button", { name: "Create role", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/roles\/[^/]+$/);
  const roleUrl = page.url();
  let assigned = false;
  try {
    const trigger = page.getByRole("button", { name: "Assign users", exact: true });
    await expect(page.getByRole("heading", { name: "Assigned users · 0" })).toBeVisible();
    await trigger.click();
    const dialog = page.getByRole("alertdialog", { name: "Assign users", exact: true });
    const search = dialog.getByRole("textbox", { name: "Find users" });
    await expect(search).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Assign to 0 users" })).toBeDisabled();
    await search.fill(user.email);
    const results = page.getByRole("dialog", { name: "Search results", exact: true });
    const candidate = page.getByRole("checkbox", { name: new RegExp(user.name) });
    await candidate.check();
    await search.fill("no-such-user-" + randomUUID());
    await expect(results.getByText("No matching users. Try another name or email.")).toBeVisible();
    await expect(candidate).toBeChecked();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(dialog.getByRole("button", { name: "Assign to 0 users" })).toBeDisabled();
    await search.fill(user.email);
    await candidate.check();
    assigned = true; // Cleanup also covers a committed request whose response was interrupted.
    await dialog.getByRole("button", { name: "Assign to 1 user" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Assigned users · 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: user.name, exact: true })).toBeVisible();
    await trigger.click();
    await search.fill(user.email);
    await expect(results.getByText("No matching users. Try another name or email.")).toBeVisible();
    await expect(candidate).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Assigned users · 1" })).toBeVisible();
  } finally {
    if (assigned) {
      await page.goto(`/admin/users?q=${encodeURIComponent(user.email)}`);
      await page.getByRole("button", { name: `Manage ${user.name}`, exact: true }).click();
      const dialog = page.getByRole("alertdialog", { name: "Manage user" });
      await dialog.getByRole("checkbox", { name: new RegExp(name) }).uncheck();
      await dialog.getByRole("button", { name: "Save roles", exact: true }).click();
      await expect(dialog).toBeHidden();
    }
    await page.goto(roleUrl);
    await page.getByRole("button", { name: "Delete role", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete role", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/roles$/);
  }
});
