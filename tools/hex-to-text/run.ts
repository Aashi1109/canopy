/**
 * Moved verbatim from the `hex-to-text` case in
 * `lib/devtools/format-json.ts` (line 2525) plus its single-consumer helper
 * `hexToBytes` (line 3724). Only this tool calls the helper, so it stays here.
 *
 * The original distinguished the two failures by matching /Hex input/ on the
 * thrown message; that is expressed here as two explicit throws with the same
 * message strings.
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";

function hexToBytes(value: string): Uint8Array {
  const normalized = value.replace(/(?:0x|[\s:_-])/gi, "");
  if (!normalized || normalized.length % 2 || !/^[\da-f]+$/i.test(normalized)) {
    throw new ToolError(
      "invalid-hex",
      "Hex input must contain complete hexadecimal bytes.",
      "Use an even number of hex digits; whitespace, colons, hyphens, underscores and 0x prefixes are stripped for you.",
    );
  }
  return Uint8Array.from(normalized.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
}

export const run: ToolRun<Record<string, never>> = (ctx): ToolResult => {
  const bytes = hexToBytes(ctx.input.text);
  try {
    return {
      render: "text",
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      downloadName: "decoded-text.txt",
    };
  } catch {
    throw new ToolError(
      "invalid-utf8",
      "Hex input does not contain valid UTF-8 text.",
      "These bytes are not UTF-8 text — check for Latin-1 content or a truncated multi-byte character.",
    );
  }
};

export default run;
