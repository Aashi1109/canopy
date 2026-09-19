import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { transformSync } from "next/dist/build/swc/index.js";

const filename = new URL("../app/admin/(protected)/blog/components/BlogAssistantPanel.tsx", import.meta.url);
const { code } = transformSync(readFileSync(filename, "utf8"), {
  filename: filename.pathname,
  jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } } },
  module: { type: "commonjs" },
});
// Only exercise the pure grouping export; UI dependencies are not rendered here.
const exports = {};
runInNewContext(code, { exports, require: () => ({}), Date });
const { groupConversationHistory } = exports;
const thread = (id, date) => ({ id, updatedAt: date.toISOString() });

test("history groups local calendar dates and sorts newest first without changing input", () => {
  const now = new Date(2026, 8, 19, 0, 10);
  const threads = [
    thread("yesterday", new Date(2026, 8, 18, 23, 55)),
    thread("older", new Date(2026, 8, 10, 12)),
    thread("today", new Date(2026, 8, 19, 0, 5)),
    thread("earlier-yesterday", new Date(2026, 8, 18, 10)),
  ];
  const before = JSON.stringify(threads);
  const groups = groupConversationHistory(threads, now);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].label, "Today");
  assert.equal(groups[0].threads[0].id, "today");
  assert.equal(groups[1].label, "Yesterday");
  assert.deepEqual(
    Array.from(groups[1].threads, ({ id }) => id),
    ["yesterday", "earlier-yesterday"],
  );
  assert.equal(groups[2].threads[0].id, "older");
  assert.equal(JSON.stringify(threads), before);
});

test("yesterday crosses month and year boundaries", () => {
  const groups = groupConversationHistory(
    [thread("last-year", new Date(2025, 11, 31, 23, 59))],
    new Date(2026, 0, 1, 0, 1),
  );
  assert.equal(groups[0].label, "Yesterday");
});

test("calendar grouping handles daylight-saving transitions", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    for (const [month, day] of [
      [2, 9],
      [10, 2],
    ]) {
      const groups = groupConversationHistory(
        [thread("previous-day", new Date(2026, month, day - 1, 0, 5))],
        new Date(2026, month, day, 23, 55),
      );
      assert.equal(groups[0].label, "Yesterday");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("empty history stays empty and unknown dates remain reachable", () => {
  assert.equal(groupConversationHistory([]).length, 0);
  const groups = groupConversationHistory([{ id: "unknown", updatedAt: "invalid" }]);
  assert.equal(groups[0].label, "Earlier");
  assert.equal(groups[0].threads[0].id, "unknown");
});
