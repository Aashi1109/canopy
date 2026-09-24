import { test, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree, foldable } from "@codemirror/language";
import { CompletionContext, completeFromList } from "@codemirror/autocomplete";
import { classHighlighter, getStyleTags, highlightTree, tags } from "@lezer/highlight";

import { collectYamlScalars, loadCodeEditorLanguage } from "../components/content/codeEditorLanguages.ts";

async function highlightsFor(code, language) {
  const state = EditorState.create({ doc: code, extensions: [await loadCodeEditorLanguage(language)] });
  const tree = ensureSyntaxTree(state, state.doc.length, 500);
  expect(tree, "the small test document should finish parsing").toBeTruthy();
  const highlights = [];
  highlightTree(tree, classHighlighter, (from, to, classes) => highlights.push({ from, to, classes }));
  return (offset) => highlights.find(({ from, to }) => from <= offset && offset < to)?.classes ?? "";
}

async function completionLabels(code, language, explicit = false) {
  const state = EditorState.create({ doc: code, extensions: [await loadCodeEditorLanguage(language)] });
  expect(ensureSyntaxTree(state, state.doc.length, 500)).toBeTruthy();
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
    expect(locals.labels.includes("userName"), `${language} should suggest a local variable`).toBeTruthy();
    const keywords = await completionLabels("ret", language);
    expect(keywords.labels.includes("return"), `${language} should suggest return`).toBeTruthy();
  }
  const typescript = await completionLabels("dec", "typescript");
  expect(typescript.labels.includes("declare")).toBeTruthy();
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
    expect(properties.labels.includes("display")).toBeTruthy();
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  }
  const values = await completionLabels("a { display: bl", "css");
  expect(values.labels.includes("block")).toBeTruthy();
});

test("HTML suggests native element names while opening a tag", async () => {
  const { labels } = await completionLabels("<di", "html");
  expect(labels.includes("div")).toBeTruthy();
});

test("SQL suggests standard query keywords without a configured database schema", async () => {
  const { labels } = await completionLabels("SEL", "sql");
  expect(labels.some((label) => label.toLowerCase() === "select")).toBeTruthy();
});

test("XML suggests the innermost matching closing tag without a configured schema", async () => {
  const { labels } = await completionLabels("<root><item></", "xml");
  expect(labels).toEqual(["item>"]);
});

test("JSON and YAML do not invent completion providers or suggestions", async () => {
  for (const [language, code] of [
    ["json", '{"name": "Ada", "n'],
    ["yaml", "name: Ada\nna"],
  ]) {
    for (const explicit of [false, true]) {
      const { sourceCount, labels } = await completionLabels(code, language, explicit);
      expect(sourceCount, `${language} should not register a completion provider`).toBe(0);
      expect(labels).toEqual([]);
    }
  }
});

test("CSV keeps delimiters and escaped quotes inside multiline quoted cells", async () => {
  const code = 'name,notes,active\nAda,"hello,\n""world""",true\nLin,-1.25e2,false';
  const classesAt = await highlightsFor(code, "csv");
  expect(classesAt(code.indexOf(",\n"))).toMatch(/tok-string/);
  expect(classesAt(code.indexOf('""world""'))).toMatch(/tok-string/);
  expect(classesAt(code.indexOf("true"))).toMatch(/tok-atom/);
  expect(classesAt(code.indexOf("-1.25e2"))).toMatch(/tok-number/);
});

test("CSV recognizes the supported semicolon, pipe, and tab separators", async () => {
  const code = "name;count|active\tvalue\nAda;42|false\t1.5";
  const classesAt = await highlightsFor(code, "csv");
  expect(classesAt(code.indexOf("42"))).toMatch(/tok-number/);
  expect(classesAt(code.indexOf("false"))).toMatch(/tok-atom/);
  expect(classesAt(code.indexOf("1.5"))).toMatch(/tok-number/);
});

test("TSV keeps commas, semicolons, and pipes inside a single unquoted value", async () => {
  const code = "message\tcount\ncomma,semi;pipe|\t12";
  const classesAt = await highlightsFor(code, "tsv");
  for (const character of [",", ";", "|"]) expect(classesAt(code.indexOf(character))).toMatch(/tok-string/);
  expect(classesAt(code.indexOf("12"))).toMatch(/tok-number/);
});

test("TSV preserves quoted tabs and escaped quotes across line boundaries", async () => {
  const code = 'message\tcount\n"tab\tinside\n""quote"""\t42';
  const classesAt = await highlightsFor(code, "tsv");
  expect(classesAt(code.indexOf("\tinside"))).toMatch(/tok-string/);
  expect(classesAt(code.indexOf('""quote""'))).toMatch(/tok-string/);
  expect(classesAt(code.indexOf("42"))).toMatch(/tok-number/);
});

test("unknown languages preserve the source with a plain-text fallback", async () => {
  const code = '<unknown language="custom">{ untouched }</unknown>';
  const state = EditorState.create({ doc: code, extensions: [await loadCodeEditorLanguage("custom")] });
  expect(state.doc.toString()).toBe(code);
});

async function yamlDocument(code, language = "yaml") {
  const state = EditorState.create({ doc: code, extensions: [await loadCodeEditorLanguage(language)] });
  const tree = ensureSyntaxTree(state, state.doc.length, 500);
  expect(tree).toBeTruthy();
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
  expect(scalars).toEqual(["42", "true", "null", "~", "-1.25e2", "0x2a", "0o17", ".inf", ".NaN"]);
});

test("YAML retains key, string, comment, tag and anchor tokens plus native folding", async () => {
  const code =
    'plain: Ada\n"quoted key": "hello"\nobject:\n  child: 42\nanchor: &ref word\nalias: *ref\ntagged: !!str word\n# comment\n';
  const classesAt = await highlightsFor(code, "yaml");
  expect(classesAt(code.indexOf("plain"))).toMatch(/tok-propertyName/);
  expect(classesAt(code.indexOf('"quoted key"'))).toMatch(/tok-propertyName/);
  expect(classesAt(code.indexOf('"hello"'))).toMatch(/tok-string/);
  expect(classesAt(code.indexOf("&ref"))).toMatch(/tok-labelName/);
  expect(classesAt(code.indexOf("*ref"))).toMatch(/tok-labelName/);
  expect(classesAt(code.indexOf("!!str"))).toMatch(/tok-typeName/);
  expect(classesAt(code.indexOf("# comment"))).toMatch(/tok-comment/);
  const { state, tree } = await yamlDocument(code);
  expect(getStyleTags(tree.resolveInner(code.indexOf("Ada") + 1))?.tags.includes(tags.content)).toBeTruthy();
  const objectLine = state.doc.lineAt(code.indexOf("object:"));
  expect(foldable(state, objectLine.from, objectLine.to)).toEqual({
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
  expect(scalars).toEqual(["2", "false", "null", "3", "42", "42"]);
  const blockValue = code.indexOf("42 false null");
  expect(getStyleTags(tree.resolveInner(blockValue + 1))?.tags.includes(tags.content)).toBeTruthy();
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
  expect(ranges.map(({ from: start, to }) => code.slice(start, to))).toEqual(["true"]);
  expect(reads.length <= 2).toBeTruthy();
  expect(reads.every(({ start, end }) => start >= from && end - start <= 128)).toBeTruthy();
});
