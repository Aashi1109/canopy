// WebCrypto access, secure randomness, and digests.
// Verbatim extraction from lib/devtools/format-json.ts (region 4).

import { ToolError } from "../../tool-framework/run.ts";
import { bytesToHex } from "./encoding.ts";

export function getCrypto(): Crypto {
  if (!globalThis.crypto) {
    throw new ToolError("crypto-unavailable", "Secure browser cryptography is unavailable.");
  }
  return globalThis.crypto;
}

export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x1_0000_0000) {
    throw new ToolError("invalid-random-range", "Random range is too large.");
  }
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  const values = new Uint32Array(1);
  do getCrypto().getRandomValues(values);
  while (values[0] >= limit);
  return values[0] % maxExclusive;
}

export function randomString(length: number, alphabet: string): string {
  if (!alphabet) throw new ToolError("missing-character-group", "Choose at least one character group.");
  return Array.from({ length }, () => alphabet[secureRandomInt(alphabet.length)]).join("");
}

export async function digestText(value: string, algorithm: "SHA-1" | "SHA-256" | "SHA-512"): Promise<string> {
  const digest = await getCrypto().subtle.digest(algorithm, new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}
