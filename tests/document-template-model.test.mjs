import assert from "node:assert/strict";
import test from "node:test";

import {
  AdvancedDocumentTemplateSchema,
  AdvancedTemplateConfigSchema,
  DOCUMENT_DEFINITIONS,
  DOCUMENT_TYPES,
  containsFullTin,
  createAdvancedTemplateConfig,
  getDocumentDefinition,
  isSupportedPageFormat,
  normalizeAdvancedTemplateConfig,
  resolveDocumentFieldKey,
  validateAdvancedTemplateForPublish,
} from "../lib/invoice-templates/index.ts";

test("full TINs are rejected while masked references remain safe", () => {
  assert.equal(containsFullTin("123-45-6789"), true);
  assert.equal(containsFullTin({ rows: [{ reference: "12-3456789" }] }), true);
  assert.equal(containsFullTin("•••• 4821"), false);
  assert.equal(containsFullTin("https://www.irs.gov/pub/irs-pdf/fw9.pdf"), false);
});

const expectedDocuments = [
  ["invoice", "invoice-generator", ["A4", "LETTER"], "normal"],
  ["receipt", "receipt-generator", ["RECEIPT_80MM", "RECEIPT_58MM"], "normal"],
  ["expense-report", "expense-report", ["A4", "LETTER"], "normal"],
  ["mileage-log", "mileage-log", ["A4", "LETTER"], "internal-tax-report"],
  ["quarterly-tax-estimator", "quarterly-tax-estimator", ["A4", "LETTER"], "internal-tax-report"],
  ["w9-request", "w9-request", ["A4", "LETTER"], "tax-request"],
  ["1099-nec-tracker", "1099-nec-tracker", ["A4", "LETTER"], "internal-tax-report"],
];

test("the document registry defines valid defaults and starters for all seven kinds", () => {
  assert.deepEqual(
    DOCUMENT_TYPES,
    expectedDocuments.map(([documentType]) => documentType),
  );
  assert.deepEqual(
    DOCUMENT_DEFINITIONS.map(({ documentType }) => documentType),
    DOCUMENT_TYPES,
  );

  for (const [documentType, toolComponentKey, allowedPageFormats, complianceMode] of expectedDocuments) {
    const definition = getDocumentDefinition(documentType);
    const config = createAdvancedTemplateConfig(documentType, definition.defaultPageFormat);
    const fieldKeys = definition.fields.map((field) => field.key);

    assert.equal(definition.documentType, documentType);
    assert.equal(definition.toolComponentKey, toolComponentKey);
    assert.deepEqual(definition.allowedPageFormats, allowedPageFormats);
    assert.equal(definition.complianceMode, complianceMode);
    assert.ok(definition.label.length > 2);
    assert.equal(new Set(fieldKeys).size, fieldKeys.length);
    assert.ok(definition.fields.length > 5);
    assert.ok(definition.requiredBindings.every((binding) => fieldKeys.includes(binding)));
    if (documentType === "quarterly-tax-estimator") {
      assert.ok(fieldKeys.includes("itemizedDeductions"));
    }
    assert.ok(
      definition.defaultForm.sections
        .flatMap((section) => section.entries)
        .every((entry) => {
          const field = definition.fields.find(({ key }) => key === entry.key);
          return entry.kind !== "builtin" || field?.source === "user";
        }),
    );

    for (const field of definition.fields) {
      assert.ok(field.key);
      assert.ok(field.label);
      assert.ok(field.section);
      assert.ok(field.valueType);
      assert.ok(field.control);
      assert.ok(["user", "computed", "system", "reference"].includes(field.source));
      assert.equal(typeof field.required, "boolean");
      assert.equal(typeof field.computationRequired, "boolean");
      assert.equal(typeof field.sampleValue, "string");
      assert.ok(field.allowedBindingTypes.length > 0);
      assert.ok(field.sensitiveData);
    }

    assert.equal(config.schemaVersion, 2);
    assert.deepEqual(config.form, definition.defaultForm);
    assert.equal(AdvancedTemplateConfigSchema.safeParse(config).success, true);
    assert.ok(config.template.schemas.length > 0);
    assert.ok(config.template.schemas.flat().length > 0);
    assert.ok(
      definition.requiredBindings.every((binding) =>
        config.template.schemas.flat().some((schema) => schema.name === binding),
      ),
    );
  }
});

test("page formats are registry-driven and reject every cross-family format", () => {
  for (const documentType of DOCUMENT_TYPES) {
    const definition = getDocumentDefinition(documentType);
    for (const pageFormat of ["A4", "LETTER", "RECEIPT_80MM", "RECEIPT_58MM"]) {
      assert.equal(isSupportedPageFormat(documentType, pageFormat), definition.allowedPageFormats.includes(pageFormat));
    }
  }
});

test("legacy invoice and receipt configs normalize in memory without losing samples or aliases", () => {
  for (const [documentType, pageFormat] of [
    ["invoice", "A4"],
    ["receipt", "RECEIPT_80MM"],
  ]) {
    const legacy = structuredClone(createAdvancedTemplateConfig(documentType, pageFormat));
    delete legacy.schemaVersion;
    delete legacy.form;
    legacy.sampleData["custom.legacy-note"] = "Keep me";
    legacy.template.schemas[0][0].name = documentType === "invoice" ? "invoiceNumber" : "documentNumber";

    const normalized = normalizeAdvancedTemplateConfig(legacy, documentType);

    assert.equal(normalized.schemaVersion, 2);
    assert.deepEqual(normalized.form, getDocumentDefinition(documentType).defaultForm);
    assert.equal(normalized.sampleData["custom.legacy-note"], "Keep me");
    assert.equal(
      normalized.template.schemas[0][0].name,
      documentType === "invoice" ? "invoiceNumber" : "documentNumber",
    );
  }

  assert.equal(resolveDocumentFieldKey("invoice", "documentNumber"), "invoiceNumber");
  assert.equal(resolveDocumentFieldKey("invoice", "discount"), "discountAmount");
  assert.equal(resolveDocumentFieldKey("invoice", "shipping"), "shippingFee");
  assert.equal(resolveDocumentFieldKey("receipt", "documentNumber"), "receiptNumber");
  assert.equal(resolveDocumentFieldKey("receipt", "discount"), "discountAmount");

  const legacyTemplate = {
    id: "legacy-invoice",
    name: "Legacy invoice",
    slug: "legacy-invoice",
    description: "",
    category: "simple",
    status: "draft",
    isDefault: false,
    version: 1,
    documentType: "invoice",
    layoutFamily: "advanced",
    config: createAdvancedTemplateConfig("invoice", "A4"),
  };
  delete legacyTemplate.config.schemaVersion;
  delete legacyTemplate.config.form;

  const parsed = AdvancedDocumentTemplateSchema.parse(legacyTemplate);
  assert.equal(parsed.config.schemaVersion, 2);
  assert.ok(parsed.config.form.sections.length > 0);

  const computedInput = {
    ...legacyTemplate,
    id: "computed-input",
    slug: "computed-input",
    documentType: "expense-report",
    config: createAdvancedTemplateConfig("expense-report", "A4"),
  };
  computedInput.config.form.sections[0].entries.push({
    kind: "builtin",
    key: "reportTotal",
    label: "Editable total",
    required: false,
    enabled: true,
  });
  assert.equal(AdvancedDocumentTemplateSchema.safeParse(computedInput).success, false);
});

test("schema validation accepts custom scalar and repeater fields and rejects malformed structure", () => {
  const valid = createAdvancedTemplateConfig("expense-report", "A4");
  valid.form.sections.push({
    id: "custom-details",
    label: "Custom details",
    entries: [
      {
        kind: "custom",
        key: "custom.cost-center",
        label: "Cost center",
        control: "text",
        required: false,
        enabled: true,
      },
      {
        kind: "repeater",
        key: "custom.attendees",
        label: "Attendees",
        required: false,
        enabled: true,
        minRows: 0,
        columns: [
          {
            key: "name",
            label: "Name",
            control: "text",
            required: true,
          },
          {
            key: "email",
            label: "Email",
            control: "email",
            required: false,
          },
        ],
      },
    ],
  });
  valid.sampleData["custom.cost-center"] = "CC-042";
  valid.sampleData["custom.attendees"] = JSON.stringify([
    { id: "attendee-1", name: "Avery Morgan", email: "avery@example.com" },
  ]);

  assert.equal(AdvancedTemplateConfigSchema.safeParse(valid).success, true);

  const duplicateSection = structuredClone(valid);
  duplicateSection.form.sections[1].id = duplicateSection.form.sections[0].id;
  assert.equal(AdvancedTemplateConfigSchema.safeParse(duplicateSection).success, false);

  const duplicateField = structuredClone(valid);
  duplicateField.form.sections.at(-1).entries[0].key = duplicateField.form.sections[0].entries[0].key;
  assert.equal(AdvancedTemplateConfigSchema.safeParse(duplicateField).success, false);

  const duplicateColumn = structuredClone(valid);
  duplicateColumn.form.sections.at(-1).entries[1].columns[1].key = "name";
  assert.equal(AdvancedTemplateConfigSchema.safeParse(duplicateColumn).success, false);

  const nestedRepeater = structuredClone(valid);
  nestedRepeater.form.sections.at(-1).entries[1].columns[0].control = "repeater";
  assert.equal(AdvancedTemplateConfigSchema.safeParse(nestedRepeater).success, false);
});

test("publish validation enforces bindings, plugin compatibility, compliance, and warnings", () => {
  const invoice = createAdvancedTemplateConfig("invoice", "A4");
  const lineItems = invoice.template.schemas.flat().find((schema) => schema.name === "lineItems");
  lineItems.type = "text";
  invoice.template.schemas[0].push({
    name: "rogue",
    type: "barcode",
    position: { x: 10, y: 250 },
    width: 20,
    height: 10,
  });
  invoice.form.sections.push({
    id: "extra",
    label: "Extra",
    entries: [
      {
        kind: "custom",
        key: "custom.unused",
        label: "Unused",
        control: "text",
        required: false,
        enabled: true,
      },
    ],
  });

  const invoiceResult = validateAdvancedTemplateForPublish(invoice, "invoice");
  assert.equal(invoiceResult.valid, false);
  assert.ok(invoiceResult.errors.some(({ code }) => code === "incompatible-binding"));
  assert.ok(invoiceResult.errors.some(({ code }) => code === "unknown-plugin"));
  assert.ok(invoiceResult.warnings.some(({ code }) => code === "unused-field"));
  invoice.form.sections.at(-1).entries[0].required = true;
  assert.ok(
    validateAdvancedTemplateForPublish(invoice, "invoice").warnings.some(
      ({ code, path }) => code === "unused-field" && path === "form.custom.unused",
    ),
  );

  const legacyBindings = createAdvancedTemplateConfig("invoice", "A4");
  legacyBindings.template.schemas.flat().find((schema) => schema.name === "invoiceNumber").name = "documentNumber";
  assert.equal(validateAdvancedTemplateForPublish(legacyBindings, "invoice").valid, true);

  for (const documentType of ["w9-request", "1099-nec-tracker"]) {
    const config = createAdvancedTemplateConfig(documentType, "A4");
    const disclaimer = getDocumentDefinition(documentType).requiredBindings.find((binding) =>
      binding.includes("Disclaimer"),
    );
    config.template.schemas = config.template.schemas.map((page) =>
      page.filter((schema) => schema.name !== disclaimer),
    );

    const result = validateAdvancedTemplateForPublish(config, documentType);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(({ code, path }) => code === "missing-binding" && path.includes(disclaimer)));
  }

  const unsafeW9 = createAdvancedTemplateConfig("w9-request", "A4");
  unsafeW9.sampleData.contractorTin = "123-45-6789";
  assert.ok(
    validateAdvancedTemplateForPublish(unsafeW9, "w9-request").errors.some(({ code }) => code === "forbidden-tax-data"),
  );
  const disguisedW9 = createAdvancedTemplateConfig("w9-request", "A4");
  disguisedW9.sampleData["custom.reference"] = "123-45-6789";
  assert.ok(
    validateAdvancedTemplateForPublish(disguisedW9, "w9-request").errors.some(
      ({ code }) => code === "forbidden-tax-data",
    ),
  );

  const unsafe1099 = createAdvancedTemplateConfig("1099-nec-tracker", "A4");
  unsafe1099.sampleData.recipientEin = "12-3456789";
  assert.ok(
    validateAdvancedTemplateForPublish(unsafe1099, "1099-nec-tracker").errors.some(
      ({ code }) => code === "forbidden-tax-data",
    ),
  );
  const copyA1099 = createAdvancedTemplateConfig("1099-nec-tracker", "A4");
  copyA1099.sampleData["custom.heading"] = "Fileable Form 1099 Copy A";
  assert.ok(
    validateAdvancedTemplateForPublish(copyA1099, "1099-nec-tracker").errors.some(
      ({ code }) => code === "fileable-form-claim",
    ),
  );
});

test("publish validation applies every hard limit without accepting partial overflow", () => {
  const pageOverflow = createAdvancedTemplateConfig("invoice", "A4");
  pageOverflow.template.schemas = Array.from({ length: 26 }, () => []);
  const pageResult = validateAdvancedTemplateForPublish(pageOverflow, "invoice");
  assert.ok(pageResult.errors.some(({ code }) => code === "page-limit"));
  assert.ok(pageResult.errors.some(({ code }) => code === "missing-binding"));

  const elementOverflow = createAdvancedTemplateConfig("invoice", "A4");
  const element = structuredClone(elementOverflow.template.schemas[0][0]);
  elementOverflow.template.schemas = [
    Array.from({ length: 1_001 }, (_, index) => ({
      ...structuredClone(element),
      name: `static-${index}`,
    })),
  ];
  assert.ok(
    validateAdvancedTemplateForPublish(elementOverflow, "invoice").errors.some(({ code }) => code === "element-limit"),
  );

  const formOverflow = createAdvancedTemplateConfig("invoice", "A4");
  formOverflow.form.sections.push({
    id: "many-fields",
    label: "Many fields",
    entries: Array.from({ length: 201 }, (_, index) => ({
      kind: "builtin",
      key: `optional-${index}`,
      label: `Optional ${index}`,
      required: false,
      enabled: true,
    })),
  });
  assert.ok(
    validateAdvancedTemplateForPublish(formOverflow, "invoice").errors.some(({ code }) => code === "form-field-limit"),
  );

  const customOverflow = createAdvancedTemplateConfig("invoice", "A4");
  customOverflow.form.sections.push({
    id: "custom-fields",
    label: "Custom fields",
    entries: Array.from({ length: 51 }, (_, index) => ({
      kind: "custom",
      key: `custom.field-${index}`,
      label: `Custom ${index}`,
      control: "text",
      required: false,
      enabled: true,
    })),
  });
  assert.ok(
    validateAdvancedTemplateForPublish(customOverflow, "invoice").errors.some(
      ({ code }) => code === "custom-field-limit",
    ),
  );

  const sizeOverflow = createAdvancedTemplateConfig("invoice", "A4");
  sizeOverflow.sampleData["custom.large"] = "x".repeat(5 * 1024 * 1024);
  assert.ok(
    validateAdvancedTemplateForPublish(sizeOverflow, "invoice").errors.some(({ code }) => code === "size-limit"),
  );
});
