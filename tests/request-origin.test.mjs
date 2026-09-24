import { expect, onTestFinished, test } from "vitest";
import { isSameOriginRequest } from "../lib/routing/requestOrigin.ts";

function check(url, headers) {
  return isSameOriginRequest(new Request(url, { method: "POST", headers }));
}

test("same-origin validation uses configured public origins behind normalized request URLs", () => {
  const previousAppUrl = process.env.APP_URL;
  onTestFinished(() => {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  });

  for (const appUrl of ["http://localhost:3000", "https://example.com"]) {
    process.env.APP_URL = appUrl;
    const main = new URL(appUrl);
    const admin = new URL(appUrl);
    admin.hostname = `admin.${main.hostname}`;
    for (const publicUrl of [main, admin]) {
      expect(check("http://localhost:3000/api/example", { host: publicUrl.host, origin: publicUrl.origin })).toBe(true);
    }
    for (const origin of [main.origin, "https://foreign.example", "null", `${admin.origin}/`, ""]) {
      expect(check("http://localhost:3000/api/example", { host: admin.host, origin })).toBe(false);
    }
    expect(check("http://localhost:3000/api/example", { host: admin.host })).toBe(false);
  }

  process.env.APP_URL = "http://localhost:3000";
  for (const headers of [
    { host: "admin.localhost:3000", origin: "https://admin.localhost:3000" },
    { host: "admin.localhost:3000", origin: "http://admin.localhost:3001" },
    { host: "admin.localhost:3001", origin: "http://admin.localhost:3001" },
    { host: "unknown.localhost:3000", origin: "http://unknown.localhost:3000" },
    { host: "unknown.localhost:3000", origin: "http://localhost:3000" },
    {
      host: "localhost:3000",
      origin: "http://admin.localhost:3000",
      "x-forwarded-host": "admin.localhost:3000",
    },
    {
      host: "admin.localhost:3000",
      origin: "https://admin.localhost:3000",
      "x-forwarded-proto": "https",
    },
  ]) {
    expect(check("http://localhost:3000/api/example", headers)).toBe(false);
  }

  expect(check("http://localhost:3000/api/example", { origin: "http://localhost:3000" })).toBe(true);
  expect(
    check("https://preview.vercel.app/api/example", {
      host: "preview.vercel.app",
      origin: "https://preview.vercel.app",
    }),
  ).toBe(true);
});
