import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
]) {
  test.describe(`JSON to CSV views at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test("Raw and Table preserve CSV exports, values, and the selected view when converting again", async ({
      context,
      page,
    }) => {
      await page.goto("/devtools/json-to-csv");
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
      const input = page.getByRole("textbox", { name: "JSON input", exact: true });
      const convert = page.getByRole("button", { name: "Convert to CSV", exact: true });
      const result = page.getByRole("region", { name: "Result", exact: true });
      const view = result.getByRole("tablist", { name: "Result view", exact: true });
      const rawTab = view.getByRole("tab", { name: "Raw", exact: true });
      const tableTab = view.getByRole("tab", { name: "Table", exact: true });
      await expect(input).toBeEditable();
      await expect(view).toHaveCount(0);
      await input.fill(
        JSON.stringify([
          { name: "Maya", profile: { city: "Pune" }, note: 'Hello, "team"', missing: null, active: false, count: 0 },
          { name: "Noah", profile: { city: "Delhi" }, note: "Next\nline" },
        ]),
      );
      await convert.click();

      const csv =
        'name,profile.city,note,missing,active,count\nMaya,Pune,"Hello, ""team""",,false,0\nNoah,Delhi,"Next\nline",,,';
      await expect(rawTab).toHaveAttribute("aria-selected", "true");
      await expect(tableTab).toHaveAttribute("aria-selected", "false");
      await expect(result.getByRole("tabpanel", { includeHidden: true })).toHaveCount(2);
      await expect(result.getByRole("tabpanel")).toHaveCount(1);
      for (const tab of [rawTab, tableTab]) {
        const panelId = await tab.getAttribute("aria-controls");
        expect(panelId).toBeTruthy();
        const panel = result.locator(`[id="${panelId}"]`);
        await expect(panel).toHaveCount(1);
        await expect(panel).toHaveAttribute("role", "tabpanel");
        await expect(panel).toHaveAttribute("aria-labelledby", (await tab.getAttribute("id"))!);
      }
      const raw = result.getByRole("textbox", { name: "Result code", exact: true });
      await expect(raw).toBeVisible();
      await expect.poll(() => raw.innerText()).toBe(csv);
      await tableTab.click();
      await expect(tableTab).toHaveAttribute("aria-selected", "true");
      await expect(rawTab).toHaveAttribute("aria-selected", "false");
      await expect(result.getByRole("tabpanel", { includeHidden: true })).toHaveCount(2);
      await expect(result.getByRole("tabpanel")).toHaveCount(1);
      const table = result.getByRole("table");
      await expect(table.getByRole("columnheader")).toHaveText([
        "name",
        "profile.city",
        "note",
        "missing",
        "active",
        "count",
      ]);
      const rows = table.getByRole("row");
      await expect(rows).toHaveCount(3);
      await expect(rows.nth(1).getByRole("cell")).toHaveText(["Maya", "Pune", 'Hello, "team"', "", "false", "0"]);
      await expect(rows.nth(2).getByRole("cell")).toHaveText(["Noah", "Delhi", "Next\nline", "", "", ""]);
      await expect(page.getByTestId("tool-status-line")).toContainText("Rows: 2 · Columns: 6");
      await expect(result.getByText("Rows", { exact: true })).toHaveCount(0);
      await expect(result.getByText("Columns", { exact: true })).toHaveCount(0);

      await result.getByRole("button", { name: "Copy all", exact: true }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(csv);
      const downloadPromise = page.waitForEvent("download");
      await result.getByRole("button", { name: "Download .csv", exact: true }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("data.csv");
      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      expect(await readFile(downloadPath!, "utf8")).toBe(csv);
      await page.screenshot({ path: `/tmp/canopy-json-to-csv-table-${viewport.width}.png` });

      await tableTab.press("ArrowLeft");
      await expect(rawTab).toBeFocused();
      await expect(rawTab).toHaveAttribute("aria-selected", "true");
      await expect(tableTab).toHaveAttribute("aria-selected", "false");
      await expect(result.getByRole("tabpanel")).toHaveCount(1);
      await expect.poll(() => raw.innerText()).toBe(csv);
      await rawTab.press("ArrowRight");
      await expect(tableTab).toBeFocused();
      await expect(tableTab).toHaveAttribute("aria-selected", "true");
      await expect(rawTab).toHaveAttribute("aria-selected", "false");
      await page.getByRole("button", { name: "Restore settings panel", exact: true }).click();
      await page.getByRole("combobox", { name: "Delimiter", exact: true }).click();
      await page.getByRole("option", { name: "Semicolon", exact: true }).click();
      await input.fill(JSON.stringify([{ name: "Updated; name", active: false, count: 0 }]));
      await convert.click();

      await expect(tableTab).toHaveAttribute("aria-selected", "true");
      await expect(table.getByRole("columnheader")).toHaveText(["name", "active", "count"]);
      await expect(table.getByRole("cell")).toHaveText(["Updated; name", "false", "0"]);
      await expect(page.getByTestId("tool-status-line")).toContainText("Rows: 1 · Columns: 3");
      await result.getByRole("button", { name: "Copy all", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe('name;active;count\n"Updated; name";false;0');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    });

    test("wide Raw rows stay on one line and both views scroll inside the result", async ({ page }) => {
      await page.goto("/devtools/json-to-csv");
      const fields = Array.from({ length: 20 }, (_, index) => [`column_${index + 1}`, `Value ${index + 1}`]);
      await page
        .getByRole("textbox", { name: "JSON input", exact: true })
        .fill(JSON.stringify([Object.fromEntries(fields)]));
      await page.getByRole("button", { name: "Convert to CSV", exact: true }).click();
      const result = page.getByRole("region", { name: "Result", exact: true });
      const raw = result.getByRole("textbox", { name: "Result code", exact: true });
      await expect(raw).toBeVisible();
      const rawLines = raw.locator(".cm-line");
      await expect(rawLines).toHaveCount(2);
      for (const metrics of await rawLines.evaluateAll((lines) =>
        lines.map((line) => ({
          height: line.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(getComputedStyle(line).lineHeight),
        })),
      )) {
        expect(metrics.lineHeight).toBeGreaterThan(0);
        expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight + 1);
      }
      const rawViewport = raw.locator("..");
      expect(await rawViewport.evaluate((element) => element.scrollWidth)).toBeGreaterThan(
        await rawViewport.evaluate((element) => element.clientWidth),
      );
      await rawViewport.hover();
      await page.mouse.wheel(10_000, 0);
      await expect.poll(() => rawViewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await page.screenshot({ path: `/tmp/canopy-json-to-csv-wide-raw-${viewport.width}.png` });

      await result.getByRole("tab", { name: "Table", exact: true }).click();
      const table = result.getByRole("table");
      const tableViewport = table.locator("..");
      expect(await tableViewport.evaluate((element) => element.scrollWidth)).toBeGreaterThan(
        await tableViewport.evaluate((element) => element.clientWidth),
      );
      await tableViewport.hover();
      await page.mouse.wheel(10_000, 0);
      await expect.poll(() => tableViewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await expect(table.getByRole("columnheader", { name: "column_20", exact: true })).toBeInViewport();
      await expect(table.getByRole("cell", { name: "Value 20", exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: `/tmp/canopy-json-to-csv-wide-table-${viewport.width}.png` });
    });

    test("an empty array has an explicit table empty state and zero counts", async ({ page }) => {
      await page.goto("/devtools/json-to-csv");
      await page.getByRole("textbox", { name: "JSON input", exact: true }).fill("[]");
      await page.getByRole("button", { name: "Convert to CSV", exact: true }).click();
      const result = page.getByRole("region", { name: "Result", exact: true });
      const view = result.getByRole("tablist", { name: "Result view", exact: true });
      await expect(view.getByRole("tab", { name: "Raw", exact: true })).toHaveAttribute("aria-selected", "true");
      await view.getByRole("tab", { name: "Table", exact: true }).click();
      await expect(result.getByText("No columns to display", { exact: true })).toBeVisible();
      await expect(page.getByTestId("tool-status-line")).toContainText("Rows: 0 · Columns: 0");
      await expect(result.getByText("Rows", { exact: true })).toHaveCount(0);
      await expect(result.getByText("Columns", { exact: true })).toHaveCount(0);
    });
  });
}
