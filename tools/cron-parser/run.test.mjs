import assert from "node:assert/strict";
import { test } from "vitest";
import { run as parseCron } from "./run.ts";

test("cron parser does not interpret blank input as a valid wildcard schedule", () => {
  assert.throws(() => parseCron({ input: { text: " \n " }, settings: {} }), { code: "input-required" });
});

test("cron parser produces exact field meanings, a usable expression, and a timezone warning", () => {
  const result = parseCron({ input: { text: "0 9 * * 1-5" }, settings: {} });
  assert.deepEqual(result.verdict, {
    level: "ok",
    label: "Valid schedule",
    labelMessage: { key: "cron.validSchedule" },
    detail: "At 09:00, Monday through Friday.",
  });
  assert.equal(result.sections[0].body.code, "0 9 * * 1-5");
  assert.deepEqual(result.sections[1].body.rows, [
    ["Minute", "0", "At the start of the hour."],
    ["Hour", "9", "During the 09:00 hour."],
    ["Day of month", "*", "Every day of the month."],
    ["Month", "*", "Every month."],
    ["Day of week", "1-5", "Monday through Friday."],
  ]);
  assert.ok(result.sections[2].body.items.some((note) => note.includes("timezone configured in your scheduler")));
  for (const row of result.sections[1].body.rows) assert.ok(result.text.includes(`${row[0]} (${row[1]}): ${row[2]}`));
});

for (const expression of [
  "* * * *",
  "* * * * * *",
  "60 * * * *",
  "0 24 * * *",
  "0 9 0 * *",
  "0 9 * 13 *",
  "0 9 * * 8",
  "*/0 * * * *",
  "@daily",
]) {
  test(`cron parser rejects invalid schedule ${expression}`, () => {
    assert.throws(() => parseCron({ input: { text: expression }, settings: {} }), { code: "invalid-cron" });
  });
}
