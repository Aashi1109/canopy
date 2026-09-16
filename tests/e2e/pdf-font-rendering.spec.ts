import { expect, test } from "@playwright/test";
import { Document, Font, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("PDF image exports preserve embedded font glyphs", async ({ page }) => {
  test.setTimeout(120_000);
  Font.register({
    family: "EmbeddedRegression",
    src: resolve("node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf"),
  });
  const pdf = await renderToBuffer(
    createElement(
      Document,
      null,
      createElement(
        Page,
        { size: [360, 160], style: { padding: 20 } },
        createElement(
          Text,
          { style: { fontFamily: "EmbeddedRegression", fontSize: 26 } },
          "Readable embedded text\nHello World 12345",
        ),
      ),
    ),
  );

  // Render the same embedded font with the browser document's native font set
  // as a reference; nonwhite-pixel checks alone also pass for missing-glyph boxes.
  await page.route("**/__pdf-font-test/pdf.mjs", (route) =>
    route.fulfill({
      path: resolve("node_modules/pdfjs-dist/legacy/build/pdf.mjs"),
      contentType: "text/javascript",
    }),
  );
  await page.route("**/__pdf-font-test/pdf.worker.mjs", (route) =>
    route.fulfill({
      path: resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
      contentType: "text/javascript",
    }),
  );

  for (const extension of ["jpg", "png"] as const) {
    await page.goto(`${process.env.MEDIA_E2E_URL ?? "http://localhost:3000/media"}/pdf-to-${extension}`);
    await page.waitForLoadState("networkidle");
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "embedded-font.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await page.getByRole("button", { name: `Convert to ${extension.toUpperCase()}`, exact: true }).click();
    const output = page.getByRole("region", { name: "Generated image previews" });
    await expect(output).toBeVisible({ timeout: 60_000 });
    const downloadEvent = page.waitForEvent("download");
    await output.getByRole("button", { name: /^Download / }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
    const exported = await readFile((await download.path())!);
    const overlap = await page.evaluate(
      async ({ pdfBytes, imageBytes, extension }) => {
        const moduleUrl = "/__pdf-font-test/pdf.mjs";
        const pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs") = await import(moduleUrl);
        pdfjs.GlobalWorkerOptions.workerSrc = "/__pdf-font-test/pdf.worker.mjs";
        const documentTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes) });
        const document = await documentTask.promise;
        try {
          const pdfPage = await document.getPage(1);
          const viewport = pdfPage.getViewport({ scale: 150 / 72 });
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d")!;
          await pdfPage.render({ canvas, canvasContext: context, viewport, background: "#ffffff" }).promise;
          const reference = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const bitmap = await createImageBitmap(
            new Blob([new Uint8Array(imageBytes)], {
              type: extension === "jpg" ? "image/jpeg" : "image/png",
            }),
          );
          if (bitmap.width !== canvas.width || bitmap.height !== canvas.height) return 0;
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          const actual = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let intersection = 0;
          let union = 0;
          for (let index = 0; index < actual.length; index += 4) {
            const expectedInk = reference[index] < 128;
            const actualInk = actual[index] < 128;
            if (expectedInk || actualInk) union++;
            if (expectedInk && actualInk) intersection++;
          }
          return union ? intersection / union : 0;
        } finally {
          await documentTask.destroy();
        }
      },
      { pdfBytes: [...pdf], imageBytes: [...exported], extension },
    );
    expect(overlap, `${extension} glyph shapes must match native PDF rendering`).toBeGreaterThan(0.98);
  }
});
