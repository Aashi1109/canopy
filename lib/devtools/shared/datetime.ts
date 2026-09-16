// Date parsing and cron expression handling.
// Verbatim extraction from lib/devtools/format-json.ts (region 4).

import { ToolError } from "../../tool-framework/run.ts";
import { requireUtilityInput } from "./options.ts";

export function parseDate(input: string, label: string): Date {
  requireUtilityInput(input, label);
  let date: Date;
  if (/^-?\d+(?:\.\d+)?$/.test(input.trim())) {
    const number = Number(input);
    date = new Date(Math.abs(number) < 1e11 ? number * 1000 : number);
  } else date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new ToolError("invalid-date", `${label} is not a valid date or timestamp.`);
  }
  return date;
}

export function describeCron(expression: string): string {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new ToolError(
      "invalid-cron",
      "Cron expression must contain minute, hour, day, month, and weekday fields.",
    );
  }
  parseCronField(fields[0], 0, 59, "Minute");
  parseCronField(fields[1], 0, 23, "Hour");
  parseCronField(fields[2], 1, 31, "Day of month");
  parseCronField(fields[3], 1, 12, "Month");
  parseCronField(fields[4], 0, 7, "Weekday", true);
  const [minute, hour, day, month, weekday] = fields;
  const timing =
    minute === "*" && hour === "*" ? "every minute" : `at minute ${minute} of hour ${hour}`;
  return `${timing}; day ${day}; month ${month}; weekday ${weekday}`;
}

function parseCronField(
  field: string,
  min: number,
  max: number,
  label: string,
  normalizeSunday = false,
) {
  const values = new Set<number>();
  const wildcard = field === "*" || field.startsWith("*/");
  const add = (value: number) => {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new ToolError("invalid-cron", `${label} must be between ${min} and ${max}.`);
    }
    values.add(normalizeSunday && value === 7 ? 0 : value);
  };

  if (field === "*") {
    for (let value = min; value <= max; value += 1) add(value);
    return { values, wildcard };
  }
  if (field.startsWith("*/")) {
    const step = Number(field.slice(2));
    if (!Number.isInteger(step) || step < 1 || step > max - min + 1) {
      throw new ToolError("invalid-cron", `${label} step is outside the supported range.`);
    }
    for (let value = min; value <= max; value += step) add(value);
    return { values, wildcard };
  }
  if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(field)) {
    throw new ToolError("invalid-cron", `${label} contains unsupported syntax.`);
  }
  for (const part of field.split(",")) {
    const [startRaw, endRaw] = part.split("-");
    const start = Number(startRaw);
    const end = endRaw === undefined ? start : Number(endRaw);
    if (start > end) throw new ToolError("invalid-cron", `${label} range must be ascending.`);
    for (let value = start; value <= end; value += 1) add(value);
  }
  return { values, wildcard };
}

export function nextCronRuns(expression: string, timezone: "local" | "utc", count = 5) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new ToolError("invalid-cron", "Cron expression must contain five fields.");
  }
  const minute = parseCronField(fields[0], 0, 59, "Minute");
  const hour = parseCronField(fields[1], 0, 23, "Hour");
  const day = parseCronField(fields[2], 1, 31, "Day of month");
  const month = parseCronField(fields[3], 1, 12, "Month");
  const weekday = parseCronField(fields[4], 0, 7, "Weekday", true);
  const runs: Date[] = [];
  const cursor = new Date();
  if (timezone === "local") {
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + 1);
  } else {
    cursor.setUTCSeconds(0, 0);
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }

  for (let checked = 0; checked < 1_051_200 && runs.length < count; checked += 1) {
    const minuteValue = timezone === "local" ? cursor.getMinutes() : cursor.getUTCMinutes();
    const hourValue = timezone === "local" ? cursor.getHours() : cursor.getUTCHours();
    const dayValue = timezone === "local" ? cursor.getDate() : cursor.getUTCDate();
    const monthValue = (timezone === "local" ? cursor.getMonth() : cursor.getUTCMonth()) + 1;
    const weekdayValue = timezone === "local" ? cursor.getDay() : cursor.getUTCDay();
    const dayMatches =
      day.wildcard && weekday.wildcard
        ? true
        : day.wildcard
          ? weekday.values.has(weekdayValue)
          : weekday.wildcard
            ? day.values.has(dayValue)
            : day.values.has(dayValue) || weekday.values.has(weekdayValue);

    if (
      minute.values.has(minuteValue) &&
      hour.values.has(hourValue) &&
      month.values.has(monthValue) &&
      dayMatches
    ) {
      runs.push(new Date(cursor));
    }
    if (timezone === "local") cursor.setMinutes(cursor.getMinutes() + 1);
    else cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  if (runs.length < count) {
    throw new ToolError("invalid-cron", "No matching runs were found in the next two years.");
  }
  return runs;
}
