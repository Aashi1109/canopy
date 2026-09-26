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
  const md5Checksum = md5(primary);
  return {
    render: "text",
    text: `MD5    ${md5Checksum}\nSHA-1  ${sha1}\nSHA-256 ${sha256}\nSHA-512 ${sha512}`,
    tablePreview: {
      render: "table",
      columns: ["Algorithm", "Checksum"],
      rows: [
        ["MD5", md5Checksum],
        ["SHA-1", sha1],
        ["SHA-256", sha256],
        ["SHA-512", sha512],
      ],
      showColumnDividers: true,
    },
    downloadName: "checksums.txt",
  };
};

export default run;
