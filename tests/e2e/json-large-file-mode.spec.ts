import { expect, test, type Download, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";

const JSON_VIEWER_URL = "/devtools/json-viewer";
const LARGE_TEXT_PREVIEW_BYTES = 256 * 1024;
const LARGE_FILE_THRESHOLD = 2_000_000;

type LargeFileReadAttempts = {
  arrayBuffer: number;
  text: number;
};

declare global {
  interface Window {
    __largeFileReadAttempts: LargeFileReadAttempts;
  }
}

test("JSON Viewer streams a large file without loading it into the page editor", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name.includes("mobile"),
    "Desktop covers large-file processing and downloads.",
  );
  test.setTimeout(90_000);

  await page.addInitScript((largeFileThreshold) => {
    const nativeArrayBuffer = File.prototype.arrayBuffer;
    const nativeText = File.prototype.text;
    const attempts: LargeFileReadAttempts = { arrayBuffer: 0, text: 0 };
    Object.defineProperty(window, "__largeFileReadAttempts", {
      configurable: false,
      value: attempts,
    });

    File.prototype.arrayBuffer = function arrayBuffer() {
      if (this.size > largeFileThreshold) {
        attempts.arrayBuffer += 1;
        throw new Error("A large File must not be read into a page ArrayBuffer.");
      }
      return nativeArrayBuffer.call(this);
    };
    File.prototype.text = function text() {
      if (this.size > largeFileThreshold) {
        attempts.text += 1;
        throw new Error("A large File must not be read into a page string.");
      }
      return nativeText.call(this);
    };
  }, LARGE_FILE_THRESHOLD);

  await page.goto(JSON_VIEWER_URL);

  const payload = "x".repeat(LARGE_FILE_THRESHOLD + 100_000);
  const source = `{"payload":"${payload}"}`;
  const expectedBeautified = `{\n  "payload": "${payload}"\n}`;
  const sourceBytes = Buffer.from(source);
  expect(sourceBytes.byteLength).toBeGreaterThan(LARGE_FILE_THRESHOLD);

  const workbench = page.getByTestId("tool-workspace");
  const editor = workbench.locator('[data-purpose="editor"]');
  const input = workbench.getByRole("textbox", { name: "JSON input" });
  const fileChooserPromise = page.waitForEvent("filechooser");
  await editor.getByRole("button", { name: "Upload", exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    buffer: sourceBytes,
    mimeType: "application/json",
    name: "large-source.json",
  });

  await expect(editor).toContainText("large-source.json");
  await expect(editor).toContainText("Large-file mode");
  await expect(input).toHaveJSProperty("readOnly", true);
  const inputPreview = await input.inputValue();
  expect(Buffer.byteLength(inputPreview)).toBeLessThanOrEqual(LARGE_TEXT_PREVIEW_BYTES);
  expect(inputPreview.length).toBeGreaterThan(0);
  expect(source.startsWith(inputPreview)).toBe(true);
  expect(await largeFileReadAttempts(page)).toEqual({ arrayBuffer: 0, text: 0 });

  await expect(workbench.getByText("Large JSON result", { exact: true })).toBeVisible();
  await expect(workbench.getByText("Read-only · bounded preview", { exact: true })).toBeVisible();
  await expect(workbench.getByTestId("json-result-renderer")).toHaveCount(0);
  await expect(workbench.getByRole("tab", { name: "Tree" })).toHaveCount(0);
  await expect(workbench.getByRole("combobox", { name: "JSON result view" })).toHaveCount(0);

  const toolbar = workbench.getByTestId("tool-action-toolbar");
  await toolbar.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(workbench.getByText("Valid JSON", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  const validatedPreview = workbench.locator('[data-purpose="result"] code');
  await expect(validatedPreview).toBeVisible();
  expect(Buffer.byteLength((await validatedPreview.textContent()) ?? "")).toBeLessThanOrEqual(
    LARGE_TEXT_PREVIEW_BYTES,
  );
  expect(await largeFileReadAttempts(page)).toEqual({ arrayBuffer: 0, text: 0 });

  await toolbar.getByRole("button", { name: "Beautify", exact: true }).click();
  await expect(workbench.getByRole("heading", { name: "Complete generated file" })).toBeVisible({
    timeout: 60_000,
  });
  const formattedPreview = workbench.locator('[data-purpose="result"] code');
  await expect(formattedPreview).toBeVisible();
  const formattedPreviewText = (await formattedPreview.textContent()) ?? "";
  expect(Buffer.byteLength(formattedPreviewText)).toBeLessThanOrEqual(LARGE_TEXT_PREVIEW_BYTES);
  expect(expectedBeautified.startsWith(formattedPreviewText)).toBe(true);
  expect(formattedPreviewText.length).toBeLessThan(expectedBeautified.length);

  const artifactJobs = await artifactJobIds(page);
  if (artifactJobs !== null) expect(artifactJobs.length).toBeGreaterThan(0);
  const downloadPromise = page.waitForEvent("download");
  await workbench
    .locator('[data-purpose="result"]')
    .getByRole("button", { name: "Download file", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("smarttools-json-viewer-formatted.json");
  const downloadedBytes = await readDownload(download);
  expect(downloadedBytes.byteLength).toBe(Buffer.byteLength(expectedBeautified));
  expect(downloadedBytes.equals(Buffer.from(expectedBeautified))).toBe(true);

  await editor.getByRole("button", { name: "Remove large-source.json" }).click();
  await expect(input).toHaveValue("");
  await expect(input).toHaveJSProperty("readOnly", false);
  await expect(editor).not.toContainText("Large-file mode");
  await expect(workbench.getByRole("heading", { name: "Complete generated file" })).toHaveCount(0);
  if (artifactJobs !== null) {
    await expect
      .poll(async () => {
        const currentJobs = await artifactJobIds(page);
        return currentJobs === null ? false : artifactJobs.some((id) => currentJobs.includes(id));
      })
      .toBe(false);
  }
});

async function largeFileReadAttempts(page: Page): Promise<LargeFileReadAttempts> {
  return page.evaluate(() => window.__largeFileReadAttempts);
}

async function artifactJobIds(page: Page): Promise<string[] | null> {
  return page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      const smarttools = await root.getDirectoryHandle("smarttools");
      const jobs = await smarttools.getDirectoryHandle("jobs");
      const ids: string[] = [];
      for await (const id of jobs.keys()) ids.push(id);
      return ids.sort();
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === "NotFoundError") return [];
        if (error.name === "UnknownError" || error.name === "NotSupportedError") {
          return null;
        }
      }
      throw error;
    }
  });
}

async function readDownload(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
