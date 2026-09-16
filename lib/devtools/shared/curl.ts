// Shell tokenization and curl command parsing.
// Verbatim extraction from lib/devtools/format-json.ts (region 4).

import { ToolError } from "../../tool-framework/run.ts";
import { encodeBase64 } from "./encoding.ts";
import { requireUtilityInput } from "./options.ts";

export function shellTokens(command: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote = "";
  let escaped = false;
  for (const character of command.trim()) {
    if (escaped) {
      token += character;
      escaped = false;
    } else if (character === "\\" && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = "";
      else token += character;
    } else if (character === '"' || character === "'") quote = character;
    else if (/\s/.test(character)) {
      if (token) tokens.push(token);
      token = "";
    } else token += character;
  }
  if (escaped || quote) {
    throw new ToolError("invalid-curl", "cURL command contains an unfinished quote or escape.");
  }
  if (token) tokens.push(token);
  return tokens;
}

export function parseCurl(command: string): {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
} {
  const tokens = shellTokens(requireUtilityInput(command, "cURL command"));
  if (tokens[0]?.toLowerCase() !== "curl") {
    throw new ToolError("invalid-curl", "Command must start with curl.");
  }
  let method = "GET";
  let url = "";
  let body: string | undefined;
  const headers: Record<string, string> = {};
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "-X" || token === "--request") method = (tokens[++index] ?? "").toUpperCase();
    else if (token === "-H" || token === "--header") {
      const header = tokens[++index] ?? "";
      const separator = header.indexOf(":");
      if (separator < 1) {
        throw new ToolError("invalid-curl-header", "Every cURL header needs a name and value.");
      }
      headers[header.slice(0, separator).trim()] = header.slice(separator + 1).trim();
    } else if (["-d", "--data", "--data-raw", "--data-binary"].includes(token)) {
      body = tokens[++index] ?? "";
      if (method === "GET") method = "POST";
    } else if (token === "-u" || token === "--user") {
      const credentials = tokens[++index] ?? "";
      headers.Authorization = `Basic ${encodeBase64(credentials)}`;
    } else if (!token.startsWith("-") && !url) url = token;
  }
  try {
    url = new URL(url).toString();
  } catch {
    throw new ToolError("invalid-url", "cURL command needs an absolute http or https URL.");
  }
  if (!/^https?:/i.test(url)) throw new ToolError("invalid-url", "cURL URL must use http or https.");
  return { url, method: method || "GET", headers, ...(body !== undefined ? { body } : {}) };
}
