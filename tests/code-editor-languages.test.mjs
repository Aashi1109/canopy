import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree, foldable } from "@codemirror/language";
import { CompletionContext, completeFromList } from "@codemirror/autocomplete";
import { classHighlighter, getStyleTags, highlightTree, tags } from "@lezer/highlight";

import { collectYamlScalars, loadCodeEditorLanguage } from "../components/content/codeEditorLanguages.ts";

async function highlightsFor(code, language) {
  const state = EditorState.create({ doc: code, extensions: [await loadCodeEditorLanguage(language)] });
  const tree = ensureSyntaxTree(state, state.doc.length, 500);
  assert.ok(tree, "the small test document should finish parsing");
  const highlights = [];
  highlightTree(tree, classHighlighter, (from, to, classes) => highlights.push({ from, to, classes }));
  return (offset) => highlights.find(({ from, to }) => from <= offset && offset < to)?.classes ?? "";
}

async function completionLabels(code, language, explicit = false) {
  const state = EditorState.create({ doc: code, extensions: [await loadCodeEditorLanguage(language)] });
  assert.ok(ensureSyntaxTree(state, state.doc.length, 500));
  const context = new CompletionContext(state, state.doc.length, explicit);
  const sources = state.languageDataAt("autocomplete", context.pos);
  const results = await Promise.all(
    sources.map((source) => (typeof source === "function" ? source : completeFromList(source))(context)),
  );
  return {
    sourceCount: sources.length,
    labels: results.flatMap((result) => result?.options.map((option) => option.label) ?? []),
  };
}

test("JavaScript and TypeScript suggest locally declared names and language keywords", async () => {
  for (const language of ["javascript", "typescript"]) {
    const locals = await completionLabels('const userName = "Ada";\nuse', language);
    assert.ok(locals.labels.includes("userName"), `${language} should suggest a local variable`);
    const keywords = await completionLabels("ret", language);
    assert.ok(keywords.labels.includes("return"), `${language} should suggest return`);
  }
  const typescript = await completionLabels("dec", "typescript");
  assert.ok(typescript.labels.includes("declare"));
});

test("CSS suggests properties and value keywords at their respective positions", async () => {
  // Native CSS completion discovers supported properties from the browser's style object.
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { body: { style: { display: "", paddingTop: "" } } },
  });
  try {
    const properties = await completionLabels("a { dis", "css");
    assert.ok(properties.labels.includes("display"));
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  }
  const values = await completionLabels("a { display: bl", "css");
  assert.ok(values.labels.includes("block"));
});

test("HTML suggests native element names while opening a tag", async () => {
  const { labels } = await completionLabels("<di", "html");
  assert.ok(labels.includes("div"));
});

test("SQL suggests standard query keywords without a configured database schema", async () => {
  const { labels } = await completionLabels("SEL", "sql");
  assert.ok(labels.some((label) => label.toLowerCase() === "select"));
});

test("XML suggests the innermost matching closing tag without a configured schema", async () => {
  const { labels } = await completionLabels("<root><item></", "xml");
  assert.deepEqual(labels, ["item>"]);
});

test("JSON and YAML do not invent completion providers or suggestions", async () => {
  for (const [language, code] of [
    ["json", '{"name": "Ada", "n'],
    ["yaml", "name: Ada\nna"],
  ]) {
    for (const explicit of [false, true]) {
      const { sourceCount, labels } = await completionLabels(code, language, explicit);
      assert.equal(sourceCount, 0, `${language} should not register a completion provider`);
      assert.deepEqual(labels, []);
    }
  }
});

test("CSV keeps delimiters and escaped quotes inside multiline quoted cells", async () => {
  const code = 'name,notes,active\nAda,"hello,\n""world""",true\nLin,-1.25e2,false';
  const classesAt = await highlightsFor(code, "csv");
  assert.match(classesAt(code.indexOf(",\n")), /tok-string/);
  assert.match(classesAt(code.indexOf('""world""')), /tok-string/);
  assert.match(classesAt(code.indexOf("true")), /tok-atom/);
  assert.match(classesAt(code.indexOf("-1.25e2")), /tok-number/);
});

test("CSV recognizes the supported semicolon, pipe, and tab separators", async () => {
  const code = "name;count|active\tvalue\nAda;42|false\t1.5";
  const classesAt = await highlightsFor(code, "csv");
  assert.match(classesAt(code.indexOf("42")), /tok-number/);
  assert.match(classesAt(code.indexOf("false")), /tok-atom/);
  assert.match(classesAt(code.indexOf("1.5")), /tok-number/);
});

test("TSV keeps commas, semicolons, and pipes inside a single unquoted value", async () => {
  const code = "message\tcount\ncomma,semi;pipe|\t12";
  const classesAt = await highlightsFor(code, "tsv");
  for (const character of [",", ";", "|"]) assert.match(classesAt(code.indexOf(character)), /tok-string/);
  assert.match(classesAt(code.indexOf("12")), /tok-number/);
});

test("TSV preserves quoted tabs and escaped quotes across line boundaries", async () => {
  const code = 'message\tcount\n"tab\tinside\n""quote"""\t42';
  const classesAt = await highlightsFor(code, "tsv");
  assert.match(classesAt(code.indexOf("\tinside")), /tok-string/);
  assert.match(classesAt(code.indexOf('""quote""')), /tok-string/);
  assert.match(classesAt(code.indexOf("42")), /tok-number/);
});

test("unknown languages preserve the source with a plain-text fallback", async () => {
  const code = '<unknown language="custom">{ untouched }</unknown>';
  const state = EditorState.create({ doc: code, extensions: [await loadCodeEditorLanguage("custom")] });
  assert.equal(state.doc.toString(), code);
});

async function yamlDocument(code, language = "yaml") {
  const state = EditorState.create({ doc: code, extensions: [await loadCodeEditorLanguage(language)] });
  const tree = ensureSyntaxTree(state, state.doc.length, 500);
  assert.ok(tree);
  const ranges = collectYamlScalars(tree, [{ from: 0, to: code.length }], (from, to) => code.slice(from, to));
  return { state, tree, scalars: ranges.map(({ from, to }) => code.slice(from, to)) };
}

test("YAML distinguishes typed scalar values from numeric keys and quoted or plain strings", async () => {
  const code = [
    "42: numeric key",
    "true: boolean key",
    "name: Ada",
    'quoted: "42"',
    "number: 42",
    "active: true",
    "nothing: null",
    "empty: ~",
    "float: -1.25e2",
    "hex: 0x2a",
    "octal: 0o17",
    "infinity: .inf",
    "notANumber: .NaN",
    "text: tRuE",
  ].join("\n");
  const { scalars } = await yamlDocument(code);
  assert.deepEqual(scalars, ["42", "true", "null", "~", "-1.25e2", "0x2a", "0o17", ".inf", ".NaN"]);
});

test("YAML retains key, string, comment, tag and anchor tokens plus native folding", async () => {
  const code =
    'plain: Ada\n"quoted key": "hello"\nobject:\n  child: 42\nanchor: &ref word\nalias: *ref\ntagged: !!str word\n# comment\n';
  const classesAt = await highlightsFor(code, "yaml");
  assert.match(classesAt(code.indexOf("plain")), /tok-propertyName/);
  assert.match(classesAt(code.indexOf('"quoted key"')), /tok-propertyName/);
  assert.match(classesAt(code.indexOf('"hello"')), /tok-string/);
  assert.match(classesAt(code.indexOf("&ref")), /tok-labelName/);
  assert.match(classesAt(code.indexOf("*ref")), /tok-labelName/);
  assert.match(classesAt(code.indexOf("!!str")), /tok-typeName/);
  assert.match(classesAt(code.indexOf("# comment")), /tok-comment/);
  const { state, tree } = await yamlDocument(code);
  assert.ok(getStyleTags(tree.resolveInner(code.indexOf("Ada") + 1))?.tags.includes(tags.content));
  const objectLine = state.doc.lineAt(code.indexOf("object:"));
  assert.deepEqual(foldable(state, objectLine.from, objectLine.to), {
    from: objectLine.to,
    to: code.indexOf("\nanchor:"),
  });
});

test("YML handles inline collections and anchored values without recoloring explicitly typed strings or blocks", async () => {
  const code = [
    "items: [one, 2, false, null, {count: 3}]",
    "anchored: &count 42",
    "alias: *count",
    "string: !!str 42",
    "custom: !custom 42",
    "integer: !!int 42",
    "block: |",
    "  42 false null",
    "# 42 false null",
  ].join("\n");
  const { tree, scalars } = await yamlDocument(code, "yml");
  assert.deepEqual(scalars, ["2", "false", "null", "3", "42", "42"]);
  const blockValue = code.indexOf("42 false null");
  assert.ok(getStyleTags(tree.resolveInner(blockValue + 1))?.tags.includes(tags.content));
});

test("YAML scalar highlighting reads only short values in the requested viewport", async () => {
  const code = `${"items: [1, 2, false]\n".repeat(500)}large: ${"1".repeat(2_000)}\nlast: true\n`;
  const { tree } = await yamlDocument(code);
  const from = code.lastIndexOf("large:");
  const reads = [];
  const ranges = collectYamlScalars(tree, [{ from, to: code.length }], (start, end) => {
    reads.push({ start, end });
    return code.slice(start, end);
  });
  assert.deepEqual(
    ranges.map(({ from: start, to }) => code.slice(start, to)),
    ["true"],
  );
  assert.ok(reads.length <= 2);
  assert.ok(reads.every(({ start, end }) => start >= from && end - start <= 128));
});
