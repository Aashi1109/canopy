"use client";

import { WorkbenchPanes } from "@/components/tool-workbench/WorkbenchPanes";

import type {
  AdvancedDocumentTemplate,
  DocumentFieldDefinition,
  DocumentTemplate,
} from "@/lib/invoice-templates/index.ts";
import { containsFullTin, getDocumentDefinition } from "@/lib/invoice-templates/index.ts";
import {
  Caption,
  H3,
  Muted,
  P,
  Button,
  ToolActionButton,
  Card,
  Checkbox,
  CheckboxControl,
  Input,
  Label,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui/index.tsx";
import { OrderableList } from "@/components/ui/components/OrderableList.tsx";
import { GripVertical, Plus, Printer, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentAdapter } from "@/lib/paperwork/documentAdapters";
import {
  AdvancedDocumentPreview,
  downloadAdvancedDocumentPdf,
  openAdvancedDocumentPdf,
} from "./AdvancedDocumentPreview";

export const MAX_RUNTIME_REPEATER_ROWS = 500;

type FormSection = AdvancedDocumentTemplate["config"]["form"]["sections"][number];
type FormEntry = FormSection["entries"][number];
type RepeaterEntry = Extract<FormEntry, { kind: "repeater" }>;
type RepeaterColumn = {
  control: string;
  key: string;
  label: string;
  options?: readonly (string | { label: string; value: string })[];
  required: boolean;
};
type RepeaterRow = { id: string } & Record<string, unknown>;

interface AdvancedTemplateWorkspaceProps<TDraft> {
  adapter: DocumentAdapter<TDraft>;
  draft: TDraft;
  onDraftChange: (draft: TDraft) => void;
  onTrackClick?: (event: string) => void;
  templates: readonly DocumentTemplate[];
}

const SELECT_OPTIONS: Readonly<Record<string, readonly (string | { label: string; value: string })[]>> = {
  "invoice:discountType": ["none", "percent", "fixed"],
  "mileage-log:rateMode": [
    { label: "IRS standard rate", value: "irs-standard" },
    { label: "Custom rate", value: "custom" },
  ],
  "quarterly-tax-estimator:filingStatus": [
    { label: "Single", value: "single" },
    { label: "Married filing jointly", value: "married_joint" },
    { label: "Married filing separately", value: "married_separate" },
    { label: "Head of household", value: "head_household" },
  ],
  "w9-request:requestStatus": ["Not Requested", "Requested", "Received", "Needs Review", "Not Applicable"],
  "1099-nec-tracker:filingStatus": ["Review required", "Ready for preparer", "Filed externally"],
  "expense-report:expenseRows.category": ["Travel", "Lodging", "Meals", "Software", "Office supplies", "Other"],
  "1099-nec-tracker:paymentRows.paymentMethod": ["Cash", "Check", "ACH", "PayPal", "Venmo", "Zelle", "Card", "Other"],
  "1099-nec-tracker:paymentRows.category": ["Services", "Rent", "Legal", "Repairs", "Commissions", "Other"],
};

function customStorageKey(templateId: string) {
  return `paperworkkit.advanced-template.${templateId}.custom`;
}

function selectedStorageKey(documentType: string) {
  return `paperworkkit.advanced-template.${documentType}.selected`;
}

function normalizeStoredCustomValues(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key,
      Array.isArray(fieldValue)
        ? fieldValue.slice(0, MAX_RUNTIME_REPEATER_ROWS).map((row) =>
            row && typeof row === "object" && !Array.isArray(row)
              ? {
                  ...row,
                  id:
                    typeof (row as { id?: unknown }).id === "string" ? (row as { id: string }).id : crypto.randomUUID(),
                }
              : { id: crypto.randomUUID() },
          )
        : fieldValue,
    ]),
  );
}

function withoutFullTinValues(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => !containsFullTin(value)));
}

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The live draft still works when browser storage is unavailable or full.
  }
}

function readStoredCustomValues(templateId: string) {
  try {
    const raw = readStorage(customStorageKey(templateId));
    return raw ? normalizeStoredCustomValues(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function templateCustomSampleValues(template: AdvancedDocumentTemplate): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const entry of template.config.form.sections.flatMap((section) => section.entries)) {
    if (entry.kind === "builtin") continue;
    const sample = template.config.sampleData[entry.key] ?? "";
    if (entry.kind === "repeater") {
      try {
        values[entry.key] = JSON.parse(sample);
      } catch {
        values[entry.key] = [];
      }
    } else if (entry.control === "checkbox") {
      values[entry.key] = sample === "true";
    } else if (sample !== "" && ["number", "currency", "percent"].includes(entry.control)) {
      values[entry.key] = Number(sample);
    } else {
      values[entry.key] = sample;
    }
  }
  return normalizeStoredCustomValues(values);
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function inputType(control: string) {
  if (control === "phone") return "tel";
  if (control === "currency" || control === "percent") return "number";
  if (control === "email" || control === "number" || control === "date" || control === "time") {
    return control;
  }
  return "text";
}

function fieldOptions(entry: FormEntry | RepeaterColumn, fallbackKey?: string) {
  const options =
    ("options" in entry ? entry.options : undefined) ?? (fallbackKey ? SELECT_OPTIONS[fallbackKey] : undefined);
  return (options ?? []).map((option) => (typeof option === "string" ? { label: option, value: option } : option));
}

function fieldControl(entry: Exclude<FormEntry, RepeaterEntry>, definition?: DocumentFieldDefinition) {
  return entry.kind === "builtin" ? (definition?.control ?? "text") : entry.control;
}

function rowValue(rows: unknown, minRows = 0): RepeaterRow[] {
  const list = Array.isArray(rows)
    ? rows
        .filter((row): row is RepeaterRow =>
          Boolean(
            row && typeof row === "object" && !Array.isArray(row) && typeof (row as { id?: unknown }).id === "string",
          ),
        )
        .slice(0, MAX_RUNTIME_REPEATER_ROWS)
    : [];
  if (list.length >= minRows) return list;
  return [
    ...list,
    ...Array.from({ length: minRows - list.length }, () => ({
      id: crypto.randomUUID(),
    })),
  ];
}

export default function AdvancedTemplateWorkspace<TDraft>({
  adapter,
  draft,
  onDraftChange,
  onTrackClick,
  templates,
}: AdvancedTemplateWorkspaceProps<TDraft>) {
  const availableTemplates = useMemo(
    () =>
      templates.filter(
        (template): template is AdvancedDocumentTemplate =>
          template.documentType === adapter.documentType &&
          template.layoutFamily === "advanced" &&
          template.status === "published",
      ),
    [adapter.documentType, templates],
  );
  const fallbackTemplate = availableTemplates.find((template) => template.isDefault) ?? availableTemplates[0];
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const selectedTemplate =
    availableTemplates.find((template) => template.id === selectedTemplateId) ?? fallbackTemplate;
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const loadedCustomTemplateRef = useRef("");
  const rejectsFullTin = adapter.documentType === "w9-request" || adapter.documentType === "1099-nec-tracker";

  useEffect(() => {
    if (!fallbackTemplate) return;
    const stored = readStorage(selectedStorageKey(adapter.documentType));
    setSelectedTemplateId(
      availableTemplates.some((template) => template.id === stored) ? stored! : fallbackTemplate.id,
    );
  }, [adapter.documentType, availableTemplates, fallbackTemplate]);

  useEffect(() => {
    if (!selectedTemplate) return;
    loadedCustomTemplateRef.current = selectedTemplate.id;
    const storedValues = readStoredCustomValues(selectedTemplate.id);
    setCustomValues(rejectsFullTin ? withoutFullTinValues(storedValues) : storedValues);
    setErrors({});
    writeStorage(selectedStorageKey(adapter.documentType), selectedTemplate.id);
  }, [adapter.documentType, rejectsFullTin, selectedTemplate]);

  useEffect(() => {
    if (!selectedTemplate || loadedCustomTemplateRef.current !== selectedTemplate.id) {
      return;
    }
    writeStorage(customStorageKey(selectedTemplate.id), JSON.stringify(customValues));
  }, [customValues, selectedTemplate]);

  const fieldDefinitions = useMemo(
    () => new Map(getDocumentDefinition(adapter.documentType).fields.map((field) => [field.key, field])),
    [adapter.documentType],
  );
  const pdfInputs = useMemo(
    () => (selectedTemplate ? adapter.toPdfInputs(draft, selectedTemplate, customValues) : null),
    [adapter, customValues, draft, selectedTemplate],
  );

  if (!selectedTemplate || !pdfInputs) return null;
  const documentData = pdfInputs;

  function readEntry(entry: FormEntry) {
    return entry.kind === "builtin" ? adapter.readField(draft, entry.key) : customValues[entry.key];
  }

  function writeEntry(entry: FormEntry, value: unknown) {
    if (rejectsFullTin && containsFullTin(value)) {
      setErrors((current) => ({
        ...current,
        [entry.key]: "Full TIN, SSN, and EIN values are not accepted.",
      }));
      return;
    }
    setErrors((current) => ({ ...current, [entry.key]: "" }));
    if (entry.kind === "builtin") {
      onDraftChange(adapter.writeField(draft, entry.key, value));
    } else {
      setCustomValues((current) => ({ ...current, [entry.key]: value }));
    }
  }

  function validate() {
    const next = adapter.validate(draft, selectedTemplate.config.form);
    for (const section of selectedTemplate.config.form.sections) {
      for (const entry of section.entries) {
        if (!entry.enabled) continue;
        const value = readEntry(entry);
        if (rejectsFullTin && containsFullTin(value)) {
          next[entry.key] = "Full TIN, SSN, and EIN values are not accepted.";
        }
        const fieldDefinition = entry.kind === "builtin" ? fieldDefinitions.get(entry.key) : undefined;
        const control = entry.kind === "repeater" ? "repeater" : fieldControl(entry, fieldDefinition);
        if (entry.required && (control === "checkbox" ? value !== true : isEmpty(value))) {
          next[entry.key] = `${entry.label} is required.`;
        }
        const columns = entry.kind === "repeater" ? entry.columns : fieldDefinition?.repeaterColumns;
        const rows = columns ? rowValue(value, entry.kind === "repeater" ? (entry.minRows ?? 0) : 0) : [];
        if (entry.kind === "repeater" && rows.length < (entry.minRows ?? 0)) {
          next[entry.key] = `${entry.label} needs at least ${entry.minRows} rows.`;
        }
        if (
          columns?.some(
            (column) =>
              column.required &&
              rows.some((row) => (column.control === "checkbox" ? row[column.key] !== true : isEmpty(row[column.key]))),
          )
        ) {
          next[entry.key] = `${entry.label} has an incomplete required column.`;
        }
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function generate(action: "download" | "print") {
    if (!validate()) return;
    setIsGenerating(true);
    try {
      if (action === "print") {
        await openAdvancedDocumentPdf({
          template: selectedTemplate,
          data: documentData,
        });
      } else {
        await downloadAdvancedDocumentPdf({
          template: selectedTemplate,
          data: documentData,
          fileName: adapter.fileName(draft),
        });
      }
      onTrackClick?.(`${adapter.documentType.replaceAll("-", "_")}_pdf_${action}`);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        _document:
          error instanceof Error && error.message === "Allow pop-ups to open the PDF preview."
            ? error.message
            : "The PDF could not be generated. Please try again.",
      }));
    } finally {
      setIsGenerating(false);
    }
  }

  function renderControl(entry: Exclude<FormEntry, RepeaterEntry>, value: unknown) {
    const definition = entry.kind === "builtin" ? fieldDefinitions.get(entry.key) : undefined;
    const control = fieldControl(entry, definition);
    const id = `advanced-field-${entry.key.replaceAll(".", "-")}`;
    const options = fieldOptions(entry, `${adapter.documentType}:${entry.key}`);

    if (control === "checkbox") {
      return (
        <Checkbox
          checked={Boolean(value)}
          id={id}
          label={`${entry.label}${entry.required ? " *" : ""}`}
          onCheckedChange={(checked) => writeEntry(entry, checked === true)}
          required={entry.required}
        />
      );
    }
    if (control === "textarea") {
      return (
        <Textarea
          aria-invalid={Boolean(errors[entry.key])}
          id={id}
          onChange={(event) => writeEntry(entry, event.target.value)}
          required={entry.required}
          value={String(value ?? "")}
        />
      );
    }
    if (control === "select") {
      return (
        <Select
          aria-invalid={Boolean(errors[entry.key])}
          id={id}
          onChange={(event) => writeEntry(entry, event.target.value)}
          required={entry.required}
          value={String(value ?? "")}
        >
          <option value="">Select…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      );
    }
    return (
      <Input
        aria-invalid={Boolean(errors[entry.key])}
        id={id}
        inputMode={control === "currency" || control === "percent" || control === "number" ? "decimal" : undefined}
        onBlur={(event) => {
          if (event.target.value !== "" && (control === "currency" || control === "percent" || control === "number")) {
            writeEntry(entry, Number(event.target.value));
          }
        }}
        onChange={(event) => writeEntry(entry, event.target.value)}
        required={entry.required}
        step={control === "currency" || control === "percent" ? "0.01" : undefined}
        type={inputType(control)}
        value={String(value ?? "")}
      />
    );
  }

  function renderRepeater(entry: FormEntry, columns: readonly RepeaterColumn[], minRows = 0) {
    const rows = rowValue(readEntry(entry), minRows);
    const updateRows = (next: RepeaterRow[]) => writeEntry(entry, next.slice(0, MAX_RUNTIME_REPEATER_ROWS));

    return (
      <div className="grid gap-3">
        <OrderableList
          ariaLabel={`${entry.label} rows`}
          className="grid gap-3"
          getId={(row) => row.id}
          getLabel={(_row) => entry.label}
          items={rows}
          onReorder={updateRows}
          renderItem={(row, state) => (
            <Card className="grid gap-3 p-3">
              <div className="flex items-center justify-between gap-2">
                <Button
                  {...state.attributes}
                  {...state.listeners}
                  aria-label={`Reorder ${entry.label} row`}
                  className="size-9 touch-none text-muted-foreground"
                  ref={state.setActivatorNodeRef}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <GripVertical aria-hidden="true" size={16} />
                </Button>
                <Button
                  aria-label={`Remove ${entry.label} row`}
                  disabled={rows.length <= minRows}
                  onClick={() => updateRows(rows.filter((item) => item.id !== row.id))}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" size={15} />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {columns.map((column) => {
                  const id = `${entry.key}-${row.id}-${column.key}`;
                  const value = row[column.key];
                  const options = fieldOptions(column, `${adapter.documentType}:${entry.key}.${column.key}`);
                  return (
                    <div className="grid gap-1" key={column.key}>
                      <Label htmlFor={id}>{column.label}</Label>
                      {column.control === "select" ? (
                        <Select
                          id={id}
                          onChange={(event) =>
                            updateRows(
                              rows.map((item) =>
                                item.id === row.id
                                  ? {
                                      ...item,
                                      [column.key]: event.target.value,
                                    }
                                  : item,
                              ),
                            )
                          }
                          value={String(value ?? "")}
                        >
                          <option value="">Select…</option>
                          {options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      ) : column.control === "checkbox" ? (
                        <CheckboxControl
                          aria-label={column.label}
                          checked={Boolean(value)}
                          className="size-4"
                          id={id}
                          onCheckedChange={(checked) =>
                            updateRows(
                              rows.map((item) =>
                                item.id === row.id
                                  ? {
                                      ...item,
                                      [column.key]: checked === true,
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      ) : (
                        <Input
                          id={id}
                          onChange={(event) =>
                            updateRows(
                              rows.map((item) =>
                                item.id === row.id
                                  ? {
                                      ...item,
                                      [column.key]: event.target.value,
                                    }
                                  : item,
                              ),
                            )
                          }
                          required={column.required}
                          type={inputType(column.control)}
                          value={String(value ?? "")}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        />
        <Button
          disabled={rows.length >= MAX_RUNTIME_REPEATER_ROWS}
          onClick={() => updateRows([...rows, { id: crypto.randomUUID() }])}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Plus aria-hidden="true" size={15} />
          Add row
        </Button>
      </div>
    );
  }

  return (
    <Card className="grid gap-6 p-5 print:hidden">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid min-w-64 gap-1">
          <Label htmlFor="advanced-published-template">Published template</Label>
          <Select
            id="advanced-published-template"
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            value={selectedTemplate.id}
          >
            {availableTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              onDraftChange(adapter.getSampleDraft());
              const samples = templateCustomSampleValues(selectedTemplate);
              setCustomValues(rejectsFullTin ? withoutFullTinValues(samples) : samples);
              setErrors({});
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            <RefreshCw aria-hidden="true" size={15} />
            Load sample
          </Button>
          <Button
            disabled={isGenerating}
            onClick={() => void generate("print")}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Printer aria-hidden="true" size={15} />
            Print PDF
          </Button>
          <ToolActionButton
            action="download"
            disabled={isGenerating}
            onClick={() => void generate("download")}
            type="button"
          >
            Download PDF
          </ToolActionButton>
        </div>
      </div>
      {errors._document ? (
        <P className="text-destructive" role="alert">
          {errors._document}
        </P>
      ) : null}

      <WorkbenchPanes className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
        <div className="grid gap-5">
          {selectedTemplate.config.form.sections.map((section) => {
            const entries = section.entries.filter((entry) => entry.enabled);
            if (!entries.length) return null;
            return (
              <section className="grid gap-4" key={section.id}>
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <H3>{section.label}</H3>
                  <StatusBadge>{entries.length} fields</StatusBadge>
                </div>
                {entries.map((entry) => {
                  const fieldDefinition = entry.kind === "builtin" ? fieldDefinitions.get(entry.key) : undefined;
                  const repeaterColumns = entry.kind === "repeater" ? entry.columns : fieldDefinition?.repeaterColumns;
                  const scalarEntry = entry as Exclude<FormEntry, RepeaterEntry>;
                  const scalarControl = repeaterColumns?.length ? null : fieldControl(scalarEntry, fieldDefinition);
                  return (
                    <div className="grid gap-1.5" key={entry.key}>
                      {repeaterColumns?.length ? (
                        <>
                          <div>
                            <P>
                              {entry.label}
                              {entry.required ? " *" : ""}
                            </P>
                            {entry.helpText ? <Muted className="text-muted-foreground">{entry.helpText}</Muted> : null}
                          </div>
                          {renderRepeater(entry, repeaterColumns, entry.kind === "repeater" ? entry.minRows : 0)}
                        </>
                      ) : scalarControl === "checkbox" ? (
                        <div className="grid gap-1.5">
                          {renderControl(scalarEntry, readEntry(entry))}
                          {entry.helpText ? (
                            <Caption className="text-muted-foreground">{entry.helpText}</Caption>
                          ) : null}
                        </div>
                      ) : (
                        <Label className="grid gap-1.5" htmlFor={`advanced-field-${entry.key.replaceAll(".", "-")}`}>
                          <span>
                            {entry.label}
                            {entry.required ? " *" : ""}
                          </span>
                          {renderControl(scalarEntry, readEntry(entry))}
                          {entry.helpText ? (
                            <Caption className="text-muted-foreground">{entry.helpText}</Caption>
                          ) : null}
                        </Label>
                      )}
                      {errors[entry.key] ? (
                        <P className="text-destructive" role="alert">
                          {errors[entry.key]}
                        </P>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
        <div className="xl:sticky xl:top-20">
          <AdvancedDocumentPreview data={documentData} template={selectedTemplate} />
        </div>
      </WorkbenchPanes>
    </Card>
  );
}
