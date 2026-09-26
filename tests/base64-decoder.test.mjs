import assert from "node:assert/strict";
import { run } from "../tools/base64-decoder/run.ts";
const { test } = await import(process.env.VITEST ? "vitest" : "node:test");

// Complete 1 × 1 images, including the transparent GIF that originally fell
// through to decoded.bin despite having a browser-supported image signature.
const GIF89A = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const GIF87A = "R0lGODdhAQABAIEAAP///wAAAAAAAAAAACwAAAAAAQABAAAIBAABBAQAOw==";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC";
const JPEG =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";
const WEBP = "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vz0AAA=";

async function execute(text) {
  const writes = [];
  const result = await run({
    input: { text, files: [] },
    settings: {},
    signal: new AbortController().signal,
    progress() {},
    async writeArtifact(input) {
      writes.push(input);
      const blob = new Blob([input.source], { type: input.mime });
      return {
        id: "decoded-artifact",
        jobId: "base64-test",
        name: input.name,
        mime: input.mime,
        size: blob.size,
        createdAt: 0,
        storage: "blob",
        blob,
      };
    },
  });
  return { result, writes };
}

function assertImage(result, writes, base64, mime, name) {
  assert.equal(result.render, "image");
  assert.equal(result.mime, mime);
  assert.equal(result.downloadName, name);
  assert.match(result.alt, /image/i);
  assert.ok(result.src.startsWith(`data:${mime};base64,`));
  assert.deepEqual(Buffer.from(result.src.split(",")[1], "base64"), Buffer.from(base64, "base64"));
  assert.equal(writes.length, 0, "an inline preview must not require writing a downloadable artifact");
}

for (const [version, base64] of [
  ["GIF87a", GIF87A],
  ["GIF89a", GIF89A],
]) {
  for (const dataUri of [false, true]) {
    test(`${version} ${dataUri ? "data URI" : "raw Base64"} previews inline and preserves its bytes`, async () => {
      const { result, writes } = await execute(dataUri ? `data:image/gif;base64,${base64}` : base64);
      assertImage(result, writes, base64, "image/gif", "decoded.gif");
      assert.equal(result.width, 1);
      assert.equal(result.height, 1);
    });
  }
}

for (const [mime, name, base64] of [
  ["image/png", "decoded.png", PNG],
  ["image/jpeg", "decoded.jpg", JPEG],
  ["image/webp", "decoded.webp", WEBP],
]) {
  test(`${mime} keeps its inline preview and exact downloadable bytes`, async () => {
    const { result, writes } = await execute(base64);
    assertImage(result, writes, base64, mime, name);
  });
}

test("declared MIME cannot override the decoded image type", async () => {
  for (const [input, base64, mime, name] of [
    [`data:image/png;base64,${GIF89A}`, GIF89A, "image/gif", "decoded.gif"],
    [`data:image/gif;base64,${PNG}`, PNG, "image/png", "decoded.png"],
    [`data:application/octet-stream;base64,${GIF87A}`, GIF87A, "image/gif", "decoded.gif"],
  ]) {
    const { result, writes } = await execute(input);
    assertImage(result, writes, base64, mime, name);
  }
});

test("Unicode text retains its content, line breaks, and text download", async () => {
  const text = "Hello 👋 नमस्ते\nCafé\t日本語";
  for (const input of [
    Buffer.from(text).toString("base64"),
    `data:image/gif;base64,${Buffer.from(text).toString("base64")}`,
  ]) {
    const { result, writes } = await execute(input);
    assert.equal(result.render, "text");
    assert.equal(result.text, text);
    assert.equal(result.downloadName, "decoded.txt");
    assert.equal(writes.length, 0);
  }
});

test("readable text starting with a GIF version remains text", async () => {
  const text = "GIF89a example";
  const { result, writes } = await execute(Buffer.from(text).toString("base64"));
  assert.equal(result.render, "text");
  assert.equal(result.text, text);
  assert.equal(result.downloadName, "decoded.txt");
  assert.equal(writes.length, 0);
});

test("a truncated GIF header remains downloadable binary", async () => {
  const bytes = Buffer.from(GIF89A, "base64").subarray(0, 10);
  const { result } = await execute(bytes.toString("base64"));
  assert.equal(result.render, "files");
  assert.equal(result.files[0].name, "decoded.bin");
  assert.deepEqual(Buffer.from(await result.files[0].blob.arrayBuffer()), bytes);
});

for (const [dimension, offset] of [
  ["width", 6],
  ["height", 8],
]) {
  test(`a GIF with zero ${dimension} remains downloadable binary`, async () => {
    const bytes = Buffer.from(GIF89A, "base64");
    bytes[offset] = 0;
    bytes[offset + 1] = 0;
    const { result } = await execute(bytes.toString("base64"));
    assert.equal(result.render, "files");
    assert.equal(result.files[0].name, "decoded.bin");
    assert.deepEqual(Buffer.from(await result.files[0].blob.arrayBuffer()), bytes);
  });
}

test("Base64url and whitespace decode to the same image bytes", async () => {
  const urlSafe = Buffer.from(GIF89A, "base64").toString("base64url");
  const wrapped = ` \n${urlSafe.match(/.{1,8}/g).join(" \n\t")}\n `;
  const { result, writes } = await execute(wrapped);
  assertImage(result, writes, GIF89A, "image/gif", "decoded.gif");
});

test("unsupported binary remains downloadable with exact bytes and a preview explanation", async () => {
  const bytes = Uint8Array.from([0x00, 0xff, 0x80, 0x47, 0x49, 0x46, 0x00]);
  for (const input of [
    Buffer.from(bytes).toString("base64"),
    `data:image/gif;base64,${Buffer.from(bytes).toString("base64")}`,
  ]) {
    const { result, writes } = await execute(input);
    assert.equal(result.render, "files");
    assert.equal(result.outputBytes, bytes.length);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].name, "decoded.bin");
    assert.equal(result.files[0].mime, "application/octet-stream");
    assert.equal(result.files[0].size, bytes.length);
    assert.deepEqual(new Uint8Array(await result.files[0].blob.arrayBuffer()), bytes);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].source, bytes);
    assert.match(result.notification?.detail ?? "", /preview/i);
    assert.match(result.notification?.detail ?? "", /download/i);
  }
});

for (const input of ["", " \n\t "]) {
  test(`empty input ${JSON.stringify(input)} requests a value`, async () => {
    await assert.rejects(execute(input), { code: "input-required", message: "Base64 input is required." });
  });
}

for (const input of ["not base64!", "A", "SGV=sbG8", "====", "data:image/gif;base64,***"]) {
  test(`invalid input ${JSON.stringify(input)} reports a recoverable error`, async () => {
    await assert.rejects(execute(input), { code: "invalid-base64", message: "Base64 input is invalid." });
  });
}
