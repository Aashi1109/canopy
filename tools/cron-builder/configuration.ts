import { describeCron } from "../../lib/devtools/shared/datetime.ts";
import definition from "./definition.ts";

export const CRON_FIELDS = [
  { key: "minute", range: "0–59" },
  { key: "hour", range: "0–23" },
  { key: "dayOfMonth", range: "1–31" },
  { key: "month", range: "1–12" },
  { key: "dayOfWeek", range: "0–7 · Sun = 0 or 7" },
] as const;

type CronField = (typeof CRON_FIELDS)[number]["key"];

export function getCronFieldError(key: CronField, value: string): string | undefined {
  if (!value.trim()) return `Enter ${definition.settings.fields[key].label.toLowerCase()}, or * for every value.`;
  const fields = CRON_FIELDS.map((field) => (field.key === key ? value.trim() : "*"));
  try {
    describeCron(fields.join(" "));
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "Enter a valid cron value.";
  }
}

/** Display-only summary. Execution and the exported result remain owned by run.ts. */
export function getScheduleSummary(settings: Readonly<Record<string, unknown>>): string {
  const fields = CRON_FIELDS.map(({ key }) => String(settings[key] ?? definition.settings.fields[key].default).trim());
  const [minute, hour, day, month, weekday] = fields;
  let description: string;
  try {
    description = describeCron(fields.join(" "));
  } catch {
    return "Complete the highlighted fields to see your schedule.";
  }
  if (day === "*" && month === "*") {
    if (weekday === "*" && hour === "*") {
      if (minute === "*" || minute === "*/1") return "Every minute.";
      if (/^\*\/\d+$/.test(minute) && 60 % Number(minute.slice(2)) === 0) {
        return `Every ${Number(minute.slice(2))} minutes.`;
      }
    }
    if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && (weekday === "*" || weekday === "1-5")) {
      const time = `${String(Number(hour)).padStart(2, "0")}:${String(Number(minute)).padStart(2, "0")}`;
      return `At ${time}, ${weekday === "1-5" ? "Monday through Friday" : "every day"}.`;
    }
  }
  return description;
}
