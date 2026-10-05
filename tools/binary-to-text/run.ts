/**
 * Moved verbatim from the `binary-to-text` case in
 * `lib/devtools/format-json.ts` (line 2504): the same eight-bit group check,
 * the same fatal UTF-8 decoder, and both legacy error strings unchanged.
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";

export const run: ToolRun<Record<string, never>> = (ctx): ToolResult => {
  const chunks = ctx.input.text.trim().split(/\s+/);
  if (!chunks.length || chunks.some((chunk) => !/^[01]{8}$/.test(chunk))) {
    throw new ToolError(
      "invalid-binary",
      "Binary input must contain eight-bit bytes separated by spaces.",
      "Group the bits into bytes of exactly eight 0s and 1s, separated by whitespace.",
      {
        messageRef: { key: "execution.errors.invalid-binary" },
        recoveryMessage: { key: "execution.recovery.invalid-binary" },
      },
    );
  }
  try {
    return {
      render: "text",
      text: new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(chunks, (chunk) => Number.parseInt(chunk, 2)),
      ),
      downloadName: "decoded-text.txt",
    };
  } catch {
    throw new ToolError(
      "invalid-utf8",
      "Binary input does not contain valid UTF-8 text.",
      "Check that every byte of each multi-byte character is present and in order.",
      {
        messageRef: { key: "execution.errors.invalid-utf8" },
        recoveryMessage: { key: "execution.recovery.invalid-utf8" },
      },
    );
  }
};

export default run;
