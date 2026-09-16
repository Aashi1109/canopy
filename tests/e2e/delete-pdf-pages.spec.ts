import { expect, test, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";

test("Delete PDF Pages previews the generated remaining pages and clears stale output after changes", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const sourceDocument = await PDFDocument.create();
  const colors = [rgb(0.9, 0.1, 0.1), rgb(0.1, 0.9, 0.1), rgb(0.1, 0.1, 0.9)];
  for (let number = 1; number <= 3; number++) {
    const sheet = sourceDocument.addPage([200 + number * 10, 300]);
    sheet.drawRectangle({
      x: 0,
      y: 0,
      width: sheet.getWidth(),
      height: 300,
      color: colors[number - 1],
    });
    sheet.drawText(`Source page ${number}`, { x: 20, y: 150, size: 18, color: rgb(1, 1, 1) });
  }
  const sourceFile = {
    name: "source.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await sourceDocument.save()),
  };
  await page.goto("/media/delete-pdf-pages");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').first().setInputFiles(sourceFile);
  const source = page.getByRole("region", { name: "Pages to delete", exact: true });
  await expect(source.getByRole("button", { name: "Select page 2", exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await source.getByRole("button", { name: "Select page 2", exact: true }).click();
  const remove = page.getByRole("button", { name: "Delete pages", exact: true });
  const output = page.getByRole("region", { name: "Processed output", exact: true });
  const preview = output.getByRole("region", { name: "Generated PDF", exact: true });
  const download = output.getByRole("button", { name: "Download file", exact: true });

  async function expectPage(
    surface: Locator,
    number: number,
    color: "red" | "blue",
    count: number,
  ) {
    const current = surface.getByRole("spinbutton", { name: "Current page", exact: true });
    await expect(current).toHaveAttribute("max", String(count), { timeout: 60_000 });
    await current.fill(String(number));
    await current.press("Enter");
    const image = surface.getByRole("img", { name: `Generated PDF page ${number}`, exact: true });
    await expect(image).toBeInViewport();
    await expect.poll(async () => (await image.boundingBox())?.height ?? 0).toBeGreaterThan(120);
    await expect
      .poll(() =>
        image.evaluate((node: HTMLImageElement) => {
          if (!node.naturalWidth) return "loading";
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 20;
          const context = canvas.getContext("2d")!;
          context.drawImage(node, 0, 0);
          const [red, , blue] = context.getImageData(4, 4, 1, 1).data;
          return red > blue + 100 ? "red" : blue > red + 100 ? "blue" : "other";
        }),
      )
      .toBe(color);
  }
  async function expectDownloaded(widths: number[]) {
    await expect(download).toBeVisible({ timeout: 60_000 });
    const downloading = page.waitForEvent("download");
    await download.click();
    const artifact = await downloading;
    expect(artifact.suggestedFilename()).toBe("source-pages-deleted.pdf");
    const document = await PDFDocument.load(await readFile((await artifact.path())!));
    expect(document.getPages().map((sheet) => sheet.getWidth())).toEqual(widths);
  }

  await remove.click();
  await expectPage(preview, 1, "red", 2);
  await expectPage(preview, 2, "blue", 2);
  await output.screenshot({ path: `/tmp/delete-pdf-generated-${testInfo.project.name}.png` });
  const expand = preview.getByRole("button", { name: "Expand preview", exact: true });
  await expand.click();
  const dialog = page.getByRole("dialog");
  await expectPage(dialog, 2, "blue", 2);
  await page.screenshot({ path: `/tmp/delete-pdf-fullscreen-${testInfo.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(expand).toBeFocused();
  await expectDownloaded([210, 230]);
  await source
    .getByRole("button", { name: "Deselect page 2", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    source.getByRole("button", { name: "Deselect page 2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(download).toBeVisible();

  await source.getByRole("button", { name: "Select page 1", exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(download).toHaveCount(0);
  await remove.click();
  await expectPage(preview, 1, "blue", 1);
  await output.screenshot({
    path: `/tmp/delete-pdf-single-generated-${testInfo.project.name}.png`,
  });
  await expectDownloaded([230]);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(download).toHaveCount(0);
  await page.locator('input[type="file"]').first().setInputFiles(sourceFile);
  await expect(source.getByRole("button", { name: "Select page 2", exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await source.getByRole("button", { name: "Select page 2", exact: true }).click();
  await remove.click();
  await expectPage(preview, 2, "blue", 2);
  await expectDownloaded([210, 230]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
