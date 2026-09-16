/**
 * Moved verbatim from the `utm-builder` case in `lib/devtools/format-json.ts`.
 * Same `safeUrl` guard, same replace-vs-merge handling of an existing query,
 * same trim/lowercase normalization, same required-parameter check.
 */

import { safeUrl } from "../../lib/devtools/shared/url.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

const PARAMETERS = [
  ["utm_source", "source"],
  ["utm_medium", "medium"],
  ["utm_campaign", "campaign"],
  ["utm_term", "term"],
  ["utm_content", "content"],
] as const;

const REQUIRED = ["utm_source", "utm_medium", "utm_campaign"] as const;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const url = safeUrl(ctx.settings.url, "Destination URL");
  if (ctx.settings.existingQuery === "replace") {
    url.search = "";
  }
  const normalizeValue = (value: string) =>
    ctx.settings.normalization === "lowercase" ? value.trim().toLocaleLowerCase() : value.trim();

  for (const [key, settingKey] of PARAMETERS) {
    const value = normalizeValue(ctx.settings[settingKey]);
    if (value) url.searchParams.set(key, value);
  }
  for (const required of REQUIRED) {
    if (!url.searchParams.get(required)) {
      throw new ToolError(
        "parameter-required",
        `${required} is required.`,
        "Fill in campaign source, medium, and name — a partially tagged link reports as direct traffic.",
      );
    }
  }

  return { render: "text", text: url.toString(), downloadName: "campaign-url.txt" };
};

export default run;
