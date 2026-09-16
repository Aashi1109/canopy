import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const PLATFORM_ORIGIN = process.env.PLATFORM_E2E_ORIGIN ?? "http://localhost:3000";
const MEDIA_URL = process.env.MEDIA_E2E_URL ?? `${PLATFORM_ORIGIN}/media`;
const requireFromMedia = createRequire(new URL("../../package.json", import.meta.url));

test("Media Tools is discoverable and unknown routes fail closed", async ({ page }) => {
  await page.goto(PLATFORM_ORIGIN);
  await page.getByRole("link", { name: "Open Media Tools", exact: true }).click();
  await expect(page).toHaveURL(MEDIA_URL);
  await expect(
    page.getByRole("heading", { name: "Edit media without sending it anywhere." }),
  ).toBeVisible();

  await page.getByRole("searchbox", { name: "Search media tools" }).fill("JPG to PNG");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name: /JPG to PNG/ }).click();
  await expect(page).toHaveURL(`${MEDIA_URL}/jpg-to-png`);
  await expect(page.getByRole("heading", { level: 1, name: "JPG to PNG" })).toBeVisible();
  await expect(page.getByText("Files never leave your device.")).toBeVisible();

  const unknown = await page.goto(`${MEDIA_URL}/not-a-media-tool`);
  expect(unknown?.status()).toBe(404);
  const reserved = await page.goto(`${MEDIA_URL}/api`);
  expect(reserved?.status()).toBe(404);
});

test("Media tool pages use the shared outer chrome", async ({ page }) => {
  await page.goto(`${MEDIA_URL}/jpg-to-png`);

  const siteHeader = page.locator("header").first();
  const main = page.locator("main");
  const breadcrumb = main.getByRole("navigation", { name: "Breadcrumb" });
  const title = main.getByRole("heading", {
    level: 1,
    name: "JPG to PNG",
    exact: true,
  });
  const workbench = breadcrumb.locator("xpath=following-sibling::div[1]");

  await expect(siteHeader).toContainText("Media Tools");
  await expect(siteHeader).toContainText("by SmartTools");
  await expect(breadcrumb.getByRole("link", { name: "All tools" })).toBeVisible();
  await expect(breadcrumb.getByRole("link", { name: "Image Conversion" })).toBeVisible();
  await expect(breadcrumb).toContainText("JPG to PNG");
  await expect(main.getByText("Runs locally", { exact: true })).toBeVisible();
  await expect(title).toBeVisible();
  await expect(main.getByRole("heading", { name: "Private by default" })).toBeVisible();
  await expect(main.getByText("Files never leave your device.", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Media Tools footer" })).toContainText(
    "All Media Tools",
  );

  const [workbenchBounds, breadcrumbBounds, titleBounds] = await Promise.all([
    workbench.boundingBox(),
    breadcrumb.boundingBox(),
    title.boundingBox(),
  ]);
  expect(workbenchBounds).not.toBeNull();
  expect(breadcrumbBounds).not.toBeNull();
  expect(titleBounds).not.toBeNull();
  expect(Math.abs(workbenchBounds!.x - breadcrumbBounds!.x)).toBeLessThan(2);
  expect(Math.abs(titleBounds!.x - breadcrumbBounds!.x)).toBeLessThan(2);
});

test("JPG to PNG can cancel, retry, and download without an upload request", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop covers worker processing.");
  test.setTimeout(90_000);
  await page.goto(`${MEDIA_URL}/jpg-to-png`);
  const jpeg = await createJpegFixture(page, 1024, 768);
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "local-fixture.jpg",
    mimeType: "image/jpeg",
    buffer: jpeg,
  });
  await expect(page.getByRole("list", { name: "Selected files" })).toContainText(
    "local-fixture.jpg",
  );
  await expect(page.getByRole("button", { name: "Add files", exact: true })).toBeVisible();

  const requests: { bodyBytes: number; method: string; url: string }[] = [];
  page.on("request", (request) => {
    requests.push({
      bodyBytes: request.postDataBuffer()?.byteLength ?? 0,
      method: request.method(),
      url: request.url(),
    });
  });

  await processButton(page, "JPG to PNG").click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Ready to download" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/1 output file ·/)).toBeVisible();
  const link = page.getByRole("link", { name: "Download", exact: true });
  await expect(link).toHaveAttribute("download", "local-fixture-converted.png");
  const downloaded = await readDownload(page, link);
  const output = await inspectImageBytes(page, downloaded.bytes, "image/png");
  expect(output).toEqual({
    height: 768,
    mime: "image/png",
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    width: 1024,
  });

  expect(downloaded.suggestedFilename).toBe("local-fixture-converted.png");

  expect(requests.some(({ url }) => new URL(url).origin !== new URL(MEDIA_URL).origin)).toBe(false);
  expect(requests.filter(({ method }) => !["GET", "HEAD"].includes(method))).toEqual([]);
  expect(requests.filter(({ bodyBytes }) => bodyBytes > 0)).toEqual([]);
  expect(requests.some(({ url }) => new URL(url).pathname.startsWith("/api/"))).toBe(false);
});

test("file selection and drag ordering work without arrow controls or mobile overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${MEDIA_URL}/jpg-to-png`);
  const first = await createJpegFixture(page, 8, 6, "#ef4444");
  const second = await createJpegFixture(page, 8, 6, "#2563eb");
  const dropZone = page.getByRole("button", { name: /Choose or drop local files/ });
  await expect(
    page.getByText("JPG · 50 files max · 25 MiB each · 100 MiB total", {
      exact: true,
    }),
  ).toBeVisible();
  await dropZone.focus();
  await expect(dropZone).toBeFocused();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  const chooser = await chooserPromise;
  await chooser.setFiles([
    { name: "first.jpg", mimeType: "image/jpeg", buffer: first },
    { name: "second.jpg", mimeType: "image/jpeg", buffer: second },
  ]);

  const files = page.getByRole("list", { name: "Selected files" });
  await expect(page.locator('input[type="file"]').first()).toHaveValue("");
  await expect(files.getByRole("listitem")).toHaveCount(2);
  await expect(dropZone).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add files", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Move .* (?:up|down)/ })).toHaveCount(0);
  await dragReorderHandle(page, "Drag second.jpg to reorder", "Drag first.jpg to reorder");
  await expect(files.getByRole("listitem").first()).toContainText("second.jpg");

  const keyboardHandle = page.getByRole("button", {
    name: "Drag first.jpg to reorder",
  });
  await keyboardHandle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");
  await expect(files.getByRole("listitem").first()).toContainText("first.jpg");
  await expect(page.locator('[role="status"]')).toContainText(
    "Dropped first.jpg at position 1 of 2.",
  );

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test("structural PDF merge follows the displayed file order", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${MEDIA_URL}/merge-pdf`);
  const first = await createMultiPagePdfFixture([
    { height: 310, width: 210 },
    { height: 320, width: 220 },
  ]);
  const second = await createMultiPagePdfFixture([{ height: 430, width: 330 }]);

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([
      { name: "first.pdf", mimeType: "application/pdf", buffer: first },
      { name: "second.pdf", mimeType: "application/pdf", buffer: second },
    ]);
  await dragReorderHandle(page, "Drag second.pdf to reorder", "Drag first.pdf to reorder");
  await expect(
    page.getByRole("list", { name: "Selected files" }).getByRole("listitem").first(),
  ).toContainText("second.pdf");
  await page.waitForTimeout(250);

  await processButton(page, "Merge PDF").click();
  const link = page.getByRole("link", { name: "Download", exact: true });
  await expect(link).toHaveAttribute("download", "second-merged.pdf", {
    timeout: 60_000,
  });

  const { bytes } = await readDownload(page, link);
  const { PDFDocument } = requireFromMedia("pdf-lib") as typeof import("pdf-lib");
  const merged = await PDFDocument.load(Buffer.from(bytes));
  expect(
    merged.getPages().map((pdfPage) => {
      const { height, width } = pdfPage.getSize();
      return { height: Math.round(height), width: Math.round(width) };
    }),
  ).toEqual([
    { height: 430, width: 330 },
    { height: 310, width: 210 },
    { height: 320, width: 220 },
  ]);
});

test("PDF page ordering uses drag handles without arrow controls", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${MEDIA_URL}/reorder-pdf-pages`);
  const source = await createMultiPagePdfFixture([
    { height: 310, width: 210 },
    { height: 320, width: 220 },
    { height: 330, width: 230 },
  ]);
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "pages.pdf",
    mimeType: "application/pdf",
    buffer: source,
  });

  const pages = page.getByRole("list", { name: "PDF pages" });
  await expect(page.getByRole("button", { name: "Drag page 3 to reorder" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: /Move page .* (?:earlier|later)/ })).toHaveCount(0);
  await dragReorderHandle(page, "Drag page 3 to reorder", "Drag page 1 to reorder");
  await expect(pages.getByRole("listitem").first()).toContainText("Page 3");
});

test("PDF to PNG renders selected pages into a zero-padded ZIP", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${MEDIA_URL}/pdf-to-png`);
  const source = await createMultiPagePdfFixture([
    { height: 72, width: 72 },
    { height: 72, width: 144 },
    { height: 144, width: 72 },
  ]);
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "raster-pages.pdf",
    mimeType: "application/pdf",
    buffer: source,
  });
  await page.getByRole("textbox", { name: "Pages", exact: true }).fill("1,3");
  await page.getByRole("combobox", { name: "Background", exact: true }).selectOption("transparent");

  await processButton(page, "PDF to PNG").click();
  const link = page.getByRole("link", { name: "Download", exact: true });
  await expect(link).toHaveAttribute("download", "raster-pages-pages.zip", {
    timeout: 60_000,
  });

  const { bytes } = await readDownload(page, link);
  const { unzipSync } = requireFromMedia("fflate") as {
    unzipSync(data: Uint8Array): Record<string, Uint8Array>;
  };
  const entries = unzipSync(Uint8Array.from(bytes));
  expect(Object.keys(entries).sort()).toEqual([
    "raster-pages-page-01.png",
    "raster-pages-page-03.png",
  ]);
  for (const entry of Object.values(entries)) {
    expect([...entry.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
});

test("Media responses enforce security headers and serve qpdf locally", async ({ request }) => {
  const response = await request.get(`${MEDIA_URL}/compress-pdf`);
  expect(response.status()).toBe(200);
  const headers = response.headers();
  const csp = headers["content-security-policy"];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("'wasm-unsafe-eval'");
  expect(csp).toContain("worker-src 'self' blob:");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["permissions-policy"]).toContain("camera=()");
  if (process.env.MEDIA_E2E_PRODUCTION === "1") {
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("connect-src 'self' ws: http:");
  }

  const [script, wasm] = await Promise.all([
    request.get(`${MEDIA_URL}/vendor/qpdf/qpdf.js`),
    request.get(`${MEDIA_URL}/vendor/qpdf/qpdf.wasm`),
  ]);
  expect(script.status()).toBe(200);
  expect((await script.text()).length).toBeGreaterThan(1_000);
  expect(wasm.status()).toBe(200);
  expect([...(await wasm.body()).subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
});

test("Preserve Document runs through qpdf and returns an openable PDF", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop covers qpdf processing.");
  test.setTimeout(90_000);
  const qpdfResponses: { status: number; url: string }[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/vendor/qpdf/")) {
      qpdfResponses.push({ status: response.status(), url: response.url() });
    }
  });

  await page.goto(`${MEDIA_URL}/compress-pdf`);
  await expect(page.getByLabel("Compression mode")).toHaveValue("preserve");
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "local-document.pdf",
    mimeType: "application/pdf",
    buffer: createPdfFixture(),
  });
  await processButton(page, "Compress PDF").click();
  await expect(page.getByRole("heading", { name: "Ready to download" })).toBeVisible({
    timeout: 60_000,
  });

  const link = page.getByRole("link", { name: "Download", exact: true });
  const downloadPromise = page.waitForEvent("download");
  await link.click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(200);
  const { PDFDocument } = requireFromMedia("pdf-lib") as typeof import("pdf-lib");
  const parsed = await PDFDocument.load(pdf);
  expect(parsed.getPageCount()).toBe(1);
  expect(
    qpdfResponses.some(
      ({ status, url }) => status === 200 && url.endsWith("/vendor/qpdf/qpdf.wasm"),
    ),
  ).toBe(true);
});

async function dragReorderHandle(page: Page, sourceName: string, targetName: string) {
  const sourceHandle = page.getByRole("button", { name: sourceName });
  const targetHandle = page.getByRole("button", { name: targetName });
  await sourceHandle.scrollIntoViewIfNeeded();
  const source = await sourceHandle.boundingBox();
  const target = await targetHandle.boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();

  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(source!.x + source!.width / 2, source!.y - 8, { steps: 2 });
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
}

function processButton(page: Page, title: string) {
  return page.getByRole("button", {
    name: new RegExp(`^(?:Process files|Run ${escapeRegExp(title)})$`),
  });
}

async function createJpegFixture(page: Page, width: number, height: number, color = "#f97316") {
  const bytes = await page.evaluate(
    async ({ color: fill, height: imageHeight, width: imageWidth }) => {
      const canvas = document.createElement("canvas");
      canvas.width = imageWidth;
      canvas.height = imageHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D is unavailable.");
      context.fillStyle = fill;
      context.fillRect(0, 0, imageWidth, imageHeight);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, Math.max(1, imageWidth / 3), Math.max(1, imageHeight / 3));
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("JPEG encoding failed."))),
          "image/jpeg",
          0.9,
        ),
      );
      return [...new Uint8Array(await blob.arrayBuffer())];
    },
    { color, height, width },
  );
  return Buffer.from(bytes);
}

async function inspectImageBytes(page: Page, bytes: readonly number[], mime: string) {
  const dimensions = await page.evaluate(
    async ({ bytes: values, mime: imageMime }) => {
      const blob = new Blob([Uint8Array.from(values)], { type: imageMime });
      const bitmap = await createImageBitmap(blob);
      const result = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return result;
    },
    { bytes, mime },
  );
  return {
    ...dimensions,
    mime,
    signature: bytes.slice(0, 8),
  };
}

async function readDownload(page: Page, link: ReturnType<Page["getByRole"]>) {
  const downloadPromise = page.waitForEvent("download");
  await link.click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("The browser did not create a download file.");
  return {
    bytes: [...(await readFile(path))],
    suggestedFilename: download.suggestedFilename(),
  };
}

async function createMultiPagePdfFixture(pages: readonly { height: number; width: number }[]) {
  const { PDFDocument, rgb } = requireFromMedia("pdf-lib") as typeof import("pdf-lib");
  const document = await PDFDocument.create();
  pages.forEach(({ height, width }, index) => {
    const pdfPage = document.addPage([width, height]);
    pdfPage.drawRectangle({
      color: rgb((index + 1) / (pages.length + 1), 0.35, 0.65),
      height: Math.max(1, height - 12),
      width: Math.max(1, width - 12),
      x: 6,
      y: 6,
    });
  });
  return Buffer.from(await document.save());
}

function createPdfFixture() {
  const content = "BT /F1 12 Tf 30 100 Td (Local qpdf fixture) Tj ET";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream\nendobj\n`,
  ];
  const header = "%PDF-1.4\n%\u0080\u0081\u0082\u0083\n";
  const offsets: number[] = [];
  let body = header;
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += object;
  }
  const xrefOffset = Buffer.byteLength(body, "latin1");
  const entries = offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
