import type { SettingRow } from "../../lib/tool-framework/settings.ts";

const STANDARD_FIELDS = new Map([
  ["utm_source", "Campaign source"],
  ["utm_medium", "Campaign medium"],
  ["utm_campaign", "Campaign name"],
  ["utm_term", "Campaign term"],
  ["utm_content", "Campaign content"],
]);

export function getParameterErrors(rows: readonly SettingRow[]): string[] {
  const keyCounts = new Map<string, number>();
  for (const row of rows) {
    const key = row.key.trim().toLowerCase();
    if (key) keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }

  return rows.map((row) => {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key && !value) return "";
    if (!key || !value) return "Enter both a key and value, or remove this row.";

    const normalizedKey = key.toLowerCase();
    const standardField = STANDARD_FIELDS.get(normalizedKey);
    if (standardField) return `Use the ${standardField} field instead of an extra ${normalizedKey} parameter.`;
    if ((keyCounts.get(normalizedKey) ?? 0) > 1) {
      return "This key is already used in another extra parameter. Keep one row per key.";
    }
    return "";
  });
}
