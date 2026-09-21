import assert from "node:assert/strict";
import test from "node:test";

import { LARGE_CSV_FILE_BYTES } from "../lib/devtools/shared/streaming-csv-tool.ts";
import { CSV_PREVIEW_BYTES, LARGE_TEXT_PREVIEW_BYTES } from "../lib/tool-framework/limits.ts";
import { run } from "../tools/csv-to-table/run.worker.ts";

async function buildTable(text, { delimiter = ",", streaming = false } = {}) {
  const file = new File([text], "input.csv", { type: "text/csv" });
  return run({
    input: {
      text: streaming ? "" : text,
      // Exercise file streaming without duplicating large fixtures in every test.
      files: streaming
        ? [{ id: "input", name: file.name, mime: file.type, size: LARGE_CSV_FILE_BYTES + 1, source: file }]
        : [],
    },
    settings: { delimiter },
    signal: new AbortController().signal,
    progress() {},
    async writeArtifact({ mime, name, source }) {
      const blob = await new Response(source).blob();
      return { id: "output", jobId: "table-test", name, mime, size: blob.size, createdAt: 0, storage: "blob", blob };
    },
  });
}

async function completeHtml(result) {
  return result.render === "html" ? result.html : result.sections[0].body.files[0].blob.text();
}

for (const streaming of [false, true]) {
  const mode = streaming ? "file streaming" : "inline";

  test(`${mode}: preserves escaped HTML and provides literal structured table cells`, async () => {
    const source = '"na<me",note\n"<img src=x onerror=""alert(1)"">","line one\nline two & <script>"';
    const result = await buildTable(source, { streaming });
    const html =
      "<table><thead><tr><th>na&lt;me</th><th>note</th></tr></thead><tbody><tr><td>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</td><td>line one\nline two &amp; &lt;script&gt;</td></tr></tbody></table>";

    assert.equal(await completeHtml(result), html);
    assert.deepEqual(result.tablePreview, {
      render: "table",
      columns: ["na<me", "note"],
      rows: [['<img src=x onerror="alert(1)">', "line one\nline two & <script>"]],
      showColumnDividers: true,
      truncated: false,
    });
    if (streaming) {
      assert.equal(result.render, "code");
      assert.equal(result.language, "html");
      assert.equal(result.code, html);
      assert.equal(result.sections[0].body.files[0].name, "table.html");
      assert.equal(result.sections[0].body.files[0].mime, "text/html");
    } else {
      assert.equal(result.render, "html");
      assert.equal(result.downloadName, "table.html");
    }
  });

  test(`${mode}: parses each delimiter, quoted delimiters, and blank cells consistently`, async () => {
    for (const delimiter of [",", ";", "\t", "|"]) {
      const result = await buildTable(
        `name${delimiter}note\nAda${delimiter}"a${delimiter}b ""quoted"""\nLin${delimiter}`,
        { delimiter, streaming },
      );

      assert.deepEqual(result.tablePreview.columns, ["name", "note"]);
      assert.deepEqual(result.tablePreview.rows, [
        ["Ada", `a${delimiter}b "quoted"`],
        ["Lin", ""],
      ]);
      assert.equal(
        await completeHtml(result),
        `<table><thead><tr><th>name</th><th>note</th></tr></thead><tbody><tr><td>Ada</td><td>a${delimiter}b &quot;quoted&quot;</td></tr><tr><td>Lin</td><td></td></tr></tbody></table>`,
      );
    }
  });

  test(`${mode}: supports a header-only table and preserves CSV validation`, async () => {
    const result = await buildTable("name,role", { streaming });

    assert.deepEqual(result.tablePreview.columns, ["name", "role"]);
    assert.deepEqual(result.tablePreview.rows, []);
    assert.equal(result.tablePreview.truncated, false);
    assert.equal(
      await completeHtml(result),
      "<table><thead><tr><th>name</th><th>role</th></tr></thead><tbody></tbody></table>",
    );
    await assert.rejects(buildTable("name,role\nAda", { streaming }), {
      code: streaming ? "csv-width" : "inconsistent-row-width",
    });
    await assert.rejects(buildTable('name,role\nAda,"unfinished', { streaming }), {
      code: streaming ? "csv-unclosed-quote" : "invalid-delimited-input",
    });
    await assert.rejects(buildTable("name,role", { streaming, delimiter: ":" }), { code: "invalid-delimiter" });
  });

  test(`${mode}: bounds table rows and cells while keeping the complete HTML artifact`, async () => {
    for (const [columnCount, rowCount, previewRows] of [
      [2, 1001, 1000],
      [25, 401, 400],
      [10001, 2, 1],
    ]) {
      const header = Array.from({ length: columnCount }, (_, index) => `c${index}`).join(",");
      const row = Array.from({ length: columnCount }, (_, index) => String(index)).join(",");
      const result = await buildTable([header, ...Array.from({ length: rowCount }, () => row)].join("\n"), {
        streaming,
      });

      assert.equal(result.tablePreview.columns.length, columnCount);
      assert.equal(result.tablePreview.rows.length, previewRows);
      assert.equal(result.tablePreview.truncated, true);
      const html = await completeHtml(result);
      assert.equal(html.match(/<tr>/g).length, rowCount + 1);
      assert.ok(html.endsWith(`<td>${columnCount - 1}</td></tr></tbody></table>`));
    }
  });

  test(`${mode}: bounds UTF-8 preview bytes without skipping ahead or altering exported cells`, async () => {
    const value = "😀".repeat(300_000);
    const result = await buildTable(`name\n${value}\n${value}\nend`, { streaming });

    assert.equal(result.tablePreview.rows.length, 1);
    assert.ok(result.tablePreview.rows[0][0] === value, "Preview retains the complete first cell");
    assert.equal(result.tablePreview.truncated, true);
    assert.ok(
      new TextEncoder().encode(result.tablePreview.columns.join("") + result.tablePreview.rows.flat().join(""))
        .byteLength <= CSV_PREVIEW_BYTES,
    );
    const expected = `<table><thead><tr><th>name</th></tr></thead><tbody><tr><td>${value}</td></tr><tr><td>${value}</td></tr><tr><td>end</td></tr></tbody></table>`;
    assert.ok((await completeHtml(result)) === expected, "Export retains all complete cells in source order");
    if (streaming) {
      assert.equal(result.truncated, true);
      assert.ok(new TextEncoder().encode(result.code).byteLength <= LARGE_TEXT_PREVIEW_BYTES);
    }

    const tooLarge = "😀".repeat(CSV_PREVIEW_BYTES / 4 + 1);
    const oversizedCell = await buildTable(`name\n${tooLarge}\nend`, { streaming });
    assert.equal(oversizedCell.tablePreview.rows.length, 0);
    assert.equal(oversizedCell.tablePreview.truncated, true);
    assert.ok(
      (await completeHtml(oversizedCell)).includes(`<td>${tooLarge}</td>`),
      "Oversized cells remain in the HTML artifact",
    );
    const oversizedHeader = await buildTable(`${tooLarge}\nvalue`, { streaming });
    assert.ok(oversizedHeader.tablePreview === undefined, "Oversized headers do not enter the table preview");
    assert.ok(
      (await completeHtml(oversizedHeader)).includes(`<th>${tooLarge}</th>`),
      "Oversized headers remain in the HTML artifact",
    );
  });
}
