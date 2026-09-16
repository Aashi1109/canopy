import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

test("crop PDF supports exact editing, direct cropping, output preview, download and recovery", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const pdf = await PDFDocument.create();
  for (let i = 1; i <= 4; i++) pdf.addPage([595.2756, 841.8898]).drawText(`Page ${i}`, { x: 60, y: 740 });
  const file = {
    name: "crop-source.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  };
  await page.goto("/media/crop-pdf");
  await page.waitForLoadState("networkidle");
  const review = page.getByRole("button", { name: "Crop PDF", exact: true });
  await expect(review).toBeDisabled();
  await page.locator("input[type=file]").first().setInputFiles(file);
  const width = page.getByRole("spinbutton", { name: "Width", exact: true });
  await expect(width).toHaveValue("595", { timeout: 60000 });
  await expect(page.getByRole("spinbutton", { name: "Height", exact: true })).toHaveValue("841");
  await width.fill("523.4");
  await expect(width).toHaveValue("523");
  await page.getByRole("spinbutton", { name: "Left", exact: true }).fill("36");
  await page.getByRole("spinbutton", { name: "Bottom", exact: true }).fill("36");
  await width.fill("523");
  await page.getByRole("spinbutton", { name: "Height", exact: true }).fill("770");
  await page.getByRole("combobox", { name: "Apply crop to" }).click();
  await page.getByRole("option", { name: "Custom pages", exact: true }).click();
  await page.getByRole("textbox", { name: "Page range" }).fill("2-4");
  const navigation = page.getByRole("spinbutton", { name: "Current page", exact: true });
  await navigation.fill("2");
  await navigation.press("Enter");
  await expect(page.getByRole("application", { name: "Crop area" }).first()).toBeVisible();
  await page.getByRole("application", { name: "Crop area" }).first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("spinbutton", { name: "Left", exact: true })).toHaveValue("37");
  await page.keyboard.press("ArrowLeft");
  const handles = page.getByRole("button", { name: /^Resize crop / });
  await expect(handles.filter({ visible: true })).toHaveCount(8);
  const right = page.getByRole("button", { name: "Resize crop right", exact: true }).first();
  await right.focus();
  await right.press("ArrowLeft");
  await expect(width).toHaveValue("522");
  await right.press("ArrowRight");
  await expect(width).toHaveValue("523");
  await width.fill("900");
  await expect(review).toBeDisabled();
  await width.fill("523");
  await expect(review).toBeEnabled();
  await page.getByTestId("tool-workspace-content").screenshot({ path: `/tmp/crop-edit-${info.project.name}.png` });
  await expect(page.getByRole("button", { name: "Review crop", exact: true })).toHaveCount(0);
  await review.click();
  const download = page.getByRole("button", {
    name: "Download crop-source-cropped.pdf",
    exact: true,
  });
  await expect(download).toBeVisible({ timeout: 60000 });
  await expect(width).toHaveValue("523");
  await expect(page.getByRole("img", { name: "Generated PDF page 1", exact: true })).toBeVisible({
    timeout: 60000,
  });
  await expect(review).toHaveCount(0);
  const outputNavigation = page.getByRole("spinbutton", { name: "Current page", exact: true });
  await outputNavigation.fill("2");
  await outputNavigation.press("Enter");
  await expect(page.getByRole("img", { name: "Generated PDF page 2", exact: true })).toBeInViewport();
  const pending = page.waitForEvent("download");
  await download.click();
  const saved = await pending;
  const result = await PDFDocument.load(await readFile((await saved.path())!));
  expect(result.getPageCount()).toBe(4);
  expect(result.getPage(0).getCropBox()).toEqual({ x: 0, y: 0, width: 595.2756, height: 841.8898 });
  for (const sheet of result.getPages().slice(1))
    expect(sheet.getCropBox()).toEqual({ x: 36, y: 36, width: 523, height: 770 });
  await page.getByTestId("tool-workspace-content").screenshot({ path: `/tmp/crop-complete-${info.project.name}.png` });
  await page.getByRole("button", { name: "Edit crop", exact: true }).click();
  await expect(review).toBeEnabled();
  await expect(width).toHaveValue("523");
  await review.click();
  await expect(download).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Crop another PDF", exact: true }).click();
  await expect(review).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("crop preview recovers from an invalid file and reseeds replacement geometry", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/media/crop-pdf");
  await page.waitForLoadState("networkidle");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("Not a PDF"),
    });
  await expect(page.getByText("Unable to open PDF", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByRole("button", { name: "Crop PDF", exact: true })).toBeDisabled();
  const document = await PDFDocument.create();
  document.addPage([400, 600]);
  const replace = async (pdf: PDFDocument, name: string) => {
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) });
  };
  await replace(document, "small.pdf");
  const width = page.getByRole("spinbutton", { name: "Width", exact: true });
  await expect(width).toHaveValue("400");
  await width.fill("250");
  const bigger = await PDFDocument.create();
  bigger.addPage([595, 842]);
  bigger.addPage([500, 700]);
  await replace(bigger, "mixed.pdf");
  await expect(width).toHaveValue("500");
  await expect(page.getByRole("spinbutton", { name: "Height", exact: true })).toHaveValue("700");
  await expect(page.getByRole("button", { name: "Crop PDF", exact: true })).toBeEnabled();
});
