import assert from "node:assert/strict";
import test from "node:test";

import { LARGE_CSV_FILE_BYTES } from "../lib/devtools/shared/streaming-csv-tool.ts";
import { CSV_PREVIEW_BYTES, LARGE_TEXT_PREVIEW_BYTES } from "../lib/tool-framework/limits.ts";
import { run } from "../tools/csv-column-extractor/run.worker.ts";

async function extract(text, column, { delimiter = ",", streaming = false } = {}) {
  const file = new File([text], "input.csv", { type: "text/csv" });
  return run({
    input: {
      text: streaming ? "" : text,
      // Exercise the file branch with small, readable fixtures.
      files: streaming
        ? [{ id: "input", name: file.name, mime: file.type, size: LARGE_CSV_FILE_BYTES + 1, source: file }]
        : [],
    },
    settings: { column, delimiter },
    signal: new AbortController().signal,
    progress() {},
    async writeArtifact({ mime, name, source }) {
      const blob = await new Response(source).blob();
      return { id: "output", jobId: "extract-test", name, mime, size: blob.size, createdAt: 0, storage: "blob", blob };
    },
  });
}

for (const streaming of [false, true]) {
  const mode = streaming ? "file streaming" : "inline";

  test(`${mode}: extracts firstName,lastName together in requested order`, async () => {
    const result = await extract("id,firstName,lastName\n1001,Aarav,Sharma\n1002,Priya,Mehta", "firstName,lastName", {
      streaming,
    });

    assert.equal(result.render, "text");
    assert.equal(result.text, "firstName,lastName\nAarav,Sharma\nPriya,Mehta");
    assert.deepEqual(result.tablePreview, {
      render: "table",
      columns: ["firstName", "lastName"],
      rows: [
        ["Aarav", "Sharma"],
        ["Priya", "Mehta"],
      ],
      showColumnDividers: true,
      truncated: false,
    });
    assert.deepEqual(result.stats, [
      { label: "Rows", value: "2" },
      { label: "Columns", value: "2" },
    ]);
    if (streaming) {
      assert.equal(await result.artifacts[0].blob.text(), result.text);
      assert.equal(result.artifacts[0].name, "extracted-columns.csv");
      assert.equal(result.artifacts[0].mime, "text/csv");
      assert.equal(result.downloadName, undefined);
    } else {
      assert.equal(result.downloadName, "extracted-columns.csv");
    }
  });

  test(`${mode}: mixes trimmed names and 1-based positions without discarding repeats`, async () => {
    const source = "id,firstName,lastName\n1001,Aarav,Sharma";
    const result = await extract(source, " 3, firstName , 1,3 ", { streaming });

    assert.equal(result.text, "lastName,firstName,id,lastName\nSharma,Aarav,1001,Sharma");
    assert.equal((await extract(source, " firstName ", { streaming })).text, "firstName\nAarav");
    assert.equal((await extract(source, "2", { streaming })).text, "firstName\nAarav");
    assert.equal((await extract("2,name\nleft,right", "2", { streaming })).text, "name\nright");
  });

  test(`${mode}: serializes selected rows with each configured delimiter and CSV quoting`, async () => {
    for (const delimiter of [",", ";", "\t", "|"]) {
      const source = `firstName${delimiter}lastName${delimiter}note\nAda${delimiter}Lovelace${delimiter}"a${delimiter}b ""quoted""\nnext"`;
      const result = await extract(source, "note,firstName", { delimiter, streaming });
      const expected = [`note${delimiter}firstName`, `"a${delimiter}b ""quoted""\nnext"${delimiter}Ada`];

      assert.equal(result.text, expected.join("\n"));
      assert.deepEqual(result.tablePreview.columns, ["note", "firstName"]);
      assert.deepEqual(result.tablePreview.rows, [[`a${delimiter}b "quoted"\nnext`, "Ada"]]);
      if (streaming) assert.equal(await result.artifacts[0].blob.text(), expected.join("\n"));
    }
  });

  test(`${mode}: retains comma headers and accepts quoted selectors with surrounding whitespace`, async () => {
    const source = '"last,name","a""quote",firstName\nLovelace,hello,Ada';

    assert.equal((await extract(source, "last,name", { streaming })).text, '"last,name"\nLovelace');
    assert.equal(
      (await extract(source, ' "last,name" , firstName , "a""quote" ', { streaming })).text,
      '"last,name",firstName,"a""quote"\nLovelace,Ada,hello',
    );

    const ambiguous = '"firstName,lastName",firstName,lastName\nFull,Ada,Lovelace';
    assert.equal((await extract(ambiguous, "firstName,lastName", { streaming })).text, '"firstName,lastName"\nFull');
    assert.equal(
      (await extract(ambiguous, '"firstName","lastName"', { streaming })).text,
      "firstName,lastName\nAda,Lovelace",
    );
    const spaced = await extract('" first ",lastName\nAda,Lovelace', '" first ",lastName', { streaming });
    assert.equal(spaced.text, " first ,lastName\nAda,Lovelace");
    assert.deepEqual(spaced.tablePreview.columns, [" first ", "lastName"]);
  });

  test(`${mode}: keeps empty selected cells as table rows and reports data row counts`, async () => {
    const result = await extract("id,note\n1,\n2,", "note", { streaming });

    assert.equal(result.text, "note\n\n");
    assert.deepEqual(result.tablePreview.columns, ["note"]);
    assert.deepEqual(result.tablePreview.rows, [[""], [""]]);
    assert.deepEqual(result.stats, [
      { label: "Rows", value: "2" },
      { label: "Columns", value: "1" },
    ]);
    const headerOnly = await extract("id,note", "note", { streaming });
    assert.equal(headerOnly.text, "note");
    assert.deepEqual(headerOnly.tablePreview.rows, []);
    assert.equal(headerOnly.stats[0].value, "0");
  });

  test(`${mode}: bounds table previews by rows and cells without shortening CSV`, async () => {
    for (const [columnCount, rowCount, previewRows] of [
      [2, 1001, 1000],
      [25, 401, 400],
      [10001, 2, 1],
    ]) {
      const headers = Array.from({ length: columnCount }, (_, index) => `c${index}`);
      const record = headers.map((_, index) => String(index)).join(",");
      const result = await extract(
        [headers.join(","), ...Array.from({ length: rowCount }, () => record)].join("\n"),
        headers.join(","),
        { streaming },
      );

      assert.equal(result.tablePreview.rows.length, previewRows);
      assert.equal(result.tablePreview.columns.length, columnCount);
      assert.equal(result.tablePreview.truncated, true);
      assert.equal(result.stats[0].value, String(rowCount));
      assert.equal(result.stats[1].value, String(columnCount));
      const complete = streaming ? await result.artifacts[0].blob.text() : result.text;
      assert.equal(complete.split("\n").length, rowCount + 1);
    }
  });

  test(`${mode}: rejects empty, malformed, unknown, and out-of-range selectors clearly`, async () => {
    const source = "firstName,lastName\nAda,Lovelace";
    for (const column of ["", "   "]) {
      await assert.rejects(extract(source, column, { streaming }), { code: "column-required" });
    }
    for (const column of [
      ",",
      "firstName,",
      ",firstName",
      "firstName,,lastName",
      '"firstName',
      "firstName\nlastName",
    ]) {
      await assert.rejects(extract(source, column, { streaming }), { code: "invalid-column-selection" });
    }
    for (const column of ["missing", "firstName,missing", "0", "firstName,3", "999999999999999999999"]) {
      await assert.rejects(extract(source, column, { streaming }), (error) => {
        assert.equal(error.code, "column-not-found");
        assert.match(error.message, /missing|0|3|999999999999999999999/);
        assert.match(error.recovery, /1.*2/);
        return true;
      });
    }
  });

  test(`${mode}: retains an ordered table prefix within the UTF-8 byte budget and exports every cell`, async () => {
    const value = "😀".repeat(150_000);
    const result = await extract(`id,value\n1,${value}\n2,${value}\n3,end`, "value,value", { streaming });

    assert.equal(result.tablePreview.rows.length, 1);
    assert.ok(
      result.tablePreview.rows[0].every((cell) => cell === value),
      "Preview cells remain complete",
    );
    assert.equal(result.tablePreview.truncated, true);
    const previewBytes = [...result.tablePreview.columns, ...result.tablePreview.rows.flat()].reduce(
      (size, cell) => size + new TextEncoder().encode(cell).byteLength,
      0,
    );
    assert.ok(previewBytes <= CSV_PREVIEW_BYTES);
    const output = streaming ? await result.artifacts[0].blob.text() : result.text;
    assert.ok(
      output === `value,value\n${value},${value}\n${value},${value}\nend,end`,
      "CSV export retains every selected row",
    );
    assert.equal(result.stats[0].value, "3");

    const oversized = "😀".repeat(CSV_PREVIEW_BYTES / 4 + 1);
    const oversizedResult = await extract(`id,value\n1,${oversized}\n2,end`, "value", { streaming });
    assert.deepEqual(oversizedResult.tablePreview.rows, []);
    assert.equal(oversizedResult.tablePreview.truncated, true);
    const complete = streaming ? await oversizedResult.artifacts[0].blob.text() : oversizedResult.text;
    assert.ok(complete === `value\n${oversized}\nend`, "CSV export retains the oversized cell and later rows");
  });

  test(`${mode}: omits an oversized table header while preserving complete CSV export`, async () => {
    const header = "😀".repeat(300_000);
    const result = await extract(`${header}\nvalue`, "1,1", { streaming });

    assert.ok(result.tablePreview === undefined, "Oversized headers must not enter the table preview");
    const output = streaming ? await result.artifacts[0].blob.text() : result.text;
    assert.ok(output === `${header},${header}\nvalue,value`, "CSV export retains repeated oversized headers");
    assert.deepEqual(result.stats, [
      { label: "Rows", value: "1" },
      { label: "Columns", value: "2" },
    ]);
  });
}

test("file streaming bounds raw text while retaining complete CSV in a downloadable artifact", async () => {
  const rows = Array.from({ length: 1002 }, (_, index) => `${index},${"F".repeat(300)}${index},Last${index}`);
  const result = await extract(["id,firstName,lastName", ...rows].join("\n"), "lastName,2", { streaming: true });

  assert.equal(result.render, "text");
  assert.equal(result.tablePreview.rows.length, 1000);
  assert.equal(result.tablePreview.truncated, true);
  assert.equal(result.truncated, true);
  assert.ok(new TextEncoder().encode(result.text).byteLength <= LARGE_TEXT_PREVIEW_BYTES);
  assert.deepEqual(result.stats, [
    { label: "Rows", value: "1002" },
    { label: "Columns", value: "2" },
  ]);
  const output = await result.artifacts[0].blob.text();
  assert.equal(output.split("\n").length, 1003);
  assert.ok(output.endsWith(`\nLast1001,${"F".repeat(300)}1001`));
  assert.ok(output.startsWith(result.text));
  assert.equal(result.artifacts[0].mime, "text/csv");
  assert.equal(result.artifacts[0].name, "extracted-columns.csv");
  assert.equal(result.downloadName, undefined);
});
