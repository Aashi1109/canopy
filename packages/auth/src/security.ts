export function getTrustedOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  return [...new Set(value.split(",").map((origin) => origin.trim()))].map((origin) => {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid trusted origin: ${origin}`);
    }

    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error(`Invalid trusted origin: ${origin}`);
    }

    return parsed.origin;
  });
}

export function safeReturnTo(
  value: string | null | undefined,
  trustedOrigins: readonly string[],
  fallback = "/",
): string {
  if (!value) return fallback;

  if (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/%2f|%5c/i.test(value)
  ) {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (!parsed.username && !parsed.password && trustedOrigins.includes(parsed.origin)) {
      return parsed.toString();
    }
  } catch {
    // Invalid and non-absolute values fall through to the safe default.
  }

  return fallback;
}

export function normalizeAccountName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Account name is required.");
  const name = value.trim();
  if (!name || name.length > 100) {
    throw new Error("Account name must be between 1 and 100 characters.");
  }
  return name;
}

const MAX_PROFILE_IMAGE_DATA_URL_LENGTH = 200_000;
const PROFILE_IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

function hasImageSignature(mime: string, payload: string): boolean {
  let header: string;
  try {
    header = atob(payload.slice(0, 32));
  } catch {
    return false;
  }

  if (mime === "image/jpeg") return header.startsWith("\xff\xd8\xff");
  if (mime === "image/png") return header.startsWith("\x89PNG\r\n\x1a\n");
  return header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
}

export function normalizeProfileImage(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new Error("Profile image is invalid.");
  }

  const normalized = value.trim();
  if (normalized.startsWith("data:")) {
    if (normalized.length > MAX_PROFILE_IMAGE_DATA_URL_LENGTH) {
      throw new Error("Profile image is invalid.");
    }
    const match = PROFILE_IMAGE_DATA_URL.exec(normalized);
    if (!match || match[2].length % 4 !== 0 || !hasImageSignature(match[1], match[2])) {
      throw new Error("Profile image is invalid.");
    }
    return normalized;
  }

  if (normalized.length > 2_048) {
    throw new Error("Profile image is invalid.");
  }
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("Profile image is invalid.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Profile image is invalid.");
  }
  return parsed.toString();
}
