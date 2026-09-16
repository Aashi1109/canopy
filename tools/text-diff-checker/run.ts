/**
 * Moved verbatim from the `text-diff-checker` case in
 * `lib/devtools/format-json.ts` and the `textDiff` helper it called. The
 * longest-common-subsequence table, the four-million-cell guard, and the
 * `"  "` / `"- "` / `"+ "` markers are unchanged.
 *
 * `textDiff` is not in `lib/devtools/shared/` because this is its only caller.
 */

import type { ToolResult } from "../../lib/tool-framework/result.ts";
import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

/** Guard on the LCS table size — the cost is the product of the line counts. */
const MAX_ALIGNMENT_CELLS = 4_000_000;

function textDiff(left: string, right: string): string {
  const leftLines = left.split(/\r\n|\r|\n/u);
  const rightLines = right.split(/\r\n|\r|\n/u);
  if (leftLines.length * rightLines.length > MAX_ALIGNMENT_CELLS) {
    throw new ToolError(
      "comparison-too-large",
      "This comparison is too large to align safely. Compare smaller sections.",
      "Split the inputs into smaller sections and compare them one at a time.",
    );
  }

  const lengths = Array.from({ length: leftLines.length + 1 }, () => new Uint32Array(rightLines.length + 1));
  for (let leftIndex = leftLines.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightLines.length - 1; rightIndex >= 0; rightIndex -= 1) {
      lengths[leftIndex][rightIndex] =
        leftLines[leftIndex] === rightLines[rightIndex]
          ? lengths[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(lengths[leftIndex + 1][rightIndex], lengths[leftIndex][rightIndex + 1]);
    }
  }

  const output: string[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftLines.length || rightIndex < rightLines.length) {
    if (
      leftIndex < leftLines.length &&
      rightIndex < rightLines.length &&
      leftLines[leftIndex] === rightLines[rightIndex]
    ) {
      output.push(`  ${leftLines[leftIndex]}`);
      leftIndex += 1;
      rightIndex += 1;
    } else if (
      rightIndex < rightLines.length &&
      (leftIndex >= leftLines.length || lengths[leftIndex][rightIndex + 1] > lengths[leftIndex + 1][rightIndex])
    ) {
      output.push(`+ ${rightLines[rightIndex]}`);
      rightIndex += 1;
    } else {
      output.push(`- ${leftLines[leftIndex]}`);
      leftIndex += 1;
    }
  }
  return output.join("\n");
}

export const run: ToolRun<Settings> = (ctx): ToolResult => ({
  render: "text",
  text: textDiff(ctx.input.text, ctx.input.secondary ?? ""),
  downloadName: "text-diff.txt",
});

export default run;
