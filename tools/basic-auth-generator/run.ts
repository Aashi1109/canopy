/**
 * Moved verbatim from the `basic-auth-generator` case in
 * `lib/devtools/format-json.ts`: the same `username:password` join and the
 * same shared `encodeBase64`.
 *
 * The password is read once into the encoded header and appears nowhere else —
 * no log line, and no error message (the only error names the *username*).
 */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { encodeBase64 } from "../../lib/devtools/shared/encoding.ts";
import { requireUtilityInput } from "../../lib/devtools/shared/options.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const encoded = encodeBase64(`${requireUtilityInput(ctx.input.text, "Username")}:${ctx.input.secondary ?? ""}`);
  const value = `Basic ${encoded}`;
  return {
    render: "text",
    text: ctx.settings.copyAsHeader ? `Authorization: ${value}` : value,
  };
};

export default run;
