import { expect, test, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";

async function sourcePdf(count: number) {
  const document = await PDFDocument.create();
  for (let number = 1; number <= count; number++) {
    const sheet = document.addPage([200 + number * 10, 300]);
    sheet.drawRectangle({ x: 0, y: 0, width: sheet.getWidth(), height: 300, color: rgb(number / 4, 0.2, 0.6) });
    sheet.drawText(`Source page ${number}`, { x: 15, y: 150, size: 18, color: rgb(1, 1, 1) });
  }
  return { name: "source.pdf", mimeType: "application/pdf", buffer: Buffer.from(await document.save()) };
}

test("page cards preview on click and reorder from the whole card without opening the preview", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const postMessage = Worker.prototype.postMessage;
    let holdRun = false;
    let releaseRun: (() => void) | undefined;
    window.addEventListener("test:hold-pdf-run", () => { holdRun = true; });
    window.addEventListener("test:release-pdf-run", () => {
      holdRun = false;
      releaseRun?.();
      releaseRun = undefined;
    });
    Worker.prototype.postMessage = function (message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
      const dispatch = () => Reflect.apply(postMessage, this, [message, options]);
      if (holdRun && typeof message === "object" && message !== null && "type" in message && message.type === "run") {
        // Hold dispatch to inspect the running UI, then execute the real PDF job.
        releaseRun = dispatch;
        return;
      }
      dispatch();
    };
  });
  await page.goto("/media/reorder-pdf-pages");
  await page.waitForLoadState("networkidle");
  const workspace = page.getByTestId("tool-workspace-content");
  const output = page.getByRole("region", { name: "Processed output", exact: true });
  const input = page.getByRole("region", { name: "Input files", exact: true });
  const selectedFiles = page.getByRole("region", { name: "Selected files", exact: true });
  const screenshot = async (state: string) => {
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: `/tmp/reorder-pdf-${state}-${testInfo.project.name}.png`, fullPage: true });
  };
  async function expectFullWidth(surface: Locator) {
    await expect(surface).toBeVisible();
    await expect.poll(async () => (await surface.boundingBox())!.width / (await workspace.boundingBox())!.width).toBeGreaterThan(0.94);
    await expect(output).toHaveCount(0);
  }
  await expectFullWidth(input);
  await screenshot("initial");
  await page.locator('input[type="file"]').first().setInputFiles(await sourcePdf(3));
  const card = (number: number) => page.getByRole("button", { name: `Preview page ${number}`, exact: true });
  const dialog = page.getByRole("dialog");
  await expect(card(3)).toBeVisible({ timeout: 60_000 });
  await expectFullWidth(selectedFiles);
  await card(3).scrollIntoViewIfNeeded();
  await expect.poll(() => card(3).locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await card(1).scrollIntoViewIfNeeded();
  await screenshot("uploaded");
  const cards = page.getByRole("button", { name: /^Preview page \d+$/ });
  const expectOrder = (order: number[]) => expect.poll(() => cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")))).toEqual(order.map((number) => `Preview page ${number}`));

  async function preview(target: Locator, number: number, position?: { x: number; y: number }, arrangedPage = number) {
    await target.click(position ? { position } : undefined);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("spinbutton", { name: "Current page", exact: true })).toHaveValue(String(arrangedPage));
    const image = dialog.getByRole("img", { name: `PDF page ${number}`, exact: true });
    await expect(image).toBeInViewport();
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(300);
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth >= Math.floor(node.getBoundingClientRect().width * devicePixelRatio))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(card(number)).toBeFocused();
  }

  await preview(card(2).locator("img"), 2);
  await preview(card(3).getByText("Page 3", { exact: true }), 3);
  await preview(card(1), 1, { x: 4, y: 50 });
  await card(2).focus();
  await card(2).press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("spinbutton", { name: "Current page", exact: true })).toHaveValue("2");
  await page.screenshot({ path: `/tmp/reorder-pdf-preview-${testInfo.project.name}.png` });
  await page.keyboard.press("Escape");

  await card(3).scrollIntoViewIfNeeded();
  const from = (await card(3).boundingBox())!;
  const to = (await card(1).boundingBox())!;
  await page.mouse.move(from.x + 5, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
  await expectOrder([3, 1, 2]);
  await expect(dialog).toBeHidden();

  const handle = page.getByRole("button", { name: "Drag page 3 to reorder", exact: true });
  await handle.focus();
  await handle.press("Space");
  await expect(page.getByRole("status").filter({ hasText: "Page 3 is over position 1 of 3." })).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await handle.press("ArrowRight");
  await expect(page.getByRole("status").filter({ hasText: "Page 3 is over position 2 of 3." })).toBeVisible();
  await handle.press("Space");
  await expectOrder([1, 3, 2]);
  await expect(dialog).toBeHidden();
  await preview(card(3), 3, undefined, 2);

  await page.evaluate(() => window.dispatchEvent(new Event("test:hold-pdf-run")));
  await page.getByRole("button", { name: "Reorder pages", exact: true }).click();
  await expect(page.getByText("Preparing the first item.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(1);
  await expectFullWidth(selectedFiles);
  await expectOrder([1, 3, 2]);
  await screenshot("running");
  await page.evaluate(() => window.dispatchEvent(new Event("test:release-pdf-run")));
  const download = output.getByRole("button", { name: "Download file", exact: true });
  await expect(download).toBeVisible({ timeout: 60_000 });
  await expect(output).toBeVisible();
  if (testInfo.project.name === "mobile") {
    await expect(download).toBeInViewport();
    await expect(output.getByRole("img", { name: "Generated PDF page 1", exact: true })).toBeInViewport();
    await page.screenshot({ path: "/tmp/reorder-pdf-completion-handoff-mobile.png" });
  }
  const generatedPreview = output.getByRole("region", { name: "Generated PDF", exact: true });
  await expect(generatedPreview.getByRole("spinbutton", { name: "Current page", exact: true })).toHaveAttribute("max", "3");
  const generatedPage = generatedPreview.getByRole("img", { name: "Generated PDF page 1", exact: true });
  await expect(generatedPage).toBeVisible();
  await expect.poll(() => generatedPage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const outputPage = generatedPreview.getByRole("spinbutton", { name: "Current page", exact: true });
  const pageScroller = generatedPreview.getByRole("region", { name: "PDF pages", exact: true });
  const footerTop = (await download.boundingBox())!.y;
  const outputScrollTop = await output.evaluate((node) => node.scrollTop);
  await generatedPreview.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(generatedPreview.getByLabel("Zoom level")).toHaveText("110%");
  const pageScrollTop = await pageScroller.evaluate((node) => node.scrollTop);
  await pageScroller.hover();
  await page.mouse.wheel(0, 120);
  await expect.poll(() => pageScroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(pageScrollTop);
  expect((await download.boundingBox())!.y).toBeCloseTo(footerTop, 0);
  expect(await output.evaluate((node) => node.scrollTop)).toBe(outputScrollTop);
  await outputPage.fill("3");
  await outputPage.press("Enter");
  await expect(generatedPreview.getByRole("img", { name: "Generated PDF page 3", exact: true })).toBeInViewport();
  expect((await download.boundingBox())!.y).toBeCloseTo(footerTop, 0);
  await outputPage.fill("1");
  await outputPage.press("Enter");
  await generatedPreview.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(generatedPreview.getByLabel("Zoom level")).toHaveText("100%");
  if (testInfo.project.name === "desktop") {
    await expect.poll(async () => (await selectedFiles.boundingBox())!.width / (await workspace.boundingBox())!.width).toBeLessThan(0.65);
    const sourceBounds = (await selectedFiles.boundingBox())!;
    const outputBounds = (await output.boundingBox())!;
    expect(outputBounds.x).toBeGreaterThanOrEqual(sourceBounds.x + sourceBounds.width - 2);
    expect(outputBounds.width).toBeGreaterThan((await workspace.boundingBox())!.width * 0.3);
  } else {
    expect((await output.boundingBox())!.y).toBeGreaterThanOrEqual((await selectedFiles.boundingBox())!.y + (await selectedFiles.boundingBox())!.height);
  }
  const downloading = page.waitForEvent("download");
  await download.click();
  const artifact = await downloading;
  expect(artifact.suggestedFilename()).toBe("source-reordered.pdf");
  const reorderedDocument = await PDFDocument.load(await readFile((await artifact.path())!));
  expect(reorderedDocument.getPages().map((sheet) => sheet.getWidth())).toEqual([210, 230, 220]);
  await card(3).scrollIntoViewIfNeeded();
  await expect(card(3).locator("img")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => card(3).locator("img").evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  await expectOrder([1, 3, 2]);
  await expect(download).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot("completed");

  const replacement = { ...await sourcePdf(3), name: "replacement.pdf" };
  await page.locator('input[type="file"]').first().setInputFiles(replacement);
  await expect(page.getByRole("button", { name: "Remove replacement.pdf", exact: true })).toBeVisible();
  await card(3).scrollIntoViewIfNeeded();
  await expect(card(3).locator("img")).toBeVisible({ timeout: 60_000 });
  await expectOrder([1, 2, 3]);
  await expect(download).toBeHidden();
  await expectFullWidth(selectedFiles);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(cards).toHaveCount(0);
  await expectFullWidth(input);
  await page.locator('input[type="file"]').first().setInputFiles(replacement);
  await card(3).scrollIntoViewIfNeeded();
  await expect(card(3).locator("img")).toBeVisible({ timeout: 60_000 });
  await expectOrder([1, 2, 3]);
});

test("one-page PDFs still open full preview when reordering is disabled", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/media/reorder-pdf-pages");
  await page.waitForLoadState("networkidle");
  const output = page.getByRole("region", { name: "Processed output", exact: true });
  await expect(output).toHaveCount(0);
  await page.locator('input[type="file"]').first().setInputFiles(await sourcePdf(1));
  const card = page.getByRole("button", { name: "Preview page 1", exact: true });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(output).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Drag page 1 to reorder", exact: true })).toBeDisabled();
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img", { name: "PDF page 1", exact: true })).toBeVisible();
  await expect(dialog.getByRole("spinbutton", { name: "Current page", exact: true })).toHaveAttribute("max", "1");
  await page.screenshot({ path: `/tmp/reorder-pdf-single-${testInfo.project.name}.png` });
  await dialog.getByRole("button", { name: /Exit preview/ }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toBeFocused();
  await page.getByRole("button", { name: "Reorder pages", exact: true }).click();
  await expect(output.getByRole("button", { name: "Download file", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(card).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(output).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Input files", exact: true })).toBeVisible();
});

test("touch tap previews and a held card drags while a quick swipe scrolls", async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, "Touch interaction runs on the mobile viewport.");
  await page.goto("/media/reorder-pdf-pages");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').first().setInputFiles(await sourcePdf(3));
  const first = page.getByRole("button", { name: "Preview page 1", exact: true });
  const second = page.getByRole("button", { name: "Preview page 2", exact: true });
  await expect(second).toBeVisible({ timeout: 60_000 });
  await first.scrollIntoViewIfNeeded();
  const cdp = await context.newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  let box = (await first.boundingBox())!;
  await touch("touchStart", box.x + box.width / 2, box.y + box.height / 2);
  await touch("touchEnd");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await second.scrollIntoViewIfNeeded();
  const from = (await second.boundingBox())!;
  const to = (await first.boundingBox())!;
  await touch("touchStart", from.x + from.width / 2, from.y + from.height / 2);
  await page.waitForTimeout(250); // TouchSensor's deliberate hold-to-drag activation.
  for (let step = 1; step <= 10; step++) {
    await touch("touchMove", from.x + from.width / 2 + (to.x - from.x) * step / 10, from.y + from.height / 2 + (to.y - from.y) * step / 10);
  }
  await touch("touchEnd");
  const cards = page.getByRole("button", { name: /^Preview page \d+$/ });
  const order = () => cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  await expect.poll(order).toEqual(["Preview page 2", "Preview page 1", "Preview page 3"]);
  await expect(dialog).toBeHidden();

  await second.scrollIntoViewIfNeeded();
  box = (await second.boundingBox())!;
  const startY = box.y + box.height * 0.75;
  await touch("touchStart", box.x + box.width / 2, startY);
  for (let step = 1; step <= 5; step++) await touch("touchMove", box.x + box.width / 2, startY - step * 25);
  await touch("touchEnd");
  await expect.poll(async () => (await second.boundingBox())!.y).toBeLessThan(box.y - 10);
  await expect.poll(order).toEqual(["Preview page 2", "Preview page 1", "Preview page 3"]);
  await expect(dialog).toBeHidden();
  await cdp.detach();
});
