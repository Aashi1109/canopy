"use client";

import { SubmitButton } from "@/app/admin/(protected)/components/SubmitButton";

import {
  InvoiceTemplateConfigSchema,
  InvoiceTemplateSchema,
  type InvoiceTemplate,
  type InvoiceTemplateConfig,
  type LayoutFamily,
  type TemplateCategory,
} from "@/lib/invoice-templates/index.ts";
import {
  InvoiceTemplatePreview,
  invoicePreviewSampleOptions,
  invoicePreviewSamples,
  type InvoicePreviewSampleId,
} from "@/lib/invoice-templates/TemplatePreview.tsx";
import {
  Overline,
  Caption,
  H1,
  Text,
  AlertBanner,
  Button,
  Checkbox,
  Field,
  Input,
  Label,
  SectionCard,
  SectionHeading,
  Select,
  StatusBadge,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  buttonVariants,
} from "@/components/ui/index.tsx";
import { OrderableList } from "@/components/ui/components/OrderableList.tsx";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  Download,
  FileText,
  GripVertical,
  Laptop,
  RotateCcw,
  Save,
} from "lucide-react";
import Link from "next/link";
import { updateAdminQuery, useAdminQueryState } from "@/app/admin/hooks/useAdminQueryState";
import { useActionState, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  archiveTemplateAction,
  duplicateTemplateAction,
  updateAndPublishTemplateAction,
  updateTemplateAction,
} from "../../../../actions";

const categories = ["classic", "modern", "simple", "professional", "creative", "service"] as const;
const layouts = ["classic", "modern", "compact", "bold", "minimal", "service"] as const;
const fontFamilies = [
  "Inter",
  "Helvetica",
  "Times-Roman",
  "Courier",
  "Georgia",
  "JetBrains Mono",
  "Space Grotesk",
  "Outfit",
] as const;
const themeFields: Array<{ key: keyof InvoiceTemplateConfig["theme"]; label: string }> = [
  { key: "primaryColor", label: "Primary color" },
  { key: "accentColor", label: "Accent color" },
  { key: "textColor", label: "Text color" },
  { key: "mutedTextColor", label: "Muted text" },
  { key: "borderColor", label: "Border color" },
  { key: "backgroundColor", label: "Background color" },
  { key: "surfaceColor", label: "Paper surface" },
];
const visibilityFields: Array<{
  key: keyof InvoiceTemplateConfig["visibility"];
  label: string;
}> = [
  { key: "showLogo", label: "Business logo" },
  { key: "showBusinessBlock", label: "Business details" },
  { key: "showClientBlock", label: "Client details" },
  { key: "showMetaBlock", label: "Invoice metadata" },
  { key: "showLineItems", label: "Line items" },
  { key: "showTotals", label: "Totals" },
  { key: "showPaymentInstructions", label: "Payment instructions" },
  { key: "showNotes", label: "Notes" },
  { key: "showTerms", label: "Terms" },
  { key: "showFooter", label: "Footer" },
];
const sectionLabels: Record<string, string> = {
  header: "Business header and details",
  meta_info: "Client and invoice metadata",
  line_items: "Line items table",
  totals: "Financial totals",
  payment_instructions: "Payment instructions",
  notes_terms: "Notes and terms",
  footer: "Footer",
};
const sixDigitHexColorPattern = /^#[0-9a-fA-F]{6}$/;
const validHexColorPattern = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const popoverClassName =
  "m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl backdrop:bg-foreground/20";

function colorPickerValue(value: string) {
  if (sixDigitHexColorPattern.test(value)) return value;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value
      .slice(1)
      .split("")
      .map((character) => character.repeat(2))
      .join("")}`;
  }
  return "#000000";
}

function colorContrastRatio(foreground: string, background: string) {
  if (!validHexColorPattern.test(foreground) || !validHexColorPattern.test(background)) return null;
  const luminance = (color: string) => {
    const value = colorPickerValue(color);
    const channels = [value.slice(1, 3), value.slice(3, 5), value.slice(5, 7)].map(
      (channel) => Number.parseInt(channel, 16) / 255,
    );
    const [red, green, blue] = channels.map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function EditorSection({
  children,
  description,
  number,
  title,
}: {
  children: ReactNode;
  description?: ReactNode;
  number: number;
  title: ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <div>
        <Overline className="block text-muted-foreground">
          {number}. {title}
        </Overline>
        {description ? <Caption className="block mt-1 text-muted-foreground">{description}</Caption> : null}
      </div>
      <SectionCard className="space-y-3 bg-muted/40 p-4 shadow-none [&_input:not([type=color]):not([type=checkbox]):not([type=range])]:h-8 [&_select]:h-8 [&_textarea]:min-h-20">
        {children}
      </SectionCard>
    </section>
  );
}

function ColorField({
  id,
  label,
  onChange,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-foreground" htmlFor={id}>
        {label}
      </Label>
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2">
        <input
          aria-label={`${label} picker`}
          className="size-8 cursor-pointer rounded-md border border-input bg-background p-1"
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={colorPickerValue(value)}
        />
        <Input
          className="min-w-0"
          id={id}
          onChange={(event) => onChange(event.target.value)}
          pattern="#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?"
          required
          value={value}
        />
      </div>
    </div>
  );
}

export default function TemplateEditor({ template }: { template: InvoiceTemplate }) {
  const [, saveAction, isSaving] = useActionState(
    (_previous: void, data: FormData) => updateTemplateAction(data),
    undefined,
  );
  const [, publishAction, isPublishing] = useActionState(
    (_previous: void, data: FormData) => updateAndPublishTemplateAction(data),
    undefined,
  );
  const [name, setName] = useState(template.name);
  const slug = template.slug;
  const [description, setDescription] = useState(template.description);
  const [category, setCategory] = useState<TemplateCategory>(template.category);
  const [layoutFamily, setLayoutFamily] = useState<LayoutFamily>(template.layoutFamily);
  const [config, setConfig] = useState<InvoiceTemplateConfig>(() => structuredClone(template.config));
  const [editorMode, setEditorMode] = useAdminQueryState("editor", "fields", ["fields", "json"]);
  const [previewMode, setPreviewMode] = useAdminQueryState("preview", "screen", ["screen", "pdf"]);
  const [mobilePane, setMobilePane] = useAdminQueryState("pane", "edit", ["edit", "preview"]);
  const [activeSample, setActiveSample] = useAdminQueryState<InvoicePreviewSampleId>(
    "sample",
    "service",
    invoicePreviewSampleOptions.map((sample) => sample.value),
  );
  const [jsonDraft, setJsonDraft] = useState<string | null>(null);
  const [jsonMessage, setJsonMessage] = useState<{
    text: string;
    variant: "error" | "success";
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  const editable = useMemo(
    () => ({ name, description, category, layoutFamily, config }),
    [name, description, category, layoutFamily, config],
  );
  const serializedTemplate = useMemo(() => JSON.stringify(editable), [editable]);
  const initialTemplate = useMemo(
    () =>
      JSON.stringify({
        name: template.name,
        description: template.description,
        category: template.category,
        layoutFamily: template.layoutFamily,
        config: template.config,
      }),
    [template],
  );
  const previewTemplate = useMemo<InvoiceTemplate>(() => ({ ...template, ...editable }), [template, editable]);
  const isDirty = serializedTemplate !== initialTemplate;
  const appliedJsonText = useMemo(() => JSON.stringify(config, null, 2), [config]);
  const jsonText = jsonDraft ?? appliedJsonText;
  const jsonDirty = jsonText !== appliedJsonText;
  const hasUnsavedChanges = isDirty || jsonDirty;
  const lowContrastColors = [
    ["Text", config.theme.textColor, config.theme.surfaceColor],
    ["Muted text", config.theme.mutedTextColor, config.theme.surfaceColor],
  ].flatMap(([label, foreground, background]) => {
    const ratio = colorContrastRatio(foreground, background);
    return ratio !== null && ratio < 4.5 ? [`${label} is ${ratio.toFixed(1)}:1`] : [];
  });
  const nameError =
    showValidation && name.trim().length < 2 ? "Template name must be at least 2 characters." : undefined;
  const resetEditor = () => {
    if (
      hasUnsavedChanges &&
      !window.confirm("Discard all unsaved field and JSON changes and restore the saved template?")
    ) {
      return;
    }
    setName(template.name);
    setDescription(template.description);
    setCategory(template.category);
    setLayoutFamily(template.layoutFamily);
    setConfig(structuredClone(template.config));
    setJsonDraft(null);
    setJsonMessage(null);
    setFormError(null);
    setShowValidation(false);
  };

  const exportTemplate = () => {
    const blob = new Blob([JSON.stringify(previewTemplate, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `template-${slug || template.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const applyJson = () => {
    try {
      const result = InvoiceTemplateConfigSchema.safeParse(JSON.parse(jsonText));
      if (!result.success) {
        setJsonMessage({
          text: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"),
          variant: "error",
        });
        return;
      }
      setConfig(result.data as InvoiceTemplateConfig);
      setJsonDraft(null);
      setJsonMessage({ text: "Configuration applied to the live preview.", variant: "success" });
      setFormError(null);
    } catch (error) {
      setJsonMessage({
        text: error instanceof Error ? error.message : "The JSON could not be parsed.",
        variant: "error",
      });
    }
  };

  const selectEditorMode = (mode: "fields" | "json") => {
    if (mode === "fields" && jsonDirty) {
      setJsonMessage({
        text: "Apply the JSON changes or reset them before returning to property fields.",
        variant: "error",
      });
      return;
    }
    if (mode === "json" && !jsonDirty) {
      setJsonDraft(null);
      setJsonMessage(null);
    }
    setEditorMode(mode);
  };

  const validateBeforeSubmit = (event: FormEvent<HTMLFormElement>) => {
    setShowValidation(true);
    if (jsonDirty) {
      event.preventDefault();
      setJsonMessage({
        text: "Apply and validate the JSON changes before saving or publishing.",
        variant: "error",
      });
      setFormError("Apply or reset the pending JSON changes first.");
      return;
    }
    const result = InvoiceTemplateSchema.safeParse(previewTemplate);
    if (!result.success) {
      event.preventDefault();
      const message = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
      setFormError(message);
      return;
    }
    setFormError(null);
  };

  return (
    <>
      <header className="sticky top-2 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            aria-label="Back to templates"
            className={buttonVariants({
              className: "size-8 rounded-lg",
              size: "icon",
              variant: "ghost",
            })}
            href="/admin/templates"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <H1 className="truncate text-foreground">Editing: {name || "Untitled template"}</H1>
              <StatusBadge
                className="min-h-5 shrink-0 px-2 py-0"
                variant={
                  template.status === "published" ? "success" : template.status === "archived" ? "archived" : "warning"
                }
              >
                {template.status}
              </StatusBadge>
            </div>
            <Caption className="block truncate text-muted-foreground">
              Layout family: {layoutFamily} · /{slug || "untitled"}
            </Caption>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-1.5">
          <Button disabled={!hasUnsavedChanges} onClick={resetEditor} size="sm" variant="outline">
            <RotateCcw aria-hidden="true" className="size-3.5" />
            Reset
          </Button>
          <Button
            disabled={jsonDirty}
            onClick={exportTemplate}
            size="sm"
            title={jsonDirty ? "Apply or reset the JSON changes before exporting." : undefined}
            variant="outline"
          >
            <Download aria-hidden="true" className="size-3.5" />
            Export
          </Button>
          <Button popoverTarget="duplicate-template" size="sm" variant="outline">
            <Copy aria-hidden="true" className="size-3.5" />
            Copy
          </Button>
          {template.status !== "archived" ? (
            <Button
              disabled={template.isDefault}
              popoverTarget="archive-template"
              size="sm"
              title={template.isDefault ? "The default template cannot be archived." : undefined}
              variant="danger-subtle"
            >
              <Archive aria-hidden="true" className="size-3.5" />
              Archive
            </Button>
          ) : null}
          <Button
            disabled={jsonDirty || isSaving || isPublishing}
            form="template-editor-form"
            loading={isSaving}
            size="sm"
            title={jsonDirty ? "Apply or reset the JSON changes before saving." : undefined}
            type="submit"
            variant="strong"
          >
            <Save aria-hidden="true" className="size-3.5" />
            Save changes
          </Button>
          <Button
            disabled={jsonDirty || isSaving || isPublishing}
            form="template-editor-form"
            formAction={publishAction}
            loading={isPublishing}
            size="sm"
            title={jsonDirty ? "Apply or reset the JSON changes before publishing." : undefined}
            type="submit"
          >
            <CheckCircle2 aria-hidden="true" className="size-3.5" />
            Publish version
          </Button>
        </div>
      </header>

      {jsonDirty && editorMode !== "json" ? (
        <AlertBanner className="mb-4" variant="warning">
          Apply or reset your unapplied JSON changes before saving or exporting.
          <Button
            className="ml-2"
            onClick={() => updateAdminQuery({ editor: "json", pane: null })}
            size="sm"
            type="button"
            variant="secondary"
          >
            Return to JSON
          </Button>
        </AlertBanner>
      ) : null}

      <div
        aria-label="Editor workspace"
        className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 lg:hidden"
        role="group"
      >
        <Button
          aria-pressed={mobilePane === "edit"}
          className={`h-8 ${
            mobilePane === "edit" ? "bg-background shadow-sm hover:bg-background" : "text-muted-foreground"
          }`}
          onClick={() => setMobilePane("edit")}
          variant="ghost"
        >
          Edit template
        </Button>
        <Button
          aria-pressed={mobilePane === "preview"}
          className={`h-8 ${
            mobilePane === "preview" ? "bg-background shadow-sm hover:bg-background" : "text-muted-foreground"
          }`}
          onClick={() => setMobilePane("preview")}
          variant="ghost"
        >
          Preview invoice
        </Button>
      </div>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
        <form
          action={saveAction}
          className={`${mobilePane === "preview" ? "hidden lg:grid" : "grid"} min-w-0 gap-4`}
          id="template-editor-form"
          onSubmit={validateBeforeSubmit}
        >
          <input name="templateId" type="hidden" value={template.id} />
          <input name="template" type="hidden" value={serializedTemplate} />

          <Tabs onValueChange={(value) => selectEditorMode(value as "fields" | "json")} value={editorMode}>
            <TabsList aria-label="Template editor mode" className="grid w-full grid-cols-2" variant="segmented">
              <TabsTrigger
                aria-controls="template-fields-panel"
                className="h-8 w-full data-[state=active]:bg-background data-[state=active]:ring-1 data-[state=active]:ring-border"
                id="template-fields-tab"
                value="fields"
              >
                <Database aria-hidden="true" className="size-4" />
                Property fields
              </TabsTrigger>
              <TabsTrigger
                aria-controls="template-json-panel"
                className="h-8 w-full data-[state=active]:bg-background data-[state=active]:ring-1 data-[state=active]:ring-border"
                id="template-json-tab"
                value="json"
              >
                <Code2 aria-hidden="true" className="size-4" />
                Config JSON
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {formError ? <AlertBanner variant="error">{formError}</AlertBanner> : null}

          {editorMode === "fields" ? (
            <div
              aria-labelledby="template-fields-tab"
              className="contents"
              id="template-fields-panel"
              role="tabpanel"
              tabIndex={0}
            >
              <EditorSection number={1} title="Theme metadata">
                <div className="grid gap-4">
                  <Field error={nameError} htmlFor="template-name" label="Template name" required>
                    <Input name="name" onChange={(event) => setName(event.target.value)} required value={name} />
                  </Field>
                  <Field description="Permanent after creation." htmlFor="template-slug" label="Slug">
                    <Input
                      aria-readonly="true"
                      className="bg-muted text-muted-foreground"
                      id="template-slug"
                      readOnly
                      value={slug}
                    />
                  </Field>
                  <Field htmlFor="template-description" label="Description">
                    <Textarea
                      name="description"
                      onChange={(event) => setDescription(event.target.value)}
                      rows={3}
                      value={description}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field htmlFor="template-category" label="Category">
                      <Select
                        name="category"
                        onChange={(event) => setCategory(event.target.value as TemplateCategory)}
                        value={category}
                      >
                        {categories.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field htmlFor="template-layout" label="Layout family">
                      <Select
                        name="layoutFamily"
                        onChange={(event) => setLayoutFamily(event.target.value as LayoutFamily)}
                        value={layoutFamily}
                      >
                        {layouts.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </div>
              </EditorSection>

              <EditorSection number={2} title="Brand theme colors">
                <div className="grid gap-4 sm:grid-cols-2">
                  {themeFields.map(({ key, label }) => (
                    <ColorField
                      id={`theme-${key}`}
                      key={key}
                      label={label}
                      onChange={(value) => setConfig({ ...config, theme: { ...config.theme, [key]: value } })}
                      value={config.theme[key]}
                    />
                  ))}
                </div>
                {lowContrastColors.length ? (
                  <AlertBanner variant="warning">
                    {lowContrastColors.join(" · ")}. Aim for at least 4.5:1 against the paper surface.
                  </AlertBanner>
                ) : null}
              </EditorSection>

              <EditorSection number={3} title="Typography specs">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field htmlFor="typography-font" label="Font family">
                    <Select
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          typography: {
                            ...config.typography,
                            fontFamily: event.target.value as InvoiceTemplateConfig["typography"]["fontFamily"],
                          },
                        })
                      }
                      value={config.typography.fontFamily}
                    >
                      {fontFamilies.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field htmlFor="typography-heading" label="Heading size">
                    <Select
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          typography: {
                            ...config.typography,
                            headingSize: event.target.value as InvoiceTemplateConfig["typography"]["headingSize"],
                          },
                        })
                      }
                      value={config.typography.headingSize}
                    >
                      <option value="sm">Small</option>
                      <option value="md">Medium</option>
                      <option value="lg">Large</option>
                      <option value="xl">Extra large</option>
                    </Select>
                  </Field>
                  <Field htmlFor="typography-body" label="Body size">
                    <Select
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          typography: {
                            ...config.typography,
                            bodySize: event.target.value as InvoiceTemplateConfig["typography"]["bodySize"],
                          },
                        })
                      }
                      value={config.typography.bodySize}
                    >
                      <option value="xs">Extra small</option>
                      <option value="sm">Small</option>
                      <option value="md">Medium</option>
                    </Select>
                  </Field>
                  <Field htmlFor="typography-line-height" label="Line height">
                    <Select
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          typography: {
                            ...config.typography,
                            lineHeight: event.target.value as InvoiceTemplateConfig["typography"]["lineHeight"],
                          },
                        })
                      }
                      value={config.typography.lineHeight}
                    >
                      <option value="tight">Tight</option>
                      <option value="normal">Normal</option>
                      <option value="relaxed">Relaxed</option>
                    </Select>
                  </Field>
                </div>
              </EditorSection>

              <EditorSection number={4} title="Paper margins & sizes">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field htmlFor="page-size" label="Paper size">
                    <Select
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          page: {
                            ...config.page,
                            size: event.target.value as InvoiceTemplateConfig["page"]["size"],
                          },
                          pdf: {
                            ...config.pdf,
                            pageSize: event.target.value as InvoiceTemplateConfig["pdf"]["pageSize"],
                          },
                        })
                      }
                      value={config.page.size}
                    >
                      <option value="LETTER">Letter</option>
                      <option value="A4">A4</option>
                    </Select>
                  </Field>
                  <Field htmlFor="page-margin" label="Margin density">
                    <Select
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          page: {
                            ...config.page,
                            margin: event.target.value as InvoiceTemplateConfig["page"]["margin"],
                          },
                        })
                      }
                      value={config.page.margin}
                    >
                      <option value="compact">Compact</option>
                      <option value="normal">Normal</option>
                      <option value="spacious">Spacious</option>
                    </Select>
                  </Field>
                </div>
                <Checkbox
                  checked={config.page.showPageBorder}
                  label="Show a page border"
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      page: { ...config.page, showPageBorder: checked === true },
                    })
                  }
                />
              </EditorSection>

              <EditorSection number={5} title="Brand header styles">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field htmlFor="header-style" label="Header style">
                    <Select
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          header: {
                            ...config.header,
                            style: event.target.value as InvoiceTemplateConfig["header"]["style"],
                          },
                        })
                      }
                      value={config.header.style}
                    >
                      <option value="left-logo">Left logo</option>
                      <option value="centered">Centered</option>
                      <option value="right-meta">Right metadata</option>
                      <option value="split">Split</option>
                      <option value="minimal">Minimal</option>
                    </Select>
                  </Field>
                  <Field htmlFor="header-logo-position" label="Logo position">
                    <Select
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          header: {
                            ...config.header,
                            logoPosition: event.target.value as InvoiceTemplateConfig["header"]["logoPosition"],
                          },
                        })
                      }
                      value={config.header.logoPosition}
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </Select>
                  </Field>
                  <Field htmlFor="header-logo-size" label="Logo size">
                    <Select
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          header: {
                            ...config.header,
                            logoSize: event.target.value as InvoiceTemplateConfig["header"]["logoSize"],
                          },
                        })
                      }
                      value={config.header.logoSize}
                    >
                      <option value="xs">Extra small</option>
                      <option value="sm">Small</option>
                      <option value="md">Medium</option>
                      <option value="lg">Large</option>
                    </Select>
                  </Field>
                  <Field htmlFor="header-title" label="Invoice title">
                    <Input
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          header: { ...config.header, invoiceTitleText: event.target.value },
                        })
                      }
                      value={config.header.invoiceTitleText}
                    />
                  </Field>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Checkbox
                    checked={config.header.showInvoiceTitle}
                    label="Show invoice title"
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        header: { ...config.header, showInvoiceTitle: checked === true },
                      })
                    }
                  />
                  <Checkbox
                    checked={config.header.showStatusBadge}
                    label="Show status badge"
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        header: { ...config.header, showStatusBadge: checked === true },
                      })
                    }
                  />
                </div>
              </EditorSection>

              <EditorSection number={6} title="Segment visibility indicators">
                <div className="grid gap-2 sm:grid-cols-2">
                  {visibilityFields.map(({ key, label }) => (
                    <Checkbox
                      checked={config.visibility[key]}
                      key={key}
                      label={label}
                      onCheckedChange={(checked) =>
                        setConfig({
                          ...config,
                          visibility: { ...config.visibility, [key]: checked === true },
                        })
                      }
                    />
                  ))}
                </div>
              </EditorSection>

              <EditorSection number={7} title="Floating watermarks">
                <Checkbox
                  checked={config.watermark.enabled}
                  label="Enable watermark"
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      watermark: { ...config.watermark, enabled: checked === true },
                    })
                  }
                />
                {config.watermark.enabled ? (
                  <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                    <Field htmlFor="watermark-text" label="Watermark text">
                      <Input
                        onChange={(event) =>
                          setConfig({
                            ...config,
                            watermark: { ...config.watermark, text: event.target.value },
                          })
                        }
                        value={config.watermark.text}
                      />
                    </Field>
                    <Field htmlFor="watermark-position" label="Position">
                      <Select
                        onChange={(event) =>
                          setConfig({
                            ...config,
                            watermark: {
                              ...config.watermark,
                              position: event.target.value as InvoiceTemplateConfig["watermark"]["position"],
                            },
                          })
                        }
                        value={config.watermark.position}
                      >
                        <option value="center">Center</option>
                        <option value="bottom-right">Bottom right</option>
                      </Select>
                    </Field>
                    <Field
                      className="sm:col-span-2"
                      htmlFor="watermark-opacity"
                      label={`Opacity · ${Math.round(config.watermark.opacity * 100)}%`}
                    >
                      <input
                        className="h-10 w-full accent-primary"
                        max="0.4"
                        min="0.05"
                        onChange={(event) =>
                          setConfig({
                            ...config,
                            watermark: {
                              ...config.watermark,
                              opacity: Number(event.target.value),
                            },
                          })
                        }
                        step="0.05"
                        type="range"
                        value={config.watermark.opacity}
                      />
                    </Field>
                  </div>
                ) : null}
              </EditorSection>

              <EditorSection
                description="Drag a handle to reorder the invoice sections. Keyboard users can focus a handle and press Space."
                number={8}
                title="Structural ordering arrangement"
              >
                <OrderableList
                  ariaLabel="Invoice section order"
                  className="grid gap-2"
                  disabled={config.sectionOrder.length < 2}
                  getId={(section) => section}
                  items={config.sectionOrder}
                  onReorder={(sectionOrder) => setConfig((current) => ({ ...current, sectionOrder }))}
                  renderItem={(section, orderable) => (
                    <div
                      className={`flex items-center gap-2 rounded-lg border border-border px-2 py-2 transition-shadow ${
                        orderable.isDragging ? "bg-card shadow-lg ring-1 ring-primary/20" : "bg-background"
                      }`}
                    >
                      <Button
                        {...orderable.attributes}
                        {...orderable.listeners}
                        aria-label={`Reorder ${sectionLabels[section] ?? section}`}
                        className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={orderable.disabled}
                        ref={orderable.setActivatorNodeRef}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <GripVertical aria-hidden="true" className="size-4" />
                      </Button>
                      <Text className="text-foreground">{sectionLabels[section] ?? section}</Text>
                    </div>
                  )}
                />
              </EditorSection>

              <EditorSection number={9} title="Overriding label dictionary">
                <div className="grid gap-4 sm:grid-cols-2">
                  {(Object.keys(config.labels) as Array<keyof InvoiceTemplateConfig["labels"]>).map((key) => (
                    <Field htmlFor={`label-${key}`} key={key} label={key.replace(/([A-Z])/g, " $1")}>
                      <Input
                        onChange={(event) =>
                          setConfig({
                            ...config,
                            labels: { ...config.labels, [key]: event.target.value },
                          })
                        }
                        value={config.labels[key]}
                      />
                    </Field>
                  ))}
                </div>
              </EditorSection>
            </div>
          ) : (
            <SectionCard
              aria-labelledby="template-json-tab"
              className="space-y-4 p-5"
              id="template-json-panel"
              role="tabpanel"
              tabIndex={0}
            >
              <AlertBanner title="Advanced JSON workbench" variant="warning">
                Apply valid configuration JSON before saving or publishing. Server validation still runs on every write.
              </AlertBanner>
              <Field htmlFor="template-config-json" label="Config-only JSON">
                <Textarea
                  code
                  className="min-h-[34rem] bg-slate-950 text-slate-100"
                  maxLength={200_000}
                  onChange={(event) => {
                    setJsonDraft(event.target.value);
                    setJsonMessage(null);
                  }}
                  spellCheck={false}
                  value={jsonText}
                />
              </Field>
              {jsonMessage ? (
                <AlertBanner variant={jsonMessage.variant}>
                  <Caption className="whitespace-pre-wrap">{jsonMessage.text}</Caption>
                </AlertBanner>
              ) : null}
              <Button className="w-full" onClick={applyJson} type="button" variant="strong">
                Apply and validate JSON
              </Button>
            </SectionCard>
          )}
        </form>

        <SectionCard
          className={`${mobilePane === "edit" ? "hidden lg:block" : "block"} min-w-0 bg-muted/50 p-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto sm:p-5`}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-2 shadow-sm">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Label className="shrink-0 text-muted-foreground" htmlFor="preview-sample">
                Load client
              </Label>
              <Select
                className="h-8 min-w-0 flex-1"
                id="preview-sample"
                onChange={(event) => setActiveSample(event.target.value as InvoicePreviewSampleId)}
                value={activeSample}
              >
                {invoicePreviewSampleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div aria-label="Preview display" className="flex rounded-lg bg-muted p-1" role="group">
              <Button
                aria-label="Desktop preview"
                aria-pressed={previewMode === "screen"}
                className={`size-8 ${previewMode === "screen" ? "bg-background shadow-sm hover:bg-background" : ""}`}
                onClick={() => setPreviewMode("screen")}
                size="icon"
                variant="ghost"
              >
                <Laptop aria-hidden="true" className="size-3.5" />
              </Button>
              <Button
                aria-label="Page preview"
                aria-pressed={previewMode === "pdf"}
                className={`size-8 ${previewMode === "pdf" ? "bg-background shadow-sm hover:bg-background" : ""}`}
                onClick={() => setPreviewMode("pdf")}
                size="icon"
                title={`${config.page.size} page preview`}
                variant="ghost"
              >
                <FileText aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          </div>
          <div
            className={`mx-auto w-full bg-white transition-[max-width,min-height] ${
              previewMode === "pdf" ? "max-w-[44rem] p-5 [&>article]:min-h-full" : "max-w-2xl rounded-xl"
            }`}
            style={
              previewMode === "pdf" ? { aspectRatio: config.page.size === "A4" ? "210 / 297" : "8.5 / 11" } : undefined
            }
          >
            <InvoiceTemplatePreview data={invoicePreviewSamples[activeSample]} template={previewTemplate} />
          </div>
        </SectionCard>
      </div>

      <section
        aria-labelledby="duplicate-template-title"
        className={popoverClassName}
        id="duplicate-template"
        popover="auto"
        role="dialog"
      >
        <SectionHeading
          description="The copy starts as a new draft."
          title={<span id="duplicate-template-title">Duplicate template</span>}
        />
        <form action={duplicateTemplateAction} className="grid gap-4">
          <input name="templateId" type="hidden" value={template.id} />
          <Field htmlFor="duplicate-name" label="Copy name" required>
            <Input defaultValue={`${template.name} Copy`} name="name" required />
          </Field>
          <Field htmlFor="duplicate-slug" label="Unique slug" required>
            <Input defaultValue={`${template.slug}-copy`} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button popoverTarget="duplicate-template" popoverTargetAction="hide" variant="ghost">
              Cancel
            </Button>
            <SubmitButton type="submit">Create copy</SubmitButton>
          </div>
        </form>
      </section>

      <section
        aria-labelledby="archive-template-title"
        className={popoverClassName}
        id="archive-template"
        popover="auto"
        role="dialog"
      >
        <SectionHeading
          description="Archived templates leave the public catalog but keep their configuration."
          title={<span id="archive-template-title">Archive {template.name}?</span>}
        />
        <form action={archiveTemplateAction} className="flex justify-end gap-2">
          <input name="templateId" type="hidden" value={template.id} />
          <Button popoverTarget="archive-template" popoverTargetAction="hide" variant="ghost">
            Cancel
          </Button>
          <SubmitButton type="submit" variant="destructive">
            Archive template
          </SubmitButton>
        </form>
      </section>
    </>
  );
}
