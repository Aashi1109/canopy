/**
 * Moved verbatim from the `uuid-generator` case in
 * `lib/devtools/format-json.ts` (line 2543) plus its single-consumer helper
 * `uuidV7` (line 3744). Only this tool builds a v7, so the helper stays here.
 *
 * v4 remains `crypto.randomUUID()` and v7 remains 16 cryptographically random
 * bytes with the first six overwritten by the millisecond timestamp and the
 * version/variant nibbles set — no reimplementation, no fallback to Math.random.
 */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { getCrypto } from "../../lib/devtools/shared/crypto.ts";
import { bytesToHex } from "../../lib/devtools/shared/encoding.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

function uuidV7(): string {
  const bytes = getCrypto().getRandomValues(new Uint8Array(16));
  let timestamp = Date.now();
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp & 0xff;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const { version, count, hyphens, upper } = ctx.settings;
  const values = Array.from({ length: count }, () => (version === "v7" ? uuidV7() : getCrypto().randomUUID())).map(
    (value) => {
      const withoutHyphens = hyphens ? value : value.replaceAll("-", "");
      return upper ? withoutHyphens.toUpperCase() : withoutHyphens;
    },
  );
  return { render: "list", items: values, downloadName: "uuids.txt" };
};

export default run;
