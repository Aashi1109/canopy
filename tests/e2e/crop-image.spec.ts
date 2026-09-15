import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false });

async function addImage(page: Page, name = "crop-test.png", width = 400, height = 300) {
  await page.waitForLoadState("networkidle");
  const png = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#318060"; context.fillRect(0, 0, width, height);
    return canvas.toDataURL("image/png").split(",")[1];
  }, { width, height });
  await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(page.getByRole("button", { name: "Crop point 2", exact: true })).toBeVisible();
}

test("freeform crop supports independent drag, keyboard, recovery and transparent PNG output", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`${process.env.MEDIA_E2E_URL ?? "http://localhost:3000/media"}/crop-image`);
  await addImage(page);
  const point = page.getByRole("button", { name: "Crop point 2", exact: true });
  const other = page.getByRole("button", { name: "Crop point 3", exact: true });
  const originalOther = await other.boundingBox();
  const box = (await point.boundingBox())!;
  await page.mouse.move(box.x + 22, box.y + 22);
  await page.mouse.down();
  await page.mouse.move(box.x - 38, box.y + 62, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByLabel("X · selected point 2", { exact: true })).toHaveValue("340");
  await expect(page.getByLabel("Y · selected point 2", { exact: true })).toHaveValue("40");
  expect(await other.boundingBox()).toEqual(originalOther);
  await point.press("ArrowLeft");
  await point.press("Shift+ArrowDown");
  await expect(page.getByLabel("X · selected point 2", { exact: true })).toHaveValue("339");
  await expect(page.getByLabel("Y · selected point 2", { exact: true })).toHaveValue("50");
  const moved = (await point.boundingBox())!;
  await page.mouse.move(moved.x + 22, moved.y + 22); await page.mouse.down();
  await page.mouse.move(moved.x - 18, moved.y + 42, { steps: 3 });
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(page.getByLabel("X · selected point 2", { exact: true })).toHaveValue("339");
  await page.getByLabel("X · selected point 2", { exact: true }).fill("300");
  await page.getByLabel("Y · selected point 2", { exact: true }).fill("60");
  await expect(page.getByLabel("Width · selection bounds", { exact: true })).toHaveValue("400");
  const current = (await point.boundingBox())!;
  const opposite = (await page.getByRole("button", { name: "Crop point 4", exact: true }).boundingBox())!;
  await page.mouse.move(current.x + 22, current.y + 22); await page.mouse.down();
  await page.mouse.move(opposite.x + 22, opposite.y + 22); await page.mouse.up();
  await expect(page.getByRole("alert").filter({ hasText: "Points cannot overlap" })).toBeVisible();
  await expect(page.getByLabel("X · selected point 2", { exact: true })).toHaveValue("300");
  await page.getByLabel("X · selected point 2", { exact: true }).fill("301");
  await page.getByLabel("X · selected point 2", { exact: true }).fill("300");
  await page.screenshot({ path: "/tmp/crop-image-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Crop image", exact: true }).click();
  const downloadButton = page.getByRole("button", { name: "Download crop-test-cropped.png", exact: true });
  await expect(downloadButton).toBeVisible({ timeout: 60_000 });
  const downloading = page.waitForEvent("download"); await downloadButton.click();
  const download = await downloading;
  const bytes = await readFile((await download.path())!);
  const pixels = await page.evaluate(async base64 => {
    const blob = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: "image/png" });
    const image = await createImageBitmap(blob);
    const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
    const ctx = c.getContext("2d")!; ctx.drawImage(image, 0, 0);
    return { width: image.width, height: image.height, outside: [...ctx.getImageData(390, 10, 1, 1).data], inside: [...ctx.getImageData(100, 100, 1, 1).data] };
  }, bytes.toString("base64"));
  expect(pixels).toEqual({ width: 400, height: 300, outside: [0, 0, 0, 0], inside: [49, 128, 96, 255] });
  const resultImage = page.getByRole("region", { name: "Generated image previews" }).locator("img").first();
  await expect.poll(() => resultImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(400);
  await expect(resultImage).toBeVisible();
  await resultImage.evaluate((image: HTMLImageElement) => image.decode());
  await resultImage.screenshot({ path: "/tmp/crop-result-image.png" });
  await page.screenshot({ path: "/tmp/crop-image-result.png", fullPage: true });
});

test("crop reset, image replacement, rectangle compatibility and mobile layout", async ({ page }) => {
  await page.goto(`${process.env.MEDIA_E2E_URL ?? "http://localhost:3000/media"}/crop-image`);
  await addImage(page);
  await page.getByRole("button", { name: "Crop point 2", exact: true }).focus();
  await page.getByLabel("X · selected point 2", { exact: true }).fill("300");
  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await expect(page.getByLabel("X · selected point 2", { exact: true })).toHaveValue("400");
  await addImage(page, "replacement.png", 200, 160);
  await expect(page.getByLabel("Width · selection bounds", { exact: true })).toHaveValue("200");
  await page.getByLabel("Crop mode", { exact: true }).click();
  await page.getByRole("option", { name: "Rectangle", exact: true }).click();
  await page.getByLabel("Width", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("200");
  await page.getByLabel("Crop mode", { exact: true }).click();
  await page.getByRole("option", { name: "Freeform points", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Crop point 2", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Crop image", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Crop image", exact: true })).toBeInViewport();
  await page.screenshot({ path: "/tmp/crop-image-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Remove replacement.png", exact: true }).click();
  await expect(page.getByRole("button", { name: "Crop point 2", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Crop image", exact: true })).toBeDisabled();
});

test("point-count control updates the editable polygon and exports it", async ({ page }) => {
  await page.goto(`${process.env.MEDIA_E2E_URL ?? "http://localhost:3000/media"}/crop-image`);
  await addImage(page);
  await page.getByLabel("Freeform point count", { exact: true }).fill("8");
  await expect(page.getByRole("button", { name: /^Crop point \d+$/ })).toHaveCount(8);
  await page.getByRole("button", { name: "Crop point 8", exact: true }).press("ArrowRight");
  await expect(page.getByLabel("X · selected point 8", { exact: true })).toHaveValue("1");
  await page.screenshot({ path: "/tmp/crop-count-grid.png", fullPage: true });
  await page.getByRole("button", { name: "Crop image", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download crop-test-cropped.png", exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Freeform point count", { exact: true }).fill("3");
  await expect(page.getByRole("button", { name: /^Crop point \d+$/ })).toHaveCount(3);
  await expect(page.getByLabel("X · selected point 1", { exact: true })).toBeEnabled();
});

test.describe("mobile touch", () => {
  test.use({ hasTouch: true });
  test("mobile editor can drag, reach actions, return to its selection and download", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${process.env.MEDIA_E2E_URL ?? "http://localhost:3000/media"}/crop-image`);
  await addImage(page);
  const point = page.getByRole("button", { name: "Crop point 2", exact: true });
  await point.scrollIntoViewIfNeeded();
  const box = (await point.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 22, y: box.y + 22 }] });
  for (let step = 1; step <= 5; step++) await session.send("Input.dispatchTouchEvent", {
    type: "touchMove", touchPoints: [{ x: box.x + 22 - step * 6, y: box.y + 22 + step * 6 }],
  });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
  const xField = page.getByLabel("X · selected point 2", { exact: true });
  const x = await xField.inputValue();
  expect(Number(x)).toBeLessThan(400);
  await page.screenshot({ path: "/tmp/crop-image-mobile-editor.png" });
  const apply = page.getByRole("button", { name: "Crop image", exact: true });
  await apply.scrollIntoViewIfNeeded(); await expect(apply).toBeInViewport();
  await page.screenshot({ path: "/tmp/crop-image-mobile-actions.png" });
  await point.scrollIntoViewIfNeeded(); await expect(point).toBeInViewport();
  await expect(xField).toHaveValue(x);
  await apply.click();
  const downloadButton = page.getByRole("button", { name: "Download crop-test-cropped.png", exact: true });
  await downloadButton.scrollIntoViewIfNeeded();
  const downloading = page.waitForEvent("download"); await downloadButton.click();
  expect((await downloading).suggestedFilename()).toBe("crop-test-cropped.png");
  const image = page.getByRole("region", { name: "Generated image previews" }).locator("img").first();
  await image.evaluate((node: HTMLImageElement) => node.decode());
  await image.screenshot({ path: "/tmp/crop-image-mobile-result.png" });
  });
});
