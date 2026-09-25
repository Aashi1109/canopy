import { test, expect } from "vitest";
import { CSV_PREVIEW_BYTES, CSV_PREVIEW_ROWS } from "../lib/tool-framework/limits.ts";
import { run } from "../tools/url-query-parser/run.ts";

function parse(text, settings = {}) {
  return run({
    input: { text },
    settings: { decodeValues: true, coerceNumbers: false, keepEmptyValues: true, ...settings },
  });
}

test("previews one row per occurrence in source order and keeps the exact JSON output", () => {
  const result = parse("https://example.com/search?tag=dev&q=smart+tools&tag=web&blank=&flag");

  expect(result.render).toBe("text");
  expect(result.text).toBe(JSON.stringify({ tag: ["dev", "web"], q: "smart tools", blank: "", flag: "" }, null, 2));
  expect(result.tablePreview).toEqual({
    render: "table",
    columns: ["Parameter", "Value"],
    rows: [
      ["tag", "dev"],
      ["q", "smart tools"],
      ["tag", "web"],
      ["blank", ""],
      ["flag", ""],
    ],
    showColumnDividers: true,
    truncated: false,
  });
});

test("preview and JSON both apply decoding, numeric coercion, and empty-value filtering", () => {
  const result = parse("n=0042&blank=&n=3.5&n=1e2&name=A%20B&word=true&space=+&n=1e999", {
    coerceNumbers: true,
    keepEmptyValues: false,
  });

  expect(JSON.parse(result.text)).toEqual({ n: [42, 3.5, 100, "1e999"], name: "A B", word: "true", space: " " });
  expect(result.tablePreview.rows).toEqual([
    ["n", "42"],
    ["n", "3.5"],
    ["n", "100"],
    ["name", "A B"],
    ["word", "true"],
    ["space", " "],
    ["n", "1e999"],
  ]);
});

test("encoded values remain encoded when decoding is disabled while names still decode", () => {
  const result = parse("https://example.com/?encoded%20key=A%20B+%26&n=0042&blank=", {
    decodeValues: false,
    coerceNumbers: true,
    keepEmptyValues: false,
  });

  expect(JSON.parse(result.text)).toEqual({ "encoded key": "A%20B+%26", n: 42 });
  expect(result.tablePreview.rows).toEqual([
    ["encoded key", "A%20B+%26"],
    ["n", "42"],
  ]);
});

for (const decodeValues of [true, false]) {
  test(`leading question mark accepts a bare query with decoding ${decodeValues ? "on" : "off"}`, () => {
    const result = parse("?utm_source=newsletter&q=smart+tools", { decodeValues });
    const expected = decodeValues ? "smart tools" : "smart+tools";

    expect(JSON.parse(result.text)).toEqual({ utm_source: "newsletter", q: expected });
    expect(result.tablePreview.rows).toEqual([
      ["utm_source", "newsletter"],
      ["q", expected],
    ]);
  });

  test(`bare queries ignore fragments and retain encoded hashes with decoding ${decodeValues ? "on" : "off"}`, () => {
    for (const prefix of ["", "?"]) {
      const result = parse(`${prefix}tag=web%23docs#section&ignored=value`, { decodeValues });
      const expected = decodeValues ? "web#docs" : "web%23docs";

      expect(JSON.parse(result.text)).toEqual({ tag: expected });
      expect(result.tablePreview.rows).toEqual([["tag", expected]]);
    }
  });
}

test("empty queries and filtered blank values explain their empty result", () => {
  const empty = parse("https://example.com/path#fragment");
  const filtered = parse("blank=&flag", { keepEmptyValues: false });

  for (const result of [empty, filtered]) {
    expect(result.text).toBe("{}");
    expect(result.tablePreview.rows).toEqual([]);
    expect(result.tablePreview.truncated).toBe(false);
    expect(result.verdict.level).toBe("ok");
    expect(result.verdict.label).toMatch(/No query parameters/);
  }
  expect(filtered.verdict.detail).toMatch(/Keep empty values/);
});

test("inherited object names are literal parameters in both views", () => {
  const result = parse("__proto__=first&constructor=value&toString=text&__proto__=second&=unnamed");

  expect(result.text).toBe(
    '{\n  "__proto__": [\n    "first",\n    "second"\n  ],\n  "constructor": "value",\n  "toString": "text",\n  "": "unnamed"\n}',
  );
  expect(result.tablePreview.rows).toEqual([
    ["__proto__", "first"],
    ["constructor", "value"],
    ["toString", "text"],
    ["__proto__", "second"],
    ["", "unnamed"],
  ]);
});

test("decoded markup and multiline values remain literal cell data", () => {
  const result = parse("%3Cscript%3E=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&line=one%0Atwo");

  expect(result.tablePreview.rows).toEqual([
    ["<script>", "<img src=x onerror=alert(1)>"],
    ["line", "one\ntwo"],
  ]);
  expect(JSON.parse(result.text)).toEqual({ "<script>": "<img src=x onerror=alert(1)>", line: "one\ntwo" });
});

test("long previews retain a bounded ordered prefix without truncating JSON", () => {
  const count = CSV_PREVIEW_ROWS + 1;
  const result = parse(Array.from({ length: count }, (_, i) => `item=${i}`).join("&"));

  expect(result.tablePreview.rows).toHaveLength(CSV_PREVIEW_ROWS);
  expect(result.tablePreview.rows[0]).toEqual(["item", "0"]);
  expect(result.tablePreview.rows.at(-1)).toEqual(["item", String(CSV_PREVIEW_ROWS - 1)]);
  expect(result.tablePreview.truncated).toBe(true);
  expect(JSON.parse(result.text).item).toHaveLength(count);
  expect(JSON.parse(result.text).item.at(-1)).toBe(String(count - 1));
});

test("oversized UTF-8 cells are omitted from preview while the complete JSON stays available", () => {
  const oversized = "😀".repeat(CSV_PREVIEW_BYTES / 4 + 1);
  const result = parse(`first=kept&large=${oversized}&last=last`);

  expect(result.tablePreview.rows).toEqual([["first", "kept"]]);
  expect(result.tablePreview.truncated).toBe(true);
  expect(JSON.parse(result.text)).toEqual({ first: "kept", large: oversized, last: "last" });
});

test("malformed complete URLs keep their existing validation error", () => {
  expect(() => parse("https://?a=1")).toThrow("URL or query string is invalid.");
});
