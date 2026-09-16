/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDocumentDefinition, resolveDocumentFieldKey } from "./documentDefinitions.ts";
import type {
  AdvancedTemplateConfig,
  AdvancedTemplateValidationIssue,
  AdvancedTemplateValidationResult,
  DocumentFieldDefinition,
  DocumentType,
  LegacyAdvancedTemplateConfig,
  PdfmeBindingType,
  PdfmeSchema,
  TemplateFormEntry,
} from "./templateTypes.ts";

export const ADVANCED_TEMPLATE_LIMITS = {
  maxBytes: 5_000_000,
  maxPages: 25,
  maxCanvasElements: 1_000,
  maxFormFields: 200,
  maxCustomFields: 50,
  maxRepeaterRows: 500,
} as const;

const KNOWN_PDFME_PLUGIN_TYPES = new Set([
  "text",
  "multiVariableText",
  "list",
  "image",
  "signature",
  "svg",
  "line",
  "rectangle",
  "ellipse",
  "table",
  "dateTime",
  "date",
  "time",
  "select",
  "radioGroup",
  "checkbox",
  "circleMark",
  "qrcode",
  "japanpost",
  "code128",
  "code39",
  "ean13",
  "ean8",
  "upca",
  "upce",
  "nw7",
  "itf14",
  "gs1datamatrix",
  "pdf417",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function containsFullTin(value: unknown): boolean {
  if (typeof value === "string") {
    return /(?:^|\D)(?:\d{3}[- ]\d{2}[- ]\d{4}|\d{2}[- ]\d{7}|\d{9})(?:\D|$)/.test(value);
  }
  if (Array.isArray(value)) return value.some(containsFullTin);
  return isRecord(value) && Object.values(value).some(containsFullTin);
}

export function normalizeAdvancedTemplateConfig(
  config: AdvancedTemplateConfig | LegacyAdvancedTemplateConfig | unknown,
  documentType: DocumentType,
): AdvancedTemplateConfig {
  if (!isRecord(config)) {
    throw new TypeError("Advanced template config must be an object.");
  }
  if (config.schemaVersion === 2 && isRecord(config.form)) {
    return structuredClone(config) as unknown as AdvancedTemplateConfig;
  }
  if (
    config.schemaVersion !== undefined ||
    (documentType !== "invoice" && documentType !== "receipt")
  ) {
    throw new TypeError(`Only legacy invoice and receipt configs can omit schemaVersion 2.`);
  }

  return {
    ...(structuredClone(config) as unknown as LegacyAdvancedTemplateConfig),
    schemaVersion: 2,
    form: structuredClone(getDocumentDefinition(documentType).defaultForm),
  };
}

export function inferLegacyDocumentType(config: unknown): "invoice" | "receipt" | undefined {
  if (!isRecord(config)) return undefined;
  return config.pageFormat === "RECEIPT_80MM" || config.pageFormat === "RECEIPT_58MM"
    ? "receipt"
    : config.pageFormat === "A4" || config.pageFormat === "LETTER"
      ? "invoice"
      : undefined;
}

function issue(code: string, message: string, path: string): AdvancedTemplateValidationIssue {
  return { code, message, path };
}

function bindingType(schema: PdfmeSchema): PdfmeBindingType {
  if (schema.type === "table") return "table";
  if (schema.type === "image" || schema.type === "signature") return "image";
  return "text";
}

function allSchemas(config: AdvancedTemplateConfig): PdfmeSchema[] {
  return [...config.template.schemas.flat(), ...(config.template.basePdf.staticSchema ?? [])];
}

function findField(documentType: DocumentType, key: string): DocumentFieldDefinition | undefined {
  const resolvedKey = resolveDocumentFieldKey(documentType, key);
  return getDocumentDefinition(documentType).fields.find((field) => field.key === resolvedKey);
}

function isCustom(entry: TemplateFormEntry): boolean {
  return entry.kind === "custom" || entry.kind === "repeater";
}

function addFormStructureIssues(
  config: AdvancedTemplateConfig,
  documentType: DocumentType,
  errors: AdvancedTemplateValidationIssue[],
) {
  const sectionIds = new Set<string>();
  const fieldKeys = new Set<string>();
  let formFieldCount = 0;
  let customFieldCount = 0;

  for (const [sectionIndex, section] of config.form.sections.entries()) {
    const sectionPath = `form.sections.${sectionIndex}`;
    if (sectionIds.has(section.id)) {
      errors.push(
        issue(
          "duplicate-section",
          `Section ID "${section.id}" must be unique.`,
          `${sectionPath}.id`,
        ),
      );
    }
    sectionIds.add(section.id);

    for (const [entryIndex, entry] of section.entries.entries()) {
      const entryPath = `${sectionPath}.entries.${entryIndex}`;
      formFieldCount += 1;
      if (fieldKeys.has(entry.key)) {
        errors.push(
          issue("duplicate-field", `Field key "${entry.key}" must be unique.`, `${entryPath}.key`),
        );
      }
      fieldKeys.add(entry.key);

      if (entry.kind === "builtin") {
        const field = findField(documentType, entry.key);
        if (!field || field.source !== "user") {
          errors.push(
            issue(
              field ? "non-editable-field" : "unknown-built-in-field",
              field
                ? `"${entry.key}" is not an editable form field.`
                : `Unknown built-in field "${entry.key}".`,
              `${entryPath}.key`,
            ),
          );
        }
      }

      if (isCustom(entry)) {
        customFieldCount += 1;
        if (!/^custom\.[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.key)) {
          errors.push(
            issue("invalid-custom-key", "Custom keys must use custom.<slug>.", `${entryPath}.key`),
          );
        }
      }

      if (entry.kind === "repeater") {
        const columnKeys = new Set<string>();
        for (const [columnIndex, column] of entry.columns.entries()) {
          if (columnKeys.has(column.key)) {
            errors.push(
              issue(
                "duplicate-column",
                `Column key "${column.key}" must be unique within its repeater.`,
                `${entryPath}.columns.${columnIndex}.key`,
              ),
            );
          }
          columnKeys.add(column.key);
        }
        if ((entry.minRows ?? 0) > ADVANCED_TEMPLATE_LIMITS.maxRepeaterRows) {
          errors.push(
            issue(
              "repeater-row-limit",
              `Repeaters cannot require more than ${ADVANCED_TEMPLATE_LIMITS.maxRepeaterRows} rows.`,
              `${entryPath}.minRows`,
            ),
          );
        }
      }
    }
  }

  if (formFieldCount > ADVANCED_TEMPLATE_LIMITS.maxFormFields) {
    errors.push(
      issue(
        "form-field-limit",
        `Templates are limited to ${ADVANCED_TEMPLATE_LIMITS.maxFormFields} form fields.`,
        "form.sections",
      ),
    );
  }
  if (customFieldCount > ADVANCED_TEMPLATE_LIMITS.maxCustomFields) {
    errors.push(
      issue(
        "custom-field-limit",
        `Templates are limited to ${ADVANCED_TEMPLATE_LIMITS.maxCustomFields} custom fields.`,
        "form.sections",
      ),
    );
  }
}

function addComplianceIssues(
  config: AdvancedTemplateConfig,
  documentType: DocumentType,
  errors: AdvancedTemplateValidationIssue[],
) {
  const keys = [
    ...Object.keys(config.sampleData),
    ...config.form.sections.flatMap((section) => section.entries.map((entry) => entry.key)),
    ...allSchemas(config).map((schema) => schema.name),
  ];
  const containsTaxDataKey = (key: string) =>
    /(?:^|[ ._-])(?:tin|ssn|ein|tax id|tax identification|social security|certification|signature)(?:[ ._-]|$)/i.test(
      key,
    ) || /(?:Tin|TIN|Ssn|SSN|Ein|EIN|Certification|Signature)(?:[A-Z._-]|$)/.test(key);
  const labels = config.form.sections.flatMap((section) =>
    section.entries.flatMap((entry) => [
      entry.label,
      entry.helpText ?? "",
      ...(entry.kind === "repeater" ? entry.columns.map((column) => column.label) : []),
    ]),
  );
  const fullTinSample = Object.entries(config.sampleData).find(([, value]) =>
    containsFullTin(value),
  );

  if ((documentType === "w9-request" || documentType === "1099-nec-tracker") && fullTinSample) {
    errors.push(
      issue(
        "forbidden-tax-data",
        "Full TIN, SSN, and EIN values are not accepted.",
        `sampleData.${fullTinSample[0]}`,
      ),
    );
  }

  if (documentType === "w9-request") {
    const forbidden = keys.find(containsTaxDataKey) ?? labels.find(containsTaxDataKey);
    const signature = allSchemas(config).find((schema) => schema.type === "signature");
    if (forbidden || signature) {
      errors.push(
        issue(
          "forbidden-tax-data",
          "W-9 requests cannot collect TIN, SSN, EIN, certification, or signature data.",
          forbidden ? `field.${forbidden}` : `schema.${signature!.name}`,
        ),
      );
    }
  }

  if (documentType === "1099-nec-tracker") {
    const unmaskedTin = [...keys, ...labels].find(
      (key) => containsTaxDataKey(key) && !/masked/i.test(key),
    );
    if (unmaskedTin) {
      errors.push(
        issue(
          "forbidden-tax-data",
          "1099 trackers can bind only masked TIN references.",
          `field.${unmaskedTin}`,
        ),
      );
    }
    const copyAClaim = [
      ...Object.entries(config.sampleData),
      ...allSchemas(config).flatMap((schema) =>
        typeof schema.content === "string" ? [[schema.name, schema.content] as const] : [],
      ),
    ].find(
      ([key, value]) =>
        key !== "internalReportDisclaimer" && /\b(?:copy a|fileable (?:form )?1099)/i.test(value),
    );
    if (copyAClaim) {
      errors.push(
        issue(
          "fileable-form-claim",
          "1099 trackers cannot present themselves as a fileable Copy A.",
          `content.${copyAClaim[0]}`,
        ),
      );
    }
  }
}

export function validateAdvancedTemplateConfig(
  config: AdvancedTemplateConfig,
  documentType: DocumentType,
  mode: "draft" | "publish" = "draft",
): AdvancedTemplateValidationResult {
  const errors: AdvancedTemplateValidationIssue[] = [];
  const warnings: AdvancedTemplateValidationIssue[] = [];
  const definition = getDocumentDefinition(documentType);

  if (config.schemaVersion !== 2) {
    errors.push(
      issue("schema-version", "Advanced templates must use schemaVersion 2.", "schemaVersion"),
    );
  }
  if (!definition.allowedPageFormats.includes(config.pageFormat)) {
    errors.push(
      issue(
        "page-format",
        `${config.pageFormat} is not supported for ${documentType}.`,
        "pageFormat",
      ),
    );
  }

  let serializedBytes = 0;
  try {
    serializedBytes = new TextEncoder().encode(JSON.stringify(config)).length;
  } catch {
    errors.push(issue("serialization", "Advanced template config must be serializable.", ""));
  }
  if (serializedBytes > ADVANCED_TEMPLATE_LIMITS.maxBytes) {
    errors.push(issue("size-limit", "Advanced template config exceeds the 5 MB limit.", ""));
  }

  const pageCount = config.template.schemas.length;
  if (pageCount > ADVANCED_TEMPLATE_LIMITS.maxPages) {
    errors.push(
      issue(
        "page-limit",
        `Templates are limited to ${ADVANCED_TEMPLATE_LIMITS.maxPages} pages.`,
        "template.schemas",
      ),
    );
  }

  const schemas = allSchemas(config);
  if (schemas.length > ADVANCED_TEMPLATE_LIMITS.maxCanvasElements) {
    errors.push(
      issue(
        "element-limit",
        `Templates are limited to ${ADVANCED_TEMPLATE_LIMITS.maxCanvasElements} canvas elements.`,
        "template.schemas",
      ),
    );
  }

  addFormStructureIssues(config, documentType, errors);
  addComplianceIssues(config, documentType, errors);

  for (const [index, schema] of schemas.entries()) {
    if (!KNOWN_PDFME_PLUGIN_TYPES.has(schema.type)) {
      errors.push(
        issue(
          "unknown-plugin",
          `Unknown pdfme plugin type "${schema.type}".`,
          `template.elements.${index}.type`,
        ),
      );
    }
  }

  if (mode === "publish") {
    if (pageCount === 0 || schemas.length === 0) {
      errors.push(
        issue(
          "empty-template",
          "Published templates need at least one page and printable element.",
          "template.schemas",
        ),
      );
    }

    const boundKeys = new Set(
      schemas.map((schema) => resolveDocumentFieldKey(documentType, schema.name)),
    );
    for (const binding of definition.requiredBindings) {
      if (!boundKeys.has(binding)) {
        errors.push(
          issue(
            "missing-binding",
            `Required binding "${binding}" is not on the canvas.`,
            `requiredBindings.${binding}`,
          ),
        );
      }
    }

    const formEntries = config.form.sections.flatMap((section) => section.entries);
    for (const field of definition.fields) {
      if (field.source !== "user" || (!field.required && !field.computationRequired)) {
        continue;
      }
      const entry = formEntries.find(
        (candidate) => candidate.kind === "builtin" && candidate.key === field.key,
      );
      if (!entry) {
        errors.push(
          issue(
            "core-field-missing",
            `Core field "${field.key}" cannot be removed.`,
            `form.${field.key}`,
          ),
        );
      } else {
        if (!entry.enabled) {
          errors.push(
            issue(
              "core-field-disabled",
              `Core field "${field.key}" cannot be disabled.`,
              `form.${field.key}.enabled`,
            ),
          );
        }
        if (field.required && !entry.required) {
          errors.push(
            issue(
              "core-field-optional",
              `Core field "${field.key}" cannot be optional.`,
              `form.${field.key}.required`,
            ),
          );
        }
      }
    }

    const customEntries = new Map(
      formEntries.filter(isCustom).map((entry) => [entry.key, entry] as const),
    );
    for (const [index, schema] of schemas.entries()) {
      const field = findField(documentType, schema.name);
      const custom = customEntries.get(schema.name);
      const allowed =
        field?.allowedBindingTypes ??
        (custom ? [custom.kind === "repeater" ? "table" : "text"] : undefined);
      if (allowed && !allowed.includes(bindingType(schema))) {
        errors.push(
          issue(
            "incompatible-binding",
            `"${schema.name}" cannot bind to a ${schema.type} element.`,
            `template.elements.${index}`,
          ),
        );
      }
    }

    for (const entry of formEntries) {
      if (!entry.enabled || boundKeys.has(entry.key)) continue;
      const field = entry.kind === "builtin" ? findField(documentType, entry.key) : undefined;
      if (entry.kind !== "builtin" || (!entry.required && !field?.computationRequired)) {
        warnings.push(
          issue(
            "unused-field",
            `Optional field "${entry.key}" is not used on the canvas.`,
            `form.${entry.key}`,
          ),
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateAdvancedTemplateForPublish(
  config: AdvancedTemplateConfig,
  documentType: DocumentType,
): AdvancedTemplateValidationResult {
  return validateAdvancedTemplateConfig(config, documentType, "publish");
}
