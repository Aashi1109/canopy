/**
 * Moved verbatim from the `checksum-generator` case in
 * `lib/devtools/format-json.ts` (line 2585): the same three Web Crypto digests
 * in parallel, the same `md5` package, and the same label padding.
 *
 * The padding is knowingly inconsistent — "MD5    " and "SHA-1  " are 7
 * characters while "SHA-256 " and "SHA-512 " are 8, so the hex columns are off
 * by one. It is preserved rather than fixed: this migration is a move, the
 * defect is cosmetic, and correcting it would mean editing a captured fixture
 * for no functional gain. Alignment belongs to a `key-value` render, not to
 * spaces baked into a string.
 */

import md5 from "md5";

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import { digestText } from "../../lib/devtools/shared/crypto.ts";

export const run: ToolRun<Record<string, never>> = async (ctx): Promise<ToolResult> => {
  const primary = ctx.input.text;
  const [sha1, sha256, sha512] = await Promise.all([
    digestText(primary, "SHA-1"),
    digestText(primary, "SHA-256"),
    digestText(primary, "SHA-512"),
  ]);
  ctx.signal.throwIfAborted();
  return {
    render: "text",
    text: `MD5    ${md5(primary)}\nSHA-1  ${sha1}\nSHA-256 ${sha256}\nSHA-512 ${sha512}`,
    downloadName: "checksums.txt",
  };
};

export default run;
