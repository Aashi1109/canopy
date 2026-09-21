import assert from "node:assert/strict";
import test from "node:test";

import { run } from "../tools/json-diff/run.ts";
import { run as runTextDiff } from "../tools/text-diff-checker/run.ts";

const compare = async (text, secondary, repairMode = "off") =>
  run({ input: { text, secondary, files: [] }, settings: { repairMode }, signal: new AbortController().signal });

const sideText = (result, side) =>
  result.lines
    .filter(({ kind }) => kind !== (side === "left" ? "added" : "removed"))
    .map(({ text }) => text)
    .join("\n");

test("JSON diff shows changed values as removed original and added candidate lines", async () => {
  const result = await compare('{"active":true,"name":"Ada"}', '{"active":false,"name":"Ada"}');
  assert.equal(result.render, "diff");
  assert.equal(result.leftLabel, "JSON A · Original");
  assert.equal(result.rightLabel, "JSON B · Changed");
  assert.equal(result.downloadName, "json-diff.txt");
  assert.deepEqual(result.lines, [
    { kind: "context", text: "{" },
    { kind: "removed", text: '  "active": true,' },
    { kind: "added", text: '  "active": false,' },
    { kind: "context", text: '  "name": "Ada"' },
    { kind: "context", text: "}" },
  ]);
  assert.equal(result.verdict.label, "1 line added · 1 line removed");
});

test("JSON diff additions and removals are directional and retain complete documents", async () => {
  const left = { keep: 1, removed: true };
  const right = { added: "new", keep: 1 };
  const result = await compare(JSON.stringify(left), JSON.stringify(right));
  assert.deepEqual(JSON.parse(sideText(result, "left")), left);
  assert.deepEqual(JSON.parse(sideText(result, "right")), right);
  assert.ok(result.lines.some(({ kind, text }) => kind === "removed" && text.includes('"removed"')));
  assert.ok(result.lines.some(({ kind, text }) => kind === "added" && text.includes('"added"')));
});

test("JSON diff ignores formatting and object key order recursively", async () => {
  const result = await compare('{"z":[{"b":2,"a":1}],"a":true}', '{ "a": true, "z": [{"a":1,"b":2}] }');
  assert.ok(result.lines.every(({ kind }) => kind === "context"));
  assert.equal(result.verdict.label, "No differences");
  assert.deepEqual(JSON.parse(sideText(result, "left")), { a: true, z: [{ a: 1, b: 2 }] });
});

test("JSON diff keeps array order and nested changes", async () => {
  const left = { users: [{ id: 1 }, { id: 2 }], flags: [false, null, 0] };
  const right = { users: [{ id: 2 }, { id: 1 }], flags: [false, null, 0, ""] };
  const result = await compare(JSON.stringify(left), JSON.stringify(right));
  assert.ok(result.lines.some(({ kind }) => kind === "removed"));
  assert.ok(result.lines.some(({ kind }) => kind === "added"));
  assert.deepEqual(JSON.parse(sideText(result, "left")), left);
  assert.deepEqual(JSON.parse(sideText(result, "right")), right);
});

test("JSON diff handles root primitives, empty values, and dangerous-looking property names", async () => {
  for (const value of ["null", "false", "0", '""', "[]", "{}", '{"__proto__":{"constructor":true}}']) {
    const result = await compare(value, value);
    assert.ok(result.lines.every(({ kind }) => kind === "context"));
    assert.deepEqual(JSON.parse(sideText(result, "left")), JSON.parse(value));
  }
  const result = await compare("null", "false");
  assert.deepEqual(result.lines, [
    { kind: "removed", text: "null" },
    { kind: "added", text: "false" },
  ]);
});

test("JSON diff identifies the invalid or missing side", async () => {
  await assert.rejects(compare("{", "{}"), { code: "invalid-json", message: "JSON A is not valid JSON." });
  await assert.rejects(compare("{}", "{"), { code: "invalid-json", message: "JSON B is not valid JSON." });
  await assert.rejects(compare("", "{}"), { code: "input-required" });
  await assert.rejects(compare("{}", ""), { code: "input-required" });
});

test("JSON diff applies repair mode to both documents", async () => {
  const source = '{"name":"Ada","broken":}';
  const removed = await compare(source, '{"name":"Ada"}', "remove");
  assert.equal(removed.verdict.label, "No differences");
  const nulled = await compare('{"name":"Ada","broken":null}', source, "null");
  assert.equal(nulled.verdict.label, "No differences");
});

test("JSON diff names the failed side when auto-repair cannot recover it", async () => {
  for (const repairMode of ["remove", "null"]) {
    await assert.rejects(compare("not JSON", "{}", repairMode), (error) => {
      assert.equal(error.code, "invalid-json");
      assert.match(error.message, /^JSON A:/);
      return true;
    });
    await assert.rejects(compare("{}", "not JSON", repairMode), (error) => {
      assert.equal(error.code, "invalid-json");
      assert.match(error.message, /^JSON B:/);
      return true;
    });
  }
});

test("JSON diff preserves negative zero and overflowing exponent differences", async () => {
  const zero = await compare("-0", "0");
  assert.deepEqual(zero.lines, [
    { kind: "removed", text: "-0" },
    { kind: "added", text: "0" },
  ]);
  const overflow = await compare("1e400", "null");
  assert.equal(JSON.parse(sideText(overflow, "left")), Infinity);
  assert.equal(JSON.parse(sideText(overflow, "right")), null);
});

test("JSON diff reports deeply nested input with named recovery guidance", async () => {
  const nested = `${"[".repeat(130)}0${"]".repeat(130)}`;
  await assert.rejects(compare("{}", nested), (error) => {
    assert.equal(error.code, "comparison-too-deep");
    assert.match(error.message, /^JSON B:/);
    assert.match(error.recovery, /smaller nested sections/);
    return true;
  });
});

test("JSON diff limits oversized comparisons with recovery guidance", async () => {
  const left = JSON.stringify(Array.from({ length: 2_100 }, (_, index) => index));
  const right = JSON.stringify(Array.from({ length: 2_100 }, (_, index) => index + 1));
  await assert.rejects(compare(left, right), (error) => {
    assert.equal(error.code, "comparison-too-large");
    assert.match(error.recovery, /smaller sections/);
    return true;
  });
});

test("shared line alignment preserves text diff output and newline handling", async () => {
  const result = await runTextDiff({
    input: { text: "alpha\r\nbeta\rgamma", secondary: "alpha\nbeta updated\ngamma", files: [] },
    settings: {},
    signal: new AbortController().signal,
  });
  assert.deepEqual(result, {
    render: "text",
    text: "  alpha\n- beta\n+ beta updated\n  gamma",
    downloadName: "text-diff.txt",
  });
});
