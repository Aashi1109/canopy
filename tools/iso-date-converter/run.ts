/**
 * Moved from the `iso-date-converter` case in `lib/devtools/format-json.ts`
 * (arm at line 2794). `parseDate` is shared
 * (`lib/devtools/shared/datetime.ts`).
 *
 * The original defaults remain pinned to en-US browser-local output. Optional
 * settings can instead use UTC, omit the RFC 1123 line, or keep an explicit
 * source offset in the ISO value.
 */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { parseDate } from "../../lib/devtools/shared/datetime.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

/** Pinned so the same instant renders identically on every machine. */
const LOCAL_FORMAT_LOCALE = "en-US";
const OFFSET_AT_END = /([+-])(\d{2}):?(\d{2})$/;

function isoWithSourceOffset(date: Date, input: string): string {
  const source = input.trim();
  const match = source.includes("T") ? source.match(OFFSET_AT_END) : null;
  if (!match) return date.toISOString();
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return date.toISOString();
  const offsetMinutes = (match[1] === "-" ? -1 : 1) * (hours * 60 + minutes);
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return `${shifted.toISOString().slice(0, -1)}${match[1]}${match[2]}:${match[3]}`;
}

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const convert = (input: string) => {
    const date = parseDate(input, "Date input");
    const locale = ctx.settings.locale === "en-GB" ? "en-GB" : LOCAL_FORMAT_LOCALE;
    const displayInUtc = ctx.settings.displayTimezone === "utc";
    const readable = displayInUtc
      ? date.toLocaleString(locale, { timeZone: "UTC" })
      : date.toLocaleString(locale);
    const output = [
      `ISO: ${ctx.settings.preserveOffset === true ? isoWithSourceOffset(date, input) : date.toISOString()}`,
    ];
    if (ctx.settings.showUtc !== false) output.push(`UTC: ${date.toUTCString()}`);
    output.push(
      `${displayInUtc ? "Display (UTC)" : "Local"}: ${readable}`,
      `Unix: ${Math.floor(date.getTime() / 1000)}`,
    );
    return output.join("\n");
  };

  const lines = ctx.input.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return { render: "text", text: convert(lines[0] ?? "") };

  return {
    render: "list",
    labels: lines,
    items: lines.map((line) => {
      try {
        return convert(line);
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    }),
  };
};

export default run;
