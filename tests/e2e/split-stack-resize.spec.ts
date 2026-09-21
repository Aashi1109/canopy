import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
]) {
  test.describe(`Side-by-side workspace at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    for (const tool of ["json-viewer", "json-formatter"]) {
      test(`${tool} resizes on the first pointer drag and remains keyboard accessible`, async ({ page }) => {
        await page.goto(`/devtools/${tool}`, { waitUntil: "networkidle" });
        const separator = page.getByRole("separator", { name: "Resize workspace panels" }).first();
        await expect(separator).toBeVisible();
        const group = separator.locator("..");
        const primary = group.locator(':scope > [data-split-pane="primary"]');
        const secondary = group.locator(':scope > [data-split-pane="secondary"]');
        const width = () => primary.evaluate((element) => element.getBoundingClientRect().width);
        const initialWidth = await width();
        const initialSecondaryWidth = await secondary.evaluate((element) => element.getBoundingClientRect().width);
        const handle = await separator.boundingBox();
        expect(handle).not.toBeNull();
        const x = handle!.x + handle!.width / 2;
        const y = handle!.y + Math.min(100, handle!.height / 4);

        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 60, y, { steps: 6 });
        await expect.poll(width).toBeGreaterThan(initialWidth + 40);
        await page.mouse.move(x + 120, y, { steps: 6 });
        await expect.poll(width).toBeGreaterThan(initialWidth + 80);
        await page.mouse.up();

        await expect.poll(width).toBeGreaterThan(initialWidth + 80);
        await expect
          .poll(() => secondary.evaluate((element) => element.getBoundingClientRect().width))
          .toBeLessThan(initialSecondaryWidth - 80);

        const pointerWidth = await width();
        await separator.focus();
        await page.keyboard.press("ArrowLeft");
        await expect.poll(width).toBeLessThan(pointerWidth - 5);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      });
    }

    test("restoring settings preserves the first drag, responsive size, and collapse recovery", async ({ page }) => {
      await page.goto("/devtools/json-formatter", { waitUntil: "networkidle" });
      const restore = page.getByRole("button", { name: "Restore settings panel", exact: true });
      await restore.click();
      const separator = page.getByRole("separator", { name: "Resize workspace panels" }).last();
      const group = separator.locator("..");
      const primary = group.locator(':scope > [data-split-pane="primary"]');
      const secondary = group.locator(':scope > [data-split-pane="secondary"]');
      const width = () => primary.evaluate((element) => element.getBoundingClientRect().width);
      const groupWidth = await group.evaluate((element) => element.getBoundingClientRect().width);
      await expect.poll(async () => Math.abs((await width()) - groupWidth * 0.75)).toBeLessThan(2);
      const initialWidth = await width();
      const handle = await separator.boundingBox();
      expect(handle).not.toBeNull();
      const x = handle!.x + handle!.width / 2;
      const y = handle!.y + Math.min(100, handle!.height / 4);

      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 40, y, { steps: 8 });
      await expect.poll(width).toBeGreaterThan(initialWidth + 30);
      await page.mouse.up();
      const resizedWidth = await width();

      const collapse = page.getByRole("button", { name: "Collapse settings panel", exact: true });
      await page.setViewportSize({ width: 900, height: 720 });
      await expect(page.getByRole("separator", { name: "Resize workspace panels" })).toHaveCount(0);
      await expect(collapse).toBeVisible();
      await page.setViewportSize(viewport);
      await expect(separator).toBeVisible();
      await expect(secondary).toBeVisible();
      await expect.poll(async () => Math.abs((await width()) - resizedWidth)).toBeLessThan(2);

      await collapse.click();
      await expect(secondary).toBeHidden();
      await page.setViewportSize({ width: 900, height: 720 });
      await expect(page.getByRole("separator", { name: "Resize workspace panels" })).toHaveCount(0);
      await expect(restore).toBeVisible();
      await page.setViewportSize(viewport);
      await expect(restore).toBeVisible();
      await expect(secondary).toBeHidden();
      await restore.click();
      await expect(secondary).toBeVisible();
      await expect.poll(async () => Math.abs((await width()) - resizedWidth)).toBeLessThan(2);
    });
  });
}
