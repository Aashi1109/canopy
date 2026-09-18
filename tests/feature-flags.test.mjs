import assert from "node:assert/strict";
import test from "node:test";

import { isFeatureEnabled, mergeFeatureOverrides } from "../lib/admin/featureFlags.ts";

const manifest = [
  {
    key: "invoice-reminders",
    app: "paperwork",
    defaultName: "Invoice reminders",
    defaultDescription: "Send invoice due-date reminders.",
  },
  {
    key: "json-schema",
    app: "devtools",
    defaultName: "JSON schema",
    defaultDescription: "Validate JSON against a schema.",
  },
];

test("new feature registrations default disabled", () => {
  assert.deepEqual(mergeFeatureOverrides(manifest), [
    {
      ...manifest[0],
      name: "Invoice reminders",
      description: "Send invoice due-date reminders.",
      enabled: false,
    },
    {
      ...manifest[1],
      name: "JSON schema",
      description: "Validate JSON against a schema.",
      enabled: false,
    },
  ]);
});

test("known overrides merge and unknown keys are ignored", () => {
  const flags = mergeFeatureOverrides(manifest, [
    {
      key: "invoice-reminders",
      app: "paperwork",
      name: "Payment reminders",
      description: "Notify customers before invoices are due.",
      enabled: true,
    },
    {
      key: "unknown",
      app: "paperwork",
      name: "Unknown",
      description: "Unknown",
      enabled: true,
    },
  ]);

  assert.equal(flags.length, 2);
  assert.equal(isFeatureEnabled(flags, "paperwork", "invoice-reminders"), true);
  assert.equal(isFeatureEnabled(flags, "paperwork", "unknown"), false);
  assert.equal(isFeatureEnabled(flags, "devtools", "invoice-reminders"), false);
});
