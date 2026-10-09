import { test } from "vitest";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env.NAV_TEST_URL;
test.skipIf(!baseURL)(
  "navigation shares the same search overlay across mobile and desktop",
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 720 } });
      let failNextSearch = false;
      await page.route("**/api/tools/search?*", async (route) => {
        const q = new URL(route.request().url()).searchParams.get("q");
        if (failNextSearch && q) {
          failNextSearch = false;
          await route.fulfill({ status: 503, json: { error: "Unavailable" } });
          return;
        }
        await route.fulfill({
          json: {
            results:
              q === "invoice"
                ? [
                    {
                      toolId: "invoice",
                      name: "Invoice Generator",
                      category: "Documents",
                      href: "/paperwork/invoice-generator",
                      description: "Create an invoice",
                      icon: { kind: "url", url: "/favicon.ico" },
                    },
                    {
                      toolId: "invoice-template",
                      name: "Invoice Template",
                      category: "Documents",
                      href: "/paperwork",
                      description: "Choose an invoice template",
                      icon: { kind: "url", url: "/favicon.ico" },
                    },
                  ]
                : [],
          },
        });
      });
      for (const path of [
        "/",
        "/blog",
        "/media",
        "/devtools",
        "/paperwork",
        "/devtools/json-formatter",
        "/media/merge-pdf",
      ]) {
        await page.goto(baseURL + path);
        const menu = page.getByRole("button", { name: "Open navigation menu", exact: true });
        await menu.click();
        expect(await page.getByRole("navigation", { name: "Mobile site navigation" }).isVisible(), path).toBe(true);
        await page.getByRole("button", { name: "Search tools", exact: true }).click();
        await expect(page.getByRole("navigation", { name: "Mobile site navigation" })).toHaveCount(0);
        const input = page.getByRole("combobox", { name: "Search all SmartTools" });
        await expect(input).toBeFocused();
        await input.fill("invoice");
        await page.getByRole("option", { name: /Invoice Generator Documents/ }).waitFor();
        await page.getByRole("button", { name: "Clear search", exact: true }).click();
        expect(await input.inputValue()).toBe("");
        expect(await input.evaluate((node) => node === document.activeElement)).toBe(true);
        await input.fill("zzzznothing");
        await page.getByText("No tools match “zzzznothing”").waitFor();
        await input.press("Escape");
        expect(await input.count()).toBe(0);
        await expect(page.getByRole("button", { name: "Search tools", exact: true })).toBeFocused();
        await menu.click();
        await page.getByRole("button", { name: "Close navigation menu", exact: true }).press("Escape");
        expect(await page.getByRole("navigation", { name: "Mobile site navigation" }).count()).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.goto(baseURL + "/");
      await page.setViewportSize({ width: 320, height: 640 });
      failNextSearch = true;
      await page.getByRole("button", { name: "Search tools", exact: true }).click();
      const query = page.getByRole("combobox", { name: "Search all SmartTools" });
      await query.fill("invoice");
      await page.getByRole("button", { name: "Retry search" }).click();
      await page.getByRole("option", { name: /Invoice Generator Documents/ }).waitFor();
      expect(await query.inputValue()).toBe("invoice");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.mouse.click(8, 500);
      await expect(query).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Search tools", exact: true })).toBeFocused();
      await page.getByRole("button", { name: "Search tools", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Search tools", exact: true })).toHaveAttribute(
        "aria-modal",
        "true",
      );
      await expect(page.getByRole("button", { name: "Open navigation menu", exact: true })).toHaveCount(0);
      await query.fill("invoice");
      await page.getByRole("option", { name: /Invoice Generator Documents/ }).waitFor();
      await query.press("Shift+Tab");
      const closeSearch = page.getByRole("button", { name: "Close", exact: true });
      await expect(closeSearch).toBeFocused();
      await closeSearch.press("Tab");
      await expect(query).toBeFocused();
      await query.press("Escape");
      await expect(query).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Search tools", exact: true })).toBeFocused();
      const menuToggle = page.getByRole("button", { name: "Open navigation menu", exact: true });
      await menuToggle.focus();
      await menuToggle.press("Enter");
      await expect(page.getByRole("navigation", { name: "Mobile site navigation" })).toBeVisible();
      await page.keyboard.press("Meta+k");
      await expect(query).toBeFocused();
      await expect(page.getByRole("navigation", { name: "Mobile site navigation" })).toHaveCount(0);
      await query.press("Escape");
      await expect(query).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Open navigation menu", exact: true })).toBeFocused();
      await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
      await expect(page.getByRole("navigation", { name: "Mobile site navigation" })).toBeVisible();
      await page.setViewportSize({ width: 575, height: 768 });
      await expect(page.getByRole("button", { name: "Search tools", exact: true })).toBeVisible();
      await page.setViewportSize({ width: 576, height: 768 });
      await expect(page.getByRole("button", { name: "Search tools", exact: true })).toBeHidden();
      await expect(page.getByRole("button", { name: "Search 150+ tools", exact: true })).toBeVisible();
      await page.setViewportSize({ width: 999, height: 768 });
      await expect(page.getByRole("button", { name: "Close navigation menu", exact: true })).toBeVisible();
      await page.setViewportSize({ width: 1000, height: 768 });
      await expect(page.getByRole("navigation", { name: "Mobile site navigation" })).toHaveCount(0);
      for (const width of [1000, 1024, 1280, 1366]) {
        await page.setViewportSize({ width, height: 768 });
        await page.goto(baseURL + "/");
        expect(await page.getByRole("button", { name: "Open navigation menu", exact: true }).isVisible()).toBe(false);
        expect(await page.getByRole("navigation", { name: "Tool suites" }).isVisible()).toBe(true);
        await page.getByRole("button", { name: "Search 150+ tools" }).click();
        await expect(query).toBeFocused();
        await query.fill("invoice");
        await page.getByRole("option", { name: /Invoice Generator Documents/ }).waitFor();
        await query.press("ArrowDown");
        await expect(page.getByRole("option", { name: /Invoice Template Documents/ })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        await query.press("ArrowUp");
        await expect(page.getByRole("option", { name: /Invoice Generator Documents/ })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `Search overlay at ${width}px`,
        ).toBe(true);
        await query.press("Escape");
        await expect(page.getByRole("button", { name: "Search 150+ tools" })).toBeFocused();
      }
      await page.keyboard.press("Control+k");
      await expect(query).toBeFocused();
      await query.fill("invoice");
      await page.getByRole("option", { name: /Invoice Generator Documents/ }).waitFor();
      await query.press("ArrowDown");
      await query.press("Enter");
      await expect(page).toHaveURL(baseURL + "/paperwork");
      await expect(query).toHaveCount(0);
      for (const [family, inputLabel, familyLabel] of [
        ["devtools", "Search developer tools", "Developer tools"],
        ["media", "Search media tools", "Media"],
      ]) {
        await page.goto(baseURL + "/" + family);
        const familyInput = page.getByRole("searchbox", { name: inputLabel, exact: true });
        await familyInput.fill("invoice");
        await familyInput.press("Enter");
        const scopedQuery = page.getByRole("combobox", { name: `Search ${familyLabel}`, exact: true });
        await expect(scopedQuery).toBeFocused();
        await expect(scopedQuery).toHaveValue("invoice");
        await expect(page.getByRole("button", { name: `Remove ${familyLabel} filter`, exact: true })).toBeVisible();
        await scopedQuery.press("Escape");
        await expect(familyInput).toBeFocused();
      }
    } finally {
      await browser.close();
    }
  },
  120_000,
);
