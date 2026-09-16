import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import { unzipSync } from "fflate";

test("Split PDF keeps one source workspace through validation, all split modes and downloads", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const sourceDocument = await PDFDocument.create();
  for (let number = 1; number <= 4; number++) {
    const sheet = sourceDocument.addPage([200 + number * 10, 300]);
    sheet.drawRectangle({
      x: 0,
      y: 0,
      width: sheet.getWidth(),
      height: 300,
      color: rgb(number / 5, 0.25, 0.6),
    });
    sheet.drawText(`Source page ${number}`, { x: 20, y: 150, size: 18, color: rgb(1, 1, 1) });
  }
  const file = {
    name: "source.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await sourceDocument.save()),
  };
  await page.goto("/media/split-pdf");
  await page.waitForLoadState("networkidle");
  const source = page.getByRole("region", { name: "Source PDF", exact: true });
  const settings = page.getByRole("region", { name: "Split settings", exact: true });
  const split = page.getByRole("button", { name: "Split PDF", exact: true });
  const mode = settings.getByRole("combobox", { name: "Split mode", exact: true });
  const bundleAsZip = settings.getByRole("switch", { name: "Bundle as ZIP", exact: true });
  const archiveDownload = settings.getByRole("button", {
    name: "Download ZIP source-split.zip",
    exact: true,
  });
  const downloads = settings.getByRole("button", { name: /^Download source-part-\d+\.pdf$/ });
  const currentPage = source.getByRole("spinbutton", { name: "Current page", exact: true });
  const screenshot = async (state: string) => {
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      window.scrollTo(0, 0);
    });
    await page
      .getByTestId("tool-workspace-content")
      .screenshot({ path: `/tmp/split-pdf-${state}-${testInfo.project.name}.png` });
  };
  async function downloadPart(number: number, pages: number[]) {
    const name = `source-part-${String(number).padStart(2, "0")}.pdf`;
    const event = page.waitForEvent("download");
    await settings.getByRole("button", { name: `Download ${name}`, exact: true }).click();
    const download = await event;
    expect(download.suggestedFilename()).toBe(name);
    const bytes = await readFile((await download.path())!);
    const result = await PDFDocument.load(bytes);
    expect(result.getPages().map((sheet) => sheet.getWidth())).toEqual(
      pages.map((number) => 200 + number * 10),
    );
    return bytes;
  }
  async function expectArchive(parts: Buffer[]) {
    const event = page.waitForEvent("download");
    await archiveDownload.click();
    const archive = await event;
    expect(archive.suggestedFilename()).toBe("source-split.zip");
    const entries = unzipSync(new Uint8Array(await readFile((await archive.path())!)));
    const names = parts.map((_, index) => `source-part-${String(index + 1).padStart(2, "0")}.pdf`);
    expect(Object.keys(entries)).toEqual(names);
    for (const [index, name] of names.entries())
      expect(Buffer.from(entries[name])).toEqual(parts[index]);
  }

  await expect(source).toBeVisible();
  await expect(settings).toBeVisible();
  await expect(split).toHaveCount(1);
  await expect(split).toBeDisabled();
  await expect(bundleAsZip).toBeChecked();
  await screenshot("empty");
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await expect(currentPage).toHaveAttribute("max", "4", { timeout: 60_000 });
  await expect(split).toBeEnabled();
  const firstPage = source.getByRole("img", { name: "PDF page 1", exact: true });
  await expect(firstPage).toBeVisible();
  await expect
    .poll(() => firstPage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await screenshot("uploaded");
  await currentPage.fill("3");
  await currentPage.press("Enter");
  await expect(currentPage).toHaveValue("3");
  await expect(source.getByRole("img", { name: "PDF page 3", exact: true })).toBeInViewport();
  await source.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(source.getByLabel("Zoom level")).toHaveText("110%");
  const expand = source.getByRole("button", { name: "Expand preview", exact: true });
  await expand.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("spinbutton", { name: "Current page", exact: true })).toHaveValue(
    "3",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(expand).toBeFocused();
  await expect(source.getByRole("img", { name: "PDF page 3", exact: true })).toBeInViewport();

  await split.click();
  await expect(downloads).toHaveCount(4, { timeout: 60_000 });
  const everyPageParts = [];
  for (let number = 1; number <= 4; number++)
    everyPageParts.push(await downloadPart(number, [number]));
  await expectArchive(everyPageParts);
  await expect(currentPage).toHaveAttribute("max", "4");
  await bundleAsZip.click();
  await expect(bundleAsZip).not.toBeChecked();
  await expect(downloads).toHaveCount(0);
  await expect(archiveDownload).toHaveCount(0);
  await mode.click();
  await page.getByRole("option", { name: "Every N pages", exact: true }).click();
  await expect(downloads).toHaveCount(0);
  const interval = settings.getByRole("spinbutton", { name: "Pages per file", exact: true });
  await interval.fill("0");
  await expect(split).toBeDisabled();
  await interval.fill("3");
  await split.click();
  await expect(downloads).toHaveCount(2, { timeout: 60_000 });
  await downloadPart(1, [1, 2, 3]);
  await downloadPart(2, [4]);
  await expect(archiveDownload).toHaveCount(0);

  await mode.click();
  await page.getByRole("option", { name: "Custom ranges", exact: true }).click();
  await expect(downloads).toHaveCount(0);
  const ranges = settings.getByRole("textbox", { name: "Ranges", exact: true });
  for (const value of ["5", "1,1", "1-"]) {
    await ranges.fill(value);
    await expect(settings.getByRole("alert")).toBeVisible();
    await expect(split).toBeDisabled();
    await expect(downloads).toHaveCount(0);
  }
  await screenshot("invalid");
  await ranges.fill("1,3;2-4");
  await bundleAsZip.click();
  await expect(split).toBeEnabled();
  await split.click();
  await expect(downloads).toHaveCount(2, { timeout: 60_000 });
  const firstPart = await downloadPart(1, [1, 3]);
  const secondPart = await downloadPart(2, [2, 3, 4]);
  await expectArchive([firstPart, secondPart]);
  await screenshot("completed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (page.viewportSize()!.width < 600) await screenshot("mobile");

  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(split).toBeDisabled();
  await expect(downloads).toHaveCount(0);
  await expect(bundleAsZip).toBeChecked();
  await page.getByRole("button", { name: "Undo reset", exact: true }).click();
  await expect(currentPage).toHaveAttribute("max", "4", { timeout: 60_000 });
  await expect(ranges).toHaveValue("1,3;2-4");
  await expect(split).toBeEnabled();

  await mode.click();
  await page.getByRole("option", { name: "Every page", exact: true }).click();
  const replacement = await PDFDocument.create();
  replacement.addPage([200, 300]);
  const chooserEvent = page.waitForEvent("filechooser");
  await source.getByRole("button", { name: "Replace PDF", exact: true }).click();
  await (
    await chooserEvent
  ).setFiles({
    name: "replacement.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await replacement.save()),
  });
  await expect(
    source.getByRole("button", { name: "Remove replacement.pdf", exact: true }),
  ).toBeVisible();
  await expect(currentPage).toHaveAttribute("max", "1", { timeout: 60_000 });
  await expect(downloads).toHaveCount(0);
  await split.click();
  const replacementDownload = settings.getByRole("button", {
    name: "Download replacement-part-01.pdf",
    exact: true,
  });
  await expect(replacementDownload).toBeVisible({ timeout: 60_000 });
  await source.getByRole("button", { name: "Remove replacement.pdf", exact: true }).click();
  await expect(replacementDownload).toHaveCount(0);
  await expect(split).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Split PDF rejects invalid input and preserves a valid source after rejected replacements", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/media/split-pdf");
  await page.waitForLoadState("networkidle");
  const source = page.getByRole("region", { name: "Source PDF", exact: true });
  const split = page.getByRole("button", { name: "Split PDF", exact: true });
  const retry = source.getByRole("button", { name: "Retry preview", exact: true });
  const replace = source.getByRole("button", { name: "Replace PDF", exact: true });
  async function replaceFile(file: { name: string; mimeType: string; buffer: Buffer }) {
    const chooser = page.waitForEvent("filechooser");
    await replace.click();
    await (await chooser).setFiles(file);
  }
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) });
  await expect(source.getByText("Unable to open PDF", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(split).toBeDisabled();
  await expect(retry).toBeVisible();
  await expect(replace).toBeVisible();
  await retry.click();
  await expect(source.getByText("Unable to open PDF", { exact: true })).toBeVisible();
  await expect(split).toBeDisabled();
  await replaceFile({
    name: "corrupt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nThis is not a PDF document."),
  });
  await expect(
    source.getByRole("button", { name: "Remove corrupt.pdf", exact: true }),
  ).toBeVisible();
  await expect(source.getByText("Unable to open PDF", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(split).toBeDisabled();
  await expect(retry).toBeVisible();
  await expect(page.getByTestId("tool-status-line")).toContainText(
    "Replace the PDF or retry opening it.",
  );
  await page.screenshot({
    path: `/tmp/split-pdf-rejected-${testInfo.project.name}.png`,
    fullPage: true,
  });

  const validPdf = await PDFDocument.create();
  validPdf.addPage([200, 300]).drawText("Valid replacement", { x: 20, y: 150, size: 14 });
  const validFile = {
    name: "valid.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await validPdf.save()),
  };
  await replaceFile(validFile);
  const currentPage = source.getByRole("spinbutton", { name: "Current page", exact: true });
  await expect(currentPage).toHaveAttribute("max", "1", { timeout: 60_000 });
  await expect(split).toBeEnabled();
  await expect(retry).toHaveCount(0);
  await split.click();
  const result = page.getByRole("button", { name: "Download valid-part-01.pdf", exact: true });
  await expect(result).toBeVisible({ timeout: 60_000 });

  await replaceFile({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Keep the valid PDF when this replacement is rejected."),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "notes.txt is not an accepted file type." }),
  ).toBeVisible();
  await expect(source.getByRole("button", { name: "Remove valid.pdf", exact: true })).toBeVisible();
  await expect(currentPage).toHaveAttribute("max", "1");
  await expect(result).toBeVisible();
  await expect(split).toBeEnabled();

  const transfer = await page.evaluateHandle(
    (bytes) => {
      const dataTransfer = new DataTransfer();
      for (const name of ["first.pdf", "second.pdf"])
        dataTransfer.items.add(
          new File([new Uint8Array(bytes)], name, { type: "application/pdf" }),
        );
      return dataTransfer;
    },
    [...validFile.buffer],
  );
  await source.dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
  await expect(page.getByRole("alert").filter({ hasText: "Add one PDF at a time." })).toBeVisible();
  await expect(source.getByRole("button", { name: "Remove valid.pdf", exact: true })).toBeVisible();
  await expect(result).toBeVisible();

  const oversizedPdf = await PDFDocument.create();
  for (let index = 0; index < 501; index++) oversizedPdf.addPage([200, 300]);
  await replaceFile({
    name: "501-pages.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await oversizedPdf.save()),
  });
  await expect(source.getByText("Unable to open PDF", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(source).toContainText("500");
  await expect(split).toBeDisabled();
  await expect(result).toHaveCount(0);
  await expect(retry).toBeVisible();
  await expect(replace).toBeVisible();
  await replaceFile(validFile);
  await expect(currentPage).toHaveAttribute("max", "1", { timeout: 60_000 });
  await expect(split).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
