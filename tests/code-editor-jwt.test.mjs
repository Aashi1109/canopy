import assert from "node:assert/strict";
import { ensureSyntaxTree, highlightingFor } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { highlightTree } from "@lezer/highlight";

import { loadCodeEditorLanguage } from "../components/content/codeEditorLanguages.ts";

const { test } = await import(process.env.VITEST ? "vitest" : "node:test");

async function parse(code, language = "jwt") {
  const state = EditorState.create({ doc: code, extensions: [await loadCodeEditorLanguage(language)] });
  const tree = ensureSyntaxTree(state, state.doc.length, 500);
  assert.ok(tree, "small JWT input should finish parsing");
  const highlights = [];
  highlightTree(tree, { style: (tags) => highlightingFor(state, tags) }, (from, to, style) => {
    highlights.push({ text: code.slice(from, to), from, to, style });
  });
  return { state, highlights };
}

test("JWT highlighting distinguishes header, payload, and signature without changing the token", async () => {
  const code = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  const { state, highlights } = await parse(code, " JWT ");
  assert.equal(state.doc.toString(), code);
  assert.deepEqual(
    highlights.map(({ text }) => text),
    code.split("."),
  );
  assert.equal(new Set(highlights.map(({ style }) => style)).size, 3);
  assert.deepEqual(state.languageDataAt("autocomplete", 1), []);
});

test("JWT partial and empty segments retain their position while editing", async () => {
  const { highlights: complete } = await parse("header.payload.signature");
  for (const [code, segments] of [
    ["head", [["head", 0]]],
    [
      "header.pay",
      [
        ["header", 0],
        ["pay", 1],
      ],
    ],
    [".payload.", [["payload", 1]]],
    [
      "header..signature",
      [
        ["header", 0],
        ["signature", 2],
      ],
    ],
    ["..sig", [["sig", 2]]],
  ]) {
    const { highlights } = await parse(code);
    assert.deepEqual(
      highlights.map(({ text, style }) => [text, style]),
      segments.map(([text, part]) => [text, complete[part].style]),
    );
  }
});

test("JWT wrapping and whitespace remain neutral without restarting segment colors", async () => {
  const { highlights: complete } = await parse("header.payload.signature");
  const code = " \thea\nder . pay\n\nload\t.\nsig nature \n";
  const { state, highlights } = await parse(code);
  assert.equal(state.doc.toString(), code);
  assert.deepEqual(
    highlights.map(({ text, style }) => [text, style]),
    [
      ["hea", 0],
      ["der", 0],
      ["pay", 1],
      ["load", 1],
      ["sig", 2],
      ["nature", 2],
    ].map(([text, part]) => [text, complete[part].style]),
  );
});

test("JWT invalid characters and additional segments stay neutral", async () => {
  const code = "he$ader.pay!load.sig?nature.extra.more";
  const { highlights } = await parse(code);
  assert.deepEqual(
    highlights.map(({ text }) => text),
    ["he", "ader", "pay", "load", "sig", "nature"],
  );
  for (const character of ["$", "!", "?"]) {
    const offset = code.indexOf(character);
    assert.equal(
      highlights.some(({ from, to }) => from <= offset && offset < to),
      false,
    );
  }
});

test("empty JWT documents and delimiter-only input have no highlighted content", async () => {
  for (const code of ["", " \t\n", ".", "..", "...."]) {
    const { state, highlights } = await parse(code);
    assert.equal(state.doc.toString(), code);
    assert.deepEqual(highlights, []);
  }
});
