// Date parsing and cron expression handling.
// Verbatim extraction from lib/devtools/format-json.ts (region 4).

import { ToolError } from "../../tool-framework/run.ts";
import { requireUtilityInput } from "./options.ts";
import type { CronTranslationOptions } from "./cron-messages.ts";

export function parseDate(input: string, label: string, endpoint: "date" | "start" | "end" = "date"): Date {
  requireUtilityInput(input, label, { key: "sharedDate.required", values: { endpoint } });
  let date: Date;
  if (/^-?\d+(?:\.\d+)?$/.test(input.trim())) {
    const number = Number(input);
    date = new Date(Math.abs(number) < 1e11 ? number * 1000 : number);
  } else date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new ToolError("invalid-date", `${label} is not a valid date or timestamp.`, undefined, {
      messageRef: { key: "sharedDate.invalid", values: { endpoint } },
    });
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

function joinCronItems(items: string[], options?: CronTranslationOptions): string {
  if (options) return new Intl.ListFormat(options.locale ?? "en", { type: "conjunction" }).format(items);
  if (items.length < 3) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function describeCronValues(
  values: number[],
  format: (value: number) => string = String,
  options?: CronTranslationOptions,
): string {
  const groups: string[] = [];
  for (let start = 0; start < values.length; start += 1) {
    let end = start;
    while (end + 1 < values.length && values[end + 1] === values[end] + 1) end += 1;
    if (end - start >= 2)
      groups.push(
        options?.translate("cron.range", { start: format(values[start]), end: format(values[end]) }) ??
          `${format(values[start])} through ${format(values[end])}`,
      );
    else for (let index = start; index <= end; index += 1) groups.push(format(values[index]));
    start = end;
  }
  return joinCronItems(groups, options);
}

function cronClock(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Optional presentation translation; callers without it retain exact export text. */
export function describeCronSchedule(
  expression: string,
  options?: CronTranslationOptions,
): {
  description: string;
  fields: readonly { label: string; value: string; description: string }[];
  notes: readonly string[];
} {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new ToolError(
      "invalid-cron",
      "Cron expression must contain minute, hour, day, month, and weekday fields.",
      undefined,
      { messageRef: { key: "cron.error.fields" } },
    );
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
  const text = (key: string, fallback: string, values?: Record<string, string | number>) =>
    options?.translate(key, values) ?? fallback;
  const valuesText = (values: number[], format?: (value: number) => string) =>
    describeCronValues(values, format, options);
  const sentence = (description: string) =>
    text("cron.field.description", `${description[0].toUpperCase()}${description.slice(1)}.`, {
      description: `${description[0].toLocaleUpperCase(options?.locale)}${description.slice(1)}`,
    });
  const monthName = (month: number) =>
    options
      ? new Intl.DateTimeFormat(options.locale ?? "en", { month: "long", timeZone: "UTC" }).format(
          new Date(Date.UTC(2024, month - 1, 1)),
        )
      : CRON_MONTHS[month - 1];
  const weekdayName = (day: number) =>
    options
      ? new Intl.DateTimeFormat(options.locale ?? "en", { weekday: "long", timeZone: "UTC" }).format(
          new Date(Date.UTC(2024, 0, 7 + day)),
        )
      : CRON_WEEKDAYS[day];
  const everyMinute = minutes.length === 60;
  const everyHour = hours.length === 24;
  const everyDate = days.length === 31;
  const everyMonth = months.length === 12;
  const everyWeekday = weekdays.length === 7;
  const minuteStep = fields[0].startsWith("*/") ? Number(fields[0].slice(2)) : undefined;
  const hourStep = fields[1].startsWith("*/") ? Number(fields[1].slice(2)) : undefined;
  const hourDescription = everyHour
    ? text("cron.hour.every", "every hour")
    : hours.length === 1
      ? text("cron.hour.one", `the ${cronClock(hours[0])} hour`, { time: cronClock(hours[0]) })
      : text("cron.hour.many", `the hours ${describeCronValues(hours, (hour) => cronClock(hour))}`, {
          hours: valuesText(hours, (hour) => cronClock(hour)),
        });
  let timing: string;
  if (everyMinute) {
    timing = everyHour
      ? text("cron.timing.everyMinute", "Every minute")
      : text("cron.timing.everyMinuteDuring", `Every minute during ${hourDescription}`, { hours: hourDescription });
  } else if (hourStep && hourStep > 1 && hourStep < 24 && 24 % hourStep === 0 && minutes.length === 1) {
    timing = text("cron.timing.hourStep", `Every ${hourStep} hours, starting at ${cronClock(0, minutes[0])}`, {
      count: hourStep,
      time: cronClock(0, minutes[0]),
    });
  } else if (!everyHour && minutes.length * hours.length <= MAX_INLINE_CRON_TIMES) {
    const times = hours.flatMap((hour) => minutes.map((minute) => cronClock(hour, minute)));
    timing = text("cron.timing.at", `At ${joinCronItems(times)}`, { times: joinCronItems(times, options) });
  } else if (minuteStep && 60 % minuteStep === 0 && minuteStep < 60) {
    timing = text(
      everyHour ? "cron.timing.minuteStep" : "cron.timing.minuteStepDuring",
      `Every ${minuteStep} minutes${everyHour ? "" : ` during ${hourDescription}`}`,
      { count: minuteStep, hours: hourDescription },
    );
  } else if (minutes.length === 1 && minutes[0] === 0 && everyHour) {
    timing = text("cron.timing.hourStart", "Every hour, on the hour");
  } else {
    timing = text(
      "cron.timing.minutesPast",
      `At ${describeCronValues(minutes)} ${minutes.length === 1 && minutes[0] === 1 ? "minute" : "minutes"} past ${hourDescription}`,
      {
        minutes: valuesText(minutes),
        unitCount: minutes.length === 1 && minutes[0] === 1 ? 1 : 2,
        hours: hourDescription,
      },
    );
  }

  const dayStep = fields[2].startsWith("*/") ? Number(fields[2].slice(2)) : undefined;
  const dayDescription = everyDate
    ? text("cron.day.every", "every day of the month")
    : dayStep && days.length > 2
      ? text("cron.day.step", `day 1 and every ${dayStep} days after that within each month`, { count: dayStep })
      : text("cron.day.values", `${days.length === 1 ? "day" : "days"} ${describeCronValues(days)} of the month`, {
          count: days.length,
          days: valuesText(days),
        });
  const weekdayDescription = everyWeekday
    ? text("cron.weekday.every", "every day of the week")
    : valuesText(weekdays, weekdayName);
  const monthDescription = everyMonth ? text("cron.month.every", "every month") : valuesText(months, monthName);
  // A wildcard or wildcard step makes the two day fields intersect. With two
  // restricted day fields, traditional five-field cron uses either match.
  const eitherDayMatches = !parsed[2].wildcard && !parsed[4].wildcard;
  let calendar: string;
  if ((everyDate && everyWeekday) || (eitherDayMatches && (everyDate || everyWeekday))) {
    calendar = text("cron.calendar.everyDay", "every day");
  } else if (everyDate) {
    calendar = weekdayDescription;
  } else if (everyWeekday) {
    calendar = text("cron.calendar.days", `on ${dayDescription}`, { days: dayDescription });
  } else if (eitherDayMatches) {
    calendar = text("cron.calendar.either", `on ${dayDescription} or on ${weekdayDescription}`, {
      days: dayDescription,
      weekdays: weekdayDescription,
    });
  } else {
    calendar = text("cron.calendar.both", `on ${weekdayDescription}, but only on ${dayDescription}`, {
      days: dayDescription,
      weekdays: weekdayDescription,
    });
  }

  const notes: string[] = [];
  if (eitherDayMatches && !everyDate && !everyWeekday) {
    notes.push(
      text(
        "cron.note.alternatives",
        "The day of the month and day of the week are alternatives: either one can match.",
      ),
    );
  } else if (!everyDate && !everyWeekday) {
    notes.push(text("cron.note.both", "Both the day-of-month rule and weekday rule must match for this schedule."));
  }
  if (minuteStep && 60 % minuteStep !== 0) {
    notes.push(
      text(
        "cron.note.minuteRestart",
        `The minute count restarts each hour, so this is not a continuous ${minuteStep}-minute interval.`,
        { count: minuteStep },
      ),
    );
  }
  if (hourStep && 24 % hourStep !== 0) {
    notes.push(
      text(
        "cron.note.hourRestart",
        `The hour count restarts at midnight, so this is not a continuous ${hourStep}-hour interval.`,
        { count: hourStep },
      ),
    );
  }
  if (dayStep && !everyDate) notes.push(text("cron.note.dayRestart", "The day count restarts on day 1 of each month."));
  if (!everyDate && days.some((day) => day >= 29)) {
    notes.push(text("cron.note.missingDates", "Dates that do not exist in a month are skipped."));
  }

  return {
    description: text(
      everyMonth ? "cron.description" : "cron.descriptionMonths",
      `${timing}, ${calendar}${everyMonth ? "" : `, in ${monthDescription}`}.`,
      { timing, calendar, months: monthDescription },
    ),
    fields: [
      {
        label: text("cron.field.minute", "Minute"),
        value: fields[0],
        description: everyMinute
          ? text("cron.field.everyMinute", "Every minute.")
          : minutes.length === 1 && minutes[0] === 0
            ? text("cron.field.hourStart", "At the start of the hour.")
            : text(
                "cron.field.minutesPast",
                `${describeCronValues(minutes)} ${minutes.length === 1 && minutes[0] === 1 ? "minute" : "minutes"} past the hour.`,
                { minutes: valuesText(minutes), unitCount: minutes.length === 1 && minutes[0] === 1 ? 1 : 2 },
              ),
      },
      {
        label: text("cron.field.hour", "Hour"),
        value: fields[1],
        description: everyHour
          ? text("cron.field.everyHour", "Every hour.")
          : text("cron.field.during", `During ${hourDescription}.`, { hours: hourDescription }),
      },
      {
        label: text("cron.field.day", "Day of month"),
        value: fields[2],
        description: sentence(dayDescription),
      },
      {
        label: text("cron.field.month", "Month"),
        value: fields[3],
        description: sentence(monthDescription),
      },
      {
        label: text("cron.field.weekday", "Day of week"),
        value: fields[4],
        description: sentence(weekdayDescription),
      },
    ],
    notes,
  };
}

export function describeCron(expression: string, options?: CronTranslationOptions): string {
  return describeCronSchedule(expression, options).description;
}

const CRON_FIELD_IDS = {
  Minute: "minute",
  Hour: "hour",
  "Day of month": "day",
  Month: "month",
  Weekday: "weekday",
} as const;

function parseCronField(
  field: string,
  min: number,
  max: number,
  label: keyof typeof CRON_FIELD_IDS,
  normalizeSunday = false,
) {
  const error = (key: string, message: string) =>
    new ToolError("invalid-cron", message, undefined, {
      messageRef: { key, values: { field: CRON_FIELD_IDS[label], min, max } },
    });
  const values = new Set<number>();
  const wildcard = field === "*" || field.startsWith("*/");
  const add = (value: number) => {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw error("cron.error.range", `${label} must be between ${min} and ${max}.`);
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
      throw error("cron.error.step", `${label} step is outside the supported range.`);
    }
    for (let value = min; value <= max; value += step) add(value);
    return { values, wildcard };
  }
  if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(field)) {
    throw error("cron.error.syntax", `${label} contains unsupported syntax.`);
  }
  for (const part of field.split(",")) {
    const [startRaw, endRaw] = part.split("-");
    const start = Number(startRaw);
    const end = endRaw === undefined ? start : Number(endRaw);
    if (start > end) throw error("cron.error.ascending", `${label} range must be ascending.`);
    for (let value = start; value <= end; value += 1) add(value);
  }
  return { values, wildcard };
}

export function nextCronRuns(expression: string, timezone: "local" | "utc", count = 5) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new ToolError("invalid-cron", "Cron expression must contain five fields.", undefined, {
      messageRef: { key: "cron.error.fiveFields" },
    });
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
    throw new ToolError("invalid-cron", "No matching runs were found in the next two years.", undefined, {
      messageRef: { key: "cron.error.noRuns" },
    });
  }
  return runs;
}
