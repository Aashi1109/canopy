import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_API_JSON_BYTES,
  assertJsonPayloadSize,
  assertRequestContentLength,
  normalizeVendorPayload,
} from "../app/api/paperwork/_lib/input.ts";

test("Paperwork API payloads have a bounded serialized size", () => {
  assert.doesNotThrow(() => assertJsonPayloadSize({ value: "small" }));
  assert.throws(() => assertJsonPayloadSize({ value: "x".repeat(MAX_API_JSON_BYTES) }), /too large/i);
  assert.doesNotThrow(() => assertRequestContentLength(null));
  assert.doesNotThrow(() => assertRequestContentLength("1024"));
  assert.throws(() => assertRequestContentLength(String(MAX_API_JSON_BYTES + 1)), /too large/i);
});

test("vendor payloads validate every record before database writes", () => {
  assert.deepEqual(
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
    [
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
    ],
  );

  for (const vendors of [
    "not-an-array",
    [{ id: "bad/id", legalName: "Name" }],
    [{ id: "vendor", legalName: " " }],
    Array.from({ length: 1_001 }, (_, index) => ({
      id: `vendor_${index}`,
      legalName: "Name",
    })),
  ]) {
    assert.throws(() => normalizeVendorPayload({ vendors }), /vendor/i);
  }
});
