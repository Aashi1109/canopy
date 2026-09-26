import { expect, test } from "vitest";

import { run } from "./run.ts";

function compare(text, secondary) {
  return run({
    input: { text, secondary, files: [] },
    settings: {},
    signal: new AbortController().signal,
  });
}

function sideText(result, side) {
  return result.diffPreview.lines
    .filter(({ kind }) => kind !== (side === "left" ? "added" : "removed"))
    .map(({ text }) => text)
    .join("\n");
}

test("an edited line has an aligned preview while the marked text export stays exact", () => {
  const result = compare("alpha\nbeta\ngamma", "alpha\nbeta updated\ngamma");

  expect(result).toMatchObject({
    render: "text",
    text: "  alpha\n- beta\n+ beta updated\n  gamma",
    downloadName: "text-diff.txt",
    diffPreview: {
      render: "diff",
      leftLabel: "Original text",
      rightLabel: "Changed text",
      lines: [
        { kind: "context", text: "alpha" },
        { kind: "removed", text: "beta" },
        { kind: "added", text: "beta updated" },
        { kind: "context", text: "gamma" },
      ],
    },
    verdict: { level: "ok", label: "1 line added · 1 line removed" },
  });
});

test("insertions align subsequent lines and additions and removals follow the comparison direction", () => {
  const left = "alpha\ngamma";
  const right = "alpha\nbeta\ngamma";
  const forward = compare(left, right);
  const reverse = compare(right, left);

  expect(forward.diffPreview.lines).toEqual([
    { kind: "context", text: "alpha" },
    { kind: "added", text: "beta" },
    { kind: "context", text: "gamma" },
  ]);
  expect(reverse.diffPreview.lines).toEqual([
    { kind: "context", text: "alpha" },
    { kind: "removed", text: "beta" },
    { kind: "context", text: "gamma" },
  ]);
  expect(forward.verdict.label).toBe("1 line added · 0 lines removed");
  expect(reverse.verdict.label).toBe("0 lines added · 1 line removed");
  expect(sideText(forward, "left")).toBe(left);
  expect(sideText(forward, "right")).toBe(right);
});

test("an empty changed input retains all original removals and the existing empty-line representation", () => {
  const result = compare("alpha\nbeta", "");

  expect(result.diffPreview.lines).toEqual([
    { kind: "removed", text: "alpha" },
    { kind: "removed", text: "beta" },
    { kind: "added", text: "" },
  ]);
  expect(result.text).toBe("- alpha\n- beta\n+ ");
  expect(sideText(result, "left")).toBe("alpha\nbeta");
  expect(sideText(result, "right")).toBe("");
  expect(result.verdict.label).toBe("1 line added · 2 lines removed");
  expect(compare("alpha\nbeta")).toEqual(result);
});

test("identical lines report no differences and preserve CRLF and CR normalization", () => {
  const result = compare("alpha\r\n\r  beta\r\n", "alpha\n\n  beta\n");

  expect(result.diffPreview.lines).toEqual([
    { kind: "context", text: "alpha" },
    { kind: "context", text: "" },
    { kind: "context", text: "  beta" },
    { kind: "context", text: "" },
  ]);
  expect(result.verdict).toMatchObject({ level: "ok", label: "No differences" });
  expect(result.text).toBe("  alpha\n  \n    beta\n  ");
});

test("leading spaces, trailing spaces, and blank lines remain meaningful changes", () => {
  const left = " alpha \n\nlast\n";
  const right = "alpha\n \nlast\n";
  const result = compare(left, right);

  expect(sideText(result, "left")).toBe(left);
  expect(sideText(result, "right")).toBe(right);
  expect(result.diffPreview.lines).toEqual([
    { kind: "removed", text: " alpha " },
    { kind: "removed", text: "" },
    { kind: "added", text: "alpha" },
    { kind: "added", text: " " },
    { kind: "context", text: "last" },
    { kind: "context", text: "" },
  ]);
  expect(result.text).toBe("-  alpha \n- \n+ alpha\n+  \n  last\n  ");
  expect(result.verdict.label).toBe("2 lines added · 2 lines removed");
});

test("oversized comparisons retain recovery guidance and a smaller retry succeeds", () => {
  const oversized = Array.from({ length: 2_001 }, (_, index) => `line ${index}`).join("\n");

  expect(() => compare(oversized, oversized)).toThrow(
    expect.objectContaining({
      code: "comparison-too-large",
      message: "This comparison is too large to align safely. Compare smaller sections.",
      recovery: "Split the inputs into smaller sections and compare them one at a time.",
    }),
  );
  expect(compare("one line", "one line").verdict.label).toBe("No differences");
});
