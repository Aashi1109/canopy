import { expect, test, type Locator, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

async function expectHtmlDownload(page: Page, button: Locator, expected: string) {
  const downloading = page.waitForEvent("download");
  await button.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("table.html");
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!, "utf8")).toBe(expected);
}

test.beforeEach(async ({ context, page }) => {
  await page.goto("/devtools/csv-to-table");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
  await expect(page.getByRole("textbox", { name: "CSV input", exact: true })).toBeEditable();
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
]) {
  test.describe(`CSV to Table views at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test("Raw and Preview preserve escaped HTML exports, keyboard access, and the view on rerun", async ({ page }) => {
      const input = page.getByRole("textbox", { name: "CSV input", exact: true });
      const build = page.getByRole("button", { name: "Build table", exact: true });
      const result = page.getByRole("region", { name: "Result", exact: true });
      const view = result.getByRole("tablist", { name: "Result view", exact: true });
      await expect(view).toHaveCount(0);
      await input.fill('"<Name>",notes\nAda,"<img src=x onerror=alert(1)>"\nGrace,"Line one\nLine two & ""quote"""');
      await build.click();
      const html =
        "<table><thead><tr><th>&lt;Name&gt;</th><th>notes</th></tr></thead><tbody>" +
        "<tr><td>Ada</td><td>&lt;img src=x onerror=alert(1)&gt;</td></tr>" +
        "<tr><td>Grace</td><td>Line one\nLine two &amp; &quot;quote&quot;</td></tr></tbody></table>";
      const rawTab = view.getByRole("tab", { name: "Raw", exact: true });
      const previewTab = view.getByRole("tab", { name: "Preview", exact: true });
      const raw = result.frameLocator('iframe[title="Generated HTML preview"]').getByRole("table");
      await expect(rawTab).toHaveAttribute("aria-selected", "true");
      await expect(previewTab).toHaveAttribute("aria-selected", "false");
      await expect(raw.getByRole("columnheader")).toHaveText(["<Name>", "notes"]);
      await expect(raw.getByRole("cell")).toHaveText([
        "Ada",
        "<img src=x onerror=alert(1)>",
        "Grace",
        'Line one Line two & "quote"',
      ]);
      await expect(raw.locator("img, script, iframe")).toHaveCount(0);
      await page.screenshot({ path: `/tmp/canopy-csv-to-table-raw-${viewport.width}.png` });
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
      await expect(table.getByRole("columnheader")).toHaveText(["<Name>", "notes"]);
      await expect(table.getByRole("cell")).toHaveText([
        "Ada",
        "<img src=x onerror=alert(1)>",
        "Grace",
        'Line one\nLine two & "quote"',
      ]);
      await expect.poll(() => table.getByRole("cell").last().innerText()).toBe('Line one\nLine two & "quote"');
      await expect(table.locator("img, script, iframe")).toHaveCount(0);
      await expect(result.locator("iframe")).toHaveCount(0);
      await result.getByRole("button", { name: "Copy all", exact: true }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(html);
      await expectHtmlDownload(page, result.getByRole("button", { name: "Download .html", exact: true }), html);
      await page.screenshot({ path: `/tmp/canopy-csv-to-table-preview-${viewport.width}.png` });

      await previewTab.press("ArrowLeft");
      await expect(rawTab).toBeFocused();
      await expect(rawTab).toHaveAttribute("aria-selected", "true");
      await expect(raw.getByRole("columnheader")).toHaveText(["<Name>", "notes"]);
      await expect(raw.getByRole("cell").nth(1)).toHaveText("<img src=x onerror=alert(1)>");
      await previewTab.click();
      await input.fill("name,role\nLin,Editor");
      await build.click();
      await expect(previewTab).toHaveAttribute("aria-selected", "true");
      await expect(result.getByRole("tabpanel")).toHaveCount(1);
      await expect(table.getByRole("columnheader")).toHaveText(["name", "role"]);
      await expect(table.getByRole("cell")).toHaveText(["Lin", "Editor"]);
      await result.getByRole("button", { name: "Copy all", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(
          "<table><thead><tr><th>name</th><th>role</th></tr></thead><tbody><tr><td>Lin</td><td>Editor</td></tr></tbody></table>",
        );
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    });

    test("invalid CSV recovers to Raw and a semantic table without losing the input", async ({ page }) => {
      const input = page.getByRole("textbox", { name: "CSV input", exact: true });
      const build = page.getByRole("button", { name: "Build table", exact: true });
      const result = page.getByRole("region", { name: "Result", exact: true });
      await expect(build).toBeDisabled();
      await input.fill("name,role\nAda");
      await build.click();
      await expect(result).toContainText("Every row must have the same number of fields.");
      await expect(input).toBeEditable();
      await expect(result.getByRole("tablist", { name: "Result view", exact: true })).toHaveCount(0);
      await input.fill("name,role\nAda,Admin");
      await build.click();
      await expect(result.getByRole("tab", { name: "Raw", exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(
        result.frameLocator('iframe[title="Generated HTML preview"]').getByRole("table").getByRole("cell"),
      ).toHaveText(["Ada", "Admin"]);
      await result.getByRole("tab", { name: "Preview", exact: true }).click();
      await expect(result.getByRole("table").getByRole("cell")).toHaveText(["Ada", "Admin"]);
      await expect(result).not.toContainText("Every row must have the same number of fields.");
      await expect.poll(() => input.innerText()).toBe("name,role\nAda,Admin");
    });

    test("a wide table scrolls within Preview without widening the page", async ({ page }) => {
      const columns = Array.from({ length: 40 }, (_, index) => `Column_${index + 1}`);
      const values = columns.map((_, index) => `Value_${index + 1}`);
      await page
        .getByRole("textbox", { name: "CSV input", exact: true })
        .fill(`${columns.join(",")}\n${values.join(",")}`);
      await page.getByRole("button", { name: "Build table", exact: true }).click();
      const result = page.getByRole("region", { name: "Result", exact: true });
      await result.getByRole("tab", { name: "Preview", exact: true }).click();
      const table = result.getByRole("table");
      const scroller = table.locator("..");
      await expect(table.getByRole("columnheader")).toHaveCount(columns.length);
      expect(await scroller.evaluate((element) => element.scrollWidth)).toBeGreaterThan(
        await scroller.evaluate((element) => element.clientWidth),
      );
      await scroller.hover();
      await page.mouse.wheel(100_000, 0);
      await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await expect(table.getByRole("columnheader", { name: "Column_40", exact: true })).toBeInViewport();
      await expect(table.getByRole("cell", { name: "Value_40", exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: `/tmp/canopy-csv-to-table-wide-${viewport.width}.png` });
    });
  });
}

test.describe("Large CSV to Table views", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("bounded Raw and table previews retain the complete HTML download", async ({ page }) => {
    test.setTimeout(60_000);
    const notes = Array.from({ length: 10_000 }, (_, index) => `row_${index}_${"x".repeat(230)}`);
    const source = `id,note\n${notes.map((note, index) => `${index},${note}`).join("\n")}`;
    const html =
      "<table><thead><tr><th>id</th><th>note</th></tr></thead><tbody>" +
      notes.map((note, index) => `<tr><td>${index}</td><td>${note}</td></tr>`).join("") +
      "</tbody></table>";
    expect(Buffer.byteLength(source)).toBeGreaterThan(2_000_000);
    await page.locator('input[type="file"]').setInputFiles({
      buffer: Buffer.from(source),
      mimeType: "text/csv",
      name: "large-html-table.csv",
    });
    await expect(page.getByRole("button", { name: "Remove large-html-table.csv", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "CSV input", exact: true })).not.toBeEditable();
    await page.getByRole("button", { name: "Build table", exact: true }).click();
    const result = page.getByRole("region", { name: "Result", exact: true });
    await expect(result.getByRole("tab", { name: "Raw", exact: true })).toHaveAttribute("aria-selected", "true", {
      timeout: 30_000,
    });
    const raw = result.frameLocator('iframe[title="Generated HTML preview"]').getByRole("table");
    await expect(raw.getByRole("columnheader")).toHaveText(["id", "note"]);
    await expect(raw.getByRole("cell").nth(1)).toHaveText(notes[0]);
    expect(await raw.getByRole("row").count()).toBeGreaterThan(1);
    expect(await raw.getByRole("row").count()).toBeLessThan(notes.length + 1);
    await expect(raw.getByRole("cell", { name: notes.at(-1)!, exact: true })).toHaveCount(0);
    await expect(
      result.getByText("Showing a preview. Download the complete file for all rows.", { exact: true }),
    ).toBeVisible();
    await result.getByRole("button", { name: "Copy preview", exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.startsWith("<table><thead>")).toBe(true);
    expect(html.startsWith(copied)).toBe(true);
    expect(Buffer.byteLength(copied)).toBeLessThanOrEqual(256 * 1024);
    expect(copied.length).toBeLessThan(html.length);

    await result.getByRole("tab", { name: "Preview", exact: true }).click();
    const table = result.getByRole("table");
    await expect(table.getByRole("columnheader")).toHaveText(["id", "note"]);
    await expect(table.getByRole("cell").nth(1)).toHaveText(notes[0]);
    expect(await table.getByRole("row").count()).toBeGreaterThan(1);
    expect(await table.getByRole("row").count()).toBeLessThan(notes.length + 1);
    await expect(table.getByRole("cell", { name: notes.at(-1)!, exact: true })).toHaveCount(0);
    await expect(result.getByText("Only part of the result is shown.", { exact: true })).toBeVisible();
    await expectHtmlDownload(page, result.getByRole("button", { name: "Download file", exact: true }).first(), html);
  });
});
