/**
 * Moved verbatim from the `bearer-token-parser` case in
 * `lib/devtools/format-json.ts`: the same case-insensitive `Bearer ` strip, the
 * same three-part test, and the same shared `decodeJwt`.
 *
 * The token is echoed in the result because that is the tool's output contract
 * — it is never written to a log, and no error message contains it.
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { decodeJwt } from "../../lib/devtools/shared/jwt.ts";
import { requireUtilityInput } from "../../lib/devtools/shared/options.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const input = requireUtilityInput(ctx.input.text, "Authorization header or token").trim();
  const inputFormat = ctx.settings.inputFormat ?? "auto";
  if (inputFormat === "header" && !/^Bearer\s+/i.test(input)) {
    throw new ToolError(
      "authorization-header-required",
      "Authorization header must start with Bearer.",
      "Paste the whole Authorization header or choose Raw token.",
    );
  }
  const token = inputFormat === "raw" ? input : input.replace(/^Bearer\s+/i, "");
  if (!token) {
    throw new ToolError(
      "token-required",
      "Bearer token is required.",
      "Paste the token itself, not just the Bearer prefix.",
    );
  }
  const displayedToken = ctx.settings.maskRawToken === true ? "••••••••" : token;
  if ((ctx.settings.decodeJwtParts ?? true) && token.split(".").length === 3) {
    const decoded = decodeJwt(token);
    const value = {
      token: displayedToken,
      header: decoded.header,
      payload: decoded.payload,
    };
    return {
      render: "json-tree",
      value,
      text: JSON.stringify(value, null, 2),
    };
  }
  return {
    render: "key-value",
    entries: [
      { label: "Token", value: displayedToken },
      { label: "Length", value: String(token.length) },
    ],
  };
};

export default run;
