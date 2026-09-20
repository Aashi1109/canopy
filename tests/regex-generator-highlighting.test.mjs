import assert from "node:assert/strict";
import test from "node:test";
import { highlightRegexOutput } from "../tools/regex-generator/highlighting.ts";
import { run } from "../tools/regex-generator/run.ts";

function texts(tokens, kind) {
  return tokens.filter((token) => token.kind === kind).map((token) => token.text);
}

test("regex highlighting distinguishes classes, escapes, groups, quantifiers, anchors and alternatives", () => {
  const output = String.raw`/^(?<match>[a-z#'|]+|\d{2,4})(?:\.)?(?=end).*$/gim`;
  const tokens = highlightRegexOutput(output);
  assert.equal(tokens.map((token) => token.text).join(""), output);
  assert.deepEqual(texts(tokens, "character-class"), ["[a-z#'|]"]);
  assert.deepEqual(texts(tokens, "escape"), [String.raw`\d`, String.raw`\.`]);
  assert.deepEqual(texts(tokens, "group"), ["(?<match>", ")", "(?:", ")", "(?=", ")"]);
  assert.deepEqual(texts(tokens, "quantifier"), ["+", "{2,4}", "?", "*"]);
  assert.deepEqual(texts(tokens, "anchor"), ["^", ".", "$"]);
  assert.deepEqual(texts(tokens, "alternation"), ["|"]);
  assert.deepEqual(texts(tokens, "delimiter"), ["/", "/gim"]);
  assert.deepEqual(texts(tokens, "comment"), []);
});

test("escaped class terminators and regex operators stay inside their character class", () => {
  const tokens = highlightRegexOutput(String.raw`/[\]\\#'|?]+\?\|\//`);
  assert.deepEqual(texts(tokens, "character-class"), [String.raw`[\]\\#'|?]`]);
  assert.deepEqual(texts(tokens, "escape"), [String.raw`\?`, String.raw`\|`, String.raw`\/`]);
  assert.deepEqual(texts(tokens, "quantifier"), ["+"]);
  assert.deepEqual(texts(tokens, "alternation"), []);
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
    assert.equal(tokens.map((token) => token.text).join(""), output);
    assert.deepEqual(texts(tokens, "delimiter"), delimiters);
    assert.deepEqual(texts(tokens, "group"), groups);
    assert.equal(texts(tokens, "comment").length, Number(output.includes("Explanation")));
    assert.ok(texts(tokens, "character-class").some((value) => value.startsWith("[a-z")));
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
              assert.equal(tokens.map((token) => token.text).join(""), result.text);
              assert.equal(texts(tokens, "delimiter").length, 2);
              assert.equal(texts(tokens, "comment").length, Number(explain));
              assert.ok(texts(tokens, "character-class").length > 0);
              assert.ok(tokens.every((token) => token.text.length > 0));
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
    assert.deepEqual(highlightRegexOutput(output), [{ kind: "literal", text: output }]);
  }
});
