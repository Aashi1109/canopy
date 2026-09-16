/**
 * Moved verbatim from the `jwt-expiration-checker` case in
 * `lib/devtools/format-json.ts`.
 *
 * The token arrives as `input.text` with `secret: true` on its field, never as
 * a setting: a JWT is a bearer credential, and settings are persisted UI state.
 * It is decoded and discarded — no part of it is echoed into the result.
 */

import { decodeJwt } from "../../lib/devtools/shared/jwt.ts";
import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const { payload } = decodeJwt(ctx.input.text);
  const now = Date.now() / 1000;
  const expiration = typeof payload.exp === "number" ? payload.exp : undefined;
  const notBefore = typeof payload.nbf === "number" ? payload.nbf : undefined;
  const formatDate = (seconds: number) =>
    ctx.settings.useLocalTime === true
      ? new Date(seconds * 1000).toLocaleString()
      : new Date(seconds * 1000).toISOString();
  const state =
    expiration === undefined
      ? "No expiration claim"
      : expiration <= now
        ? "Expired"
        : notBefore !== undefined && notBefore > now
          ? "Not active yet"
          : ctx.settings.warnBeforeExpiry === true && expiration <= now + 300
            ? "Expiring soon"
            : "Active";
  const lines = [
    `Status: ${state}`,
    expiration === undefined ? "Expires: not specified" : `Expires: ${formatDate(expiration)}`,
    typeof payload.iat === "number"
      ? `Issued: ${formatDate(payload.iat)}`
      : "Issued: not specified",
  ];
  if (ctx.settings.decodePayload === true) {
    lines.push("Payload:", JSON.stringify(payload, null, 2));
  }
  return {
    render: "text",
    text: lines.join("\n"),
  };
};

export default run;
