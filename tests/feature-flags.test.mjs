import { test, expect } from "vitest";
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
  expect(mergeFeatureOverrides(manifest)).toEqual([
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

  expect(flags.length).toBe(2);
  expect(isFeatureEnabled(flags, "paperwork", "invoice-reminders")).toBe(true);
  expect(isFeatureEnabled(flags, "paperwork", "unknown")).toBe(false);
  expect(isFeatureEnabled(flags, "devtools", "invoice-reminders")).toBe(false);
});
