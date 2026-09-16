/**
 * Moved verbatim from the `sha1-generator` case in
 * `lib/devtools/format-json.ts` (line 2559). `digestText` is the shared Web
 * Crypto helper. As before there is no required-input guard: empty input hashes
 * the empty string rather than erroring.
 */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import { digestText } from "../../lib/devtools/shared/crypto.ts";

export const run: ToolRun<Record<string, never>> = async (ctx): Promise<ToolResult> => {
  const digest = await digestText(ctx.input.text, "SHA-1");
  ctx.signal.throwIfAborted();
  return { render: "text", text: digest, downloadName: "sha1-hash.txt" };
};

export default run;
