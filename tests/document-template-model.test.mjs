import { test, expect } from "vitest";
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
  expect(containsFullTin("123-45-6789")).toBe(true);
  expect(containsFullTin({ rows: [{ reference: "12-3456789" }] })).toBe(true);
  expect(containsFullTin("•••• 4821")).toBe(false);
  expect(containsFullTin("https://www.irs.gov/pub/irs-pdf/fw9.pdf")).toBe(false);
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
  expect(DOCUMENT_TYPES).toEqual(expectedDocuments.map(([documentType]) => documentType));
  expect(DOCUMENT_DEFINITIONS.map(({ documentType }) => documentType)).toEqual(DOCUMENT_TYPES);

  for (const [documentType, toolComponentKey, allowedPageFormats, complianceMode] of expectedDocuments) {
    const definition = getDocumentDefinition(documentType);
    const config = createAdvancedTemplateConfig(documentType, definition.defaultPageFormat);
    const fieldKeys = definition.fields.map((field) => field.key);

    expect(definition.documentType).toBe(documentType);
    expect(definition.toolComponentKey).toBe(toolComponentKey);
    expect(definition.allowedPageFormats).toEqual(allowedPageFormats);
    expect(definition.complianceMode).toBe(complianceMode);
    expect(definition.label.length > 2).toBeTruthy();
    expect(new Set(fieldKeys).size).toBe(fieldKeys.length);
    expect(definition.fields.length > 5).toBeTruthy();
    expect(definition.requiredBindings.every((binding) => fieldKeys.includes(binding))).toBeTruthy();
    if (documentType === "quarterly-tax-estimator") {
      expect(fieldKeys.includes("itemizedDeductions")).toBeTruthy();
    }
    expect(
      definition.defaultForm.sections
        .flatMap((section) => section.entries)
        .every((entry) => {
          const field = definition.fields.find(({ key }) => key === entry.key);
          return entry.kind !== "builtin" || field?.source === "user";
        }),
    ).toBeTruthy();

    for (const field of definition.fields) {
      expect(field.key).toBeTruthy();
      expect(field.label).toBeTruthy();
      expect(field.section).toBeTruthy();
      expect(field.valueType).toBeTruthy();
      expect(field.control).toBeTruthy();
      expect(["user", "computed", "system", "reference"].includes(field.source)).toBeTruthy();
      expect(typeof field.required).toBe("boolean");
      expect(typeof field.computationRequired).toBe("boolean");
      expect(typeof field.sampleValue).toBe("string");
      expect(field.allowedBindingTypes.length > 0).toBeTruthy();
      expect(field.sensitiveData).toBeTruthy();
    }

    expect(config.schemaVersion).toBe(2);
    expect(config.form).toEqual(definition.defaultForm);
    expect(AdvancedTemplateConfigSchema.safeParse(config).success).toBe(true);
    expect(config.template.schemas.length > 0).toBeTruthy();
    expect(config.template.schemas.flat().length > 0).toBeTruthy();
    expect(
      definition.requiredBindings.every((binding) =>
        config.template.schemas.flat().some((schema) => schema.name === binding),
      ),
    ).toBeTruthy();
  }
});

test("page formats are registry-driven and reject every cross-family format", () => {
  for (const documentType of DOCUMENT_TYPES) {
    const definition = getDocumentDefinition(documentType);
    for (const pageFormat of ["A4", "LETTER", "RECEIPT_80MM", "RECEIPT_58MM"]) {
      expect(isSupportedPageFormat(documentType, pageFormat)).toBe(definition.allowedPageFormats.includes(pageFormat));
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

    expect(normalized.schemaVersion).toBe(2);
    expect(normalized.form).toEqual(getDocumentDefinition(documentType).defaultForm);
    expect(normalized.sampleData["custom.legacy-note"]).toBe("Keep me");
    expect(normalized.template.schemas[0][0].name).toBe(
      documentType === "invoice" ? "invoiceNumber" : "documentNumber",
    );
  }

  expect(resolveDocumentFieldKey("invoice", "documentNumber")).toBe("invoiceNumber");
  expect(resolveDocumentFieldKey("invoice", "discount")).toBe("discountAmount");
  expect(resolveDocumentFieldKey("invoice", "shipping")).toBe("shippingFee");
  expect(resolveDocumentFieldKey("receipt", "documentNumber")).toBe("receiptNumber");
  expect(resolveDocumentFieldKey("receipt", "discount")).toBe("discountAmount");

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
  expect(parsed.config.schemaVersion).toBe(2);
  expect(parsed.config.form.sections.length > 0).toBeTruthy();

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
  expect(AdvancedDocumentTemplateSchema.safeParse(computedInput).success).toBe(false);
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

  expect(AdvancedTemplateConfigSchema.safeParse(valid).success).toBe(true);

  const duplicateSection = structuredClone(valid);
  duplicateSection.form.sections[1].id = duplicateSection.form.sections[0].id;
  expect(AdvancedTemplateConfigSchema.safeParse(duplicateSection).success).toBe(false);

  const duplicateField = structuredClone(valid);
  duplicateField.form.sections.at(-1).entries[0].key = duplicateField.form.sections[0].entries[0].key;
  expect(AdvancedTemplateConfigSchema.safeParse(duplicateField).success).toBe(false);

  const duplicateColumn = structuredClone(valid);
  duplicateColumn.form.sections.at(-1).entries[1].columns[1].key = "name";
  expect(AdvancedTemplateConfigSchema.safeParse(duplicateColumn).success).toBe(false);

  const nestedRepeater = structuredClone(valid);
  nestedRepeater.form.sections.at(-1).entries[1].columns[0].control = "repeater";
  expect(AdvancedTemplateConfigSchema.safeParse(nestedRepeater).success).toBe(false);
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
  expect(invoiceResult.valid).toBe(false);
  expect(invoiceResult.errors.some(({ code }) => code === "incompatible-binding")).toBeTruthy();
  expect(invoiceResult.errors.some(({ code }) => code === "unknown-plugin")).toBeTruthy();
  expect(invoiceResult.warnings.some(({ code }) => code === "unused-field")).toBeTruthy();
  invoice.form.sections.at(-1).entries[0].required = true;
  expect(
    validateAdvancedTemplateForPublish(invoice, "invoice").warnings.some(
      ({ code, path }) => code === "unused-field" && path === "form.custom.unused",
    ),
  ).toBeTruthy();

  const legacyBindings = createAdvancedTemplateConfig("invoice", "A4");
  legacyBindings.template.schemas.flat().find((schema) => schema.name === "invoiceNumber").name = "documentNumber";
  expect(validateAdvancedTemplateForPublish(legacyBindings, "invoice").valid).toBe(true);

  for (const documentType of ["w9-request", "1099-nec-tracker"]) {
    const config = createAdvancedTemplateConfig(documentType, "A4");
    const disclaimer = getDocumentDefinition(documentType).requiredBindings.find((binding) =>
      binding.includes("Disclaimer"),
    );
    config.template.schemas = config.template.schemas.map((page) =>
      page.filter((schema) => schema.name !== disclaimer),
    );

    const result = validateAdvancedTemplateForPublish(config, documentType);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(({ code, path }) => code === "missing-binding" && path.includes(disclaimer)),
    ).toBeTruthy();
  }

  const unsafeW9 = createAdvancedTemplateConfig("w9-request", "A4");
  unsafeW9.sampleData.contractorTin = "123-45-6789";
  expect(
    validateAdvancedTemplateForPublish(unsafeW9, "w9-request").errors.some(({ code }) => code === "forbidden-tax-data"),
  ).toBeTruthy();
  const disguisedW9 = createAdvancedTemplateConfig("w9-request", "A4");
  disguisedW9.sampleData["custom.reference"] = "123-45-6789";
  expect(
    validateAdvancedTemplateForPublish(disguisedW9, "w9-request").errors.some(
      ({ code }) => code === "forbidden-tax-data",
    ),
  ).toBeTruthy();

  const unsafe1099 = createAdvancedTemplateConfig("1099-nec-tracker", "A4");
  unsafe1099.sampleData.recipientEin = "12-3456789";
  expect(
    validateAdvancedTemplateForPublish(unsafe1099, "1099-nec-tracker").errors.some(
      ({ code }) => code === "forbidden-tax-data",
    ),
  ).toBeTruthy();
  const copyA1099 = createAdvancedTemplateConfig("1099-nec-tracker", "A4");
  copyA1099.sampleData["custom.heading"] = "Fileable Form 1099 Copy A";
  expect(
    validateAdvancedTemplateForPublish(copyA1099, "1099-nec-tracker").errors.some(
      ({ code }) => code === "fileable-form-claim",
    ),
  ).toBeTruthy();
});

test("publish validation applies every hard limit without accepting partial overflow", () => {
  const pageOverflow = createAdvancedTemplateConfig("invoice", "A4");
  pageOverflow.template.schemas = Array.from({ length: 26 }, () => []);
  const pageResult = validateAdvancedTemplateForPublish(pageOverflow, "invoice");
  expect(pageResult.errors.some(({ code }) => code === "page-limit")).toBeTruthy();
  expect(pageResult.errors.some(({ code }) => code === "missing-binding")).toBeTruthy();

  const elementOverflow = createAdvancedTemplateConfig("invoice", "A4");
  const element = structuredClone(elementOverflow.template.schemas[0][0]);
  elementOverflow.template.schemas = [
    Array.from({ length: 1_001 }, (_, index) => ({
      ...structuredClone(element),
      name: `static-${index}`,
    })),
  ];
  expect(
    validateAdvancedTemplateForPublish(elementOverflow, "invoice").errors.some(({ code }) => code === "element-limit"),
  ).toBeTruthy();

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
  expect(
    validateAdvancedTemplateForPublish(formOverflow, "invoice").errors.some(({ code }) => code === "form-field-limit"),
  ).toBeTruthy();

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
  expect(
    validateAdvancedTemplateForPublish(customOverflow, "invoice").errors.some(
      ({ code }) => code === "custom-field-limit",
    ),
  ).toBeTruthy();

  const sizeOverflow = createAdvancedTemplateConfig("invoice", "A4");
  sizeOverflow.sampleData["custom.large"] = "x".repeat(5 * 1024 * 1024);
  expect(
    validateAdvancedTemplateForPublish(sizeOverflow, "invoice").errors.some(({ code }) => code === "size-limit"),
  ).toBeTruthy();
});
