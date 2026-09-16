import { expect, test, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

test("generated PDF previews its pages and stays downloadable after editing", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("/media/image-to-pdf");
  await page.waitForLoadState("networkidle");
  const images = await page.evaluate(() =>
    ["#e04040", "#3050d0"].map((color) => {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 600;
      const context = canvas.getContext("2d")!;
      context.fillStyle = color;
      context.fillRect(0, 0, 400, 600);
      return canvas.toDataURL("image/png").split(",")[1];
    }),
  );
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(
      images.map((data, index) => ({
        name: `page-${index + 1}.png`,
        mimeType: "image/png",
        buffer: Buffer.from(data, "base64"),
      })),
    );
  await expect(page.getByRole("button", { name: "Remove page-2.png" })).toBeVisible();
  await page.getByRole("button", { name: "Create PDF", exact: true }).click();
  const output = page.getByRole("region", { name: "Processed output", exact: true });
  const preview = output.getByRole("region", { name: "Generated PDF", exact: true });
  async function wheelToPage(surface: Locator, delta: number, pageNumber: number) {
    const showOutline = surface.getByRole("button", { name: "Show outline", exact: true });
    if (await showOutline.isVisible()) await showOutline.click();
    await surface.getByRole("region", { name: "PDF pages", exact: true }).hover();
    await page.mouse.wheel(0, delta);
    await expect(surface.getByRole("spinbutton", { name: "Current page" })).toHaveValue(String(pageNumber));
    await expect(
      surface.getByRole("listbox", { name: "Document outline" }).getByRole("option", { selected: true }),
    ).toContainText(`Page ${pageNumber}`);
    await expect(surface.getByRole("img", { name: `Generated PDF page ${pageNumber}`, exact: true })).toBeInViewport();
  }
  const firstPage = preview.getByRole("img", { name: "Generated PDF page 1", exact: true });
  await expect(firstPage).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => firstPage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await preview.getByRole("spinbutton", { name: "Current page" }).fill("2");
  await preview.getByRole("spinbutton", { name: "Current page" }).press("Enter");
  const secondPage = preview.getByRole("img", { name: "Generated PDF page 2", exact: true });
  await expect(secondPage).toBeVisible();
  await expect
    .poll(() =>
      secondPage.evaluate((image: HTMLImageElement) => {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const [red, , blue] = context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
        return blue > red;
      }),
    )
    .toBe(true);
  await preview.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(preview.getByLabel("Zoom level")).toHaveText("110%");
  await wheelToPage(preview, -100_000, 1);
  await wheelToPage(preview, 100_000, 2);
  const expand = preview.getByRole("button", { name: "Expand preview", exact: true });
  await expand.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const modalPage = dialog.getByRole("spinbutton", { name: "Current page" });
  await expect(modalPage).toHaveValue("2");
  await expect(dialog.getByRole("img", { name: "Generated PDF page 2", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Fit page", exact: true }).click();
  await expect(dialog.getByLabel("Zoom level")).toHaveText("100%");
  await wheelToPage(dialog, -100_000, 1);
  await wheelToPage(dialog, 100_000, 2);
  await dialog.getByRole("option", { name: "Page 1 1", exact: true }).click();
  await expect(modalPage).toHaveValue("1");
  await expect(dialog.getByRole("img", { name: "Generated PDF page 1", exact: true })).toBeInViewport();
  await modalPage.fill("1");
  await modalPage.press("Enter");
  await expect(dialog.getByRole("img", { name: "Generated PDF page 1", exact: true })).toBeVisible();
  await modalPage.fill("2");
  await modalPage.press("Enter");
  const expandedImage = dialog.getByRole("img", { name: "Generated PDF page 2", exact: true });
  await expect(expandedImage).toBeInViewport();
  await expect.poll(() => expandedImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const modalDownloadEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download converted-images.pdf", exact: true }).click();
  const modalArtifact = await modalDownloadEvent;
  expect(modalArtifact.suggestedFilename()).toBe("converted-images.pdf");
  expect((await PDFDocument.load(await readFile((await modalArtifact.path())!))).getPageCount()).toBe(2);
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: `/tmp/image-to-pdf-expanded-${testInfo.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(expand).toBeFocused();
  await expect(preview.getByRole("spinbutton", { name: "Current page" })).toHaveValue("2");
  await expect(secondPage).toBeVisible();
  const outputBounds = await output.boundingBox();
  const previewBounds = await preview.boundingBox();
  expect(previewBounds!.x).toBeGreaterThanOrEqual(outputBounds!.x);
  expect(previewBounds!.x + previewBounds!.width).toBeLessThanOrEqual(outputBounds!.x + outputBounds!.width);
  await output.screenshot({ path: `/tmp/image-to-pdf-${testInfo.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download file", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("converted-images.pdf");
  expect((await PDFDocument.load(await readFile((await download.path())!))).getPageCount()).toBe(2);
  expect(await readFile((await download.path())!)).toEqual(await readFile((await modalArtifact.path())!));
  await expect(page.getByRole("button", { name: "Remove page-2.png" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download file", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove page-2.png" }).click();
  await expect(page.getByRole("button", { name: "Download file", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Create PDF", exact: true }).click();
  await expect(preview.getByRole("img", { name: "Generated PDF page 1", exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(preview.getByRole("spinbutton", { name: "Current page" })).toHaveAttribute("max", "1");
});
