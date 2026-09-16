import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

test("rotate PDF previews selected angles and downloads only the selected page rotation", async ({ page }, info) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]).drawText("First page", { x: 80, y: 700 });
  pdf.addPage([595, 842]).drawText("Second page", { x: 80, y: 700 });
  await page.goto("/media/rotate-pdf-pages");
  await page.waitForLoadState("networkidle");
  const run = page.getByRole("button", { name: "Rotate pages", exact: true });
  await expect(run).toBeDisabled();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "rotation.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await pdf.save()),
    });
  await expect(run).toBeEnabled({ timeout: 60000 });
  await page.getByRole("button", { name: "180°", exact: true }).click();
  await page.getByRole("combobox", { name: "Apply to", exact: true }).click();
  await page.getByRole("option", { name: "Custom pages", exact: true }).click();
  await expect(run).toBeDisabled();
  await page.getByRole("textbox", { name: "Page range", exact: true }).fill("2");
  await expect(run).toBeEnabled();
  await page.screenshot({ path: `/tmp/rotate-edit-${info.project.name}.png` });
  await run.click();
  const download = page.getByRole("button", { name: "Download rotation-rotated.pdf", exact: true });
  await expect(download).toBeVisible({ timeout: 60000 });
  const pending = page.waitForEvent("download");
  await download.click();
  const saved = await pending;
  const output = await PDFDocument.load(await readFile((await saved.path())!));
  expect(output.getPage(0).getRotation().angle).toBe(0);
  expect(output.getPage(1).getRotation().angle).toBe(180);
  await page.getByRole("button", { name: "Edit rotation", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/rotate-result-${info.project.name}.png` });
  await page.getByRole("button", { name: "Edit rotation", exact: true }).click();
  await expect(run).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
