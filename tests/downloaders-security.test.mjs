import { expect, test } from "vitest";
import { createHmac } from "node:crypto";
import {
  signCapability,
  verifyCapability,
  readGuestOwner,
  createGuestCookie,
  readDownloadJson,
} from "../lib/downloaders/security.ts";
const secret = "s".repeat(48);
const base64url = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
test("capabilities reject tampering, expiry and the wrong signing key", () => {
  const value = { jobId: "job", operation: "status", expiresAt: 200 };
  const token = signCapability(value, secret);
  expect(verifyCapability(token, [secret], 199)).toEqual(value);
  for (const [input, keys, time] of [
    [token, [secret], 200],
    [token, ["x".repeat(48)], 199],
    [token + "a", [secret], 199],
    ["x.y.z", [secret], 199],
  ]) {
    expect(verifyCapability(input, keys, time)).toBeNull();
  }
});
test("alternate base64url padding bits cannot alias a valid capability or guest signature", () => {
  for (const payload of [
    { jobId: "job", operation: "status", expiresAt: 200 },
    { purpose: "download-guest", id: "00000000-0000-4000-8000-000000000001", expiresAt: 200 },
  ]) {
    const token = signCapability(payload, secret);
    const [encoded, signature] = token.split(".");
    expect(verifyCapability(token, [secret], 199)).toEqual(payload);
    for (const paddingBits of [1, 2, 3]) {
      const alias = signature.slice(0, -1) + base64url[base64url.indexOf(signature.at(-1)) | paddingBits];
      expect(alias).not.toBe(signature);
      expect(Buffer.from(alias, "base64url")).toEqual(Buffer.from(signature, "base64url"));
      const aliasedToken = `${encoded}.${alias}`;
      expect(verifyCapability(aliasedToken, [secret], 199)).toBeNull();
      expect(
        readGuestOwner(new Headers({ cookie: `__Host-canopy-downloader=${aliasedToken}` }), [secret], 199),
      ).toBeNull();
    }
  }
});
test("capability payload encoding is canonical even if an alternate representation has a matching HMAC", () => {
  const encoded = Buffer.from('{"expiresAt":200}').toString("base64url");
  const alias = encoded.slice(0, -1) + base64url[base64url.indexOf(encoded.at(-1)) | 1];
  expect(alias).not.toBe(encoded);
  expect(Buffer.from(alias, "base64url")).toEqual(Buffer.from(encoded, "base64url"));
  const signature = createHmac("sha256", secret).update(alias).digest("base64url");
  expect(verifyCapability(`${alias}.${signature}`, [secret], 199)).toBeNull();
});
test("guest identity supports secret rotation but not a changed owner or duplicate cookies", () => {
  const cookie = createGuestCookie(secret, 100);
  const headers = new Headers({ cookie: cookie.split(";")[0] });
  const owner = readGuestOwner(headers, ["new".repeat(16), secret], 101);
  expect(owner.kind).toBe("guest");
  expect(
    readGuestOwner(new Headers({ cookie: `${headers.get("cookie")}; ${headers.get("cookie")}` }), [secret], 101),
  ).toBeNull();
  expect(cookie).toContain("Secure; HttpOnly; SameSite=Lax");
});
test("JSON reading bounds real bytes even with no declared content length", async () => {
  const request = (body) =>
    new Request("https://app.test/api", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  expect(await readDownloadJson(request('{"a":1}'))).toEqual({ a: 1 });
  await expect(readDownloadJson(request(" ".repeat(9000)))).rejects.toMatchObject({ status: 413 });
  await expect(readDownloadJson(request("{"))).rejects.toMatchObject({ status: 400 });
});
