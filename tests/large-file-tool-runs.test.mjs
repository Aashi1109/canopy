import { expect, test } from "vitest";
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

  expect(file.size > LARGE_FILE_THRESHOLD).toBe(true);
  expect(result.render).toBe("code");
  expect(result.code.length).toBe(LARGE_TEXT_PREVIEW_BYTES);
  expect(result.code).toBe(expected.slice(0, LARGE_TEXT_PREVIEW_BYTES));
  expect(result.sections?.length).toBe(1);
  const artifact = onlyArtifact(result);
  expect(artifact.size).toBe(new TextEncoder().encode(expected).byteLength);
  expect(await (await readArtifact(artifact)).text()).toBe(expected);
});

test("CSV viewer parses the complete large File but keeps at most 1,000 data rows", async () => {
  const fixture = largeCsvFixture();
  const file = new File([fixture.csv], "large.csv", { type: "text/csv" });
  const { context } = runContext(file, { delimiter: "," }, "large-csv-view");

  const result = await viewCsv(context);

  expect(file.size > LARGE_FILE_THRESHOLD).toBe(true);
  expect(result.render).toBe("table");
  expect(result.columns).toEqual(["id", "value"]);
  expect(result.rows.length).toBe(1_000);
  expect(result.rows[0]).toEqual(["1", fixture.value]);
  expect(result.rows.at(-1)).toEqual(["1000", fixture.value]);
  expect(result.truncated).toBe(true);
  expect(statValue(result, "Rows")).toBe(String(fixture.dataRows));
  expect(statValue(result, "Columns")).toBe("2");
});

test("CSV-to-TSV converts every row of a large File into a streamed artifact", async () => {
  const fixture = largeCsvFixture();
  const file = new File([fixture.csv], "large.csv", { type: "text/csv" });
  const { context } = runContext(file, {}, "large-csv-convert");

  const result = await convertCsvToTsv(context);

  expect(file.size > LARGE_FILE_THRESHOLD).toBe(true);
  expect(result.render).toBe("code");
  expect(result.code.length).toBe(LARGE_TEXT_PREVIEW_BYTES);
  expect(result.code).toBe(fixture.tsv.slice(0, LARGE_TEXT_PREVIEW_BYTES));
  expect(statValue(result, "Rows")).toBe(String(fixture.dataRows + 1));
  expect(statValue(result, "Columns")).toBe("2");
  const artifact = onlyArtifact(result);
  expect(artifact.size).toBe(new TextEncoder().encode(fixture.tsv).byteLength);
  expect(await (await readArtifact(artifact)).text()).toBe(fixture.tsv);
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
  expect(section).toBeTruthy();
  expect(section.body.render).toBe("files");
  expect(section.body.files.length).toBe(1);
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
