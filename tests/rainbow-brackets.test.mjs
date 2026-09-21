import assert from "node:assert/strict";
import test from "node:test";
import { jsonLanguage } from "@codemirror/lang-json";
import { javascriptLanguage, typescriptLanguage } from "@codemirror/lang-javascript";
import { TreeFragment } from "@lezer/common";

import { collectRainbowBrackets } from "../components/content/rainbowBrackets.ts";

function collect(code, language = jsonLanguage, ranges = [{ from: 0, to: code.length }], limits) {
  return collectRainbowBrackets(language.parser.parse(code), ranges, limits);
}

test("JSON bracket pairs share depth colors while strings remain untouched", () => {
  const code = '{"items":[{"value":"[ignored] {\\\"x\\\"}"}],"empty":{}}';
  const result = collect(code);
  assert.deepEqual(
    result.brackets.map(({ from, color }) => [code[from], color]),
    [
      ["{", 0],
      ["[", 1],
      ["{", 2],
      ["}", 2],
      ["]", 1],
      ["{", 1],
      ["}", 1],
      ["}", 0],
    ],
  );
  assert.equal(result.limited, false);
  assert.ok(result.brackets.every(({ from, to }) => to === from + 1));
});

test("JavaScript highlights structural brackets and skips comments, strings, and regular expressions", () => {
  const code = 'const value = obj[fn({a: [1]})]; /* ([{}]) */ const s = "[{}]"; const r = /[(){}]/;';
  const result = collect(code, javascriptLanguage);
  assert.deepEqual(
    result.brackets.map(({ from, color }) => [code[from], color]),
    [
      ["[", 0],
      ["(", 1],
      ["{", 2],
      ["[", 3],
      ["]", 3],
      ["}", 2],
      [")", 1],
      ["]", 0],
    ],
  );
});

test("TypeScript object types and expressions use matching nesting colors", () => {
  const code = "type Data = { items: Array<{ id: number }> }; const f = (x: Data) => ({x});";
  const result = collect(code, typescriptLanguage);
  assert.deepEqual(
    result.brackets.map(({ from, color }) => [code[from], color]),
    [
      ["{", 0],
      ["{", 1],
      ["}", 1],
      ["}", 0],
      ["(", 0],
      [")", 0],
      ["(", 0],
      ["{", 1],
      ["}", 1],
      [")", 0],
    ],
  );
});

test("template text stays literal while interpolation expressions receive structural colors", () => {
  const code = "const s = `raw [ { ( ${fn({x:[1]})} ) } ]`;";
  const result = collect(code, javascriptLanguage);
  assert.deepEqual(
    result.brackets.map(({ from, color }) => [code[from], color]),
    [
      ["{", 0],
      ["(", 1],
      ["{", 2],
      ["[", 3],
      ["]", 3],
      ["}", 2],
      [")", 1],
      ["}", 0],
    ],
  );
});

test("scrolled and disjoint ranges retain the same colors as the complete parsed document", () => {
  const samples = [
    [
      jsonLanguage,
      JSON.stringify({ items: Array.from({ length: 100 }, (_, id) => ({ id, data: [{ valid: true }] })) }, null, 2),
    ],
    [
      javascriptLanguage,
      'const ignored = "{}";\nconst value = outer[fn({items: [1, {a: 2}]})];\nif (ready) { fn([2]); }',
    ],
    [typescriptLanguage, "type Data = { items: Array<{ id: number }> };\nconst f = (x: Data) => ({nested: [{x}]});"],
    [javascriptLanguage, "const s = `raw [ ${fn({x:[1]})} ] ${other({x:2})}`;"],
  ];
  for (const [language, code] of samples) {
    const tree = language.parser.parse(code);
    const all = collectRainbowBrackets(tree, [{ from: 0, to: code.length }]).brackets;
    for (const bracket of all.filter((_, index) => index % 7 === 0)) {
      const range = { from: bracket.from, to: Math.min(code.length, bracket.from + 23) };
      const visible = collectRainbowBrackets(tree, [range]);
      assert.equal(visible.limited, false);
      assert.deepEqual(
        visible.brackets,
        all.filter(({ from, to }) => from >= range.from && to <= range.to),
      );
    }
    const ranges = [
      { from: 3, to: 20 },
      { from: code.length - 20, to: code.length },
    ];
    assert.deepEqual(
      collectRainbowBrackets(tree, ranges).brackets,
      all.filter(({ from, to }) => ranges.some((range) => from >= range.from && to <= range.to)),
    );
  }
});

test("incomplete and malformed edits remain safe and recover after incremental parsing", () => {
  for (const code of ['{"items":[1,{"x":2}', '{"items":[1,}', '["unterminated {[', "])}"]) {
    const result = collect(code);
    assert.ok(
      result.brackets.every(({ from, to, color }) => from >= 0 && to <= code.length && color >= 0 && color < 6),
    );
  }
  const before = '{"items":[{"value":1}]}';
  const oldTree = jsonLanguage.parser.parse(before);
  const at = before.indexOf("1");
  const after = `${before.slice(0, at)}[1,2]${before.slice(at + 1)}`;
  const fragments = TreeFragment.applyChanges(TreeFragment.addTree(oldTree), [
    { fromA: at, toA: at + 1, fromB: at, toB: at + 5 },
  ]);
  const updatedTree = jsonLanguage.parser.parse(after, fragments);
  assert.deepEqual(
    collectRainbowBrackets(updatedTree, [{ from: 0, to: after.length }]).brackets,
    collect(after).brackets,
  );
});

test("rainbow colors cycle across six nesting levels", () => {
  const code = "[".repeat(9) + "0" + "]".repeat(9);
  assert.deepEqual(
    collect(code).brackets.map(({ color }) => color),
    [0, 1, 2, 3, 4, 5, 0, 1, 2, 2, 1, 0, 5, 4, 3, 2, 1, 0],
  );
});

test("long lines and excessive depth respect node, decoration, and ancestry budgets", () => {
  const code = JSON.stringify(Array.from({ length: 20_000 }, () => ({ value: [] })));
  const tree = jsonLanguage.parser.parse(code);
  const result = collectRainbowBrackets(tree, [{ from: 0, to: code.length }], { maxNodes: 60, maxBrackets: 10 });
  assert.equal(result.limited, true);
  assert.ok(result.visitedNodes <= 60);
  assert.ok(result.brackets.length <= 10);
  const from = Math.floor(code.length / 2);
  const visible = collectRainbowBrackets(tree, [{ from, to: from + 300 }], { maxNodes: 1_000 });
  assert.equal(visible.limited, false);
  assert.ok(visible.visitedNodes < 1_000);
  assert.ok(visible.brackets.length > 0);
  assert.ok(visible.brackets.every((bracket) => bracket.from >= from && bracket.to <= from + 300));
  const deep = "[".repeat(200) + "0" + "]".repeat(200);
  const middle = collect(deep, jsonLanguage, [{ from: 195, to: 210 }], { maxDepth: 32 });
  assert.equal(middle.limited, true);
  assert.deepEqual(middle.brackets, []);
});
