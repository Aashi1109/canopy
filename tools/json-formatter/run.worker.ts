/**
 * The folder-contract entry point. Formatting and minifying share
 * `transformJson`; validation reports the type of the value it already parsed.
 *
 * The `"2" | "4" | "tab"` setting is a UI value; `JsonIndentation` is the
 * transform's own `2 | 4 | "tab"`, so the mapping stays at this boundary.
 */

import {
  isLargeJsonRun,
  jsonRootType,
  transformLargeJsonRun,
  transformSmallJson,
  validateStreamingJsonRun,
} from "../../lib/devtools/shared/streaming-json-tool.ts";
import type { StreamingJsonIndentation } from "../../lib/devtools/shared/streaming-json.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

function indentationFrom(value: string): StreamingJsonIndentation {
  if (value === "tab") return "tab";
  return value === "4" ? 4 : 2;
}

export const run: ToolRun<Settings> = async (ctx): Promise<ToolResult> => {
  const operation = ctx.settings.operation ?? "format";
  if (isLargeJsonRun(ctx)) {
    if (operation === "validate") return validateStreamingJsonRun(ctx);
    return transformLargeJsonRun(ctx, {
      indentation: indentationFrom(ctx.settings.indentation),
      mode: operation === "minify" ? "minify" : "format",
      name: operation === "minify" ? "smarttools-minified.json" : "smarttools-formatted.json",
    });
  }

  if (operation === "validate") {
    const validated = await validateStreamingJsonRun(ctx);
    return {
      render: "text",
      text: `Valid JSON\nRoot type: ${jsonRootType(validated.render === "code" ? validated.code : ctx.input.text)}`,
    };
  }

  const output = await transformSmallJson(ctx.input.text, {
    indentation: indentationFrom(ctx.settings.indentation),
    mode: operation === "minify" ? "minify" : "format",
    signal: ctx.signal,
  });
  const value = JSON.parse(output) as unknown;

  if (operation === "minify") {
    return {
      render: "json-tree",
      text: output,
      downloadName: "smarttools-minified.json",
      value,
    };
  }

  // Match complete strings first so digits in keys and string values are ignored.
  for (const [, number] of output.matchAll(/"(?:[^"\\]|\\.)*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)) {
    if (number !== undefined && String(Number(number)) !== number) {
      return {
        render: "code",
        code: output,
        language: "json",
        downloadName: "smarttools-formatted.json",
        verdict: {
          level: "ok",
          label: "Exact numbers preserved",
          detail:
            "Shown as code because a tree view would change some numeric values. Copy and download keep the original numbers.",
        },
      };
    }
  }

  return {
    render: "json-tree",
    text: output,
    downloadName: "smarttools-formatted.json",
    value,
  };
};

export default run;
