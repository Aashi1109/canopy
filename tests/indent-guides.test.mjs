import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree, StreamLanguage } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";

import { collectIndentGuides } from "../components/content/indentGuides.ts";

function editor(doc, extension = json(), caret = 0, tabSize = 4) {
  const state = EditorState.create({
    doc,
    extensions: [extension, EditorState.tabSize.of(tabSize)],
    selection: { anchor: caret },
  });
  ensureSyntaxTree(state, doc.length, 500);
  return state;
}
function collect(state, focused = false, ranges = [{ from: 0, to: state.doc.length }]) {
  return collectIndentGuides(state, ranges, focused);
}
function rows(state, result) {
  return result.lines.map(({ from, columns, activeColumn }) => ({
    line: state.doc.lineAt(from).number,
    columns,
    activeColumn,
  }));
}

test("infers two- and four-space indentation without adding phantom nesting", () => {
  for (const width of [2, 4]) {
    const state = editor(JSON.stringify({ item: { value: true } }, null, width));
    assert.deepEqual(
      rows(state, collect(state)).map(({ line, columns }) => [line, columns]),
      [
        [2, [0]],
        [3, [0, width]],
        [4, [0]],
      ],
    );
  }
});

test("tab stops and mixed space-tab prefixes use visual columns", () => {
  const code = '{\n \t"item": {\n\t\t"value": true\n \t}\n}';
  for (const tabSize of [4, 8]) {
    const state = editor(code, json(), code.indexOf("value"), tabSize);
    const line = rows(state, collect(state, true)).find((row) => row.line === 3);
    assert.deepEqual(line.columns, [0, tabSize]);
    assert.equal(line.activeColumn, tabSize);
  }
});

test("only the focused caret's innermost JSON block receives active guides", () => {
  const code = JSON.stringify({ first: { value: 1 }, second: { value: 2 } }, null, 2);
  const state = editor(code, json(), code.indexOf("value"));
  assert.ok(collect(state).lines.every((row) => row.activeColumn === undefined));
  assert.deepEqual(
    rows(state, collect(state, true)).filter((row) => row.activeColumn !== undefined),
    [{ line: 3, columns: [0, 2], activeColumn: 2 }],
  );
  const moved = state.update({ selection: { anchor: code.lastIndexOf("value") } }).state;
  assert.deepEqual(
    rows(moved, collect(moved, true)).filter((row) => row.activeColumn !== undefined),
    [{ line: 6, columns: [0, 2], activeColumn: 2 }],
  );
});

test("blank lines continue surrounding guides and closing rows retain only outer indentation", () => {
  const code = '{\n  "item": {\n\n    "value": 1\n\n  }\n}';
  const state = editor(code, json(), code.indexOf("value"));
  assert.deepEqual(
    rows(state, collect(state)).map(({ line, columns }) => [line, columns]),
    [
      [2, [0]],
      [3, [0, 2]],
      [4, [0, 2]],
      [5, [0, 2]],
      [6, [0]],
    ],
  );
  assert.deepEqual(
    rows(state, collect(state, true))
      .filter((row) => row.activeColumn === 2)
      .map((row) => row.line),
    [3, 4, 5],
  );
});

test("TypeScript, XML, and YAML use the nearest parsed multiline block", () => {
  for (const [extension, code, word, expectedColumn] of [
    [javascript({ typescript: true }), "function get(): Data {\n  if (ready) {\n    return data;\n  }\n}", "return", 2],
    [xml(), "<root>\n    <item>\n        <value>true</value>\n    </item>\n</root>", "value", 4],
    [yaml(), "root:\n  item:\n    value: true\n  other: false", "value", 2],
  ]) {
    const state = editor(code, extension, code.indexOf(word));
    const active = rows(state, collect(state, true)).filter((row) => row.activeColumn !== undefined);
    assert.ok(active.length > 0);
    assert.ok(active.every((row) => row.activeColumn === expectedColumn));
  }
});

test("scrolled and folded visible ranges keep guide columns without decorating hidden rows", () => {
  const code = JSON.stringify(
    { items: Array.from({ length: 100 }, (_, id) => ({ id, detail: { value: id } })) },
    null,
    4,
  );
  const state = editor(code);
  const ranges = [
    { from: state.doc.line(125).from, to: state.doc.line(130).to },
    { from: state.doc.line(135).from, to: state.doc.line(140).to },
  ];
  const result = collect(state, false, ranges);
  assert.ok(result.lines.length > 0);
  assert.ok(result.lines.every((row) => ranges.some((range) => row.from >= range.from && row.from <= range.to)));
  for (const row of result.lines) {
    const indent = state.doc.lineAt(row.from).text.match(/^ */)[0].length;
    assert.deepEqual(
      row.columns,
      Array.from({ length: indent / 4 }, (_, index) => index * 4),
    );
  }
  assert.ok(result.readLines < 50);
  assert.equal(result.limited, false);
});

test("bounded indentation fallback supports languages without a block parser", () => {
  const stream = StreamLanguage.define({
    token(input) {
      input.skipToEnd();
      return null;
    },
  });
  const code = "root:\n    child:\n        value\n    sibling\nend";
  const state = editor(code, stream, code.indexOf("value"));
  assert.deepEqual(
    rows(state, collect(state, true)).filter((row) => row.activeColumn !== undefined),
    [{ line: 3, columns: [0, 4], activeColumn: 4 }],
  );
});

test("missing languages and malformed input remain safe", () => {
  assert.deepEqual(collect(editor("    plain\n        text", [])).lines, []);
  for (const code of ['{\n  "item": {\n    "value":', "<root>\n  <item>\n    <value", "root:\n  item: [\n    broken"]) {
    const state = editor(code, code[0] === "<" ? xml() : code[0] === "{" ? json() : yaml(), code.length);
    const result = collect(state, true);
    assert.ok(result.lines.every((row) => row.from >= 0 && row.from <= code.length && row.columns.length <= 32));
  }
});

test("large documents, long prefixes, blank runs, and deep trees have explicit work bounds", () => {
  const code = JSON.stringify(
    Array.from({ length: 20_000 }, (_, id) => ({ id, value: true })),
    null,
    2,
  );
  const state = editor(code);
  const from = state.doc.line(40_000).from;
  const visible = collect(state, false, [{ from, to: from + 300 }]);
  assert.ok(visible.readLines < 50);
  assert.ok(visible.readCharacters < 10_000);
  assert.equal(visible.limited, false);

  const spaces = editor("{\n" + " ".repeat(100_000) + '"value": 1\n}');
  const long = collect(spaces);
  assert.equal(long.limited, true);
  assert.ok(long.readCharacters <= 3 * 256);
  assert.ok(long.lines.every((row) => row.columns.length <= 32));

  const blanks = editor("{\n" + "\n".repeat(2_000) + '  "value": 1\n}');
  const blankResult = collect(blanks);
  assert.equal(blankResult.limited, true);
  assert.ok(blankResult.readLines <= 656);
  assert.ok(blankResult.lines.length <= 400);

  const deep = editor("[\n".repeat(200) + "0" + "\n]".repeat(200), json(), 400);
  const deepResult = collect(deep, true, [{ from: 390, to: 410 }]);
  assert.equal(deepResult.limited, true);
  assert.ok(deepResult.visitedNodes <= 128);
});
