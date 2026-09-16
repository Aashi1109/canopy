import { randomString } from "../../lib/devtools/shared/crypto.ts";
import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const alphabet = [
    ctx.settings.upper ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "",
    ctx.settings.lower ? "abcdefghijklmnopqrstuvwxyz" : "",
    ctx.settings.numbers ? "0123456789" : "",
    ctx.settings.symbols ? "!@#$%^&*()-_=+[]{}" : "",
  ].join("");
  const usableAlphabet = ctx.settings.excludeAmbiguous ? alphabet.replace(/[0OIl]/g, "") : alphabet;
  return {
    render: "list",
    items: Array.from({ length: ctx.settings.count }, () => randomString(ctx.settings.length, usableAlphabet)),
    downloadName: "passwords.txt",
  };
};

export default run;
