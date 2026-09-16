import assert from "node:assert/strict";
import test from "node:test";

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

  assert.equal(result.ok, true);
  assert.equal(chunks.join(""), `{"emoji":"😀","number":${number}}`);
  assert.ok(chunks.every((chunk) => chunk.length <= 5));
});

test("reports cumulative bytes while reading streaming JSON input", async () => {
  const progress = [];
  const result = await processStreamingJson(byteStream("[1,2]", 2), {
    mode: "validate",
    onInputProgress: (bytes) => progress.push(bytes),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(progress, [2, 4, 5]);
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

  assert.deepEqual(result, {
    ok: true,
    inputBytes: 42,
    inputCharacters: 42,
    outputCharacters: output.length,
    preview: output.slice(0, 12),
    previewTruncated: true,
    rootType: "object",
  });
  assert.equal(chunks.join(""), output);
  assert.ok(chunks.every((chunk) => chunk.length <= 7));
  assert.equal("output" in result, false);
});

test("bounds previews by UTF-8 bytes without splitting a code point", async () => {
  const result = await processStreamingJson('{"value":"😀😀"}', {
    mode: "minify",
    previewLimit: 12,
  });
  assert.equal(result.ok, true);
  assert.equal(new TextEncoder().encode(result.preview).byteLength <= 12, true);
  assert.doesNotMatch(result.preview, /�/);
  assert.equal(result.previewTruncated, true);
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

  assert.equal(result.ok, true);
  assert.equal(result.preview, '\n { "val');
  assert.equal(result.previewTruncated, true);
  assert.equal(result.outputCharacters, 0);
  assert.equal(outputCalls, 0);
});

test("tracks root type independently of a bounded leading-whitespace preview", async () => {
  const result = await processStreamingJson(`${" ".repeat(20)}[]`, {
    mode: "validate",
    previewLimit: 4,
  });
  assert.equal(result.ok, true);
  assert.equal(result.preview, "    ");
  assert.equal(result.rootType, "array");
});

test("reports strict syntax errors at the offending line and column", async () => {
  const input = '{\r\n  "ok": true,\r\n  "bad": [1,]\r\n}';
  const result = await processStreamingJson(byteStream(input, 2), {
    mode: "minify",
  });

  assert.deepEqual(result, {
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

  assert.equal(result.ok, false);
  assert.equal(result.error.kind, "syntax");
  assert.equal(result.error.line, 1);
  assert.equal(result.error.column, 5);
  assert.match(result.error.message, /number/i);
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

  assert.equal(result.ok, false);
  assert.equal(result.error.kind, "encoding");
  assert.match(result.error.message, /UTF-8/);
  assert.equal(result.error.line, 1);
});

test("honors an already-aborted signal before reading input", async () => {
  const controller = new AbortController();
  controller.abort(new DOMException("Stopped", "AbortError"));

  await assert.rejects(
    processStreamingJson("{}", {
      mode: "validate",
      signal: controller.signal,
    }),
    { name: "AbortError", message: "Stopped" },
  );
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

  assert.equal(result.ok, true);
  assert.equal(closed, true);
  const size = bytes.reduce((total, chunk) => total + chunk.byteLength, 0);
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of bytes) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(joined), '["ab😀"]');
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

  assert.equal(result.ok, false);
  assert.equal(result.error.message, "Trailing commas are not allowed in objects.");
  assert.equal(closed, false);
  assert.equal(abortReason?.name, "JsonStreamParseError");
});

test("rejects non-JSON whitespace and multiple root values", async () => {
  for (const input of ['{"x":1\u00a0}', "true false", "[01]"]) {
    const result = await processStreamingJson(input, { mode: "validate" });
    assert.equal(result.ok, false, input);
    assert.equal(result.error.kind, "syntax", input);
  }
});

test("rejects unsupported modes at the API boundary", async () => {
  await assert.rejects(processStreamingJson("{}", { mode: "pretty" }), {
    name: "TypeError",
    message: "Unsupported streaming JSON mode: pretty.",
  });
});

test("rejects pathologically deep JSON with a recoverable syntax error", async () => {
  const result = await processStreamingJson("[[[]]]", {
    mode: "validate",
    maxDepth: 2,
  });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /nesting exceeds the 2 level limit/);
});
