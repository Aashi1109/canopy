import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LABELS,
  DEFAULT_SECTION_ORDER,
  InvoiceTemplateConfigSchema,
  InvoiceTemplateSchema,
  getDefaultTemplateConfigByFamily,
  seedTemplates,
} from "../packages/invoice-templates/src/index.ts";

const layoutFamilies = ["classic", "modern", "compact", "bold", "minimal", "service"];

test("every layout family produces an independent valid default config", () => {
  const configs = layoutFamilies.map(getDefaultTemplateConfigByFamily);

  for (const config of configs) {
    assert.equal(InvoiceTemplateConfigSchema.safeParse(config).success, true);
    assert.deepEqual(config.labels, DEFAULT_LABELS);
    assert.deepEqual(config.sectionOrder, DEFAULT_SECTION_ORDER);
  }

  assert.notStrictEqual(configs[0].labels, configs[1].labels);
  assert.notStrictEqual(configs[0].sectionOrder, configs[1].sectionOrder);
});

test("seed templates are valid with unique slugs and one published default", () => {
  for (const template of seedTemplates) {
    assert.equal(
      InvoiceTemplateSchema.safeParse(template).success,
      true,
      `${template.slug} is invalid`,
    );
  }

  assert.equal(new Set(seedTemplates.map((template) => template.slug)).size, seedTemplates.length);
  assert.equal(
    seedTemplates.filter((template) => template.status === "published" && template.isDefault)
      .length,
    1,
  );
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

  assert.equal(result.success, false);
  assert.deepEqual(
    result.error.issues.map((issue) => issue.path.join(".")),
    [
      "config.theme.primaryColor",
      "config.sectionOrder",
      "config.visibility.showBusinessBlock",
      "config.visibility.showLineItems",
      "config.visibility.showTotals",
    ],
  );
});
