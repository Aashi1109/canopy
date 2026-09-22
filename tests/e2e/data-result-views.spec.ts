import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function openTool(page: Page, context: BrowserContext, slug: string) {
  await page.goto(`/devtools/${slug}`);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
  return page.getByRole("region", { name: "Result", exact: true });
}

async function expectExports(page: Page, result: Locator, expected: string, filename: string) {
  await result.getByRole("button", { name: "Copy all", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  const downloading = page.waitForEvent("download");
  await result.getByRole("button", { name: `Download .${filename.split(".").at(-1)}`, exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(filename);
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!, "utf8")).toBe(expected);
}

async function expectTabAssociations(result: Locator, previewName: string) {
  const view = result.getByRole("tablist", { name: "Result view", exact: true });
  const raw = view.getByRole("tab", { name: "Raw", exact: true });
  const preview = view.getByRole("tab", { name: previewName, exact: true });
  await expect(raw).toHaveAttribute("aria-selected", "true");
  await expect(preview).toHaveAttribute("aria-selected", "false");
  for (const tab of [raw, preview]) {
    const panelId = await tab.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const panel = result.locator(`[id="${panelId}"]`);
    await expect(panel).toHaveAttribute("role", "tabpanel");
    await expect(panel).toHaveAttribute("aria-labelledby", (await tab.getAttribute("id"))!);
  }
  await raw.press("ArrowRight");
  await expect(preview).toBeFocused();
  await expect(preview).toHaveAttribute("aria-selected", "true");
  await expect(raw).toHaveAttribute("aria-selected", "false");
  return { raw, preview };
}

async function expectReadOnlyTree(result: Locator) {
  const tree = result.getByRole("tree", { name: "Read-only JSON values", exact: true });
  await expect(tree).toBeVisible();
  await expect(tree.locator("input, textarea, select, [contenteditable=true], [role=switch]")).toHaveCount(0);
  await expect(tree.getByRole("button", { name: /Reorder|Delete|Duplicate|Add|Edit|Change/ })).toHaveCount(0);
  await expect(result.getByRole("group", { name: "JSON edit history" })).toHaveCount(0);
  await expect(result.getByRole("combobox", { name: "JSON result view" })).toHaveCount(0);
  return tree;
}

async function expectContained(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
}

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
]) {
  test.describe(`Data result views at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test("CSV Formatter preserves quoted cells and original exports in Raw and Table", async ({ page, context }) => {
      const result = await openTool(page, context, "csv-formatter");
      const input = page.getByRole("textbox", { name: "CSV input", exact: true });
      const format = page.getByRole("button", { name: "Format CSV", exact: true });
      await expect(input).toBeEditable();
      await input.fill('name,note\n Ada ,"Hello, ""team"""\n Lin ,"First line\nSecond line"');
      await format.click();
      const expected = 'name,note\nAda,"Hello, ""team"""\nLin,"First line\nSecond line"';
      const rawCode = result.getByRole("textbox", { name: "Result code", exact: true });
      await expect.poll(() => rawCode.innerText()).toBe(expected);
      await expect(rawCode).not.toBeEditable();
      const { raw, preview } = await expectTabAssociations(result, "Table");
      const table = result.getByRole("table");
      await expect(table.getByRole("columnheader")).toHaveText(["name", "note"]);
      await expect(table.getByRole("cell")).toHaveText(["Ada", 'Hello, "team"', "Lin", "First line\nSecond line"]);
      await expectExports(page, result, expected, "formatted-data.txt");
      await preview.press("ArrowLeft");
      await expect(raw).toBeFocused();
      await expect(raw).toHaveAttribute("aria-selected", "true");
      await expect.poll(() => rawCode.innerText()).toBe(expected);
      await preview.click();
      await input.fill("name,note\n Grace , updated ");
      await format.click();
      await expect(preview).toHaveAttribute("aria-selected", "true");
      await expect(table.getByRole("cell")).toHaveText(["Grace", "updated"]);
      await expectExports(page, result, "name,note\nGrace,updated", "formatted-data.txt");
      await expectContained(page);
    });

    test("CSV to JSON provides a read-only Tree and preserves strings and optional numeric conversion", async ({
      page,
      context,
    }) => {
      const result = await openTool(page, context, "csv-to-json");
      const input = page.getByRole("textbox", { name: "CSV input", exact: true });
      const convert = page.getByRole("button", { name: "Convert to JSON", exact: true });
      await expect(input).toBeEditable();
      await input.fill('person,note,active,count\n Ada ,"Hello, ""team""",false,0');
      const expected = JSON.stringify(
        [{ person: " Ada ", note: 'Hello, "team"', active: "false", count: "0" }],
        null,
        2,
      );
      await convert.click();
      const rawCode = result.getByRole("textbox", { name: "Result code", exact: true });
      await expect.poll(() => rawCode.innerText()).toBe(expected);
      const { raw, preview } = await expectTabAssociations(result, "Tree");
      const tree = await expectReadOnlyTree(result);
      await expect(tree.getByRole("treeitem", { name: "person", exact: true })).toContainText('" Ada "');
      await expect(tree.getByRole("treeitem", { name: "note", exact: true })).toContainText(
        JSON.stringify('Hello, "team"'),
      );
      await expect(
        tree.getByRole("treeitem", { name: "active", exact: true }).getByText('"false"', { exact: true }),
      ).toBeVisible();
      await expect(
        tree.getByRole("treeitem", { name: "count", exact: true }).getByText('"0"', { exact: true }),
      ).toBeVisible();
      await tree.getByRole("button", { name: "Collapse 0", exact: true }).click();
      await expect(tree.getByRole("treeitem", { name: "person", exact: true })).toHaveCount(0);
      await tree.getByRole("button", { name: "Expand 0", exact: true }).click();
      await expect(tree.getByRole("treeitem", { name: "person", exact: true })).toBeVisible();
      await expectExports(page, result, expected, "data.json");
      await preview.press("ArrowLeft");
      await expect(raw).toBeFocused();
      await expect.poll(() => rawCode.innerText()).toBe(expected);
      await raw.press("ArrowRight");
      await page.getByRole("button", { name: "Restore settings panel", exact: true }).click();
      await page.getByRole("switch", { name: "Parse numbers", exact: true }).check();
      await page.getByRole("switch", { name: "Trim whitespace", exact: true }).check();
      await convert.click();
      await expect(preview).toHaveAttribute("aria-selected", "true");
      await expect(tree.getByRole("treeitem", { name: "person", exact: true })).toContainText('"Ada"');
      await expect(
        tree.getByRole("treeitem", { name: "count", exact: true }).getByText("0", { exact: true }),
      ).toBeVisible();
      await expect(
        tree.getByRole("treeitem", { name: "active", exact: true }).getByText('"false"', { exact: true }),
      ).toBeVisible();
      await expectExports(
        page,
        result,
        JSON.stringify([{ person: "Ada", note: 'Hello, "team"', active: "false", count: 0 }], null, 2),
        "data.json",
      );
      await expectContained(page);
    });

    test("CSV to TSV keeps native tab-separated exports while Table shows decoded cells", async ({ page, context }) => {
      const result = await openTool(page, context, "csv-to-tsv");
      const input = page.getByRole("textbox", { name: "CSV input", exact: true });
      await expect(input).toBeEditable();
      await input.fill('name,note\nAda,"Hello, world"\nLin,"First line\nSecond line"');
      await page.getByRole("button", { name: "Convert to TSV", exact: true }).click();
      const expected = 'name\tnote\nAda\tHello, world\nLin\t"First line\nSecond line"';
      const rawCode = result.getByRole("textbox", { name: "Result code", exact: true });
      await expect.poll(() => rawCode.innerText()).toBe(expected);
      await expectTabAssociations(result, "Table");
      const table = result.getByRole("table");
      await expect(table.getByRole("columnheader")).toHaveText(["name", "note"]);
      await expect(table.getByRole("cell")).toHaveText(["Ada", "Hello, world", "Lin", "First line\nSecond line"]);
      await expectExports(page, result, expected, "table.tsv");
      await expectContained(page);
    });
  });
}
