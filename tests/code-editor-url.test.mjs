import assert from "node:assert/strict";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { test } from "vitest";

import { loadCodeEditorLanguage } from "../components/content/codeEditorLanguages.ts";

function highlights(state) {
  const tree = ensureSyntaxTree(state, state.doc.length, 500);
  assert.ok(tree, "URL input should finish parsing");
  const spans = [];
  highlightTree(tree, classHighlighter, (from, to, style) => spans.push({ from, to, style }));
  return (offset) => spans.find(({ from, to }) => from <= offset && offset < to)?.style ?? "";
}

async function parse(code) {
  const state = EditorState.create({ doc: code, extensions: [await loadCodeEditorLanguage(" URL ")] });
  assert.equal(state.doc.toString(), code);
  assert.deepEqual(state.languageDataAt("autocomplete", 0), []);
  return { state, at: highlights(state) };
}

test("URL highlighting distinguishes address parts, query fields, delimiters, and encoded bytes", async () => {
  const code = "https://user:pass@[2001:db8::1]:8443/api/caf%C3%A9?name=Ada+Lovelace&active=true";
  const { at } = await parse(code);
  assert.match(at(code.indexOf("https")), /tok-keyword/);
  assert.match(at(code.indexOf("user:pass")), /tok-link/);
  assert.match(at(code.indexOf("2001")), /tok-link/);
  assert.match(at(code.indexOf("8443")), /tok-link/);
  assert.match(at(code.indexOf("api")), /tok-string/);
  assert.match(at(code.indexOf("caf")), /tok-string/);
  for (const key of ["name", "active"]) assert.match(at(code.indexOf(key)), /tok-keyword/);
  for (const value of ["Ada", "+", "true"]) assert.match(at(code.indexOf(value)), /tok-string/);
  for (const marker of ["//", "/api", "?", "=", "&"]) assert.match(at(code.indexOf(marker)), /tok-punctuation/);
  for (const escape of ["%C3", "%A9"]) {
    for (let index = 0; index < escape.length; index++) assert.match(at(code.indexOf(escape) + index), /tok-atom/);
  }
});

for (const prefix of ["", "?"]) {
  test(`bare query highlighting ${prefix ? "with" : "without"} a question mark preserves repeated and empty fields`, async () => {
    const code = `${prefix}tag=one&tag=two&empty=&flag&=anonymous&query=a?b=c`;
    const { at } = await parse(code);
    for (const index of [
      code.indexOf("tag"),
      code.lastIndexOf("tag"),
      code.indexOf("empty"),
      code.indexOf("flag"),
      code.indexOf("query"),
    ]) {
      assert.match(at(index), /tok-keyword/);
    }
    for (const value of ["one", "two", "anonymous", "a?b=c"]) {
      for (let index = 0; index < value.length; index++) assert.match(at(code.indexOf(value) + index), /tok-string/);
    }
    if (prefix) assert.match(at(0), /tok-punctuation/);
    assert.match(at(code.indexOf("=&")), /tok-punctuation/);
    assert.match(at(code.indexOf("&=")), /tok-punctuation/);
  });
}

test("encoded nested URLs remain values and do not introduce new query fields", async () => {
  const code = "redirect=https%3A%2F%2Fexample.com%2Ffind%3Fx%3D1%26y%3D2&%6Eame=Alice%20Smith";
  const { at } = await parse(code);
  for (const match of code.matchAll(/%[\da-f]{2}/gi)) {
    for (let index = 0; index < 3; index++) assert.match(at(match.index + index), /tok-atom/);
  }
  for (const text of ["https", "example.com", "find", "x%3D", "y%3D", "Alice", "Smith"]) {
    assert.match(at(code.indexOf(text)), /tok-string/);
  }
  assert.match(at(code.indexOf("ame=")), /tok-keyword/);
});

test("fragment query-like characters stay literal and incremental edits recalculate their role", async () => {
  const code = "https://example.com?name=Ada#part?x&other=value%20here";
  const { state, at } = await parse(code);
  const fragment = code.indexOf("#");
  assert.match(at(fragment), /tok-punctuation/);
  for (let index = fragment + 1; index < code.indexOf("%20"); index++) assert.match(at(index), /tok-string/);
  assert.match(at(code.indexOf("%20")), /tok-atom/);

  const edited = state.update({ changes: { from: fragment, to: fragment + 1, insert: "&" } }).state;
  assert.equal(edited.doc.toString(), code.replace("#", "&"));
  assert.match(highlights(edited)(code.indexOf("other")), /tok-keyword/);
});

test("malformed percent escapes stay ordinary values and incomplete edits always preserve input", async () => {
  const code = "broken=%G1&short=%2&percent=%&complete=%2f";
  const { at } = await parse(code);
  for (const escape of ["%G1", "%2&", "%&"]) assert.match(at(code.indexOf(escape)), /tok-string/);
  assert.match(at(code.indexOf("%2f")), /tok-atom/);
  for (const partial of [
    "",
    "?",
    "&",
    "=",
    "https:",
    "https:/",
    "https://",
    "https://[",
    "?key=",
    "?key=%",
    "?key=%2",
    "?key=<script>😀",
    "#?&=",
  ]) {
    await parse(partial);
  }
});

test("URL highlighting resets between lines and supports relative URL paths", async () => {
  const code = "  //example.com/path?first=one#fragment\n  second=two\n/path/to?third=three";
  const { at } = await parse(code);
  assert.match(at(code.indexOf("example.com")), /tok-link/);
  assert.match(at(code.indexOf("second")), /tok-keyword/);
  assert.match(at(code.indexOf("two")), /tok-string/);
  assert.match(at(code.lastIndexOf("path")), /tok-string/);
  assert.match(at(code.indexOf("third")), /tok-keyword/);
});
