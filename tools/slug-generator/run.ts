/**
 * Moved verbatim from the `slug-generator` case in
 * `lib/devtools/format-json.ts` (arm at line 2323). `words` — which does the
 * NFKD normalization, accent stripping, and camelCase split — is shared
 * (`lib/devtools/shared/text.ts`) and is imported rather than copied.
 */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { words } from "../../lib/devtools/shared/text.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => ({
  render: "text",
  text: ctx.input.text
    .split(/\r\n|\r|\n/)
    .map((line) =>
      words(line)
        .map((word) => word.toLocaleLowerCase())
        .join("-"),
    )
    .filter(Boolean)
    .join("\n"),
  downloadName: "slugs.txt",
});

export default run;
