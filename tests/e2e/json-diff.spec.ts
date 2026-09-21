import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1366, height: 768 } });

test.beforeEach(async ({ page }) => {
  await page.goto("http://localhost:3000/devtools/json-diff");
});

test("JSON Diff compares two panes and preserves input when editing and comparing again", async ({ page }) => {
  const original = '{"name":"Ada","removed":true}';
  const changed = '{"name":"Lin","added":true}';
  const inputA = page.getByRole("textbox", { name: "JSON A", exact: true });
  const inputB = page.getByRole("textbox", { name: "JSON B", exact: true });
  await inputA.fill(original);
  await inputB.fill(changed);
  const left = await inputA.boundingBox();
  const right = await inputB.boundingBox();
  expect(left).not.toBeNull();
  expect(right).not.toBeNull();
  expect(left!.x + left!.width).toBeLessThanOrEqual(right!.x);

  await page.getByRole("button", { name: "Compare JSON", exact: true }).click();
  const comparison = page.getByRole("region", { name: "Side-by-side comparison" });
  await expect(comparison).toBeVisible();
  await expect(comparison.getByText("JSON A · Original", { exact: true })).toBeVisible();
  await expect(comparison.getByText("JSON B · Changed", { exact: true })).toBeVisible();
  await expect(comparison).toContainText(/JSON A · Original, line \d+, removed:/);
  await expect(comparison).toContainText(/JSON B · Changed, line \d+, added:/);
  await expect(comparison).toContainText('"removed": true');
  await expect(comparison).toContainText('"added": true');
  await expect(page.getByRole("button", { name: "Copy all", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Download .txt", exact: true })).toBeEnabled();
  await comparison.focus();
  await expect(comparison).toBeFocused();

  const edit = page.getByRole("button", { name: "Edit JSON", exact: true });
  await edit.focus();
  await edit.press("Enter");
  await expect(inputA).toHaveValue(original);
  await expect(inputB).toHaveValue(changed);
  await inputB.fill('{"name":"Revised","added":false}');
  await page.getByRole("button", { name: "Compare JSON", exact: true }).click();
  await expect(comparison).toContainText('"name": "Revised"');
  await expect(comparison).not.toContainText('"name": "Lin"');

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(edit).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
});

test("JSON Diff reports identical values despite whitespace and key order changes", async ({ page }) => {
  await page.getByRole("textbox", { name: "JSON A", exact: true }).fill('{"id":1,"active":true}');
  await page.getByRole("textbox", { name: "JSON B", exact: true }).fill('{ "active": true, "id": 1 }');
  await page.getByRole("button", { name: "Compare JSON", exact: true }).click();

  await expect(page.getByRole("status").filter({ hasText: /^No differences$/ })).toBeVisible();
  const comparison = page.getByRole("region", { name: "Side-by-side comparison" });
  await expect(comparison).toContainText('"id": 1');
  await expect(comparison).not.toContainText(/, (added|removed):/);
  await expect(page.getByRole("button", { name: "Edit JSON", exact: true })).toBeEnabled();
});

for (const mode of ["strict", "default repair"] as const) {
  test(`JSON Diff keeps invalid JSON B editable in ${mode} mode and recovers`, async ({ page }) => {
    const inputA = page.getByRole("textbox", { name: "JSON A", exact: true });
    const inputB = page.getByRole("textbox", { name: "JSON B", exact: true });
    await inputA.fill('{"id":1}');
    await inputB.fill('{"id":');
    if (mode === "strict") {
      await page.getByRole("button", { name: "Restore settings panel", exact: true }).click();
      await page.getByRole("combobox", { name: "Auto-fix broken JSON", exact: true }).click();
      await page.getByRole("option", { name: "Off (strict)", exact: true }).click();
    }
    await page.getByRole("button", { name: "Compare JSON", exact: true }).click();

    await expect(inputB).toBeEditable();
    await expect(inputB).toHaveAttribute("aria-invalid", "true");
    await expect(inputA).toHaveAttribute("aria-invalid", "false");
    await expect(inputB).toHaveAccessibleDescription(/JSON B/);
    await expect(page.getByRole("region", { name: "Side-by-side comparison" })).toHaveCount(0);
    await expect(inputA).toHaveValue('{"id":1}');

    await inputB.fill('{"id":2}');
    await page.getByRole("button", { name: "Compare JSON", exact: true }).click();
    await expect(page.getByRole("region", { name: "Side-by-side comparison" })).toContainText('"id": 2');
  });
}
