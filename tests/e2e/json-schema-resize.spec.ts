import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 900, height: 720 },
  { width: 390, height: 844 },
]) {
  test.describe(`JSON Schema editor resizing at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test("the first vertical drag, keyboard resizing, and limits preserve usable editors", async ({ page }) => {
      await page.goto("/devtools/json-schema-validator");
      const data = page.getByRole("textbox", { name: "JSON data", exact: true });
      const schema = page.getByRole("textbox", { name: "JSON schema", exact: true });
      const source = '{"name":"Ada","age":36}';
      const schemaSource = '{"type":"object","required":["name"],"properties":{"name":{"type":"string"}}}';
      await data.fill(source);
      await schema.fill(schemaSource);

      const separator = page.getByRole("separator", { name: "Resize workspace regions", exact: true });
      await expect(separator).toBeVisible();
      await separator.scrollIntoViewIfNeeded();
      const group = separator.locator("..");
      const primary = group.locator(':scope > [data-split-pane="primary"]');
      const secondary = group.locator(':scope > [data-split-pane="secondary"]');
      const height = () => primary.evaluate((element) => element.getBoundingClientRect().height);
      const initialHeight = await height();
      const initialSecondaryHeight = await secondary.evaluate((element) => element.getBoundingClientRect().height);
      const handle = await separator.boundingBox();
      expect(handle).not.toBeNull();
      const x = handle!.x + handle!.width / 2;
      const y = handle!.y + handle!.height / 2;
      const distance = Math.min(80, initialHeight / 4);
      expect(distance).toBeGreaterThan(20);

      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + distance / 2, { steps: 6 });
      await expect.poll(height).toBeGreaterThan(initialHeight + distance * 0.3);
      await page.mouse.move(x, y + distance, { steps: 6 });
      await expect.poll(height).toBeGreaterThan(initialHeight + distance * 0.75);
      await page.mouse.up();
      await expect
        .poll(() => secondary.evaluate((element) => element.getBoundingClientRect().height))
        .toBeLessThan(initialSecondaryHeight - distance * 0.75);

      const draggedHeight = await height();
      await separator.focus();
      await page.keyboard.press("ArrowUp");
      await expect.poll(height).toBeLessThan(draggedHeight - 1);
      await page.keyboard.press("ArrowDown");
      await expect.poll(async () => Math.abs((await height()) - draggedHeight)).toBeLessThan(2);

      if (viewport.width > 1024) {
        const horizontal = page.getByRole("separator", { name: "Resize workspace panels", exact: true });
        const outerPrimary = horizontal.locator("..").locator(':scope > [data-split-pane="primary"]');
        const initialWidth = await outerPrimary.evaluate((element) => element.getBoundingClientRect().width);
        const horizontalHandle = await horizontal.boundingBox();
        expect(horizontalHandle).not.toBeNull();
        const horizontalX = horizontalHandle!.x + horizontalHandle!.width / 2;
        const horizontalY = horizontalHandle!.y + 70;
        await page.mouse.move(horizontalX, horizontalY);
        await page.mouse.down();
        await page.mouse.move(horizontalX + 80, horizontalY, { steps: 8 });
        await page.mouse.up();
        await expect
          .poll(() => outerPrimary.evaluate((element) => element.getBoundingClientRect().width))
          .toBeGreaterThan(initialWidth + 60);
        await expect.poll(async () => Math.abs((await height()) - draggedHeight)).toBeLessThan(2);
      } else {
        await expect(page.getByRole("separator", { name: "Resize workspace panels", exact: true })).toHaveCount(0);
      }

      for (const direction of ["ArrowUp", "ArrowDown"]) {
        await separator.focus();
        for (let press = 0; press < 20; press += 1) await page.keyboard.press(direction);
        const limitedHeight = await height();
        await page.keyboard.press(direction);
        await expect.poll(async () => Math.abs((await height()) - limitedHeight)).toBeLessThan(2);
        expect(await primary.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(100);
        expect(await secondary.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(100);
        for (const editor of [data, schema]) {
          await editor.scrollIntoViewIfNeeded();
          await expect(editor).toBeEditable();
          await expect(editor).toBeInViewport();
          expect((await editor.boundingBox())!.height).toBeGreaterThan(44);
        }
        await expect.poll(() => data.innerText()).toBe(source);
        await expect.poll(() => schema.innerText()).toBe(schemaSource);
      }

      await page.getByRole("button", { name: "Validate against schema", exact: true }).click();
      await expect(page.getByTestId("tool-status-line")).toContainText("JSON Schema validation is complete");
      const workspace = page.getByTestId("tool-workspace");
      const workspaceBounds = await workspace.boundingBox();
      expect(workspaceBounds).not.toBeNull();
      expect(workspaceBounds!.x).toBeGreaterThanOrEqual(0);
      expect(workspaceBounds!.x + workspaceBounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(await workspace.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
        await workspace.evaluate((element) => element.clientWidth),
      );
      await page.screenshot({ path: `/tmp/canopy-json-schema-resize-${viewport.width}.png` });
    });
  });
}
