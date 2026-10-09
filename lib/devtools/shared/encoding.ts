// Base64 and hexadecimal encoding primitives.
// Verbatim extraction from lib/devtools/format-json.ts (region 4).

import { ToolError } from "../../tool-framework/run.ts";

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
  if (!/^[A-Za-z\d+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    throw new ToolError("invalid-base64", "Base64 input is invalid.", undefined, {
      messageRef: { key: "sharedEncoding.base64" },
    });
  }
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw new ToolError("invalid-base64", "Base64 input is invalid.", undefined, {
      messageRef: { key: "sharedEncoding.base64" },
    });
  }
}

export function encodeBase64(value: string, urlSafe = false): string {
  const encoded = bytesToBase64(new TextEncoder().encode(value));
  return urlSafe ? encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : encoded;
}

export function decodeBase64(value: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(base64ToBytes(value));
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError("invalid-base64-text", "Base64 does not contain valid UTF-8 text.", undefined, {
      messageRef: { key: "sharedEncoding.utf8" },
    });
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
