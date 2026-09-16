import assert from "node:assert/strict";
import test from "node:test";

import { CsvParseError, parseStreamingCsv } from "../lib/devtools/shared/streaming-csv.ts";

test("parses UTF-8, quotes, embedded newlines, BOM, and CRLF across byte boundaries", async () => {
  const source = '\uFEFFid,note\r\n1,"héllo, ""world"""\r\n2,"line one\r\nline two"';
  const bytes = new TextEncoder().encode(source);
  const chunks = Array.from(bytes, (_, index) => bytes.subarray(index, index + 1));
  const rows = [];

  const result = await parseStreamingCsv(chunks, {
    onRow(row, rowNumber) {
      rows.push([rowNumber, row]);
    },
  });

  assert.deepEqual(rows, [
    [1, ["id", "note"]],
    [2, ["1", 'héllo, "world"']],
    [3, ["2", "line one\r\nline two"]],
  ]);
  assert.deepEqual(result, {
    columnCount: 2,
    preview: [
      ["id", "note"],
      ["1", 'héllo, "world"'],
      ["2", "line one\r\nline two"],
    ],
    previewTruncated: false,
    rowCount: 3,
  });
});

test("supports string chunks and does not add a row after a trailing CRLF", async () => {
  const result = await parseStreamingCsv(["\uFEFFname,active\r", "\nAda,tr", "ue\r", "\n"]);

  assert.deepEqual(result.preview, [
    ["name", "active"],
    ["Ada", "true"],
  ]);
  assert.equal(result.rowCount, 2);
});

test("reports cumulative bytes while reading streaming CSV input", async () => {
  const progress = [];
  const result = await parseStreamingCsv(
    [Uint8Array.from([0x61, 0x2c]), Uint8Array.from([0x62, 0x0a, 0x31, 0x2c, 0x32])],
    { onInputProgress: (bytes) => progress.push(bytes) },
  );

  assert.equal(result.rowCount, 2);
  assert.deepEqual(progress, [2, 7]);
});

test("waits for asynchronous row consumers to provide backpressure", async () => {
  const events = [];

  await parseStreamingCsv(["a\nb\nc"], {
    async onRow(row) {
      events.push(`start:${row[0]}`);
      await Promise.resolve();
      events.push(`end:${row[0]}`);
    },
  });

  assert.deepEqual(events, ["start:a", "end:a", "start:b", "end:b", "start:c", "end:c"]);
});

test("validates row width against the first row by default", async () => {
  await assert.rejects(parseStreamingCsv(["id,name\n1,Ada\n2"]), (error) => {
    assert.ok(error instanceof CsvParseError);
    assert.equal(error.code, "width");
    assert.equal(error.row, 3);
    assert.equal(error.column, 2);
    assert.equal(error.message, "Row 3 has 1 column; expected 2 columns.");
    return true;
  });
});

test("can accept ragged rows or validate a caller-provided width", async () => {
  const ragged = await parseStreamingCsv(["a,b\n1"], {
    validateWidth: false,
  });
  assert.deepEqual(ragged.preview, [["a", "b"], ["1"]]);

  await assert.rejects(
    parseStreamingCsv(["a,b,c"], { expectedColumns: 2 }),
    (error) => error instanceof CsvParseError && error.code === "width" && error.row === 1 && error.column === 3,
  );
});

test("reports quote errors at the logical row and column", async (t) => {
  const cases = [
    {
      input: 'id,name\n1,Al"ice',
      code: "unexpected-quote",
      row: 2,
      column: 2,
      message: "Unexpected quote at row 2, column 2. Quotes must start at the beginning of a field.",
    },
    {
      input: 'id,name\n1,"Alice"x',
      code: "unexpected-character",
      row: 2,
      column: 2,
      message: 'Unexpected character "x" after a closing quote at row 2, column 2.',
    },
    {
      input: 'id,name\n1,"Alice',
      code: "unclosed-quote",
      row: 2,
      column: 2,
      message: "Unclosed quoted field at row 2, column 2.",
    },
  ];

  for (const expected of cases) {
    await t.test(expected.code, async () => {
      await assert.rejects(parseStreamingCsv([expected.input]), (error) => {
        assert.ok(error instanceof CsvParseError);
        assert.equal(error.code, expected.code);
        assert.equal(error.row, expected.row);
        assert.equal(error.column, expected.column);
        assert.equal(error.message, expected.message);
        return true;
      });
    });
  }
});

test("keeps only the first 1,000 preview rows while streaming every row", async () => {
  const csv = Array.from({ length: 1002 }, (_, index) => String(index)).join("\n");
  let streamedRows = 0;

  const result = await parseStreamingCsv([csv], {
    onRow() {
      streamedRows += 1;
    },
  });

  assert.equal(streamedRows, 1002);
  assert.equal(result.rowCount, 1002);
  assert.equal(result.preview.length, 1000);
  assert.deepEqual(result.preview.at(-1), ["999"]);
  assert.equal(result.previewTruncated, true);
});

test("bounds the retained preview by UTF-8 bytes as well as row count", async () => {
  const result = await parseStreamingCsv([`header\n${"😀".repeat(100)}`], {
    maxPreviewBytes: 16,
    previewRows: 1_000,
  });

  assert.equal(result.rowCount, 2);
  assert.deepEqual(result.preview, [["header"]]);
  assert.equal(result.previewTruncated, true);
});

test("drops blank records consistently and bounds pathological fields", async () => {
  const result = await parseStreamingCsv(["id\n\n1\n\r\n2"], {
    maxFieldBytes: 4,
    maxRowBytes: 8,
  });
  assert.deepEqual(result.preview, [["id"], ["1"], ["2"]]);

  await assert.rejects(
    parseStreamingCsv(["12345"], { maxFieldBytes: 4, maxRowBytes: 8 }),
    (error) => error instanceof CsvParseError && error.code === "field-too-large",
  );
});

test("supports an empty preview and an empty input", async () => {
  assert.deepEqual(await parseStreamingCsv([], { previewRows: 0 }), {
    columnCount: 0,
    preview: [],
    previewTruncated: false,
    rowCount: 0,
  });

  assert.deepEqual(await parseStreamingCsv(["a\nb"], { previewRows: 0 }), {
    columnCount: 1,
    preview: [],
    previewTruncated: true,
    rowCount: 2,
  });
});

test("stops parsing when its AbortSignal is aborted", async () => {
  const controller = new AbortController();

  await assert.rejects(
    parseStreamingCsv(["a\nb"], {
      signal: controller.signal,
      onRow() {
        controller.abort();
      },
    }),
    (error) => error?.name === "AbortError",
  );
});
