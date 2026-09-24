import { expect, test } from "vitest";
import { getTrustedOrigins, normalizeAccountName, normalizeProfileImage, safeReturnTo } from "../lib/auth/security.ts";

const trustedOrigins = ["https://smarttools.example.com", "https://admin.smarttools.example.com"];

test("trusted origins accept only explicit HTTP origins", () => {
  expect(
    getTrustedOrigins(
      "https://smarttools.example.com, https://admin.smarttools.example.com,https://smarttools.example.com",
    ),
  ).toEqual(trustedOrigins);

  for (const invalid of [
    "*.smarttools.example.com",
    "javascript:alert(1)",
    "https://smarttools.example.com/path",
    "https://user@canopy.example.com",
    "https://smarttools.example.com#fragment",
  ]) {
    expect(() => getTrustedOrigins(invalid)).toThrow(/trusted origin/i);
  }
});

test("return URLs allow local paths and exact trusted origins only", () => {
  expect(safeReturnTo("/profile?tab=sessions", trustedOrigins)).toBe("/profile?tab=sessions");
  expect(safeReturnTo("/auth/profile?returnTo=%2Fadmin", trustedOrigins)).toBe("/auth/profile?returnTo=%2Fadmin");
  expect(safeReturnTo("https://admin.smarttools.example.com/tools?updated=1", trustedOrigins)).toBe(
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
    expect(safeReturnTo(invalid, trustedOrigins), invalid).toBe("/");
  }
});

test("server account fields reject unsafe or oversized profile input", () => {
  expect(normalizeAccountName("  Ada Lovelace  ")).toBe("Ada Lovelace");
  expect(() => normalizeAccountName(" ")).toThrow(/name/i);
  expect(() => normalizeAccountName("a".repeat(101))).toThrow(/name/i);

  expect(normalizeProfileImage("")).toBe(null);
  expect(normalizeProfileImage(" https://images.example/avatar.png ")).toBe("https://images.example/avatar.png");
  const embeddedWebp = "data:image/webp;base64,UklGRnh4eHhXRUJQ";
  expect(normalizeProfileImage(embeddedWebp)).toBe(embeddedWebp);
  expect(() => normalizeProfileImage("data:image/svg+xml;base64,PHN2Zz4=")).toThrow(/image/i);
  expect(() => normalizeProfileImage("data:image/webp;base64,ZmFrZQ==")).toThrow(/image/i);
  expect(() => normalizeProfileImage(`data:image/webp;base64,${"A".repeat(200_001)}`)).toThrow(/image/i);
  expect(() => normalizeProfileImage("javascript:alert(1)")).toThrow(/image/i);
  expect(() => normalizeProfileImage("https://user:pass@images.example/avatar.png")).toThrow(/image/i);
});
