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

const CRON_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const CRON_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MAX_INLINE_CRON_TIMES = 6;

function joinCronItems(items: string[]): string {
  if (items.length < 3) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function describeCronValues(values: number[], format: (value: number) => string = String): string {
  const groups: string[] = [];
  for (let start = 0; start < values.length; start += 1) {
    let end = start;
    while (end + 1 < values.length && values[end + 1] === values[end] + 1) end += 1;
    if (end - start >= 2) groups.push(`${format(values[start])} through ${format(values[end])}`);
    else for (let index = start; index <= end; index += 1) groups.push(format(values[index]));
    start = end;
  }
  return joinCronItems(groups);
}

function cronClock(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function describeCronSchedule(expression: string): {
  description: string;
  fields: readonly { label: string; value: string; description: string }[];
  notes: readonly string[];
} {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new ToolError("invalid-cron", "Cron expression must contain minute, hour, day, month, and weekday fields.");
  }
  const parsed = [
    parseCronField(fields[0], 0, 59, "Minute"),
    parseCronField(fields[1], 0, 23, "Hour"),
    parseCronField(fields[2], 1, 31, "Day of month"),
    parseCronField(fields[3], 1, 12, "Month"),
    parseCronField(fields[4], 0, 7, "Weekday", true),
  ];
  const [minutes, hours, days, months, weekdays] = parsed.map(({ values }) =>
    [...values].sort((left, right) => left - right),
  );
  const everyMinute = minutes.length === 60;
  const everyHour = hours.length === 24;
  const everyDate = days.length === 31;
  const everyMonth = months.length === 12;
  const everyWeekday = weekdays.length === 7;
  const minuteStep = fields[0].startsWith("*/") ? Number(fields[0].slice(2)) : undefined;
  const hourStep = fields[1].startsWith("*/") ? Number(fields[1].slice(2)) : undefined;
  const hourDescription = everyHour
    ? "every hour"
    : hours.length === 1
      ? `the ${cronClock(hours[0])} hour`
      : `the hours ${describeCronValues(hours, (hour) => cronClock(hour))}`;
  let timing: string;
  if (everyMinute) {
    timing = everyHour ? "Every minute" : `Every minute during ${hourDescription}`;
  } else if (hourStep && hourStep > 1 && hourStep < 24 && 24 % hourStep === 0 && minutes.length === 1) {
    timing = `Every ${hourStep} hours, starting at ${cronClock(0, minutes[0])}`;
  } else if (!everyHour && minutes.length * hours.length <= MAX_INLINE_CRON_TIMES) {
    timing = `At ${joinCronItems(hours.flatMap((hour) => minutes.map((minute) => cronClock(hour, minute))))}`;
  } else if (minuteStep && 60 % minuteStep === 0 && minuteStep < 60) {
    timing = `Every ${minuteStep} minutes${everyHour ? "" : ` during ${hourDescription}`}`;
  } else if (minutes.length === 1 && minutes[0] === 0 && everyHour) {
    timing = "Every hour, on the hour";
  } else {
    timing = `At ${describeCronValues(minutes)} ${minutes.length === 1 && minutes[0] === 1 ? "minute" : "minutes"} past ${hourDescription}`;
  }

  const dayStep = fields[2].startsWith("*/") ? Number(fields[2].slice(2)) : undefined;
  const dayDescription = everyDate
    ? "every day of the month"
    : dayStep && days.length > 2
      ? `day 1 and every ${dayStep} days after that within each month`
      : `${days.length === 1 ? "day" : "days"} ${describeCronValues(days)} of the month`;
  const weekdayDescription = everyWeekday
    ? "every day of the week"
    : describeCronValues(weekdays, (day) => CRON_WEEKDAYS[day]);
  const monthDescription = everyMonth ? "every month" : describeCronValues(months, (month) => CRON_MONTHS[month - 1]);
  // A wildcard or wildcard step makes the two day fields intersect. With two
  // restricted day fields, traditional five-field cron uses either match.
  const eitherDayMatches = !parsed[2].wildcard && !parsed[4].wildcard;
  let calendar: string;
  if ((everyDate && everyWeekday) || (eitherDayMatches && (everyDate || everyWeekday))) {
    calendar = "every day";
  } else if (everyDate) {
    calendar = weekdayDescription;
  } else if (everyWeekday) {
    calendar = `on ${dayDescription}`;
  } else if (eitherDayMatches) {
    calendar = `on ${dayDescription} or on ${weekdayDescription}`;
  } else {
    calendar = `on ${weekdayDescription}, but only on ${dayDescription}`;
  }

  const notes: string[] = [];
  if (eitherDayMatches && !everyDate && !everyWeekday) {
    notes.push("The day of the month and day of the week are alternatives: either one can match.");
  } else if (!everyDate && !everyWeekday) {
    notes.push("Both the day-of-month rule and weekday rule must match for this schedule.");
  }
  if (minuteStep && 60 % minuteStep !== 0) {
    notes.push(`The minute count restarts each hour, so this is not a continuous ${minuteStep}-minute interval.`);
  }
  if (hourStep && 24 % hourStep !== 0) {
    notes.push(`The hour count restarts at midnight, so this is not a continuous ${hourStep}-hour interval.`);
  }
  if (dayStep && !everyDate) notes.push("The day count restarts on day 1 of each month.");
  if (!everyDate && days.some((day) => day >= 29)) {
    notes.push("Dates that do not exist in a month are skipped.");
  }

  return {
    description: `${timing}, ${calendar}${everyMonth ? "" : `, in ${monthDescription}`}.`,
    fields: [
      {
        label: "Minute",
        value: fields[0],
        description: everyMinute
          ? "Every minute."
          : minutes.length === 1 && minutes[0] === 0
            ? "At the start of the hour."
            : `${describeCronValues(minutes)} ${minutes.length === 1 && minutes[0] === 1 ? "minute" : "minutes"} past the hour.`,
      },
      {
        label: "Hour",
        value: fields[1],
        description: everyHour ? "Every hour." : `During ${hourDescription}.`,
      },
      {
        label: "Day of month",
        value: fields[2],
        description: `${dayDescription[0].toUpperCase()}${dayDescription.slice(1)}.`,
      },
      {
        label: "Month",
        value: fields[3],
        description: `${monthDescription[0].toUpperCase()}${monthDescription.slice(1)}.`,
      },
      {
        label: "Day of week",
        value: fields[4],
        description: `${weekdayDescription[0].toUpperCase()}${weekdayDescription.slice(1)}.`,
      },
    ],
    notes,
  };
}

export function describeCron(expression: string): string {
  return describeCronSchedule(expression).description;
}

function parseCronField(field: string, min: number, max: number, label: string, normalizeSunday = false) {
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

    if (minute.values.has(minuteValue) && hour.values.has(hourValue) && month.values.has(monthValue) && dayMatches) {
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
