import { getTrustedOrigins, normalizeProfileImage, safeReturnTo } from "@smarttools/auth/security";

export { normalizeProfileImage };

export const DEFAULT_AUTH_ERROR = "Unable to complete that request. Check your details and try again.";

type RedirectPolicy = {
  baseURL: string;
  trustedOrigins?: string;
  fallback?: string;
};

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return;
  return typeof error.code === "string" ? error.code : undefined;
}

export function resolveReturnTo(value: string | null | undefined, policy: RedirectPolicy): string {
  const baseOrigin = new URL(policy.baseURL).origin;
  const trustedOrigins = [baseOrigin, ...getTrustedOrigins(policy.trustedOrigins)];
  const fallback = safeReturnTo(policy.fallback, trustedOrigins, "/");

  return safeReturnTo(value, trustedOrigins, fallback);
}

export function resolveConfiguredReturnTo(value: string | null | undefined): string {
  return resolveReturnTo(value, {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    fallback: "/",
  });
}

export function shouldUseBrowserBack(
  fallbackHref: string,
  currentHref: string,
  referrer: string,
  historyLength: number,
  modified = false,
): boolean {
  if (modified || historyLength <= 1 || !referrer) return false;

  try {
    return new URL(referrer).origin === new URL(fallbackHref, currentHref).origin;
  } catch {
    return false;
  }
}

export function getSafeAuthError(error: unknown): string {
  if (errorCode(error) === "TOO_MANY_REQUESTS") {
    return "Too many attempts. Try again in a few minutes.";
  }
  if (isEmailVerificationError(error)) {
    return "Verify your email before signing in.";
  }
  return DEFAULT_AUTH_ERROR;
}

export function isEmailVerificationError(error: unknown): boolean {
  return errorCode(error) === "EMAIL_NOT_VERIFIED";
}

export function isValidPassword(password: string): boolean {
  return password.length >= 12 && password.length <= 128;
}

export function canConfirmAccountDeletion(confirmation: string, email: string): boolean {
  return confirmation.trim().toLowerCase() === email.trim().toLowerCase();
}
