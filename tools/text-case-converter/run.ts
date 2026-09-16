/**
 * Moved verbatim from the `text-case-converter` case and `convertTextCase` in
 * `lib/devtools/format-json.ts`. `convertTextCase` has one consumer, so it
 * lives here; the `words` splitter it builds on is shared and imported.
 */

import { words } from "../../lib/devtools/shared/text.ts";
import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

function convertTextCase(value: string, target: string): string {
  const parts = words(value);
  const lower = parts.map((part) => part.toLocaleLowerCase());
  const capitalize = (part: string) => (part ? part[0].toLocaleUpperCase() + part.slice(1).toLocaleLowerCase() : part);

  switch (target) {
    case "upper":
      return value.toLocaleUpperCase();
    case "lower":
      return value.toLocaleLowerCase();
    case "title":
      return parts.map(capitalize).join(" ");
    case "sentence":
      return lower.length ? capitalize(lower.join(" ")) : "";
    case "camel":
      return lower.map((part, index) => (index ? capitalize(part) : part)).join("");
    case "pascal":
      return lower.map(capitalize).join("");
    case "snake":
      return lower.join("_");
    case "kebab":
      return lower.join("-");
    case "constant":
      return lower.join("_").toLocaleUpperCase();
    default:
      throw new ToolError("unknown-case", "Choose a valid text case.");
  }
}

export const run: ToolRun<Settings> = (ctx): ToolResult => ({
  render: "text",
  text: convertTextCase(ctx.input.text, ctx.settings.target),
});

export default run;
