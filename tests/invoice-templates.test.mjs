import { expect, test } from "vitest";

import {
  DEFAULT_LABELS,
  DEFAULT_SECTION_ORDER,
  InvoiceTemplateConfigSchema,
  InvoiceTemplateSchema,
  getDefaultTemplateConfigByFamily,
  seedTemplates,
} from "../lib/invoice-templates/index.ts";

const layoutFamilies = ["classic", "modern", "compact", "bold", "minimal", "service"];

test("every layout family produces an independent valid default config", () => {
  const configs = layoutFamilies.map(getDefaultTemplateConfigByFamily);

  for (const config of configs) {
    expect(InvoiceTemplateConfigSchema.safeParse(config).success).toBe(true);
    expect(config.labels).toEqual(DEFAULT_LABELS);
    expect(config.sectionOrder).toEqual(DEFAULT_SECTION_ORDER);
  }

  expect(configs[0].labels).not.toBe(configs[1].labels);
  expect(configs[0].sectionOrder).not.toBe(configs[1].sectionOrder);
});

test("seed templates are valid with unique slugs and one published default", () => {
  for (const template of seedTemplates) {
    expect(InvoiceTemplateSchema.safeParse(template).success, `${template.slug} is invalid`).toBe(true);
  }

  expect(new Set(seedTemplates.map((template) => template.slug)).size).toBe(seedTemplates.length);
  expect(seedTemplates.filter((template) => template.status === "published" && template.isDefault).length).toBe(1);
});

test("validation rejects unsafe colors, duplicate sections, and unusable invoices", () => {
  const template = structuredClone(seedTemplates[0]);

  template.config.theme.primaryColor = "red";
  template.config.sectionOrder.push(template.config.sectionOrder[0]);
  template.config.visibility.showBusinessBlock = false;
  template.config.visibility.showClientBlock = false;
  template.config.visibility.showLineItems = false;
  template.config.visibility.showTotals = false;

  const result = InvoiceTemplateSchema.safeParse(template);

  expect(result.success).toBe(false);
  expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
    "config.theme.primaryColor",
    "config.sectionOrder",
    "config.visibility.showBusinessBlock",
    "config.visibility.showLineItems",
    "config.visibility.showTotals",
  ]);
});
