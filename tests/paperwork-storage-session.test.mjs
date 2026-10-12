vi.mock("@/lib/auth/session.ts", () => ({ getSession: async () => null }));
import { expect, test, vi } from "vitest";
import {
  getPaperworkSession,
  assertSameOriginWrite,
  applyPaperworkSession,
} from "../app/api/paperwork/_lib/session.ts";

test("anonymous ownership ignores caller IDs and isolates sessions", () => {
  const request = new Request("https://app.example/api/paperwork/vendors", {
    headers: { "x-user-id": "default_user" },
  });
  const first = getPaperworkSession(request);
  const second = getPaperworkSession(request);
  expect(first.userId).not.toBe(second.userId);
  expect(first.userId).not.toBe("default_user");
  const resumed = getPaperworkSession(
    new Request(request.url, { headers: { cookie: `paperwork_session=${first.token}`, "x-user-id": second.userId } }),
  );
  expect(resumed.userId).toBe(first.userId);
  expect(resumed.isNew).toBe(false);
  expect(
    getPaperworkSession(new Request(request.url, { headers: { cookie: "paperwork_session=default_user" } })).userId,
  ).not.toBe("default_user");
  const response = applyPaperworkSession(Response.json({}), first, request);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

test("writes reject cross-origin and missing-origin requests", () => {
  for (const origin of ["https://evil.example", null]) {
    expect(() =>
      assertSameOriginWrite(
        new Request("https://app.example/api/paperwork/storage", { method: "POST", headers: origin ? { origin } : {} }),
      ),
    ).toThrow(/origin/i);
  }
  expect(() =>
    assertSameOriginWrite(
      new Request("https://app.example/api/paperwork/storage", {
        method: "POST",
        headers: { origin: "https://app.example" },
      }),
    ),
  ).not.toThrow();
});
