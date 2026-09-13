import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";

test("Extract PDF Pages selects and reorders real pages in one source workspace with complete recovery", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const sourceDocument = await PDFDocument.create();
  for (let number = 1; number <= 4; number++) {
    const sheet = sourceDocument.addPage([200 + number * 10, 300]);
    sheet.drawRectangle({ x: 0, y: 0, width: sheet.getWidth(), height: 300, color: rgb(number / 5, 0.25, 0.6) });
    sheet.drawText(`Source page ${number}`, { x: 20, y: 150, size: 18, color: rgb(1, 1, 1) });
  }
  const file = { name: "source.pdf", mimeType: "application/pdf", buffer: Buffer.from(await sourceDocument.save()) };
  await page.goto("/media/extract-pdf-pages");
  await page.waitForLoadState("networkidle");
  const source = page.getByRole("region", { name: "Source PDF", exact: true });
  const settings = page.getByRole("region", { name: "Extraction settings", exact: true });
  const pages = settings.getByRole("textbox", { name: "Pages", exact: true });
  const extract = page.getByRole("button", { name: "Extract pages", exact: true });
  const download = settings.getByRole("button", { name: "Download source-extracted.pdf", exact: true });
  const currentPage = source.getByRole("spinbutton", { name: "Current page", exact: true });
  const screenshot = async (state: string) => {
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
    await page.getByTestId("tool-workspace-content").screenshot({ path: `/tmp/extract-pdf-pages-${state}-${testInfo.project.name}.png` });
  };
  async function expectExtracted(selectedPages: number[]) {
    await extract.click();
    await expect(download).toBeVisible({ timeout: 60_000 });
    const event = page.waitForEvent("download");
    await download.click();
    const artifact = await event;
    expect(artifact.suggestedFilename()).toBe("source-extracted.pdf");
    const extracted = await PDFDocument.load(await readFile((await artifact.path())!));
    expect(extracted.getPages().map((sheet) => sheet.getWidth())).toEqual(selectedPages.map((number) => 200 + number * 10));
    await expect(settings.getByRole("button", { name: /^Download / })).toHaveCount(1);
    await expect(currentPage).toHaveAttribute("max", "4");
  }

  await expect(source).toBeVisible();
  await expect(source.getByText("Add a PDF to extract pages", { exact: true })).toBeVisible();
  await expect(settings).toBeVisible();
  await expect(extract).toHaveCount(1);
  await expect(extract).toBeDisabled();
  await expect(pages).toHaveValue("1");
  await expect(page.getByRole("switch", { name: "Bundle as ZIP", exact: true })).toHaveCount(0);
  await screenshot("empty");
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await expect(currentPage).toHaveAttribute("max", "4", { timeout: 60_000 });
  const firstPage = source.getByRole("img", { name: "PDF page 1", exact: true });
  await expect(firstPage).toBeVisible();
  await expect.poll(() => firstPage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(extract).toBeEnabled();
  await expect(source.getByRole("button", { name: "Deselect page 1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await screenshot("uploaded");
  await expectExtracted([1]);

  await source.getByRole("button", { name: "Deselect page 1", exact: true }).click();
  await expect(pages).toHaveValue("");
  await expect(extract).toBeDisabled();
  await expect(settings.getByRole("alert")).toBeVisible();
  await expect(download).toHaveCount(0);
  await screenshot("unselected");
  const selectFirstPage = source.getByRole("button", { name: "Select page 1", exact: true });
  await expect(selectFirstPage).toHaveAttribute("aria-pressed", "false");
  await selectFirstPage.focus();
  await selectFirstPage.press("Space");
  await expect(pages).toHaveValue("1");
  await expect(extract).toBeEnabled();
  await expect(source.getByRole("button", { name: "Deselect page 1", exact: true })).toBeFocused();

  await pages.fill("3,1");
  await expect(download).toHaveCount(0);
  await currentPage.fill("3");
  await currentPage.press("Enter");
  await expect(currentPage).toHaveValue("3");
  await expect(source.getByRole("img", { name: "PDF page 3", exact: true })).toBeInViewport();
  const deselectThirdPage = source.getByRole("button", { name: "Deselect page 3", exact: true });
  await expect(deselectThirdPage).toHaveAttribute("aria-pressed", "true");
  await deselectThirdPage.focus();
  await deselectThirdPage.press("Enter");
  await expect(pages).toHaveValue("1");
  await source.getByRole("button", { name: "Select page 3", exact: true }).click();
  await expect(pages).toHaveValue(/1,\s*3/);
  await currentPage.fill("2");
  await currentPage.press("Enter");
  await source.getByRole("button", { name: "Select page 2", exact: true }).click();
  await expect(pages).toHaveValue(/1,\s*3,\s*2/);
  await expectExtracted([1, 3, 2]);

  await source.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(source.getByLabel("Zoom level")).toHaveText("110%");
  const expand = source.getByRole("button", { name: "Expand preview", exact: true });
  await expand.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("spinbutton", { name: "Current page", exact: true })).toHaveValue("2");
  await expect(dialog.getByRole("button", { name: "Deselect page 2", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Deselect page 2", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Select page 2", exact: true })).toHaveAttribute("aria-pressed", "false");
  const expandedPage = dialog.getByRole("spinbutton", { name: "Current page", exact: true });
  await expandedPage.fill("4");
  await expandedPage.press("Enter");
  const selectFourthPage = dialog.getByRole("button", { name: "Select page 4", exact: true });
  await selectFourthPage.focus();
  await selectFourthPage.press("Space");
  await expect(dialog.getByRole("button", { name: "Deselect page 4", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: `/tmp/extract-pdf-pages-fullscreen-selected-${testInfo.project.name}.png` });
  const pageScroller = dialog.getByRole("region", { name: "PDF pages", exact: true });
  const scrollTop = await pageScroller.evaluate((node) => node.scrollTop);
  if (testInfo.project.use.hasTouch) {
    const bounds = (await pageScroller.boundingBox())!;
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height * 0.3;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    for (let step = 1; step <= 5; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + step * 30, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  } else {
    await pageScroller.hover();
    await page.mouse.wheel(0, -150);
  }
  await expect.poll(() => pageScroller.evaluate((node) => node.scrollTop)).toBeLessThan(scrollTop);
  await expect(dialog.getByRole("button", { name: "Deselect page 4", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(expand).toBeFocused();
  await expect(pages).toHaveValue(/1,\s*3,\s*4/);
  await expect(download).toHaveCount(0);
  await expect(source.getByRole("button", { name: "Select page 2", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(source.getByRole("button", { name: "Deselect page 4", exact: true })).toHaveAttribute("aria-pressed", "true");
  await screenshot("selection");

  for (const [value, selectedPages] of [["all", [1, 2, 3, 4]], ["odd", [1, 3]], ["even", [2, 4]], ["3,1", [3, 1]]] as const) {
    await pages.fill(value);
    await expect(download).toHaveCount(0);
    await expectExtracted([...selectedPages]);
  }
  for (const value of ["", "1,1", "5", "3-"]) {
    await pages.fill(value);
    await expect(settings.getByRole("alert")).toBeVisible();
    await expect(extract).toBeDisabled();
    await expect(download).toHaveCount(0);
  }
  await screenshot("invalid");
  await pages.fill("3,1");
  await expectExtracted([3, 1]);
  await screenshot("completed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (page.viewportSize()!.width < 600) await screenshot("mobile");

  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(extract).toBeDisabled();
  await expect(download).toHaveCount(0);
  await expect(pages).toHaveValue("1");
  await page.getByRole("button", { name: "Undo reset", exact: true }).click();
  await expect(currentPage).toHaveAttribute("max", "4", { timeout: 60_000 });
  await expect(pages).toHaveValue(/3,\s*1/);
  await expect(extract).toBeEnabled();

  const replacement = await PDFDocument.create();
  replacement.addPage([250, 300]);
  const chooser = page.waitForEvent("filechooser");
  await source.getByRole("button", { name: "Replace PDF", exact: true }).click();
  await (await chooser).setFiles({ name: "replacement.pdf", mimeType: "application/pdf", buffer: Buffer.from(await replacement.save()) });
  await expect(source.getByRole("button", { name: "Remove replacement.pdf", exact: true })).toBeVisible();
  await expect(currentPage).toHaveAttribute("max", "1", { timeout: 60_000 });
  await expect(extract).toBeDisabled();
  await expect(settings.getByRole("alert")).toBeVisible();
  await expect(download).toHaveCount(0);
  await pages.fill("all");
  await extract.click();
  const replacementDownload = settings.getByRole("button", { name: "Download replacement-extracted.pdf", exact: true });
  await expect(replacementDownload).toBeVisible({ timeout: 60_000 });
  const replacementEvent = page.waitForEvent("download");
  await replacementDownload.click();
  const replacementArtifact = await replacementEvent;
  expect((await PDFDocument.load(await readFile((await replacementArtifact.path())!))).getPages().map((sheet) => sheet.getWidth())).toEqual([250]);
  await source.getByRole("button", { name: "Remove replacement.pdf", exact: true }).click();
  await expect(replacementDownload).toHaveCount(0);
  await expect(extract).toBeDisabled();
  await expect(source.getByText("Add a PDF to extract pages", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
