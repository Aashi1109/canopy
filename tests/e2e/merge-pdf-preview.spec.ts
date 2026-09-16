import { expect, test, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";

test("merged PDF previews the selected file order and clears stale output after editing", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const createObjectURL = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      const url = createObjectURL(blob);
      if (blob instanceof Blob) sessionStorage.setItem(url, blob.type);
      return url;
    };
  });
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgba(0, 0, 0, 0.5)";
    context.fillRect(0, 0, 512, 512);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const files = [];
  for (const [name, color] of [
    ["red.pdf", rgb(0.9, 0.1, 0.1)],
    ["blue.pdf", rgb(0.1, 0.1, 0.9)],
  ] as const) {
    const document = await PDFDocument.create();
    const sheet = document.addPage([200, 300]);
    sheet.drawRectangle({ x: 0, y: 0, width: 200, height: 300, color });
    // Image downscaling and alpha masks require scratch canvases in the worker.
    sheet.drawImage(await document.embedPng(Buffer.from(png, "base64")), {
      x: 10,
      y: 10,
      width: 40,
      height: 40,
    });
    files.push({ name, mimeType: "application/pdf", buffer: Buffer.from(await document.save()) });
  }
  await page.goto("/media/merge-pdf");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').first().setInputFiles(files);
  await expect(page.getByRole("button", { name: "Remove blue.pdf", exact: true })).toBeVisible();
  const merge = page.getByRole("button", { name: "Merge PDFs", exact: true });
  const output = page.getByRole("region", { name: "Processed output", exact: true });
  const preview = output.getByRole("region", { name: "Generated PDF", exact: true });
  const currentPage = preview.getByRole("spinbutton", { name: "Current page" });
  const download = output.getByRole("button", { name: "Download file", exact: true });
  async function expectPageColor(pageNumber: number, color: "red" | "blue") {
    await expect(currentPage).toBeVisible({ timeout: 60_000 });
    await currentPage.fill(String(pageNumber));
    await currentPage.press("Enter");
    const image = preview.getByRole("img", {
      name: `Generated PDF page ${pageNumber}`,
      exact: true,
    });
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((node: HTMLImageElement) => {
          if (!node.naturalWidth) return "loading";
          const canvas = document.createElement("canvas");
          canvas.width = node.naturalWidth;
          canvas.height = node.naturalHeight;
          const context = canvas.getContext("2d")!;
          context.drawImage(node, 0, 0);
          const [red, , blue] = context.getImageData(
            canvas.width / 2,
            canvas.height / 2,
            1,
            1,
          ).data;
          return red > blue + 100 ? "red" : blue > red + 100 ? "blue" : "other";
        }),
      )
      .toBe(color);
  }
  async function wheelToPage(surface: Locator, delta: number, pageNumber: number) {
    const showOutline = surface.getByRole("button", { name: "Show outline", exact: true });
    if (await showOutline.isVisible()) await showOutline.click();
    await surface.getByRole("region", { name: "PDF pages", exact: true }).hover();
    await page.mouse.wheel(0, delta);
    await expect(surface.getByRole("spinbutton", { name: "Current page" })).toHaveValue(
      String(pageNumber),
    );
    await expect(
      surface
        .getByRole("listbox", { name: "Document outline" })
        .getByRole("option", { selected: true }),
    ).toContainText(`Page ${pageNumber}`);
    await expect(
      surface.getByRole("img", { name: `Generated PDF page ${pageNumber}`, exact: true }),
    ).toBeInViewport();
  }
  await merge.click();
  await expectPageColor(1, "red");
  await expect(currentPage).toHaveAttribute("max", "2");
  await expectPageColor(2, "blue");
  await preview.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(preview.getByLabel("Zoom level")).toHaveText("110%");
  await wheelToPage(preview, -100_000, 1);
  await wheelToPage(preview, 100_000, 2);
  const expand = preview.getByRole("button", { name: "Expand preview", exact: true });
  await expand.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("spinbutton", { name: "Current page" })).toHaveValue("2");
  await expect(
    dialog.getByRole("img", { name: "Generated PDF page 2", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Fit page", exact: true }).click();
  await expect(dialog.getByLabel("Zoom level")).toHaveText("100%");
  await wheelToPage(dialog, -100_000, 1);
  await wheelToPage(dialog, 100_000, 2);
  await dialog.getByRole("option", { name: "Page 1 1", exact: true }).click();
  await expect(dialog.getByRole("spinbutton", { name: "Current page" })).toHaveValue("1");
  await expect(
    dialog.getByRole("img", { name: "Generated PDF page 1", exact: true }),
  ).toBeInViewport();
  const modalPage = dialog.getByRole("spinbutton", { name: "Current page" });
  const pageScroller = dialog.getByRole("region", { name: "PDF pages", exact: true });
  const pageStart = await pageScroller.evaluate((node) => node.scrollTop);
  await pageScroller.hover();
  await page.mouse.wheel(0, 100);
  await expect
    .poll(() => pageScroller.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(pageStart);
  await expect(modalPage).toHaveValue("1");
  await dialog.getByRole("option", { name: "Page 1 1", exact: true }).click();
  await expect.poll(() => pageScroller.evaluate((node) => node.scrollTop)).toBe(pageStart);
  await pageScroller.hover();
  await page.mouse.wheel(0, 100);
  await expect
    .poll(() => pageScroller.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(pageStart);
  await modalPage.fill("1");
  await modalPage.press("Enter");
  await expect.poll(() => pageScroller.evaluate((node) => node.scrollTop)).toBe(pageStart);
  await expect(
    dialog.getByRole("img", { name: "Generated PDF page 1", exact: true }),
  ).toBeVisible();
  const scrollBounds = (await pageScroller.boundingBox())!;
  const nextPageBounds = (await dialog
    .getByRole("img", { name: "Generated PDF page 2", exact: true })
    .boundingBox())!;
  await pageScroller.hover();
  await page.mouse.wheel(0, nextPageBounds.y - scrollBounds.y - scrollBounds.height / 2);
  await expect(
    dialog.getByRole("img", { name: "Generated PDF page 1", exact: true }),
  ).toBeInViewport();
  await expect(
    dialog.getByRole("img", { name: "Generated PDF page 2", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: `/tmp/pdf-continuous-seam-${testInfo.project.name}.png` });
  await modalPage.fill("2");
  await modalPage.press("Enter");
  const expandedImage = dialog.getByRole("img", { name: "Generated PDF page 2", exact: true });
  await expect(expandedImage).toBeInViewport();
  await expect
    .poll(() => expandedImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      expandedImage.evaluate(
        (image: HTMLImageElement) =>
          image.naturalWidth >= Math.floor(image.getBoundingClientRect().width * devicePixelRatio),
      ),
    )
    .toBe(true);
  expect(
    await expandedImage.evaluate((image: HTMLImageElement) => sessionStorage.getItem(image.src)),
  ).toBe("image/png");
  const normalResolution = await expandedImage.evaluate(
    (image: HTMLImageElement) => image.naturalWidth,
  );
  const normalWidth = (await expandedImage.boundingBox())!.width;
  for (let index = 0; index < 10; index++)
    await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(dialog.getByLabel("Zoom level")).toHaveText("200%");
  await expect
    .poll(async () => (await expandedImage.boundingBox())!.width)
    .toBeGreaterThan(normalWidth * 1.9);
  await expect
    .poll(() =>
      expandedImage.evaluate(
        (image: HTMLImageElement) =>
          image.naturalWidth >= Math.floor(image.getBoundingClientRect().width * devicePixelRatio),
      ),
    )
    .toBe(true);
  expect(
    await expandedImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(normalResolution);
  await expect
    .poll(() => pageScroller.evaluate((node) => node.scrollWidth > node.clientWidth))
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await wheelToPage(dialog, -100_000, 1);
  await wheelToPage(dialog, 100_000, 2);
  await dialog.getByRole("button", { name: "Fit page", exact: true }).click();
  await expect(dialog.getByLabel("Zoom level")).toHaveText("100%");
  const modalDownloadEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download red-merged.pdf", exact: true }).click();
  const modalArtifact = await modalDownloadEvent;
  expect(modalArtifact.suggestedFilename()).toBe("red-merged.pdf");
  expect(
    (await PDFDocument.load(await readFile((await modalArtifact.path())!))).getPageCount(),
  ).toBe(2);
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: `/tmp/merge-pdf-expanded-${testInfo.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(expand).toBeFocused();
  await expect(currentPage).toHaveValue("2");
  const downloadEvent = page.waitForEvent("download");
  await download.click();
  const artifact = await downloadEvent;
  expect(artifact.suggestedFilename()).toBe("red-merged.pdf");
  expect((await PDFDocument.load(await readFile((await artifact.path())!))).getPageCount()).toBe(2);
  expect(await readFile((await artifact.path())!)).toEqual(
    await readFile((await modalArtifact.path())!),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const firstHandle = page.getByRole("button", { name: "Drag red.pdf to reorder", exact: true });
  const handle = page.getByRole("button", { name: "Drag blue.pdf to reorder", exact: true });
  await firstHandle.scrollIntoViewIfNeeded();
  await handle.scrollIntoViewIfNeeded();
  await expect(firstHandle).toBeInViewport();
  await expect(handle).toBeInViewport();
  await handle.focus();
  await handle.press("Space");
  await expect(
    page.getByRole("status").filter({ hasText: "blue.pdf is over position 2 of 2." }),
  ).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await handle.press("ArrowUp");
  await expect(
    page.getByRole("status").filter({ hasText: "blue.pdf is over position 1 of 2." }),
  ).toBeVisible();
  await handle.press("Space");
  await expect(preview).toHaveCount(0);
  await expect(download).toHaveCount(0);
  await merge.click();
  await expectPageColor(1, "blue");
  await expectPageColor(2, "red");
  const reorderedDownloadEvent = page.waitForEvent("download");
  await download.click();
  const reorderedArtifact = await reorderedDownloadEvent;
  expect(reorderedArtifact.suggestedFilename()).toBe("blue-merged.pdf");
  expect(
    (await PDFDocument.load(await readFile((await reorderedArtifact.path())!))).getPageCount(),
  ).toBe(2);
  await output.screenshot({ path: `/tmp/merge-pdf-${testInfo.project.name}.png` });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `/tmp/merge-pdf-layout-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Remove blue.pdf", exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(download).toHaveCount(0);
});

test("continuous PDF preview reloads earlier pages after browsing a long document", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const files = [];
  for (const count of [29, 1]) {
    const document = await PDFDocument.create();
    for (let index = 0; index < count; index++) {
      document
        .addPage([200, 300])
        .drawRectangle({ x: 0, y: 0, width: 200, height: 300, color: rgb(0.8, 0.1, 0.1) });
    }
    files.push({
      name: `pages-${count}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from(await document.save()),
    });
  }
  await page.goto("/media/merge-pdf");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').first().setInputFiles(files);
  await page.getByRole("button", { name: "Merge PDFs", exact: true }).click();
  const preview = page.getByRole("region", { name: "Generated PDF", exact: true });
  await expect(preview.getByRole("img", { name: "Generated PDF page 1", exact: true })).toBeVisible(
    { timeout: 60_000 },
  );
  await preview.getByRole("button", { name: "Expand preview", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const currentPage = dialog.getByRole("spinbutton", { name: "Current page" });
  const showOutline = dialog.getByRole("button", { name: "Show outline", exact: true });
  if (await showOutline.isVisible()) await showOutline.click();
  await expect(currentPage).toHaveAttribute("max", "30");
  for (let index = 0; index < 10; index++)
    await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(dialog.getByLabel("Zoom level")).toHaveText("200%");
  for (const number of [...Array.from({ length: 30 }, (_, index) => index + 1), 1]) {
    await currentPage.fill(String(number));
    await currentPage.press("Enter");
    const image = dialog.getByRole("img", { name: `Generated PDF page ${number}`, exact: true });
    await expect(image).toBeInViewport();
    await expect
      .poll(() =>
        image.evaluate(
          (node: HTMLImageElement) =>
            node.naturalWidth >= Math.floor(node.getBoundingClientRect().width * devicePixelRatio),
        ),
      )
      .toBe(true);
  }
  await expect(currentPage).toHaveValue("1");
  await expect(
    dialog
      .getByRole("listbox", { name: "Document outline" })
      .getByRole("option", { selected: true }),
  ).toContainText("Page 1");
});
