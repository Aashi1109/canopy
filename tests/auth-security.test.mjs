import assert from "node:assert/strict";
import test from "node:test";

import { getTrustedOrigins, normalizeAccountName, normalizeProfileImage, safeReturnTo } from "../lib/auth/security.ts";

const trustedOrigins = ["https://smarttools.example.com", "https://admin.smarttools.example.com"];

test("trusted origins accept only explicit HTTP origins", () => {
  assert.deepEqual(
    getTrustedOrigins(
      "https://smarttools.example.com, https://admin.smarttools.example.com,https://smarttools.example.com",
    ),
    trustedOrigins,
  );

  for (const invalid of [
    "*.smarttools.example.com",
    "javascript:alert(1)",
    "https://smarttools.example.com/path",
    "https://user@canopy.example.com",
    "https://smarttools.example.com#fragment",
  ]) {
    assert.throws(() => getTrustedOrigins(invalid), /trusted origin/i, invalid);
  }
});

test("return URLs allow local paths and exact trusted origins only", () => {
  assert.equal(safeReturnTo("/profile?tab=sessions", trustedOrigins), "/profile?tab=sessions");
  assert.equal(safeReturnTo("/auth/profile?returnTo=%2Fadmin", trustedOrigins), "/auth/profile?returnTo=%2Fadmin");
  assert.equal(
    safeReturnTo("https://admin.smarttools.example.com/tools?updated=1", trustedOrigins),
    "https://admin.smarttools.example.com/tools?updated=1",
  );

  for (const invalid of [
    "//evil.example.com",
    "/\\evil.example.com",
    "/%2fevil.example.com",
    "/%5cevil.example.com?returnTo=%2Fadmin",
    "https://evil.example.com",
    "https://admin.smarttools.example.com.evil.test",
    "javascript:alert(1)",
    "https://user@admin.smarttools.example.com/tools",
  ]) {
    assert.equal(safeReturnTo(invalid, trustedOrigins), "/", invalid);
  }
});

test("server account fields reject unsafe or oversized profile input", () => {
  assert.equal(normalizeAccountName("  Ada Lovelace  "), "Ada Lovelace");
  assert.throws(() => normalizeAccountName(" "), /name/i);
  assert.throws(() => normalizeAccountName("a".repeat(101)), /name/i);

  assert.equal(normalizeProfileImage(""), null);
  assert.equal(normalizeProfileImage(" https://images.example/avatar.png "), "https://images.example/avatar.png");
  const embeddedWebp = "data:image/webp;base64,UklGRnh4eHhXRUJQ";
  assert.equal(normalizeProfileImage(embeddedWebp), embeddedWebp);
  assert.throws(() => normalizeProfileImage("data:image/svg+xml;base64,PHN2Zz4="), /image/i);
  assert.throws(() => normalizeProfileImage("data:image/webp;base64,ZmFrZQ=="), /image/i);
  assert.throws(() => normalizeProfileImage(`data:image/webp;base64,${"A".repeat(200_001)}`), /image/i);
  assert.throws(() => normalizeProfileImage("javascript:alert(1)"), /image/i);
  assert.throws(() => normalizeProfileImage("https://user:pass@images.example/avatar.png"), /image/i);
});
