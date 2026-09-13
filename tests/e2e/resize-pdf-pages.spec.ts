import { expect, test } from "@playwright/test";
import { PDFDocument, rgb } from "pdf-lib";
import { readFile } from "node:fs/promises";

test("Resize PDF Pages previews the source and resizes only selected pages from its settings panel", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const postMessage = Worker.prototype.postMessage;
    let holdRun = false;
    let releaseRun: (() => void) | undefined;
    window.addEventListener("test:hold-pdf-run", () => { holdRun = true; });
    window.addEventListener("test:release-pdf-run", () => { holdRun = false; releaseRun?.(); releaseRun = undefined; });
    Worker.prototype.postMessage = function (message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
      const dispatch = () => Reflect.apply(postMessage, this, [message, options]);
      if (holdRun && typeof message === "object" && message !== null && "type" in message && message.type === "run") {
        // Pause dispatch for the running-state check, then execute the real job.
        releaseRun = dispatch;
        return;
      }
      dispatch();
    };
  });
  const sourceDocument = await PDFDocument.create();
  for (let number = 1; number <= 3; number++) {
    const sheet = sourceDocument.addPage([200 + number * 10, 300]);
    sheet.drawRectangle({ x: 0, y: 0, width: sheet.getWidth(), height: 300, color: rgb(number / 4, 0.25, 0.6) });
    sheet.drawText(`Source page ${number}`, { x: 20, y: 150, size: 18, color: rgb(1, 1, 1) });
  }
  await page.goto("/media/resize-pdf-pages");
  await page.waitForLoadState("networkidle");
  const source = page.getByRole("region", { name: "Source PDF", exact: true });
  const settings = page.getByRole("region", { name: "Resize settings", exact: true });
  const resize = settings.getByRole("button", { name: "Resize pages", exact: true });
  const pages = settings.getByRole("textbox", { name: "Pages", exact: true });
  const download = settings.getByRole("button", { name: "Download source-resized.pdf", exact: true });
  const currentPage = source.getByRole("spinbutton", { name: "Current page", exact: true });
  const screenshot = async (state: string) => {
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); });
    await source.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/resize-pdf-pages-${state}-${testInfo.project.name}.png` });
  };
  async function expectSecondPageInViewer() {
    await expect(currentPage).toHaveValue("2");
    await expect.poll(async () => {
      const image = (await source.getByRole("img", { name: "PDF page 2", exact: true }).boundingBox())!;
      const viewport = (await source.getByRole("region", { name: "PDF pages", exact: true }).boundingBox())!;
      return Math.min(image.y - viewport.y, viewport.y + viewport.height - image.y - image.height);
    }).toBeGreaterThanOrEqual(-2);
  }
  await expect(source).toBeVisible();
  await expect(settings).toBeVisible();
  await expect(pages).toHaveValue("all");
  await expect(settings.getByRole("combobox", { name: "Page size", exact: true })).toBeVisible();
  await expect(settings.getByRole("combobox", { name: "Orientation", exact: true })).toBeVisible();
  await expect(settings.getByRole("combobox", { name: "Fit", exact: true })).toBeVisible();
  await expect(settings.getByRole("spinbutton", { name: "Margin", exact: true })).toHaveValue("18");
  await expect(resize).toBeDisabled();
  await expect(page.getByRole("button", { name: "Resize pages", exact: true })).toHaveCount(1);
  await screenshot("empty");

  await page.locator('input[type="file"]').first().setInputFiles({ name: "source.pdf", mimeType: "application/pdf", buffer: Buffer.from(await sourceDocument.save()) });
  await expect(currentPage).toHaveAttribute("max", "3", { timeout: 60_000 });
  const image = source.getByRole("img", { name: "PDF page 1", exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  await expect(resize).toBeEnabled();
  await expect(source.getByRole("button", { name: "Replace PDF", exact: true })).toBeVisible();
  await screenshot("uploaded");
  await currentPage.fill("2");
  await currentPage.press("Enter");
  const secondPage = source.getByRole("img", { name: "PDF page 2", exact: true });
  await expectSecondPageInViewer();
  await expect.poll(() => secondPage.evaluate((image: HTMLImageElement) => {
    if (!image.naturalWidth) return Infinity;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return Math.abs(context.getImageData(canvas.width / 4, canvas.height / 4, 1, 1).data[0] - 128);
  })).toBeLessThan(5);
  await pages.fill("2");
  await settings.getByRole("combobox", { name: "Page size", exact: true }).click();
  await page.getByRole("option", { name: "US Letter", exact: true }).click();
  await settings.getByRole("combobox", { name: "Orientation", exact: true }).click();
  await page.getByRole("option", { name: "Landscape", exact: true }).click();
  const margin = settings.getByRole("spinbutton", { name: "Margin", exact: true });
  await margin.fill("400");
  await expect(resize).toBeDisabled();
  await expect(settings.getByRole("alert")).toBeVisible();
  await margin.fill("18");
  await expect(resize).toBeEnabled();

  await page.evaluate(() => window.dispatchEvent(new Event("test:hold-pdf-run")));
  await resize.click();
  await expect(settings.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(1);
  await expect(download).toHaveCount(0);
  await expect(currentPage).toHaveAttribute("max", "3");
  await expect(currentPage).toHaveValue("2");
  await screenshot("running");
  await expectSecondPageInViewer();
  await page.evaluate(() => window.dispatchEvent(new Event("test:release-pdf-run")));
  await expect(download).toBeVisible({ timeout: 60_000 });
  const event = page.waitForEvent("download");
  await download.click();
  const artifact = await event;
  expect(artifact.suggestedFilename()).toBe("source-resized.pdf");
  const result = await PDFDocument.load(await readFile((await artifact.path())!));
  expect(result.getPages().map((sheet) => [sheet.getWidth(), sheet.getHeight()])).toEqual([[210, 300], [792, 612], [230, 300]]);
  await expect(currentPage).toHaveAttribute("max", "3");
  await expect(page.getByRole("region", { name: "Processed output", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resize pages", exact: true })).toHaveCount(1);
  await screenshot("completed");
  await expectSecondPageInViewer();
  if (page.viewportSize()!.width < 600) {
    expect((await resize.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await download.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await download.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/resize-pdf-pages-actions-mobile.png" });
  }

  for (const value of ["4", "3-", ""]) {
    await pages.fill(value);
    await expect(settings.getByRole("alert")).toBeVisible();
    await expect(resize).toBeDisabled();
    await expect(download).toHaveCount(0);
  }
  await screenshot("invalid");
  await pages.fill("2");
  await expect(resize).toBeEnabled();
  await pages.fill("2,2");
  await expect(resize).toBeEnabled();
  await settings.getByRole("combobox", { name: "Page size", exact: true }).click();
  await page.getByRole("option", { name: "Custom", exact: true }).click();
  await settings.getByRole("spinbutton", { name: "Width", exact: true }).fill("100");
  await settings.getByRole("spinbutton", { name: "Height", exact: true }).fill("200");
  await margin.fill("50");
  await expect(resize).toBeDisabled();
  await margin.fill("49");
  await expect(resize).toBeEnabled();
  await margin.fill("");
  await expect(resize).toBeDisabled();
  await margin.fill("18");
  await settings.getByRole("combobox", { name: "Page size", exact: true }).click();
  await page.getByRole("option", { name: "US Letter", exact: true }).click();
  await resize.click();
  await expect(download).toBeVisible({ timeout: 60_000 });

  const replacement = await PDFDocument.create();
  replacement.addPage([250, 350]);
  const chooser = page.waitForEvent("filechooser");
  await source.getByRole("button", { name: "Replace PDF", exact: true }).click();
  await (await chooser).setFiles({ name: "replacement.pdf", mimeType: "application/pdf", buffer: Buffer.from(await replacement.save()) });
  await expect(source.getByRole("button", { name: "Remove replacement.pdf", exact: true })).toBeVisible();
  await expect(currentPage).toHaveAttribute("max", "1", { timeout: 60_000 });
  await expect(download).toHaveCount(0);
  await expect(resize).toBeDisabled();
  await pages.fill("all");
  await resize.click();
  const replacementDownload = settings.getByRole("button", { name: "Download replacement-resized.pdf", exact: true });
  await expect(replacementDownload).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(replacementDownload).toHaveCount(0);
  await expect(currentPage).toHaveCount(0);
  await expect(pages).toHaveValue("all");
  await expect(resize).toBeDisabled();
  await expect(settings).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
