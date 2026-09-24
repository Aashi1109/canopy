import { expect, test } from "vitest";
import { highlightRegexOutput } from "../tools/regex-generator/highlighting.ts";
import { run } from "../tools/regex-generator/run.ts";

function texts(tokens, kind) {
  return tokens.filter((token) => token.kind === kind).map((token) => token.text);
}

test("regex highlighting distinguishes classes, escapes, groups, quantifiers, anchors and alternatives", () => {
  const output = String.raw`/^(?<match>[a-z#'|]+|\d{2,4})(?:\.)?(?=end).*$/gim`;
  const tokens = highlightRegexOutput(output);
  expect(tokens.map((token) => token.text).join("")).toBe(output);
  expect(texts(tokens, "character-class")).toEqual(["[a-z#'|]"]);
  expect(texts(tokens, "escape")).toEqual([String.raw`\d`, String.raw`\.`]);
  expect(texts(tokens, "group")).toEqual(["(?<match>", ")", "(?:", ")", "(?=", ")"]);
  expect(texts(tokens, "quantifier")).toEqual(["+", "{2,4}", "?", "*"]);
  expect(texts(tokens, "anchor")).toEqual(["^", ".", "$"]);
  expect(texts(tokens, "alternation")).toEqual(["|"]);
  expect(texts(tokens, "delimiter")).toEqual(["/", "/gim"]);
  expect(texts(tokens, "comment")).toEqual([]);
});

test("escaped class terminators and regex operators stay inside their character class", () => {
  const tokens = highlightRegexOutput(String.raw`/[\]\\#'|?]+\?\|\//`);
  expect(texts(tokens, "character-class")).toEqual([String.raw`[\]\\#'|?]`]);
  expect(texts(tokens, "escape")).toEqual([String.raw`\?`, String.raw`\|`, String.raw`\/`]);
  expect(texts(tokens, "quantifier")).toEqual(["+"]);
  expect(texts(tokens, "alternation")).toEqual([]);
});

test("Python and PHP wrappers keep calls and comments separate from the regex body", () => {
  const cases = [
    ['# Explanation\nre.findall(r"(?im:(?P<match>[a-z]+))", text)', ['r"', '"'], ["(?im:", "(?P<match>", ")", ")"]],
    ['// Explanation\npreg_match_all("~(?<match>[a-z#]+)~im", $text, $matches)', ['"~', '~im"'], ["(?<match>", ")"]],
    ['r"(?m:[a-z]+)"', ['r"', '"'], ["(?m:", ")"]],
    ["~(?<match>[a-z#]+)~i", ["~", "~i"], ["(?<match>", ")"]],
  ];
  for (const [output, delimiters, groups] of cases) {
    const tokens = highlightRegexOutput(output);
    expect(tokens.map((token) => token.text).join("")).toBe(output);
    expect(texts(tokens, "delimiter")).toEqual(delimiters);
    expect(texts(tokens, "group")).toEqual(groups);
    expect(texts(tokens, "comment").length).toBe(Number(output.includes("Explanation")));
    expect(texts(tokens, "character-class").some((value) => value.startsWith("[a-z"))).toBeTruthy();
  }
});

test("all generated presets and settings preserve their complete copyable text", async () => {
  for (const preset of ["email", "url", "ipv4", "uuid", "hex-color", "password"]) {
    for (const language of ["javascript", "python", "php"]) {
      for (const flags of ["none", "global", "ignore-case", "global-ignore-case"]) {
        for (const addNamedGroups of [false, true]) {
          for (const multiline of [false, true]) {
            for (const explain of [false, true]) {
              const result = await run({
                input: { text: "" },
                settings: { preset, language, flags, addNamedGroups, multiline, explain },
                signal: new AbortController().signal,
              });
              const tokens = highlightRegexOutput(result.text);
              expect(tokens.map((token) => token.text).join("")).toBe(result.text);
              expect(texts(tokens, "delimiter").length).toBe(2);
              expect(texts(tokens, "comment").length).toBe(Number(explain));
              expect(texts(tokens, "character-class").length > 0).toBeTruthy();
              expect(tokens.every((token) => token.text.length > 0)).toBeTruthy();
            }
          }
        }
      }
    }
  }
});

test("unrecognized or incomplete output is returned as literal text", () => {
  for (const output of [
    "",
    "plain text",
    "/unfinished",
    'r"unterminated',
    "// Explanation\nunknown()",
    '<img src=x onerror="alert(1)">',
  ]) {
    expect(highlightRegexOutput(output)).toEqual([{ kind: "literal", text: output }]);
  }
});
