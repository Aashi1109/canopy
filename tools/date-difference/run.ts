/**
 * Moved verbatim from the `date-difference` case in
 * `lib/devtools/format-json.ts`. Parsing is the shared `parseDate` (which is
 * what accepts bare Unix seconds and milliseconds), and the three-decimal
 * rounding plus the leading "-" for a negative gap are preserved exactly.
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { parseDate } from "../../lib/devtools/shared/datetime.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

function dateInput(value: string, time: string, timezone: Settings["timezone"], label: string) {
  const trimmed = value.trim();
  const enteredTime = time.trim();
  const timeLabel = label.replace("date", "time");
  if (enteredTime && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(enteredTime)) {
    throw new ToolError(
      "time-invalid",
      `${timeLabel} must use 24-hour HH:MM or HH:MM:SS format.`,
      `Enter ${timeLabel.toLowerCase()} from 00:00 through 23:59:59.`,
    );
  }
  let input = trimmed;
  if (enteredTime) {
    const parsed = parseDate(trimmed, label);
    const datePart =
      /^\d{4}-\d{2}-\d{2}/.exec(trimmed)?.[0] ??
      (timezone === "utc"
        ? parsed.toISOString().slice(0, 10)
        : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`);
    const enteredOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.exec(trimmed)?.[0] ?? "";
    const offset = timezone === "utc" ? "Z" : timezone === "local" ? "" : enteredOffset;
    input = `${datePart}T${enteredTime}${offset}`;
  } else if (timezone === "utc" && !/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const withoutOffset = trimmed.replace(/(?:Z|[+-]\d{2}:\d{2})$/i, "");
    input = `${withoutOffset}${/^\d{4}-\d{2}-\d{2}$/.test(withoutOffset) ? "T00:00:00Z" : "Z"}`;
  } else if (timezone === "local") {
    input = trimmed.replace(/(?:Z|[+-]\d{2}:\d{2})$/i, "");
  }
  return parseDate(input, label);
}

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const timezone = ctx.settings.timezone ?? "as-entered";
  const start = dateInput(ctx.input.text, ctx.settings.startTime ?? "", timezone, "Start date");
  const end = dateInput(ctx.input.secondary ?? "", ctx.settings.endTime ?? "", timezone, "End date");
  const milliseconds = end.getTime() - start.getTime();
  const direction = milliseconds < 0 ? "-" : "";
  const hours = Math.abs(milliseconds) / 3_600_000;
  const days = hours / 24;
  const text =
    (ctx.settings.exactDuration ?? true)
      ? `${direction}${Number(days.toFixed(3))} days (${direction}${Number(hours.toFixed(3))} hours)`
      : `${direction}${Number(days.toFixed(3))} days`;
  return {
    render: "text",
    text,
  };
};

export default run;
