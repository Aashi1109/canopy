/**
 * Moved verbatim from the `json-unescape` case in
 * `lib/devtools/format-json.ts` (line 2186): the input is wrapped in quotes and
 * handed to `JSON.parse`, and the legacy error message is preserved exactly.
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";

export const run: ToolRun<Record<string, never>> = (ctx): ToolResult => {
  try {
    return {
      render: "text",
      text: JSON.parse(`"${ctx.input.text}"`) as string,
      downloadName: "unescaped.txt",
    };
  } catch {
    throw new ToolError(
      "invalid-escape",
      "Escaped string is not valid JSON string content.",
      'Paste only what sits between the quotes, and escape any inner quote as \\" and any backslash as \\\\.',
    );
  }
};

export default run;
