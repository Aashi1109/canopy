import { expect, test, type Locator, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

async function expectMarkdownDownload(page: Page, button: Locator, expected: string) {
  const downloading = page.waitForEvent("download");
  await button.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("table.md");
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!, "utf8")).toBe(expected);
}

test.beforeEach(async ({ context, page }) => {
  await page.goto("/devtools/csv-to-markdown-table");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
  await expect(page.getByRole("textbox", { name: "CSV input", exact: true })).toBeEditable();
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
]) {
  test.describe(`CSV to Markdown views at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test("Raw and rich Preview preserve Markdown exports and the selected view on conversion", async ({ page }) => {
      const input = page.getByRole("textbox", { name: "CSV input", exact: true });
      const convert = page.getByRole("button", { name: "Convert to Markdown", exact: true });
      const result = page.getByRole("region", { name: "Result", exact: true });
      const view = result.getByRole("tablist", { name: "Result view", exact: true });
      await expect(view).toHaveCount(0);
      await input.fill('name,notes\n**Ada**,Uses `code`\nLin,A | B\nGrace,"Line one\nLine two"');
      await convert.click();
      const markdown = [
        "| name | notes |",
        "| --- | --- |",
        "| **Ada** | Uses `code` |",
        "| Lin | A \\| B |",
        "| Grace | Line one<br>Line two |",
      ].join("\n");
      const rawTab = view.getByRole("tab", { name: "Raw", exact: true });
      const previewTab = view.getByRole("tab", { name: "Preview", exact: true });
      const raw = result.getByRole("textbox", { name: "Result code", exact: true });
      await expect(rawTab).toHaveAttribute("aria-selected", "true");
      await expect(previewTab).toHaveAttribute("aria-selected", "false");
      await expect.poll(() => raw.innerText()).toBe(markdown);
      for (const tab of [rawTab, previewTab]) {
        const panelId = await tab.getAttribute("aria-controls");
        expect(panelId).toBeTruthy();
        const panel = result.locator(`[id="${panelId}"]`);
        await expect(panel).toHaveAttribute("role", "tabpanel");
        await expect(panel).toHaveAttribute("aria-labelledby", (await tab.getAttribute("id"))!);
      }
      await expect(result.getByRole("tabpanel", { includeHidden: true })).toHaveCount(2);
      await expect(result.getByRole("tabpanel")).toHaveCount(1);

      await rawTab.press("ArrowRight");
      await expect(previewTab).toBeFocused();
      await expect(previewTab).toHaveAttribute("aria-selected", "true");
      await expect(rawTab).toHaveAttribute("aria-selected", "false");
      const table = result.getByRole("table");
      await expect(table.getByRole("columnheader")).toHaveText(["name", "notes"]);
      await expect(table.getByRole("cell").nth(0)).toHaveText("Ada");
      await expect(table.getByRole("cell").nth(1)).toHaveText("Uses code");
      await expect(table.getByRole("cell").nth(3)).toHaveText("A | B");
      await expect(table.locator("strong")).toHaveText("Ada");
      await expect(table.locator("code")).toHaveText("code");
      await expect.poll(() => table.getByRole("cell").last().innerText()).toBe("Line one\nLine two");
      await result.getByRole("button", { name: "Copy all", exact: true }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(markdown);
      await expectMarkdownDownload(page, result.getByRole("button", { name: "Download .md", exact: true }), markdown);
      await page.screenshot({ path: `/tmp/canopy-csv-to-markdown-preview-${viewport.width}.png` });

      await previewTab.press("ArrowLeft");
      await expect(rawTab).toBeFocused();
      await expect(rawTab).toHaveAttribute("aria-selected", "true");
      await expect.poll(() => raw.innerText()).toBe(markdown);
      await previewTab.click();
      await input.fill("name,notes\n**Updated**,Current");
      await convert.click();
      await expect(previewTab).toHaveAttribute("aria-selected", "true");
      await expect(result.getByRole("tabpanel")).toHaveCount(1);
      await expect(table.getByRole("cell")).toHaveText(["Updated", "Current"]);
      await expect(table.locator("strong")).toHaveText("Updated");
      await result.getByRole("button", { name: "Copy all", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe("| name | notes |\n| --- | --- |\n| **Updated** | Current |");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    });

    test("empty input and invalid CSV stay recoverable before showing a preview", async ({ page }) => {
      const input = page.getByRole("textbox", { name: "CSV input", exact: true });
      const convert = page.getByRole("button", { name: "Convert to Markdown", exact: true });
      const result = page.getByRole("region", { name: "Result", exact: true });
      await expect(convert).toBeDisabled();
      await expect(result.getByRole("tablist", { name: "Result view", exact: true })).toHaveCount(0);
      await input.fill("name,role\nAda");
      await convert.click();
      await expect(result).toContainText("Every row must have the same number of fields.");
      await expect(input).toBeEditable();
      await input.fill("name,role\nAda,Admin");
      await convert.click();
      await expect(result.getByRole("tab", { name: "Raw", exact: true })).toHaveAttribute("aria-selected", "true");
      await expect
        .poll(() => result.getByRole("textbox", { name: "Result code", exact: true }).innerText())
        .toBe("| name | role |\n| --- | --- |\n| Ada | Admin |");
      await result.getByRole("tab", { name: "Preview", exact: true }).click();
      await expect(result.getByRole("table").getByRole("cell")).toHaveText(["Ada", "Admin"]);
      await expect(result).not.toContainText("Every row must have the same number of fields.");
    });

    test("a wide Markdown table scrolls within its preview without widening the page", async ({ page }) => {
      const columns = Array.from({ length: 60 }, (_, index) => `Column_${index + 1}`);
      const values = columns.map((_, index) => `Value_${index + 1}`);
      await page
        .getByRole("textbox", { name: "CSV input", exact: true })
        .fill(`${columns.join(",")}\n${values.join(",")}`);
      await page.getByRole("button", { name: "Convert to Markdown", exact: true }).click();
      const result = page.getByRole("region", { name: "Result", exact: true });
      await result.getByRole("tab", { name: "Preview", exact: true }).click();
      const table = result.getByRole("table");
      await expect(table.getByRole("columnheader")).toHaveCount(60);
      expect(await table.evaluate((element) => element.scrollWidth)).toBeGreaterThan(
        await table.evaluate((element) => element.clientWidth),
      );
      await table.hover();
      await page.mouse.wheel(100_000, 0);
      await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await expect(table.getByRole("columnheader", { name: "Column_60", exact: true })).toBeInViewport();
      await expect(table.getByRole("cell", { name: "Value_60", exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: `/tmp/canopy-csv-to-markdown-wide-${viewport.width}.png` });
    });
  });
}

test.describe("Large CSV to Markdown preview", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("the preview is bounded while downloading the complete Markdown table", async ({ page }) => {
    test.setTimeout(60_000);
    const notes = Array.from({ length: 10_000 }, (_, index) => `row_${index}_${"x".repeat(230)}`);
    const source = `id,note\n${notes.map((note, index) => `${index},${note}`).join("\n")}`;
    const markdown = `| id | note |\n| --- | --- |\n${notes.map((note, index) => `| ${index} | ${note} |`).join("\n")}`;
    expect(Buffer.byteLength(source)).toBeGreaterThan(2_000_000);
    await page.locator('input[type="file"]').setInputFiles({
      buffer: Buffer.from(source),
      mimeType: "text/csv",
      name: "large-markdown-table.csv",
    });
    await expect(page.getByRole("button", { name: "Remove large-markdown-table.csv", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "CSV input", exact: true })).not.toBeEditable();
    await page.getByRole("button", { name: "Convert to Markdown", exact: true }).click();
    const result = page.getByRole("region", { name: "Result", exact: true });
    await expect(result.getByRole("tab", { name: "Raw", exact: true })).toHaveAttribute("aria-selected", "true", {
      timeout: 30_000,
    });
    await expect(
      result.getByText("Showing a preview. Download the complete file for all rows.", { exact: true }),
    ).toBeVisible();
    await result.getByRole("button", { name: "Copy preview", exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.startsWith("| id | note |\n| --- | --- |\n")).toBe(true);
    expect(markdown.startsWith(copied)).toBe(true);
    expect(Buffer.byteLength(copied)).toBeLessThanOrEqual(256 * 1024);
    expect(copied.length).toBeLessThan(markdown.length);

    await result.getByRole("tab", { name: "Preview", exact: true }).click();
    const table = result.getByRole("table");
    await expect(table.getByRole("columnheader")).toHaveText(["id", "note"]);
    await expect(table.getByRole("cell").nth(1)).toHaveText(notes[0]);
    expect(await table.getByRole("row").count()).toBeGreaterThan(1);
    expect(await table.getByRole("row").count()).toBeLessThan(notes.length + 1);
    await expect(table.getByRole("cell", { name: notes.at(-1)!, exact: true })).toHaveCount(0);
    await expect(
      result.getByText("Showing a preview. Download the complete file for all rows.", { exact: true }),
    ).toBeVisible();
    await expectMarkdownDownload(
      page,
      result.getByRole("button", { name: "Download file", exact: true }).first(),
      markdown,
    );
  });
});
