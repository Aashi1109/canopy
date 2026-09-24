import { test } from "vitest";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env.NAV_TEST_URL;
test.skipIf(!baseURL)("global mobile navigation and search share one exclusive overlay flow", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 720 } });
    let failNextSearch = false;
    await page.route("**/api/tools/search?*", async (route) => {
      const q = new URL(route.request().url()).searchParams.get("q");
      if (failNextSearch) {
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
      expect(await page.getByRole("navigation", { name: "Mobile site navigation" }).count()).toBe(0);
      const input = page.getByRole("combobox", { name: "Search all SmartTools" });
      await input.fill("invoice");
      await page.getByRole("link", { name: /Invoice Generator Documents/ }).waitFor();
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
    await page.getByRole("link", { name: /Invoice Generator Documents/ }).waitFor();
    expect(await query.inputValue()).toBe("invoice");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.mouse.click(8, 500);
    await expect(query).toHaveCount(0);
    await page.getByRole("button", { name: "Search tools", exact: true }).click();
    await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
    await expect(query).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Mobile site navigation" })).toBeVisible();
    await page.setViewportSize({ width: 767, height: 768 });
    await expect(page.getByRole("button", { name: "Close navigation menu", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 768, height: 768 });
    await expect(page.getByRole("navigation", { name: "Mobile site navigation" })).toHaveCount(0);
    for (const width of [768, 1024, 1280, 1366]) {
      await page.setViewportSize({ width, height: 768 });
      await page.goto(baseURL + "/");
      expect(await page.getByRole("button", { name: "Open navigation menu", exact: true }).isVisible()).toBe(false);
      expect(await page.getByRole("navigation", { name: "Tool suites" }).isVisible()).toBe(true);
      await page.getByRole("button", { name: "Search 150+ tools" }).click();
      await page.getByRole("combobox", { name: "Search all SmartTools" }).fill("invoice");
      await page.getByRole("link", { name: /Invoice Generator Documents/ }).waitFor();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally {
    await browser.close();
  }
});
