import assert from "node:assert/strict";
import test from "node:test";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env.NAV_TEST_URL;
test("global mobile navigation and search share one exclusive overlay flow", { skip: !baseURL }, async () => {
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
      assert.equal(await page.getByRole("navigation", { name: "Mobile site navigation" }).isVisible(), true, path);
      await page.getByRole("button", { name: "Search tools", exact: true }).click();
      assert.equal(await page.getByRole("navigation", { name: "Mobile site navigation" }).count(), 0);
      const input = page.getByRole("combobox", { name: "Search all SmartTools" });
      await input.fill("invoice");
      await page.getByRole("link", { name: /Invoice Generator Documents/ }).waitFor();
      await page.getByRole("button", { name: "Clear search", exact: true }).click();
      assert.equal(await input.inputValue(), "");
      assert.equal(await input.evaluate((node) => node === document.activeElement), true);
      await input.fill("zzzznothing");
      await page.getByText("No tools match “zzzznothing”").waitFor();
      await input.press("Escape");
      assert.equal(await input.count(), 0);
      await expect(page.getByRole("button", { name: "Search tools", exact: true })).toBeFocused();
      await menu.click();
      await page.getByRole("button", { name: "Close navigation menu", exact: true }).press("Escape");
      assert.equal(await page.getByRole("navigation", { name: "Mobile site navigation" }).count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.goto(baseURL + "/");
    await page.setViewportSize({ width: 320, height: 640 });
    failNextSearch = true;
    await page.getByRole("button", { name: "Search tools", exact: true }).click();
    const query = page.getByRole("combobox", { name: "Search all SmartTools" });
    await query.fill("invoice");
    await page.getByRole("button", { name: "Retry search" }).click();
    await page.getByRole("link", { name: /Invoice Generator Documents/ }).waitFor();
    assert.equal(await query.inputValue(), "invoice");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
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
      assert.equal(await page.getByRole("button", { name: "Open navigation menu", exact: true }).isVisible(), false);
      assert.equal(await page.getByRole("navigation", { name: "Tool suites" }).isVisible(), true);
      await page.getByRole("button", { name: "Search 150+ tools" }).click();
      await page.getByRole("combobox", { name: "Search all SmartTools" }).fill("invoice");
      await page.getByRole("link", { name: /Invoice Generator Documents/ }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
  } finally {
    await browser.close();
  }
});
