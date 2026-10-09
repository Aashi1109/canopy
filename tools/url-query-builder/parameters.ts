import { ToolError } from "../../lib/tool-framework/run.ts";
import type { SettingRow } from "../../lib/tool-framework/settings.ts";

export function parseQueryRows(text: string): SettingRow[] {
  const rows: SettingRow[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf("=");
    const key = separator < 0 ? "" : line.slice(0, separator).trim();
    if (!key) {
      throw new ToolError(
        "invalid-query-row",
        "Each query row must use key=value format.",
        "Give every non-blank line a key, an equals sign, and a value.",
        { messageRef: { key: "errors.invalid-query-row" }, recoveryMessage: { key: "recovery.invalid-query-row" } },
      );
    }
    rows.push({ key, value: line.slice(separator + 1).trim() });
  }
  return rows;
}
