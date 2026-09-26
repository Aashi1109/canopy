import assert from "node:assert/strict";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { classHighlighter, highlightTree } from "@lezer/highlight";

import { loadCodeEditorLanguage } from "../components/content/codeEditorLanguages.ts";

const { test } = await import(process.env.VITEST ? "vitest" : "node:test");

async function parse(code, language = "qr") {
  const state = EditorState.create({ doc: code, extensions: [await loadCodeEditorLanguage(language)] });
  const tree = ensureSyntaxTree(state, state.doc.length, 500);
  assert.ok(tree, "small QR input should finish parsing");
  const highlights = [];
  highlightTree(tree, classHighlighter, (from, to, style) => highlights.push({ from, to, style }));
  const at = (text, offset = 0) => {
    const index = code.indexOf(text) + offset;
    return highlights.find(({ from, to }) => from <= index && index < to)?.style ?? "";
  };
  return { state, highlights, at };
}

test("QR URLs distinguish their scheme, address, path, query keys, values, and fragment", async () => {
  const code = "https://example.com/account?name=Ada%20Lovelace&active=true#details";
  const { state, at } = await parse(code, " QR ");
  assert.equal(state.doc.toString(), code);
  assert.match(at("https"), /tok-keyword/);
  assert.match(at("example.com"), /tok-link/);
  assert.match(at("account"), /tok-string/);
  assert.match(at("name"), /tok-keyword/);
  assert.match(at("Ada%20Lovelace"), /tok-string/);
  assert.match(at("active"), /tok-keyword/);
  assert.match(at("true"), /tok-string/);
  assert.match(at("details"), /tok-string/);
  assert.deepEqual(state.languageDataAt("autocomplete", 1), []);
});

test("QR highlighting supports incomplete URLs and common non-web schemes while typing", async () => {
  for (const code of [
    "https:",
    "https:/",
    "https://",
    "https://example.com?search=",
    "mailto:ada@example.com",
    "tel:+15551234567",
    "custom://device/path",
  ]) {
    const { state, at } = await parse(code);
    assert.equal(state.doc.toString(), code);
    assert.match(at(code.split(":")[0]), /tok-keyword/);
  }
});

test("QR Wi-Fi fields retain escaped delimiters inside their values", async () => {
  const code = String.raw`WIFI:T:WPA;S:Office\;Guest;P:a\:b\;c\\d;H:false;;`;
  const { state, at } = await parse(code);
  assert.equal(state.doc.toString(), code);
  assert.match(at("WIFI"), /tok-keyword/);
  for (const field of ["T:", "S:", "P:", "H:"]) assert.match(at(field), /tok-keyword/);
  for (const value of ["WPA", String.raw`Office\;Guest`, String.raw`a\:b\;c\\d`, "false"]) {
    for (let offset = 0; offset < value.length; offset++) assert.match(at(value, offset), /tok-string/);
  }
  const partial = await parse("WIFI:S:Office;P:password\\");
  assert.match(partial.at("password\\", 8), /tok-string/);
});

test("QR vCards highlight properties, parameters, quoted parameter values, and folded content", async () => {
  const code =
    'BEGIN:VCARD\nVERSION:3.0\nFN:Ada Lovelace\nTEL;TYPE="work,voice":+15551234567\nNOTE:First line\n continued note\nEND:VCARD\nPlain text 42 true';
  const { state, at } = await parse(code);
  assert.equal(state.doc.toString(), code);
  for (const field of ["BEGIN", "VERSION", "FN", "TEL", "TYPE", "NOTE", "END"]) assert.match(at(field), /tok-keyword/);
  for (const value of ["3.0", "Ada Lovelace", '"work,voice"', "+15551234567", "First line", "continued note"])
    assert.match(at(value), /tok-string/);
  assert.equal(at("Plain text"), "");
  assert.equal(at("42"), "");
});

test("QR plain prose, arbitrary numbers, and unrecognized prefixes remain unhighlighted", async () => {
  for (const code of [
    "",
    "Scan me",
    "42 true false null",
    "Reminder: buy 2 things",
    "BEGIN:story\nFN:Someone",
    "Meet at 12:30",
    "This mentions https://example.com in prose",
  ]) {
    const { state, highlights } = await parse(code);
    assert.equal(state.doc.toString(), code);
    assert.deepEqual(highlights, []);
  }
});

test("QR formatting resets between independent lines and after URL whitespace", async () => {
  const code = "https://example.com plain text 42\nWIFI:S:Office;;\nPlain text true\nhttps://other.example/path";
  const { at } = await parse(code);
  assert.equal(at("plain text"), "");
  assert.equal(at("Plain text"), "");
  assert.equal(at("true"), "");
  assert.match(at("Office"), /tok-string/);
  assert.match(at("other.example"), /tok-link/);
  assert.match(at("path"), /tok-string/);
});
