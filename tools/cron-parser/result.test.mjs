import assert from "node:assert/strict";
const { test } = await import(process.env.VITEST ? "vitest" : "node:test");

import { run } from "./run.ts";

test("cron result explains the schedule and copies every displayed meaning", () => {
  const expression = "*/15 * * * *";
  const result = run({ input: { text: expression }, settings: {} });

  assert.equal(result.verdict.detail, "Every 15 minutes, every day.");
  assert.ok(result.text.startsWith("Every 15 minutes, every day."));
  const code = result.sections.find(({ body }) => body.render === "code").body;
  assert.equal(code.code, expression);
  const fields = result.sections.find(({ body }) => body.render === "table").body.rows;
  assert.equal(fields.length, 5);
  for (const [label, value, meaning] of fields) {
    assert.ok(result.text.includes(`${label} (${value}): ${meaning}`));
  }
  const notes = result.sections.find(({ body }) => body.render === "list").body.items;
  for (const note of notes) assert.ok(result.text.includes(note));
  assert.match(result.text, /timezone configured in your scheduler/);
});

test("cron result preserves non-uniform intervals and alternatives in the copied explanation", () => {
  const result = run({ input: { text: "*/35 * 1,15 * 5" }, settings: {} });
  assert.match(result.text, /0 and 35 minutes past every hour/);
  assert.match(result.text, /either one can match/);
  assert.match(result.text, /not a continuous 35-minute interval/);
});

test("invalid cron input produces an actionable error instead of a ready result", () => {
  assert.throws(() => run({ input: { text: "60 * * * *" }, settings: {} }), /Minute must be between 0 and 59/);
});
