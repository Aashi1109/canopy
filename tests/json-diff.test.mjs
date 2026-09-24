import { expect, test } from "vitest";

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
  expect(result.render).toBe("diff");
  expect(result.leftLabel).toBe("JSON A · Original");
  expect(result.rightLabel).toBe("JSON B · Changed");
  expect(result.downloadName).toBe("json-diff.txt");
  expect(result.lines).toEqual([
    { kind: "context", text: "{" },
    { kind: "removed", text: '  "active": true,' },
    { kind: "added", text: '  "active": false,' },
    { kind: "context", text: '  "name": "Ada"' },
    { kind: "context", text: "}" },
  ]);
  expect(result.verdict.label).toBe("1 line added · 1 line removed");
});

test("JSON diff additions and removals are directional and retain complete documents", async () => {
  const left = { keep: 1, removed: true };
  const right = { added: "new", keep: 1 };
  const result = await compare(JSON.stringify(left), JSON.stringify(right));
  expect(JSON.parse(sideText(result, "left"))).toEqual(left);
  expect(JSON.parse(sideText(result, "right"))).toEqual(right);
  expect(result.lines.some(({ kind, text }) => kind === "removed" && text.includes('"removed"'))).toBeTruthy();
  expect(result.lines.some(({ kind, text }) => kind === "added" && text.includes('"added"'))).toBeTruthy();
});

test("JSON diff ignores formatting and object key order recursively", async () => {
  const result = await compare('{"z":[{"b":2,"a":1}],"a":true}', '{ "a": true, "z": [{"a":1,"b":2}] }');
  expect(result.lines.every(({ kind }) => kind === "context")).toBeTruthy();
  expect(result.verdict.label).toBe("No differences");
  expect(JSON.parse(sideText(result, "left"))).toEqual({ a: true, z: [{ a: 1, b: 2 }] });
});

test("JSON diff keeps array order and nested changes", async () => {
  const left = { users: [{ id: 1 }, { id: 2 }], flags: [false, null, 0] };
  const right = { users: [{ id: 2 }, { id: 1 }], flags: [false, null, 0, ""] };
  const result = await compare(JSON.stringify(left), JSON.stringify(right));
  expect(result.lines.some(({ kind }) => kind === "removed")).toBeTruthy();
  expect(result.lines.some(({ kind }) => kind === "added")).toBeTruthy();
  expect(JSON.parse(sideText(result, "left"))).toEqual(left);
  expect(JSON.parse(sideText(result, "right"))).toEqual(right);
});

test("JSON diff handles root primitives, empty values, and dangerous-looking property names", async () => {
  for (const value of ["null", "false", "0", '""', "[]", "{}", '{"__proto__":{"constructor":true}}']) {
    const result = await compare(value, value);
    expect(result.lines.every(({ kind }) => kind === "context")).toBeTruthy();
    expect(JSON.parse(sideText(result, "left"))).toEqual(JSON.parse(value));
  }
  const result = await compare("null", "false");
  expect(result.lines).toEqual([
    { kind: "removed", text: "null" },
    { kind: "added", text: "false" },
  ]);
});

test("JSON diff applies repair mode to both documents", async () => {
  const source = '{"name":"Ada","broken":}';
  const removed = await compare(source, '{"name":"Ada"}', "remove");
  expect(removed.verdict.label).toBe("No differences");
  const nulled = await compare('{"name":"Ada","broken":null}', source, "null");
  expect(nulled.verdict.label).toBe("No differences");
});

test("JSON diff identifies the invalid or missing side", async () => {
  await expect(compare("{", "{}")).rejects.toMatchObject({
    code: "invalid-json",
    message: "JSON A is not valid JSON.",
  });
  await expect(compare("{}", "{")).rejects.toMatchObject({
    code: "invalid-json",
    message: "JSON B is not valid JSON.",
  });
  await expect(compare("", "{}")).rejects.toMatchObject({ code: "input-required" });
  await expect(compare("{}", "")).rejects.toMatchObject({ code: "input-required" });
});

test("JSON diff names the failed side when auto-repair cannot recover it", async () => {
  for (const repairMode of ["remove", "null"]) {
    await expect(compare("not JSON", "{}", repairMode)).rejects.toMatchObject({
      code: "invalid-json",
      message: expect.stringMatching(/^JSON A:/),
    });
    await expect(compare("{}", "not JSON", repairMode)).rejects.toMatchObject({
      code: "invalid-json",
      message: expect.stringMatching(/^JSON B:/),
    });
  }
});

test("JSON diff preserves negative zero and overflowing exponent differences", async () => {
  const zero = await compare("-0", "0");
  expect(zero.lines).toEqual([
    { kind: "removed", text: "-0" },
    { kind: "added", text: "0" },
  ]);
  const overflow = await compare("1e400", "null");
  expect(JSON.parse(sideText(overflow, "left"))).toBe(Infinity);
  expect(JSON.parse(sideText(overflow, "right"))).toBe(null);
});

test("JSON diff reports deeply nested input with named recovery guidance", async () => {
  const nested = `${"[".repeat(130)}0${"]".repeat(130)}`;
  await expect(compare("{}", nested)).rejects.toMatchObject({
    code: "comparison-too-deep",
    message: expect.stringMatching(/^JSON B:/),
    recovery: expect.stringMatching(/smaller nested sections/),
  });
});

test("JSON diff limits oversized comparisons with recovery guidance", async () => {
  const left = JSON.stringify(Array.from({ length: 2_100 }, (_, index) => index));
  const right = JSON.stringify(Array.from({ length: 2_100 }, (_, index) => index + 1));
  await expect(compare(left, right)).rejects.toMatchObject({
    code: "comparison-too-large",
    recovery: expect.stringMatching(/smaller sections/),
  });
});

test("shared line alignment preserves text diff output and newline handling", async () => {
  const result = await runTextDiff({
    input: { text: "alpha\r\nbeta\rgamma", secondary: "alpha\nbeta updated\ngamma", files: [] },
    settings: {},
    signal: new AbortController().signal,
  });
  expect(result).toEqual({
    render: "text",
    text: "  alpha\n- beta\n+ beta updated\n  gamma",
    downloadName: "text-diff.txt",
  });
});
