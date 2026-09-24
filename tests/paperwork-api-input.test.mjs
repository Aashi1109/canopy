import { expect, test } from "vitest";
import {
  MAX_API_JSON_BYTES,
  assertJsonPayloadSize,
  assertRequestContentLength,
  normalizeVendorPayload,
} from "../app/api/paperwork/_lib/input.ts";

test("Paperwork API payloads have a bounded serialized size", () => {
  expect(() => assertJsonPayloadSize({ value: "small" })).not.toThrow();
  expect(() => assertJsonPayloadSize({ value: "x".repeat(MAX_API_JSON_BYTES) })).toThrow(/too large/i);
  expect(() => assertRequestContentLength(null)).not.toThrow();
  expect(() => assertRequestContentLength("1024")).not.toThrow();
  expect(() => assertRequestContentLength(String(MAX_API_JSON_BYTES + 1))).toThrow(/too large/i);
});

test("vendor payloads validate every record before database writes", () => {
  expect(
    normalizeVendorPayload({
      vendors: [
        {
          id: "vendor_1",
          legalName: "  Ada Consulting  ",
          email: "ada@example.test",
          entityType: "LLC",
          w9Status: "Received",
        },
      ],
    }),
  ).toEqual([
    {
      id: "vendor_1",
      legalName: "Ada Consulting",
      businessName: null,
      email: "ada@example.test",
      phone: null,
      addressLine1: null,
      city: null,
      state: null,
      zipCode: null,
      entityType: "LLC",
      w9Status: "Received",
      notes: null,
    },
  ]);

  for (const vendors of [
    "not-an-array",
    [{ id: "bad/id", legalName: "Name" }],
    [{ id: "vendor", legalName: " " }],
    Array.from({ length: 1_001 }, (_, index) => ({
      id: `vendor_${index}`,
      legalName: "Name",
    })),
  ]) {
    expect(() => normalizeVendorPayload({ vendors })).toThrow(/vendor/i);
  }
});
