import assert from "node:assert/strict";
const { test } = await import(process.env.VITEST ? "vitest" : "node:test");

import { describeCron, describeCronSchedule } from "../lib/devtools/shared/datetime.ts";

test("common cron schedules read as ordinary timing instructions", () => {
  for (const [expression, expected] of [
    ["*/15 * * * *", "Every 15 minutes, every day."],
    ["* * * * *", "Every minute, every day."],
    ["0 * * * *", "Every hour, on the hour, every day."],
    ["0 9 * * 1-5", "At 09:00, Monday through Friday."],
    ["30 14 * * *", "At 14:30, every day."],
    ["15 */2 * * *", "Every 2 hours, starting at 00:15, every day."],
    ["0 9 * * 0,7", "At 09:00, Sunday."],
    ["0 9 * 1-3 1,3,5", "At 09:00, Monday, Wednesday, and Friday, in January through March."],
    ["0,30 9,17 * * *", "At 09:00, 09:30, 17:00, and 17:30, every day."],
    ["0 9 1,15 * *", "At 09:00, on days 1 and 15 of the month."],
  ]) {
    assert.equal(describeCron(expression), expected, expression);
    assert.equal(describeCronSchedule(expression).description, expected);
  }
});

test("non-dividing steps name actual times instead of promising uniform intervals", () => {
  const minutes = describeCronSchedule("*/35 * * * *");
  assert.equal(minutes.description, "At 0 and 35 minutes past every hour, every day.");
  assert.match(minutes.notes.join(" "), /not a continuous 35-minute interval/);

  const hours = describeCronSchedule("0 */23 * * *");
  assert.equal(hours.description, "At 00:00 and 23:00, every day.");
  assert.match(hours.notes.join(" "), /restarts at midnight/);
  assert.deepEqual(describeCronSchedule("*/15 * * * *").notes, []);
});

test("ranges and lists stay readable without exposing cron syntax in explanations", () => {
  const schedule = describeCronSchedule("0,30 8-18 * * 1-5");
  assert.equal(schedule.description, "At 0 and 30 minutes past the hours 08:00 through 18:00, Monday through Friday.");
  assert.equal(describeCron("10-15 * * * *"), "At 10 through 15 minutes past every hour, every day.");
  assert.equal(schedule.fields[1].description, "During the hours 08:00 through 18:00.");
  assert.equal(schedule.fields[4].description, "Monday through Friday.");
  assert.equal(schedule.fields[1].value, "8-18");
});

test("restricted day fields use either match while wildcard steps require both", () => {
  const alternatives = describeCronSchedule("30 4 1,15 * 5");
  assert.equal(alternatives.description, "At 04:30, on days 1 and 15 of the month or on Friday.");
  assert.match(alternatives.notes.join(" "), /either one can match/);

  const intersection = describeCronSchedule("0 9 */2 * 1");
  assert.equal(
    intersection.description,
    "At 09:00, on Monday, but only on day 1 and every 2 days after that within each month.",
  );
  assert.ok(intersection.notes.includes("Both the day-of-month rule and weekday rule must match for this schedule."));
  assert.match(intersection.notes.join(" "), /restarts on day 1/);
  assert.match(describeCron("0 9 */2 * *"), /day 1 and every 2 days/);
  assert.equal(describeCron("0 9 1-31 * 1"), "At 09:00, every day.");
});

test("field descriptions preserve normalized input and explain Sunday and absent dates", () => {
  const schedule = describeCronSchedule("  0   9  31  2  7  ");
  assert.deepEqual(
    schedule.fields.map((field) => field.value),
    ["0", "9", "31", "2", "7"],
  );
  assert.equal(schedule.fields[0].description, "At the start of the hour.");
  assert.equal(describeCronSchedule("1 * * * *").fields[0].description, "1 minute past the hour.");
  assert.equal(schedule.fields[3].description, "February.");
  assert.equal(schedule.fields[4].description, "Sunday.");
  assert.match(schedule.notes.join(" "), /Dates that do not exist in a month are skipped/);
  assert.deepEqual(describeCronSchedule("0 9 */1 * */1").notes, []);
});

test("invalid expressions fail instead of receiving a plausible explanation", () => {
  for (const expression of [
    "",
    "* * * *",
    "* * * * * *",
    "60 * * * *",
    "0 24 * * *",
    "0 9 0 * *",
    "0 9 * 13 *",
    "0 9 * * 8",
    "*/0 * * * *",
    "5-1 * * * *",
    "0 9 * JAN MON",
    "0-30/5 * * * *",
    "@daily",
  ]) {
    assert.throws(() => describeCronSchedule(expression), { code: "invalid-cron" }, expression);
  }
});
