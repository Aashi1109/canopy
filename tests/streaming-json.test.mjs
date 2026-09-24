import { expect, test } from "vitest";

import { processStreamingJson } from "../lib/devtools/shared/streaming-json.ts";

function byteStream(value, chunkSize = 1) {
  const bytes = new TextEncoder().encode(value);
  let offset = 0;

  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }

      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

test("minifies byte-by-byte UTF-8 input without changing number lexemes", async () => {
  const number = "-0.123456789012345678901234567890e+999";
  const input = ` { "emoji" : "😀", "number" : ${number} } `;
  const chunks = [];

  const result = await processStreamingJson(byteStream(input), {
    mode: "minify",
    onOutput: (chunk) => chunks.push(chunk),
    outputChunkSize: 5,
  });

  expect(result.ok).toBe(true);
  expect(chunks.join("")).toBe(`{"emoji":"😀","number":${number}}`);
  expect(chunks.every((chunk) => chunk.length <= 5)).toBeTruthy();
});

test("reports cumulative bytes while reading streaming JSON input", async () => {
  const progress = [];
  const result = await processStreamingJson(byteStream("[1,2]", 2), {
    mode: "validate",
    onInputProgress: (bytes) => progress.push(bytes),
  });

  expect(result.ok).toBe(true);
  expect(progress).toEqual([2, 4, 5]);
});

test("formats nested JSON and keeps only a bounded preview", async () => {
  const chunks = [];
  const result = await processStreamingJson('{"items":[1,{"name":"Ada"}],"active":true}', {
    mode: "format",
    indentation: 2,
    onOutput: async (chunk) => chunks.push(chunk),
    outputChunkSize: 7,
    previewLimit: 12,
  });

  const output = [
    "{",
    '  "items": [',
    "    1,",
    "    {",
    '      "name": "Ada"',
    "    }",
    "  ],",
    '  "active": true',
    "}",
  ].join("\n");

  expect(result).toEqual({
    ok: true,
    inputBytes: 42,
    inputCharacters: 42,
    outputCharacters: output.length,
    preview: output.slice(0, 12),
    previewTruncated: true,
    rootType: "object",
  });
  expect(chunks.join("")).toBe(output);
  expect(chunks.every((chunk) => chunk.length <= 7)).toBeTruthy();
  expect("output" in result).toBe(false);
});

test("bounds previews by UTF-8 bytes without splitting a code point", async () => {
  const result = await processStreamingJson('{"value":"😀😀"}', {
    mode: "minify",
    previewLimit: 12,
  });
  expect(result.ok).toBe(true);
  expect(new TextEncoder().encode(result.preview).byteLength <= 12).toBe(true);
  expect(result.preview).not.toMatch(/�/);
  expect(result.previewTruncated).toBe(true);
});

test("accepts Blob input and validates without producing output", async () => {
  let outputCalls = 0;
  const result = await processStreamingJson(new Blob(['\n { "value": null } \n']), {
    mode: "validate",
    onOutput: () => {
      outputCalls += 1;
    },
    previewLimit: 8,
  });

  expect(result.ok).toBe(true);
  expect(result.preview).toBe('\n { "val');
  expect(result.previewTruncated).toBe(true);
  expect(result.outputCharacters).toBe(0);
  expect(outputCalls).toBe(0);
});

test("tracks root type independently of a bounded leading-whitespace preview", async () => {
  const result = await processStreamingJson(`${" ".repeat(20)}[]`, {
    mode: "validate",
    previewLimit: 4,
  });
  expect(result.ok).toBe(true);
  expect(result.preview).toBe("    ");
  expect(result.rootType).toBe("array");
});

test("reports strict syntax errors at the offending line and column", async () => {
  const input = '{\r\n  "ok": true,\r\n  "bad": [1,]\r\n}';
  const result = await processStreamingJson(byteStream(input, 2), {
    mode: "minify",
  });

  expect(result).toEqual({
    ok: false,
    error: {
      kind: "syntax",
      message: "Trailing commas are not allowed in arrays.",
      line: 3,
      column: 13,
      offset: 30,
    },
  });
});

test("rejects malformed numbers even when the token ends at EOF", async () => {
  const result = await processStreamingJson(byteStream("[1e+]"), {
    mode: "validate",
  });

  expect(result.ok).toBe(false);
  expect(result.error.kind).toBe("syntax");
  expect(result.error.line).toBe(1);
  expect(result.error.column).toBe(5);
  expect(result.error.message).toMatch(/number/i);
});

test("reports invalid UTF-8 as an encoding error", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.of(0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3));
      controller.enqueue(Uint8Array.of(0x28, 0x7d));
      controller.close();
    },
  });

  const result = await processStreamingJson(stream, { mode: "validate" });

  expect(result.ok).toBe(false);
  expect(result.error.kind).toBe("encoding");
  expect(result.error.message).toMatch(/UTF-8/);
  expect(result.error.line).toBe(1);
});

test("honors an already-aborted signal before reading input", async () => {
  const controller = new AbortController();
  controller.abort(new DOMException("Stopped", "AbortError"));

  await expect(
    processStreamingJson("{}", {
      mode: "validate",
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError", message: "Stopped" });
});

test("writes valid UTF-8 without splitting surrogate pairs at chunk boundaries", async () => {
  const bytes = [];
  let closed = false;
  const writable = new WritableStream({
    write(chunk) {
      bytes.push(chunk);
    },
    close() {
      closed = true;
    },
  });

  const result = await processStreamingJson('[ "ab😀" ]', {
    mode: "minify",
    writable,
    outputChunkSize: 5,
  });

  expect(result.ok).toBe(true);
  expect(closed).toBe(true);
  const size = bytes.reduce((total, chunk) => total + chunk.byteLength, 0);
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of bytes) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  expect(new TextDecoder("utf-8", { fatal: true }).decode(joined)).toBe('["ab😀"]');
});

test("aborts a writable output when later input is invalid", async () => {
  let closed = false;
  let abortReason;
  const writable = new WritableStream({
    close() {
      closed = true;
    },
    abort(reason) {
      abortReason = reason;
    },
  });

  const result = await processStreamingJson('{"valid":1,}', {
    mode: "minify",
    writable,
    outputChunkSize: 2,
  });

  expect(result.ok).toBe(false);
  expect(result.error.message).toBe("Trailing commas are not allowed in objects.");
  expect(closed).toBe(false);
  expect(abortReason?.name).toBe("JsonStreamParseError");
});

test("rejects non-JSON whitespace and multiple root values", async () => {
  for (const input of ['{"x":1\u00a0}', "true false", "[01]"]) {
    const result = await processStreamingJson(input, { mode: "validate" });
    expect(result.ok, input).toBe(false);
    expect(result.error.kind, input).toBe("syntax");
  }
});

test("rejects unsupported modes at the API boundary", async () => {
  await expect(processStreamingJson("{}", { mode: "pretty" })).rejects.toMatchObject({
    name: "TypeError",
    message: "Unsupported streaming JSON mode: pretty.",
  });
});

test("rejects pathologically deep JSON with a recoverable syntax error", async () => {
  const result = await processStreamingJson("[[[]]]", {
    mode: "validate",
    maxDepth: 2,
  });
  expect(result.ok).toBe(false);
  expect(result.error.message).toMatch(/nesting exceeds the 2 level limit/);
});
