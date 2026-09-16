import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_AUTH_ERROR,
  canConfirmAccountDeletion,
  getSafeAuthError,
  isEmailVerificationError,
  isValidPassword,
  normalizeProfileImage,
  resolveReturnTo,
  shouldUseBrowserBack,
} from "../app/auth/_lib/security.ts";

const redirectPolicy = {
  baseURL: "https://smarttools.test",
  fallback: "/",
};

test("profile keeps the auth theme and returns through the validated origin", async () => {
  const [page, backLink] = await Promise.all([
    readFile(new URL("../app/auth/profile/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/profile/components/ProfileBackLink.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /resolveConfiguredReturnTo\(first\(params\.returnTo\)\)/);
  assert.match(page, /<main className=["']auth-shell /);
  assert.match(page, /<ProfileBackLink fallbackHref=\{returnTo\}/);
  assert.match(backLink, /aria-label=["']Back to previous page["']/);
  assert.match(backLink, /href=\{fallbackHref\}/);
  assert.match(backLink, /shouldUseBrowserBack\(/);
  assert.match(backLink, /event\.preventDefault\(\)/);
  assert.match(backLink, /window\.history\.back\(\)/);
});

test("profile uses browser history only for the validated return origin", () => {
  const fallback = "/admin";
  const current = "https://smarttools.test/auth/profile";

  assert.equal(shouldUseBrowserBack(fallback, current, "https://smarttools.test/admin/audit", 2), true);
  assert.equal(shouldUseBrowserBack(fallback, current, "", 2), false);
  assert.equal(shouldUseBrowserBack(fallback, current, "https://untrusted.example/profile-link", 2), false);
  assert.equal(shouldUseBrowserBack(fallback, current, "https://smarttools.test/admin/audit", 1), false);
  assert.equal(shouldUseBrowserBack(fallback, current, "https://smarttools.test/admin/audit", 2, true), false);
});

test("profile photo uses a native image picker instead of a URL field", async () => {
  const source = await readFile(new URL("../app/auth/profile/ProfileManager.tsx", import.meta.url), "utf8");

  assert.match(source, /accept=["']image\/jpeg,image\/png,image\/webp["']/);
  assert.match(source, /type=["']file["']/);
  assert.doesNotMatch(source, /type=["']url["']/);
});

test("auth return URLs keep navigation inside the unified application", () => {
  assert.equal(resolveReturnTo("/auth/profile", redirectPolicy), "/auth/profile");
  assert.equal(resolveReturnTo("/paperwork/invoice-generator", redirectPolicy), "/paperwork/invoice-generator");
  assert.equal(
    resolveReturnTo("https://smarttools.test/devtools/json-formatter", redirectPolicy),
    "https://smarttools.test/devtools/json-formatter",
  );

  for (const unsafe of [
    "//evil.test",
    "/%2fevil.test",
    "https://smarttools.test.evil.test/",
    "https://user@smarttools.test/",
  ]) {
    assert.equal(resolveReturnTo(unsafe, redirectPolicy), "/");
  }
});

test("auth errors never expose server or provider details", () => {
  const secret = "postgres://admin:password@database.internal";

  assert.equal(getSafeAuthError({ message: secret }), DEFAULT_AUTH_ERROR);
  assert.doesNotMatch(getSafeAuthError({ message: secret }), /postgres|password/);
  assert.equal(getSafeAuthError({ code: "TOO_MANY_REQUESTS" }), "Too many attempts. Try again in a few minutes.");
  assert.equal(isEmailVerificationError({ code: "EMAIL_NOT_VERIFIED" }), true);
});

test("account inputs enforce password, image, and deletion boundaries", () => {
  assert.equal(isValidPassword("a".repeat(11)), false);
  assert.equal(isValidPassword("a".repeat(12)), true);
  assert.equal(isValidPassword("a".repeat(128)), true);
  assert.equal(isValidPassword("a".repeat(129)), false);

  assert.equal(normalizeProfileImage(""), null);
  assert.equal(normalizeProfileImage(" https://images.example/avatar.png "), "https://images.example/avatar.png");
  assert.throws(() => normalizeProfileImage("javascript:alert(1)"));

  assert.equal(canConfirmAccountDeletion(" Person@Example.com ", "person@example.com"), true);
  assert.equal(canConfirmAccountDeletion("other@example.com", "person@example.com"), false);
});
