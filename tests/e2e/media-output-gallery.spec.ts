import { expect, test } from "@playwright/test";
import { PDFDocument, rgb } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

for (const extension of ["jpg", "png"] as const) {
  test(`PDF to ${extension.toUpperCase()} has integrated per-file actions, a scrolling grid and full-screen navigation`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const pdf = await PDFDocument.create();
    for (let index = 0; index < 12; index++) {
      const sheet = pdf.addPage([160, 240]);
      sheet.drawRectangle({
        x: 0,
        y: 0,
        width: 160,
        height: 240,
        color: rgb(index / 12, 0.3, 0.6),
      });
      sheet.drawText(`Page ${index + 1}`, { x: 20, y: 120, size: 20, color: rgb(1, 1, 1) });
    }
    await page.goto(`${process.env.MEDIA_E2E_URL ?? "http://localhost:3000/media"}/pdf-to-${extension}`);
    await page.waitForLoadState("networkidle");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "pages.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(await pdf.save()),
      });
    await page.getByRole("button", { name: `Convert to ${extension.toUpperCase()}`, exact: true }).click();
    const grid = page.getByRole("region", { name: "Generated image previews" });
    await expect(grid).toBeVisible({ timeout: 60_000 });
    const cards = grid.getByRole("article");
    await expect(cards).toHaveCount(12);
    const first = cards.first();
    const preview = first.getByRole("button", { name: /^Open preview of/ });
    await preview.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const fullImage = dialog.locator('img[alt]:not([alt=""])');
    await expect.poll(() => fullImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    const firstPreviewDownloadEvent = page.waitForEvent("download");
    await dialog.getByRole("button", { name: `Download pages-page-01.${extension}`, exact: true }).click();
    const firstPreviewDownload = await firstPreviewDownloadEvent;
    expect(firstPreviewDownload.suggestedFilename()).toBe(`pages-page-01.${extension}`);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^Preview image 2:/ }).click();
    await expect(dialog).toContainText("2 of 12");
    const secondPreviewDownloadEvent = page.waitForEvent("download");
    const previewDownload = dialog.getByRole("button", {
      name: `Download pages-page-02.${extension}`,
      exact: true,
    });
    await previewDownload.click();
    const secondPreviewDownload = await secondPreviewDownloadEvent;
    expect(secondPreviewDownload.suggestedFilename()).toBe(`pages-page-02.${extension}`);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "100%", exact: true }).click();
    await dialog.getByRole("button", { name: "Fit to screen", exact: true }).click();
    await page.screenshot({ path: `/tmp/media-output-${extension}-fullscreen.png` });
    await expect(previewDownload).toBeInViewport();
    await expect(dialog.getByRole("button", { name: /^Exit preview/ })).toBeInViewport();
    await page.screenshot({ path: `/tmp/media-output-${extension}-download-desktop.png` });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(preview).toBeFocused();
    const singleEvent = page.waitForEvent("download");
    await first.getByRole("button", { name: /^Download / }).click();
    const single = await singleEvent;
    expect(single.suggestedFilename()).toBe(`pages-page-01.${extension}`);
    const archiveEvent = page.waitForEvent("download");
    const zipButton = page.getByRole("button", { name: "Download ZIP", exact: true });
    await zipButton.click();
    const zip = await archiveEvent;
    const entries = unzipSync(new Uint8Array(await readFile((await zip.path())!)));
    expect(Object.keys(entries)).toHaveLength(12);
    expect(Buffer.from(entries[single.suggestedFilename()])).toEqual(await readFile((await single.path())!));
    for (const download of [firstPreviewDownload, secondPreviewDownload]) {
      expect(Buffer.from(entries[download.suggestedFilename()])).toEqual(await readFile((await download.path())!));
    }
    await grid.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect(cards.last()).toBeInViewport();
    await expect(zipButton).toBeInViewport();
    await page.screenshot({ path: `/tmp/media-output-${extension}-gallery-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(grid).toBeVisible();
    await grid.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect(zipButton).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/media-output-${extension}-gallery-mobile.png` });
    await cards
      .nth(1)
      .getByRole("button", { name: /^Open preview of/ })
      .click();
    await expect(previewDownload).toBeInViewport();
    await expect(dialog.getByRole("button", { name: /^Exit preview/ })).toBeInViewport();
    await expect.poll(() => fullImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    const mobileDownloadEvent = page.waitForEvent("download");
    await previewDownload.click();
    const mobileDownload = await mobileDownloadEvent;
    expect(mobileDownload.suggestedFilename()).toBe(`pages-page-02.${extension}`);
    expect(await readFile((await mobileDownload.path())!)).toEqual(
      Buffer.from(entries[mobileDownload.suggestedFilename()]),
    );
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: `/tmp/media-output-${extension}-download-mobile.png` });
  });
}
