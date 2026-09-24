import { test, expect } from "vitest";
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

    expect(result.render).toBe("text");
    expect(result.text).toBe("firstName,lastName\nAarav,Sharma\nPriya,Mehta");
    expect(result.tablePreview).toEqual({
      render: "table",
      columns: ["firstName", "lastName"],
      rows: [
        ["Aarav", "Sharma"],
        ["Priya", "Mehta"],
      ],
      showColumnDividers: true,
      truncated: false,
    });
    expect(result.stats).toEqual([
      { label: "Rows", value: "2" },
      { label: "Columns", value: "2" },
    ]);
    if (streaming) {
      expect(await result.artifacts[0].blob.text()).toBe(result.text);
      expect(result.artifacts[0].name).toBe("extracted-columns.csv");
      expect(result.artifacts[0].mime).toBe("text/csv");
      expect(result.downloadName).toBe(undefined);
    } else {
      expect(result.downloadName).toBe("extracted-columns.csv");
    }
  });

  test(`${mode}: mixes trimmed names and 1-based positions without discarding repeats`, async () => {
    const source = "id,firstName,lastName\n1001,Aarav,Sharma";
    const result = await extract(source, " 3, firstName , 1,3 ", { streaming });

    expect(result.text).toBe("lastName,firstName,id,lastName\nSharma,Aarav,1001,Sharma");
    expect((await extract(source, " firstName ", { streaming })).text).toBe("firstName\nAarav");
    expect((await extract(source, "2", { streaming })).text).toBe("firstName\nAarav");
    expect((await extract("2,name\nleft,right", "2", { streaming })).text).toBe("name\nright");
  });

  test(`${mode}: serializes selected rows with each configured delimiter and CSV quoting`, async () => {
    for (const delimiter of [",", ";", "\t", "|"]) {
      const source = `firstName${delimiter}lastName${delimiter}note\nAda${delimiter}Lovelace${delimiter}"a${delimiter}b ""quoted""\nnext"`;
      const result = await extract(source, "note,firstName", { delimiter, streaming });
      const expected = [`note${delimiter}firstName`, `"a${delimiter}b ""quoted""\nnext"${delimiter}Ada`];

      expect(result.text).toBe(expected.join("\n"));
      expect(result.tablePreview.columns).toEqual(["note", "firstName"]);
      expect(result.tablePreview.rows).toEqual([[`a${delimiter}b "quoted"\nnext`, "Ada"]]);
      if (streaming) expect(await result.artifacts[0].blob.text()).toBe(expected.join("\n"));
    }
  });

  test(`${mode}: retains comma headers and accepts quoted selectors with surrounding whitespace`, async () => {
    const source = '"last,name","a""quote",firstName\nLovelace,hello,Ada';

    expect((await extract(source, "last,name", { streaming })).text).toBe('"last,name"\nLovelace');
    expect((await extract(source, ' "last,name" , firstName , "a""quote" ', { streaming })).text).toBe(
      '"last,name",firstName,"a""quote"\nLovelace,Ada,hello',
    );

    const ambiguous = '"firstName,lastName",firstName,lastName\nFull,Ada,Lovelace';
    expect((await extract(ambiguous, "firstName,lastName", { streaming })).text).toBe('"firstName,lastName"\nFull');
    expect((await extract(ambiguous, '"firstName","lastName"', { streaming })).text).toBe(
      "firstName,lastName\nAda,Lovelace",
    );
    const spaced = await extract('" first ",lastName\nAda,Lovelace', '" first ",lastName', { streaming });
    expect(spaced.text).toBe(" first ,lastName\nAda,Lovelace");
    expect(spaced.tablePreview.columns).toEqual([" first ", "lastName"]);
  });

  test(`${mode}: keeps empty selected cells as table rows and reports data row counts`, async () => {
    const result = await extract("id,note\n1,\n2,", "note", { streaming });

    expect(result.text).toBe("note\n\n");
    expect(result.tablePreview.columns).toEqual(["note"]);
    expect(result.tablePreview.rows).toEqual([[""], [""]]);
    expect(result.stats).toEqual([
      { label: "Rows", value: "2" },
      { label: "Columns", value: "1" },
    ]);
    const headerOnly = await extract("id,note", "note", { streaming });
    expect(headerOnly.text).toBe("note");
    expect(headerOnly.tablePreview.rows).toEqual([]);
    expect(headerOnly.stats[0].value).toBe("0");
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

      expect(result.tablePreview.rows.length).toBe(previewRows);
      expect(result.tablePreview.columns.length).toBe(columnCount);
      expect(result.tablePreview.truncated).toBe(true);
      expect(result.stats[0].value).toBe(String(rowCount));
      expect(result.stats[1].value).toBe(String(columnCount));
      const complete = streaming ? await result.artifacts[0].blob.text() : result.text;
      expect(complete.split("\n").length).toBe(rowCount + 1);
    }
  });

  test(`${mode}: rejects empty, malformed, unknown, and out-of-range selectors clearly`, async () => {
    const source = "firstName,lastName\nAda,Lovelace";
    for (const column of ["", "   "]) {
      await expect(extract(source, column, { streaming })).rejects.toMatchObject({ code: "column-required" });
    }
    for (const column of [
      ",",
      "firstName,",
      ",firstName",
      "firstName,,lastName",
      '"firstName',
      "firstName\nlastName",
    ]) {
      await expect(extract(source, column, { streaming })).rejects.toMatchObject({ code: "invalid-column-selection" });
    }
    for (const column of ["missing", "firstName,missing", "0", "firstName,3", "999999999999999999999"]) {
      await expect(extract(source, column, { streaming })).rejects.toSatisfy((error) => {
        expect(error.code).toBe("column-not-found");
        expect(error.message).toMatch(/missing|0|3|999999999999999999999/);
        expect(error.recovery).toMatch(/1.*2/);
        return true;
      });
    }
  });

  test(`${mode}: retains an ordered table prefix within the UTF-8 byte budget and exports every cell`, async () => {
    const value = "😀".repeat(150_000);
    const result = await extract(`id,value\n1,${value}\n2,${value}\n3,end`, "value,value", { streaming });

    expect(result.tablePreview.rows.length).toBe(1);
    expect(
      result.tablePreview.rows[0].every((cell) => cell === value),
      "Preview cells remain complete",
    ).toBeTruthy();
    expect(result.tablePreview.truncated).toBe(true);
    const previewBytes = [...result.tablePreview.columns, ...result.tablePreview.rows.flat()].reduce(
      (size, cell) => size + new TextEncoder().encode(cell).byteLength,
      0,
    );
    expect(previewBytes <= CSV_PREVIEW_BYTES).toBeTruthy();
    const output = streaming ? await result.artifacts[0].blob.text() : result.text;
    expect(
      output === `value,value\n${value},${value}\n${value},${value}\nend,end`,
      "CSV export retains every selected row",
    ).toBeTruthy();
    expect(result.stats[0].value).toBe("3");

    const oversized = "😀".repeat(CSV_PREVIEW_BYTES / 4 + 1);
    const oversizedResult = await extract(`id,value\n1,${oversized}\n2,end`, "value", { streaming });
    expect(oversizedResult.tablePreview.rows).toEqual([]);
    expect(oversizedResult.tablePreview.truncated).toBe(true);
    const complete = streaming ? await oversizedResult.artifacts[0].blob.text() : oversizedResult.text;
    expect(
      complete === `value\n${oversized}\nend`,
      "CSV export retains the oversized cell and later rows",
    ).toBeTruthy();
  });

  test(`${mode}: omits an oversized table header while preserving complete CSV export`, async () => {
    const header = "😀".repeat(300_000);
    const result = await extract(`${header}\nvalue`, "1,1", { streaming });

    expect(result.tablePreview === undefined, "Oversized headers must not enter the table preview").toBeTruthy();
    const output = streaming ? await result.artifacts[0].blob.text() : result.text;
    expect(output === `${header},${header}\nvalue,value`, "CSV export retains repeated oversized headers").toBeTruthy();
    expect(result.stats).toEqual([
      { label: "Rows", value: "1" },
      { label: "Columns", value: "2" },
    ]);
  });
}

test("file streaming bounds raw text while retaining complete CSV in a downloadable artifact", async () => {
  const rows = Array.from({ length: 1002 }, (_, index) => `${index},${"F".repeat(300)}${index},Last${index}`);
  const result = await extract(["id,firstName,lastName", ...rows].join("\n"), "lastName,2", { streaming: true });

  expect(result.render).toBe("text");
  expect(result.tablePreview.rows.length).toBe(1000);
  expect(result.tablePreview.truncated).toBe(true);
  expect(result.truncated).toBe(true);
  expect(new TextEncoder().encode(result.text).byteLength <= LARGE_TEXT_PREVIEW_BYTES).toBeTruthy();
  expect(result.stats).toEqual([
    { label: "Rows", value: "1002" },
    { label: "Columns", value: "2" },
  ]);
  const output = await result.artifacts[0].blob.text();
  expect(output.split("\n").length).toBe(1003);
  expect(output.endsWith(`\nLast1001,${"F".repeat(300)}1001`)).toBeTruthy();
  expect(output.startsWith(result.text)).toBeTruthy();
  expect(result.artifacts[0].mime).toBe("text/csv");
  expect(result.artifacts[0].name).toBe("extracted-columns.csv");
  expect(result.downloadName).toBe(undefined);
});
