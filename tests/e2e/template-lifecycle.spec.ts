import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";
import { AuthPage } from "./pages/AuthPage";

test("an Admin publishes a template that Paperwork can consume", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "mutation runs once");
  const suffix = Date.now().toString(36);
  const name = `E2E Published ${suffix}`;

  await new AuthPage(page).signIn(
    E2E_ACCOUNTS.admin.email,
    E2E_PASSWORD,
    "http://localhost:3000/admin/templates",
  );
  const create = page.locator("section").filter({ hasText: "Create template" });
  await create.getByLabel("Name").fill(name);
  await create.getByLabel("Slug").fill(`e2e-published-${suffix}`);
  await create.getByLabel("Description").fill("Published by the desktop browser integration test.");
  await create.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/templates\/[a-f0-9-]+$/);

  await page.goto("http://localhost:3000/admin/templates");
  const card = page.locator("article").filter({ hasText: name });
  await card.getByRole("button", { name: "Publish" }).click();
  await expect(card).toContainText("published");
  await card.getByRole("button", { name: "Set default" }).click();
  await expect(card).toContainText("Default");

  await page.goto("http://localhost:3000/paperwork/invoice-generator");
  await expect(
    page.getByRole("heading", {
      name: `Invoice theme: ${name}`,
      exact: true,
    }),
  ).toBeVisible();
});

test("an Admin publishes a dynamic expense form with bound custom fields", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "mutation runs once");
  test.slow();
  const suffix = Date.now().toString(36);
  const name = `E2E Expense ${suffix}`;

  await new AuthPage(page).signIn(
    E2E_ACCOUNTS.admin.email,
    E2E_PASSWORD,
    "http://localhost:3000/admin/templates",
  );
  await page.getByRole("button", { name: "Advanced designer" }).click();
  const create = page.getByRole("dialog", {
    name: "Create an advanced template",
  });
  await create.getByLabel("Name").fill(name);
  await create.getByLabel("Slug").fill(`e2e-expense-${suffix}`);
  await create
    .getByLabel("Description")
    .fill("Dynamic expense form created by the browser integration test.");
  await create.getByLabel("Document and canvas").selectOption("expense-report:LETTER");
  await create.getByRole("button", { name: "Open designer" }).click();

  await expect(page).toHaveURL(/\/templates\/[a-f0-9-]+\/advanced$/);
  await expect(page.getByText("Loading designer…")).toBeHidden({
    timeout: 60_000,
  });
  await page.getByLabel("Page size").selectOption("A4");

  await page.getByLabel("Add elements").click();
  await page.getByRole("button", { name: "Add Text" }).click();
  await page.getByRole("button", { name: "Fields", exact: true }).click();
  await page.getByRole("button", { name: "Section", exact: true }).click();
  const sectionLabel = page.getByLabel("Section label").last();
  await sectionLabel.fill("Custom details");
  const customSection = sectionLabel.locator("xpath=ancestor::section[1]");

  await customSection.getByRole("button", { name: "Add custom field" }).click();
  const scalarLabel = customSection.getByLabel(/^custom\.field(?:-\d+)? label$/).last();
  await scalarLabel.fill("Cost center");
  await scalarLabel.locator("..").getByRole("button", { name: "Bind" }).click();
  await customSection.getByLabel("Cost center sample value").fill("CC-042");

  await page.getByLabel("Close data panel").click();
  await page.getByLabel("Add elements").click();
  await page.getByRole("button", { name: "Add Table" }).click();
  await page.getByRole("button", { name: "Fields", exact: true }).click();
  await customSection.getByRole("button", { name: "Add repeatable table" }).click();
  const repeaterLabel = customSection.getByLabel(/^custom\.table(?:-\d+)? label$/).last();
  await repeaterLabel.fill("Attendees");
  await repeaterLabel.locator("..").getByRole("button", { name: "Bind" }).click();
  await customSection
    .getByLabel("Attendees sample value")
    .fill('[{"id":"attendee-1","value":"Avery"}]');

  const previewPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Preview PDF" }).click();
  const preview = await previewPromise;
  await expect.poll(() => preview.url()).toMatch(/^blob:/);
  await preview.close();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3000/admin/templates", {
    timeout: 60_000,
  });

  await page.goto("http://localhost:3000/paperwork/expense-report");
  await expect(page.getByRole("option", { name, exact: true })).toBeAttached();
  await page.getByRole("button", { name: "Load sample", exact: true }).click();
  await expect(page.getByLabel("Cost center")).toHaveValue("CC-042");

  const attendees = page.getByText("Attendees", { exact: true }).locator("xpath=../..");
  await expect(attendees.getByLabel("Value")).toHaveValue("Avery");
  await attendees.getByRole("button", { name: "Add row" }).click();
  await attendees.getByLabel("Value").nth(1).fill("Blake");
  const secondHandle = attendees.getByRole("button", { name: "Reorder Attendees row" }).nth(1);
  await secondHandle.focus();
  await secondHandle.press("Space");
  await secondHandle.press("ArrowUp");
  await secondHandle.press("Space");
  await expect(attendees.getByLabel("Value").first()).toHaveValue("Blake");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await expect((await downloadPromise).suggestedFilename()).toMatch(/^expense-report-.*\.pdf$/);
  const printPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print PDF", exact: true }).click();
  const printed = await printPromise;
  await expect.poll(() => printed.url()).toMatch(/^blob:/);
  await printed.close();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileField = await page.getByLabel("Cost center").boundingBox();
  expect(mobileField).not.toBeNull();
  expect(mobileField!.x).toBeGreaterThanOrEqual(0);
  expect(mobileField!.x + mobileField!.width).toBeLessThanOrEqual(390);

  await page.goto("http://localhost:3000/paperwork/mileage-log");
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
});
