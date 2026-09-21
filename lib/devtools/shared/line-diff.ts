import type { ToolDiffLine } from "../../tool-framework/result.ts";
import { ToolError } from "../../tool-framework/run.ts";

/** Guard on the LCS table size — the cost is the product of the line counts. */
const MAX_ALIGNMENT_CELLS = 4_000_000;

export function diffLines(left: string, right: string): ToolDiffLine[] {
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

  const output: ToolDiffLine[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftLines.length || rightIndex < rightLines.length) {
    if (
      leftIndex < leftLines.length &&
      rightIndex < rightLines.length &&
      leftLines[leftIndex] === rightLines[rightIndex]
    ) {
      output.push({ kind: "context", text: leftLines[leftIndex] });
      leftIndex += 1;
      rightIndex += 1;
    } else if (
      rightIndex < rightLines.length &&
      (leftIndex >= leftLines.length || lengths[leftIndex][rightIndex + 1] > lengths[leftIndex + 1][rightIndex])
    ) {
      output.push({ kind: "added", text: rightLines[rightIndex] });
      rightIndex += 1;
    } else {
      output.push({ kind: "removed", text: leftLines[leftIndex] });
      leftIndex += 1;
    }
  }
  return output;
}
