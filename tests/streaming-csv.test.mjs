import { expect, test } from "vitest";

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

  expect(rows).toEqual([
    [1, ["id", "note"]],
    [2, ["1", 'héllo, "world"']],
    [3, ["2", "line one\r\nline two"]],
  ]);
  expect(result).toEqual({
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

  expect(result.preview).toEqual([
    ["name", "active"],
    ["Ada", "true"],
  ]);
  expect(result.rowCount).toBe(2);
});

test("reports cumulative bytes while reading streaming CSV input", async () => {
  const progress = [];
  const result = await parseStreamingCsv(
    [Uint8Array.from([0x61, 0x2c]), Uint8Array.from([0x62, 0x0a, 0x31, 0x2c, 0x32])],
    { onInputProgress: (bytes) => progress.push(bytes) },
  );

  expect(result.rowCount).toBe(2);
  expect(progress).toEqual([2, 7]);
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

  expect(events).toEqual(["start:a", "end:a", "start:b", "end:b", "start:c", "end:c"]);
});

test("validates row width against the first row by default", async () => {
  await (async () => {
    let __err;
    try {
      await parseStreamingCsv(["id,name\n1,Ada\n2"]);
    } catch (__e) {
      __err = __e;
    }
    expect(__err).toBeDefined();
    expect(
      ((error) => {
        expect(error instanceof CsvParseError).toBeTruthy();
        expect(error.code).toBe("width");
        expect(error.row).toBe(3);
        expect(error.column).toBe(2);
        expect(error.message).toBe("Row 3 has 1 column; expected 2 columns.");
        return true;
      })(__err),
    ).toBe(true);
  })();
});

test("can accept ragged rows or validate a caller-provided width", async () => {
  const ragged = await parseStreamingCsv(["a,b\n1"], {
    validateWidth: false,
  });
  expect(ragged.preview).toEqual([["a", "b"], ["1"]]);

  await (async () => {
    let __err;
    try {
      await parseStreamingCsv(["a,b,c"], { expectedColumns: 2 });
    } catch (__e) {
      __err = __e;
    }
    expect(__err).toBeDefined();
    expect(
      ((error) => error instanceof CsvParseError && error.code === "width" && error.row === 1 && error.column === 3)(
        __err,
      ),
    ).toBe(true);
  })();
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
    await (async () => {
      await (async () => {
        let __err;
        try {
          await parseStreamingCsv([expected.input]);
        } catch (__e) {
          __err = __e;
        }
        expect(__err).toBeDefined();
        expect(
          ((error) => {
            expect(error instanceof CsvParseError).toBeTruthy();
            expect(error.code).toBe(expected.code);
            expect(error.row).toBe(expected.row);
            expect(error.column).toBe(expected.column);
            expect(error.message).toBe(expected.message);
            return true;
          })(__err),
        ).toBe(true);
      })();
    })();
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

  expect(streamedRows).toBe(1002);
  expect(result.rowCount).toBe(1002);
  expect(result.preview.length).toBe(1000);
  expect(result.preview.at(-1)).toEqual(["999"]);
  expect(result.previewTruncated).toBe(true);
});

test("bounds the retained preview by UTF-8 bytes as well as row count", async () => {
  const result = await parseStreamingCsv([`header\n${"😀".repeat(100)}`], {
    maxPreviewBytes: 16,
    previewRows: 1_000,
  });

  expect(result.rowCount).toBe(2);
  expect(result.preview).toEqual([["header"]]);
  expect(result.previewTruncated).toBe(true);
});

test("drops blank records consistently and bounds pathological fields", async () => {
  const result = await parseStreamingCsv(["id\n\n1\n\r\n2"], {
    maxFieldBytes: 4,
    maxRowBytes: 8,
  });
  expect(result.preview).toEqual([["id"], ["1"], ["2"]]);

  await (async () => {
    let __err;
    try {
      await parseStreamingCsv(["12345"], { maxFieldBytes: 4, maxRowBytes: 8 });
    } catch (__e) {
      __err = __e;
    }
    expect(__err).toBeDefined();
    expect(((error) => error instanceof CsvParseError && error.code === "field-too-large")(__err)).toBe(true);
  })();
});

test("supports an empty preview and an empty input", async () => {
  expect(await parseStreamingCsv([], { previewRows: 0 })).toEqual({
    columnCount: 0,
    preview: [],
    previewTruncated: false,
    rowCount: 0,
  });

  expect(await parseStreamingCsv(["a\nb"], { previewRows: 0 })).toEqual({
    columnCount: 1,
    preview: [],
    previewTruncated: true,
    rowCount: 2,
  });
});

test("stops parsing when its AbortSignal is aborted", async () => {
  const controller = new AbortController();

  await (async () => {
    let __err;
    try {
      await parseStreamingCsv(["a\nb"], {
        signal: controller.signal,
        onRow() {
          controller.abort();
        },
      });
    } catch (__e) {
      __err = __e;
    }
    expect(__err).toBeDefined();
    expect(((error) => error?.name === "AbortError")(__err)).toBe(true);
  })();
});
