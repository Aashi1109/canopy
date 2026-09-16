import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";
import { AuthPage } from "./pages/AuthPage";

test("assignment search uses a dismissible dropdown and keeps selections visible", async ({ page, baseURL }) => {
  await new AuthPage(page).signIn(
    E2E_ACCOUNTS.admin.email,
    E2E_PASSWORD,
    new URL("/admin/roles/e2e-tool-viewer", baseURL).href,
  );
  await page.getByRole("button", { name: "Assign users", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Assign users", exact: true });
  const search = dialog.getByRole("textbox", { name: "Find users", exact: true });
  const results = page.getByRole("dialog", { name: "Search results", exact: true });
  await search.fill(E2E_ACCOUNTS.user.email);
  const option = results.getByRole("checkbox", { name: /E2E Regular User/ });
  await expect(option).toBeVisible();
  await search.press("Escape");
  await expect(results).toBeHidden();
  await expect(dialog).toBeVisible();
  await search.press("ArrowDown");
  await expect(option).toBeFocused();
  await option.press("Space");
  await expect(results).toBeHidden();
  await expect(search).toBeFocused();
  const selected = dialog.getByRole("group", { name: "Selected users" });
  await expect(selected.getByRole("checkbox")).toBeChecked();
  await expect(dialog.getByRole("button", { name: "Assign to 1 user", exact: true })).toBeEnabled();
  await selected.getByRole("checkbox").uncheck();
  await expect(dialog.getByRole("button", { name: "Assign to 0 users", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
});

test("role changes enable Save only until saved or reverted", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "role lifecycle runs once");
  const name = `E2E Role ${randomUUID()}`;
  const description = "Temporary role for editor behavior checks.";
  const savedName = `${name} renamed`;
  const savedDescription = `${description} Saved.`;

  await new AuthPage(page).signIn(E2E_ACCOUNTS.admin.email, E2E_PASSWORD, new URL("/admin/roles", baseURL).href);
  await page.getByRole("textbox", { name: /^Role name\b/ }).fill(name);
  await page.getByRole("textbox", { name: /^Description\b/ }).fill(description);
  await page.getByRole("button", { name: "Create role", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/roles\/[^/]+$/);
  const roleUrl = page.url();
  const save = page.getByRole("button", { name: "Save role", exact: true });
  const roleName = page.getByRole("textbox", { name: "Role name", exact: true });
  const roleDescription = page.getByRole("textbox", { name: "Role description", exact: true });
  async function editName(value: string) {
    if (!(await roleName.isVisible())) await page.getByRole("button", { name: "Edit Role name", exact: true }).click();
    await roleName.fill(value);
  }
  async function editDescription(value: string) {
    if (!(await roleDescription.isVisible()))
      await page.getByRole("button", { name: "Edit Role description", exact: true }).click();
    await roleDescription.fill(value);
  }
  const permission = page.getByRole("group", { name: "Tools", exact: true }).getByRole("checkbox", { name: /^Edit\b/ });
  const viewPermission = page
    .getByRole("group", { name: "Tools", exact: true })
    .getByRole("checkbox", { name: /^View\b/ });

  try {
    await expect(save).toBeDisabled();
    await expect(page.getByRole("group", { name: "Admin", exact: true })).toHaveCount(0);
    for (const view of await page.getByRole("checkbox", { name: /^View\b/ }).all()) {
      await expect(view).toBeEnabled();
    }
    await editName(`${name} changed`);
    await expect(save).toBeEnabled();
    await editName(name);
    await expect(save).toBeDisabled();
    await editName(` ${name} `);
    await expect(save).toBeDisabled();
    await editName(name);

    await editDescription(`${description} Changed.`);
    await expect(save).toBeEnabled();
    await editDescription(description);
    await expect(save).toBeDisabled();

    await expect(viewPermission).toBeEnabled();
    await expect(permission).toBeDisabled();
    await viewPermission.check();
    await permission.check();
    await expect(save).toBeEnabled();
    await viewPermission.uncheck();
    await expect(permission).not.toBeChecked();
    await expect(permission).toBeDisabled();
    await expect(viewPermission).toBeEnabled();
    await expect(save).toBeDisabled();

    await editName("x".repeat(161));
    await expect(roleName).toHaveValue("x".repeat(160));
    await editName("   ");
    await expect(page.getByRole("alert")).toContainText("Role name is required.");
    await expect(save).toBeDisabled();
    await roleName.press("Escape");
    await expect(save).toBeDisabled();

    await editName(` ${savedName} `);
    await editDescription(` ${savedDescription} `);
    await viewPermission.check();
    await permission.check();
    await save.click();
    await expect(page.getByText("Role saved.", { exact: true })).toBeVisible();
    await expect(page.getByText(savedName, { exact: true })).toBeVisible();
    await expect(page.getByText(savedDescription, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(savedName);
    await expect(permission).toBeChecked();
    await expect(viewPermission).toBeChecked();
    await expect(save).toBeDisabled();

    await page.getByRole("button", { name: "Delete role", exact: true }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toHaveAccessibleName(`Delete “${savedName}”?`);
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();

    await editName(`${savedName} unsaved`);
    await expect(save).toBeEnabled();
    await editName(savedName);
    await expect(save).toBeDisabled();
    await editDescription(`${savedDescription} Unsaved.`);
    await expect(save).toBeEnabled();
    await editDescription(savedDescription);
    await expect(save).toBeDisabled();
    await page.reload();
    await expect(page.getByText(savedName, { exact: true })).toBeVisible();
    await expect(page.getByText(savedDescription, { exact: true })).toBeVisible();
    await expect(permission).toBeChecked();
    await expect(save).toBeDisabled();
    await viewPermission.uncheck();
    await expect(viewPermission).not.toBeChecked();
    await expect(permission).not.toBeChecked();
    await expect(viewPermission).toBeEnabled();
    await expect(permission).toBeDisabled();
    await expect(save).toBeEnabled();
    await viewPermission.check();
    await permission.check();
    await expect(save).toBeDisabled();

    await viewPermission.uncheck();
    await expect(permission).not.toBeChecked();
    await expect(permission).toBeDisabled();
    await viewPermission.check();
    await expect(permission).not.toBeChecked();
    await save.click();
    await expect(page.getByText("Role saved.", { exact: true })).toBeVisible();
    await expect(permission).not.toBeChecked();
    await expect(viewPermission).toBeChecked();
    await expect(save).toBeDisabled();
    await page.reload();
    await expect(permission).not.toBeChecked();
    await expect(viewPermission).toBeChecked();
    await expect(save).toBeDisabled();
  } finally {
    // This role was created by this test in the configured disposable E2E database.
    await page.goto(roleUrl);
    await page.getByRole("button", { name: "Edit Role name", exact: true }).click();
    const currentName = await roleName.inputValue();
    await page.getByRole("button", { name: "Delete role", exact: true }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toHaveAccessibleName(`Delete “${currentName}”?`);
    await confirmation.getByRole("button", { name: "Delete role", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/roles$/);
    await expect(page.getByRole("link").filter({ hasText: name })).toHaveCount(0);
  }
});

test("role deletion requires confirmation and preserves assigned roles after failure", async ({ page, baseURL }) => {
  const roleUrl = new URL("/admin/roles/e2e-tool-viewer", baseURL).href;
  await new AuthPage(page).signIn(E2E_ACCOUNTS.admin.email, E2E_PASSWORD, roleUrl);
  const trigger = page.getByRole("button", { name: "Delete role", exact: true });
  const confirmation = page.getByRole("alertdialog");

  await trigger.click();
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toHaveAccessibleName("Delete “E2E Tool Viewer”?");
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(roleUrl);

  await trigger.click();
  await expect(confirmation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await confirmation.getByRole("button", { name: "Delete role", exact: true }).click();
  await expect(confirmation.getByRole("alert")).toContainText(/assigned/i);
  await expect(confirmation).toBeVisible();
  await expect(page).toHaveURL(roleUrl);
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E Tool Viewer");
  await expect(page.getByRole("button", { name: "Save role", exact: true })).toBeDisabled();
});
