import { test, expect } from "vitest";
import { LARGE_CSV_FILE_BYTES } from "../lib/devtools/shared/streaming-csv-tool.ts";
import { CSV_PREVIEW_BYTES } from "../lib/tool-framework/limits.ts";
import { run as format } from "../tools/csv-formatter/run.worker.ts";
import { run as sort } from "../tools/csv-sorter/run.ts";
import { run as filter } from "../tools/csv-filter/run.worker.ts";
import { run as deduplicate } from "../tools/csv-duplicate-remover/run.ts";
import { run as delimit } from "../tools/csv-delimiter-converter/run.worker.ts";
import { run as toTsv } from "../tools/csv-to-tsv/run.worker.ts";
import { run as toCsv } from "../tools/tsv-to-csv/run.worker.ts";

async function execute(run, text, settings = {}, streaming = false) {
  const file = new File([text], "input.csv", { type: "text/csv" });
  return run({
    input: {
      text: streaming ? "" : text,
      files: streaming
        ? [{ id: "input", name: file.name, mime: file.type, size: LARGE_CSV_FILE_BYTES + 1, source: file }]
        : [],
    },
    settings,
    signal: new AbortController().signal,
    progress() {},
    async writeArtifact({ mime, name, source }) {
      const blob = await new Response(source).blob();
      return { id: "output", jobId: "preview-test", name, mime, size: blob.size, createdAt: 0, storage: "blob", blob };
    },
  });
}

async function completeText(result) {
  return result.render === "text" ? result.text : result.sections[0].body.files[0].blob.text();
}

const cases = [
  {
    name: "formatter",
    run: format,
    settings: { delimiter: ";" },
    source: ' name ; note \n Ada ;" x;y "\n Lin ;" say ""hi""\nthere "',
    expected: 'name;note\nAda;"x;y"\nLin;"say ""hi""\nthere"',
    rows: [
      ["Ada", "x;y"],
      ["Lin", 'say "hi"\nthere'],
    ],
    header: "name;note",
    streaming: true,
  },
  {
    name: "sorter",
    run: sort,
    settings: { delimiter: ",", column: "name", order: "asc" },
    source: 'name,note\nLin,"x,y"\nAda,"line one\nline two"',
    expected: 'name,note\nAda,"line one\nline two"\nLin,"x,y"',
    rows: [
      ["Ada", "line one\nline two"],
      ["Lin", "x,y"],
    ],
    header: "name,note",
  },
  {
    name: "filter",
    run: filter,
    settings: { delimiter: "|", column: "note", query: "keep" },
    source: 'name|note\nAda|"keep|this"\nLin|discard\nMia|"KEEP\nthis"',
    expected: 'name|note\nAda|"keep|this"\nMia|"KEEP\nthis"',
    rows: [
      ["Ada", "keep|this"],
      ["Mia", "KEEP\nthis"],
    ],
    header: "name|note",
    streaming: true,
  },
  {
    name: "duplicate remover",
    run: deduplicate,
    settings: { delimiter: "," },
    source: 'name,note\nAda,"say ""hi"""\nAda,"say ""hi"""\nLin,',
    expected: 'name,note\nAda,"say ""hi"""\nLin,',
    rows: [
      ["Ada", 'say "hi"'],
      ["Lin", ""],
    ],
    header: "name,note",
  },
  {
    name: "delimiter converter",
    run: delimit,
    settings: { from: ",", to: ";" },
    source: 'name,note\nAda,x;y\nLin,"x,y"',
    expected: 'name;note\nAda;"x;y"\nLin;x,y',
    rows: [
      ["Ada", "x;y"],
      ["Lin", "x,y"],
    ],
    header: "name,note",
    outputHeader: "name;note",
    streaming: true,
  },
  {
    name: "CSV to TSV",
    run: toTsv,
    source: 'name,note\nAda,x\ty\nLin,"x,y"',
    expected: 'name\tnote\nAda\t"x\ty"\nLin\tx,y',
    rows: [
      ["Ada", "x\ty"],
      ["Lin", "x,y"],
    ],
    header: "name,note",
    outputHeader: "name\tnote",
    streaming: true,
  },
  {
    name: "TSV to CSV",
    run: toCsv,
    source: 'name\tnote\nAda\tx,y\nLin\t"x\ty"',
    expected: 'name,note\nAda,"x,y"\nLin,x\ty',
    rows: [
      ["Ada", "x,y"],
      ["Lin", "x\ty"],
    ],
    header: "name\tnote",
    outputHeader: "name,note",
    streaming: true,
  },
];

for (const example of cases) {
  for (const streaming of example.streaming ? [false, true] : [false]) {
    const label = `${example.name}, ${streaming ? "streaming" : "inline"}`;
    test(`${label}: previews the transformed cells and preserves the exact complete output`, async () => {
      const result = await execute(example.run, example.source, example.settings, streaming);

      expect(await completeText(result)).toBe(example.expected);
      expect(result.tablePreview).toEqual({
        render: "table",
        columns: ["name", "note"],
        rows: example.rows,
        showColumnDividers: true,
        truncated: false,
      });
    });

    test(`${label}: a header-only result has an empty, complete table preview`, async () => {
      const result = await execute(example.run, example.header, example.settings, streaming);

      expect(await completeText(result)).toBe(example.outputHeader ?? example.header);
      expect(result.tablePreview.columns).toEqual(["name", "note"]);
      expect(result.tablePreview.rows).toEqual([]);
      expect(result.tablePreview.truncated).toBe(false);
    });
  }
}

for (const streaming of [false, true]) {
  test(`formatter ${streaming ? "streaming" : "inline"}: bounds rows and cells without shortening the output`, async () => {
    for (const [width, count, retained] of [
      [2, 1001, 1000],
      [25, 401, 400],
    ]) {
      const header = Array.from({ length: width }, (_, i) => `c${i}`).join(",");
      const row = Array.from({ length: width }, (_, i) => String(i)).join(",");
      const source = [header, ...Array.from({ length: count }, () => row)].join("\n");
      const result = await execute(format, source, { delimiter: "," }, streaming);

      expect(result.tablePreview.rows.length).toBe(retained);
      expect(result.tablePreview.truncated).toBe(true);
      expect(await completeText(result)).toBe(source);
    }
  });

  test(`formatter ${streaming ? "streaming" : "inline"}: omits previews with more than 10,000 short header cells`, async () => {
    for (const width of [10_000, 10_001]) {
      const header = [...Array.from({ length: width - 1 }, () => ""), "name"].join(",");
      const row = [...Array.from({ length: width - 1 }, () => ""), "value"].join(",");
      const source = `${header}\n${row}`;
      const result = await execute(format, source, { delimiter: "," }, streaming);

      expect(await completeText(result)).toBe(source);
      if (width > 10_000) {
        expect(result.tablePreview === undefined, "Oversized headers omit the table preview").toBeTruthy();
      } else {
        expect(result.tablePreview.columns.length).toBe(width);
        expect(result.tablePreview.rows.length).toBe(1);
        expect(result.tablePreview.truncated).toBe(false);
      }
    }
  });

  test(`formatter ${streaming ? "streaming" : "inline"}: bounds UTF-8 preview bytes and retains an ordered prefix`, async () => {
    const large = "😀".repeat(300_000);
    const source = `name\n${large}\n${large}\nlast`;
    const result = await execute(format, source, { delimiter: "," }, streaming);

    expect(result.tablePreview.rows.length).toBe(1);
    expect(result.tablePreview.rows[0][0] === large).toBeTruthy();
    expect(result.tablePreview.truncated).toBe(true);
    expect(
      new TextEncoder().encode(result.tablePreview.columns.join("") + result.tablePreview.rows.flat().join(""))
        .byteLength <= CSV_PREVIEW_BYTES,
    ).toBeTruthy();
    expect((await completeText(result)) === source).toBeTruthy();

    const oversized = "😀".repeat(CSV_PREVIEW_BYTES / 4 + 1);
    const cell = await execute(format, `name\n${oversized}\nlast`, { delimiter: "," }, streaming);
    expect(cell.tablePreview.rows).toEqual([]);
    expect(cell.tablePreview.truncated).toBe(true);
    expect((await completeText(cell)).includes(oversized)).toBeTruthy();

    const header = await execute(format, `${oversized}\nvalue`, { delimiter: "," }, streaming);
    expect(header.tablePreview === undefined).toBeTruthy();
    expect((await completeText(header)).startsWith(oversized)).toBeTruthy();
  });

  test(`filter ${streaming ? "streaming" : "inline"}: no matches keeps the header, and truncation counts only matched rows`, async () => {
    const empty = await execute(
      filter,
      "name,note\nAda,discard",
      { delimiter: ",", column: "note", query: "keep" },
      streaming,
    );
    expect(empty.tablePreview.rows).toEqual([]);
    expect(empty.tablePreview.truncated).toBe(false);
    expect(await completeText(empty)).toBe("name,note");

    const source = ["name,note", ...Array.from({ length: 1001 }, (_, i) => `${i},discard`), "Ada,keep"].join("\n");
    const result = await execute(filter, source, { delimiter: ",", column: "note", query: "keep" }, streaming);
    expect(result.tablePreview.rows).toEqual([["Ada", "keep"]]);
    expect(result.tablePreview.truncated).toBe(false);
    expect(await completeText(result)).toBe("name,note\nAda,keep");
  });
}
