import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

const SOURCE_CSV = "firstName,lastName,age\nAda,Lovelace,36\nGrace,Hopper,85";

async function copyResultAndExpect(page: Page, expected: string) {
  const copy = page
    .getByRole("region", { name: "Result", exact: true })
    .getByRole("button", { name: "Copy all", exact: true });
  await expect(copy).toBeEnabled();
  await copy.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
}

test.describe("Large CSV column extraction", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("the bounded CSV preview copies explicitly while the download includes every row", async ({ context, page }) => {
    test.setTimeout(60_000);
    const notes = Array.from({ length: 10_000 }, (_, index) => `row_${index}_${"x".repeat(230)}`);
    const source = `id,note\n${notes.map((note, index) => `${index},${note}`).join("\n")}`;
    const expected = `note\n${notes.join("\n")}`;
    const file = Buffer.from(source);
    expect(file.byteLength).toBeGreaterThan(2_000_000);
    expect(Buffer.byteLength(expected)).toBeGreaterThan(256 * 1024);

    await page.goto("/devtools/csv-column-extractor");
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
    await expect(page.getByRole("textbox", { name: "CSV input", exact: true })).toBeEditable();
    await page.locator('input[type="file"]').setInputFiles({
      buffer: file,
      mimeType: "text/csv",
      name: "large-columns.csv",
    });
    await expect(page.getByRole("button", { name: "Remove large-columns.csv", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "CSV input", exact: true })).not.toBeEditable();
    const column = page.getByRole("textbox", { name: "Column", exact: true });
    await column.fill("note");
    await column.press("Enter");

    const result = page.getByRole("region", { name: "Result", exact: true });
    const copy = result.getByRole("button", { name: "Copy preview", exact: true });
    await expect(copy).toBeEnabled({ timeout: 30_000 });
    await expect(
      result.getByText("Showing a preview. Download the complete file for all rows.", { exact: true }),
    ).toBeVisible();
    await copy.click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.startsWith("note\n")).toBe(true);
    expect(expected.startsWith(copied)).toBe(true);
    expect(Buffer.byteLength(copied)).toBeLessThanOrEqual(256 * 1024);
    expect(copied.length).toBeLessThan(expected.length);

    const downloadPromise = page.waitForEvent("download");
    await result.getByRole("button", { name: "Download file", exact: true }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("extracted-columns.csv");
    const path = await download.path();
    expect(path).not.toBeNull();
    expect(await readFile(path!, "utf8")).toBe(expected);

    await result.getByRole("tab", { name: "Table", exact: true }).click();
    const table = result.getByRole("table");
    await expect(table.getByRole("columnheader")).toHaveText(["note"]);
    await expect(table.getByRole("cell").first()).toHaveText(notes[0]);
    expect(await table.getByRole("row").count()).toBeGreaterThan(1);
    expect(await table.getByRole("row").count()).toBeLessThan(notes.length + 1);
    await expect(table.getByRole("cell", { name: notes.at(-1)!, exact: true })).toHaveCount(0);
  });
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
]) {
  test.describe(`CSV column extraction at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ context, page }) => {
      await page.goto("/devtools/csv-column-extractor");
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
      await expect(page.getByRole("textbox", { name: "CSV input", exact: true })).toBeEditable();
    });

    test("Enter extracts multiple columns on the first run and uses the latest selectors and CSV", async ({ page }) => {
      const input = page.getByRole("textbox", { name: "CSV input", exact: true });
      const column = page.getByRole("textbox", { name: "Column", exact: true });
      const result = page.getByRole("region", { name: "Result", exact: true });
      await input.fill(SOURCE_CSV);
      await column.fill("firstName,lastName");
      await column.press("Enter");
      const extracted = "firstName,lastName\nAda,Lovelace\nGrace,Hopper";
      const raw = result.getByRole("textbox", { name: "Result code", exact: true });
      const rawTab = result.getByRole("tab", { name: "Raw", exact: true });
      const tableTab = result.getByRole("tab", { name: "Table", exact: true });
      await expect(rawTab).toHaveAttribute("aria-selected", "true");
      await expect(tableTab).toHaveAttribute("aria-selected", "false");
      await expect.poll(() => raw.innerText()).toBe(extracted);
      await expect(result.getByRole("button", { name: /^Copy item \d+$/ })).toHaveCount(0);
      await tableTab.click();
      await expect(tableTab).toHaveAttribute("aria-selected", "true");
      await expect(rawTab).toHaveAttribute("aria-selected", "false");
      const table = result.getByRole("table");
      await expect(table.getByRole("columnheader")).toHaveText(["firstName", "lastName"]);
      await expect(table.getByRole("cell")).toHaveText(["Ada", "Lovelace", "Grace", "Hopper"]);
      await copyResultAndExpect(page, extracted);
      const downloadPromise = page.waitForEvent("download");
      await result.getByRole("button", { name: "Download .csv", exact: true }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("extracted-columns.csv");
      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      expect(await readFile(downloadPath!, "utf8")).toBe(extracted);

      await column.fill("lastName,firstName");
      await input.fill("firstName,lastName,age\nLin,Chen,29");
      await column.press("Enter");
      await expect(tableTab).toHaveAttribute("aria-selected", "true");
      await expect(table.getByRole("columnheader")).toHaveText(["lastName", "firstName"]);
      await expect(table.getByRole("cell")).toHaveText(["Chen", "Lin"]);
      await copyResultAndExpect(page, "lastName,firstName\nChen,Lin");
      await rawTab.click();
      await expect(rawTab).toHaveAttribute("aria-selected", "true");
      await expect(tableTab).toHaveAttribute("aria-selected", "false");
      await expect.poll(() => raw.innerText()).toBe("lastName,firstName\nChen,Lin");
      await expect(input).toBeEditable();
      await expect(column).toHaveValue("lastName,firstName");
      await expect(page.getByRole("button", { name: /^Extract columns?$/ })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: `/tmp/canopy-csv-column-extractor-${viewport.width}.png` });
    });

    test("an unknown column reports an error and corrected positional selectors recover with Enter", async ({
      page,
    }) => {
      const input = page.getByRole("textbox", { name: "CSV input", exact: true });
      const column = page.getByRole("textbox", { name: "Column", exact: true });
      const result = page.getByRole("region", { name: "Result", exact: true });
      await input.fill(SOURCE_CSV);
      await column.fill("unknown");
      await column.press("Enter");
      await expect(result).toContainText(/column.*not found/i);
      await expect(column).toBeEditable();
      await column.fill("2");
      await column.press("Enter");
      await expect
        .poll(() => result.getByRole("textbox", { name: "Result code", exact: true }).innerText())
        .toBe("lastName\nLovelace\nHopper");
      await copyResultAndExpect(page, "lastName\nLovelace\nHopper");
      await expect(result).not.toContainText(/column.*not found/i);
      await expect.poll(() => input.innerText()).toBe(SOURCE_CSV);

      await column.fill("3");
      await page.getByRole("button", { name: /^Extract columns?$/ }).click();
      await expect
        .poll(() => result.getByRole("textbox", { name: "Result code", exact: true }).innerText())
        .toBe("age\n36\n85");
      await copyResultAndExpect(page, "age\n36\n85");
    });

    test("CSV newlines and modified, repeated, or composing Enter do not submit", async ({ page }) => {
      const input = page.getByRole("textbox", { name: "CSV input", exact: true });
      const column = page.getByRole("textbox", { name: "Column", exact: true });
      const result = page.getByRole("region", { name: "Result", exact: true });
      const empty = result.getByText("Result will appear here", { exact: true });
      await expect(page.getByRole("button", { name: /^Extract columns?$/ })).toBeDisabled();
      await column.press("Enter");
      await expect(empty).toBeVisible();

      await input.fill(SOURCE_CSV);
      await column.fill("firstName");
      await input.press("ControlOrMeta+End");
      await input.press("Enter");
      await expect.poll(() => input.innerText()).toMatch(/\n$/);
      await expect(empty).toBeVisible();
      for (const key of ["Shift+Enter", "Alt+Enter", "Control+Enter", "Meta+Enter"]) {
        await column.press(key);
        await expect(empty).toBeVisible();
      }
      for (const event of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }]) {
        await column.dispatchEvent("keydown", { key: "Enter", code: "Enter", ...event });
        await expect(empty).toBeVisible();
      }
      await expect(result.getByRole("button", { name: "Copy all", exact: true })).toBeDisabled();
      await column.press("Enter");
      await expect
        .poll(() => result.getByRole("textbox", { name: "Result code", exact: true }).innerText())
        .toBe("firstName\nAda\nGrace");
      await copyResultAndExpect(page, "firstName\nAda\nGrace");
    });
  });
}
