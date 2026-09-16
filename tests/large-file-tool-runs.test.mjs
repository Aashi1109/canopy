import assert from "node:assert/strict";
import test from "node:test";

import { createArtifactWriter, readArtifact } from "../lib/tool-framework/artifacts.ts";
import { LARGE_TEXT_PREVIEW_BYTES } from "../lib/tool-framework/limits.ts";
import { run as formatJson } from "../tools/json-formatter/run.worker.ts";
import { run as viewCsv } from "../tools/csv-viewer/run.worker.ts";
import { run as convertCsvToTsv } from "../tools/csv-to-tsv/run.worker.ts";

const LARGE_FILE_THRESHOLD = 2_000_000;

test("JSON formatter streams a complete large File into an artifact with a bounded preview", async () => {
  const payload = "x".repeat(LARGE_FILE_THRESHOLD + 1);
  const input = `{"payload":"${payload}"}`;
  const expected = `{\n  "payload": "${payload}"\n}`;
  const file = new File([input], "large.json", { type: "application/json" });
  const { context } = runContext(
    file,
    {
      indentation: "2",
      operation: "format",
    },
    "large-json-format",
  );

  const result = await formatJson(context);

  assert.equal(file.size > LARGE_FILE_THRESHOLD, true);
  assert.equal(result.render, "code");
  assert.equal(result.code.length, LARGE_TEXT_PREVIEW_BYTES);
  assert.equal(result.code, expected.slice(0, LARGE_TEXT_PREVIEW_BYTES));
  assert.equal(result.sections?.length, 1);
  const artifact = onlyArtifact(result);
  assert.equal(artifact.size, new TextEncoder().encode(expected).byteLength);
  assert.equal(await (await readArtifact(artifact)).text(), expected);
});

test("CSV viewer parses the complete large File but keeps at most 1,000 data rows", async () => {
  const fixture = largeCsvFixture();
  const file = new File([fixture.csv], "large.csv", { type: "text/csv" });
  const { context } = runContext(file, { delimiter: "," }, "large-csv-view");

  const result = await viewCsv(context);

  assert.equal(file.size > LARGE_FILE_THRESHOLD, true);
  assert.equal(result.render, "table");
  assert.deepEqual(result.columns, ["id", "value"]);
  assert.equal(result.rows.length, 1_000);
  assert.deepEqual(result.rows[0], ["1", fixture.value]);
  assert.deepEqual(result.rows.at(-1), ["1000", fixture.value]);
  assert.equal(result.truncated, true);
  assert.equal(statValue(result, "Rows"), String(fixture.dataRows));
  assert.equal(statValue(result, "Columns"), "2");
});

test("CSV-to-TSV converts every row of a large File into a streamed artifact", async () => {
  const fixture = largeCsvFixture();
  const file = new File([fixture.csv], "large.csv", { type: "text/csv" });
  const { context } = runContext(file, {}, "large-csv-convert");

  const result = await convertCsvToTsv(context);

  assert.equal(file.size > LARGE_FILE_THRESHOLD, true);
  assert.equal(result.render, "code");
  assert.equal(result.code.length, LARGE_TEXT_PREVIEW_BYTES);
  assert.equal(result.code, fixture.tsv.slice(0, LARGE_TEXT_PREVIEW_BYTES));
  assert.equal(statValue(result, "Rows"), String(fixture.dataRows + 1));
  assert.equal(statValue(result, "Columns"), "2");
  const artifact = onlyArtifact(result);
  assert.equal(artifact.size, new TextEncoder().encode(fixture.tsv).byteLength);
  assert.equal(await (await readArtifact(artifact)).text(), fixture.tsv);
});

function runContext(file, settings, jobId) {
  const artifacts = createArtifactWriter(jobId);
  return {
    artifacts,
    context: {
      input: {
        files: [
          {
            id: `${jobId}-input`,
            mime: file.type,
            name: file.name,
            size: file.size,
            source: file,
          },
        ],
        text: "",
      },
      progress() {},
      settings,
      signal: new AbortController().signal,
      writeArtifact: artifacts.write,
    },
  };
}

function onlyArtifact(result) {
  const section = result.sections?.[0];
  assert.ok(section);
  assert.equal(section.body.render, "files");
  assert.equal(section.body.files.length, 1);
  return section.body.files[0];
}

function statValue(result, label) {
  return result.stats?.find((stat) => stat.label === label)?.value;
}

function largeCsvFixture() {
  const dataRows = 1_500;
  const value = "v".repeat(1_400);
  const rows = Array.from({ length: dataRows }, (_, index) => `${index + 1},${value}`);
  return {
    csv: ["id,value", ...rows].join("\n"),
    dataRows,
    tsv: ["id\tvalue", ...rows.map((row) => row.replace(",", "\t"))].join("\n"),
    value,
  };
}
