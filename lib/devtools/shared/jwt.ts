// JWT segment decoding.
// Verbatim extraction from lib/devtools/format-json.ts (region 4).

import { ToolError } from "../../tool-framework/run.ts";
import { decodeBase64 } from "./encoding.ts";
import { isRecord } from "./json.ts";

export function decodeJwt(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
} {
  const parts = token.trim().split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new ToolError("invalid-jwt", "JWT must contain three dot-separated parts.", undefined, {
      messageRef: { key: "sharedJwt.parts" },
    });
  }
  try {
    const header = JSON.parse(decodeBase64(parts[0])) as unknown;
    const payload = JSON.parse(decodeBase64(parts[1])) as unknown;
    if (!isRecord(header) || !isRecord(payload)) {
      throw new ToolError("invalid-jwt", "JWT header or payload is not valid Base64URL JSON.", undefined, {
        messageRef: { key: "sharedJwt.payload" },
      });
    }
    return { header, payload, signature: parts[2] };
  } catch {
    throw new ToolError("invalid-jwt", "JWT header or payload is not valid Base64URL JSON.", undefined, {
      messageRef: { key: "sharedJwt.payload" },
    });
  }
}
