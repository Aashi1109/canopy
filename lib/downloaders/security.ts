import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { DownloadError, type DownloadOwner } from "./contracts";

const GUEST_COOKIE = "__Host-canopy-downloader";
const GUEST_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

function requireSecret(secret: string): void {
  if (secret.length < 32)
    throw new DownloadError("DOWNLOADS_UNAVAILABLE", "Downloads are temporarily unavailable.", 503, true);
}
export function signCapability(payload: Record<string, unknown>, secret: string): string {
  requireSecret(secret);
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}
export function verifyCapability(
  token: string,
  secrets: readonly string[],
  now = Math.floor(Date.now() / 1000),
): Record<string, unknown> | null {
  if (token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [encoded, signature] = token.split(".");
  const actual = Buffer.from(signature, "base64url");
  const decoded = Buffer.from(encoded, "base64url");
  // Reject alternate encodings that change only unused base64url padding bits.
  if (actual.toString("base64url") !== signature || decoded.toString("base64url") !== encoded) return null;
  const valid = secrets.some(
    (secret) => secret.length >= 32 && timingSafeEqual(actual, createHmac("sha256", secret).update(encoded).digest()),
  );
  if (!valid) return null;
  try {
    const payload: unknown = JSON.parse(decoded.toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const value = payload as Record<string, unknown>;
    return Number.isSafeInteger(value.expiresAt) && Number(value.expiresAt) > now ? value : null;
  } catch {
    return null;
  }
}
export function createGuestCookie(secret: string, now = Math.floor(Date.now() / 1000)): string {
  const token = signCapability(
    { purpose: "download-guest", id: crypto.randomUUID(), expiresAt: now + GUEST_LIFETIME_SECONDS },
    secret,
  );
  return `${GUEST_COOKIE}=${token}; Path=/; Max-Age=${GUEST_LIFETIME_SECONDS}; Secure; HttpOnly; SameSite=Lax`;
}
export function readGuestOwner(headers: Headers, secrets: readonly string[], now?: number): DownloadOwner | null {
  const values = (headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${GUEST_COOKIE}=`));
  if (values.length !== 1) return null;
  const payload = verifyCapability(values[0].slice(GUEST_COOKIE.length + 1), secrets, now);
  if (payload?.purpose !== "download-guest" || typeof payload.id !== "string" || !/^[0-9a-f-]{36}$/.test(payload.id))
    return null;
  return { kind: "guest", id: payload.id };
}
export function privateIdentityHash(value: string, secret: string): string {
  requireSecret(secret);
  return createHmac("sha256", secret).update(value).digest("hex");
}
export async function readDownloadJson(request: Request, maxBytes = 8192): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new DownloadError("INVALID_CONTENT_TYPE", "Send a JSON request.", 415);
  }
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new DownloadError("REQUEST_TOO_LARGE", "The request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DownloadError("INVALID_REQUEST", "Provide a JSON request.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new DownloadError("REQUEST_TOO_LARGE", "The request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new DownloadError("INVALID_REQUEST", "Provide a valid JSON request.");
  }
}

export function downloadErrorResponse(error: unknown): Response {
  const failure =
    error instanceof DownloadError
      ? error
      : error instanceof z.ZodError
        ? new DownloadError("INVALID_REQUEST", "Check the download request and try again.")
        : new DownloadError(
            "DOWNLOADS_UNAVAILABLE",
            "Downloads are temporarily unavailable. Try again later.",
            503,
            true,
          );
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  if (failure.status === 429 || (failure.status === 503 && failure.retryable))
    headers.set("Retry-After", failure.code === "RATE_LIMITED" ? "60" : "30");
  return Response.json(
    { error: { code: failure.code, message: failure.message, retryable: failure.retryable } },
    { status: failure.status, headers },
  );
}
