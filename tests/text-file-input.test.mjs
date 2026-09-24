import { expect, test } from "vitest";

import { LARGE_TEXT_PREVIEW_BYTES } from "../lib/tool-framework/limits.ts";
import { readTextFileForEditor } from "../lib/tool-framework/textFileInput.ts";

test("small text imports stay editable and read the complete file", async () => {
  const file = new File(["hello"], "input.json", { type: "application/json" });
  const result = await readTextFileForEditor(file, {
    maxEditableBytes: 10,
    maxLength: 4,
  });
  expect(result).toEqual({ large: false, text: "hell" });
});

test("large text imports read only the bounded preview", async () => {
  class TrackingFile extends File {
    slices = [];
    textCalled = false;
    async text() {
      this.textCalled = true;
      return super.text();
    }
    slice(start, end, type) {
      this.slices.push([start, end]);
      return super.slice(start, end, type);
    }
  }
  const file = new TrackingFile(["x".repeat(32)], "large.json", {
    type: "application/json",
  });
  const result = await readTextFileForEditor(file, {
    maxEditableBytes: 16,
    previewBytes: 8,
  });
  expect(result.large).toBe(true);
  expect(result.text).toBe("x".repeat(8));
  expect(file.textCalled).toBe(false);
  expect(file.slices).toEqual([[0, 8]]);
});

test("large preview size is capped by the shared 256 KiB budget", async () => {
  const file = new File(["x".repeat(LARGE_TEXT_PREVIEW_BYTES + 20)], "large.csv");
  const result = await readTextFileForEditor(file, {
    maxEditableBytes: 1,
    previewBytes: LARGE_TEXT_PREVIEW_BYTES * 2,
  });
  expect(result.text.length).toBe(LARGE_TEXT_PREVIEW_BYTES);
});

test("large previews do not split a UTF-8 code point at the byte boundary", async () => {
  const file = new File(["a😀rest"], "unicode.json", {
    type: "application/json",
  });
  const result = await readTextFileForEditor(file, {
    maxEditableBytes: 1,
    previewBytes: 3,
  });

  expect(result.large).toBe(true);
  expect(result.text).toBe("a");
  expect(result.text).not.toMatch(/�/);
});
