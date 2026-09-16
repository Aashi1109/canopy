"use client";

import type { Plugins, PropPanelWidgetProps, Schema, Template } from "@pdfme/common";
import {
  getDocumentDefinition,
  resizeAdvancedTemplateConfig,
  validateAdvancedTemplateConfig,
  type AdvancedDocumentTemplate,
  type AdvancedTemplateConfig,
  type PageFormat,
  type PdfmeBlankBase,
  type PdfmeSchema,
} from "@smarttools/invoice-templates";
import {
  Strong,
  Caption,
  H1,
  H3,
  List,
  Muted,
  Overline,
  P,
  Text,
  AlertBanner,
  Button,
  Card,
  CheckboxControl,
  Field,
  Input,
  Label,
  Select,
  StatusBadge,
  Textarea,
  buttonVariants,
  typographyStyles,
} from "@smarttools/ui";
import { OrderableList } from "@smarttools/ui/components/OrderableList";
import {
  AlignCenter,
  ArrowLeft,
  Barcode,
  Bold,
  Braces,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleDot,
  CirclePlus,
  Clock3,
  Copy,
  File,
  FilePlus2,
  Files,
  GripVertical,
  Hand,
  ImageIcon,
  Layers,
  List as ListIcon,
  ListFilter,
  LoaderCircle,
  Maximize2,
  Minus,
  MousePointer2,
  PanelBottom,
  PanelTop,
  PenLine,
  Plus,
  QrCode,
  Redo2,
  Scan,
  Search,
  Shapes,
  Square,
  SquareCheck,
  Table2,
  TextCursorInput,
  Trash2,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { updateAdminQuery, useAdminQueryState } from "@/app/admin/hooks/useAdminQueryState";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Designer, DesignerSelection } from "@pdfme/ui";
import { updateAndPublishTemplateAction, updateTemplateAction } from "../../../../../actions";

type ActivePanel = "add" | "layers" | "data" | "pages" | null;
type Region = "header" | "footer";
type LayerItem = {
  id: string;
  index: number;
  schema: Schema;
};
type HistoryEntry = {
  pageFormat: PageFormat;
  template: Template;
};
type TemplateFormSection = AdvancedTemplateConfig["form"]["sections"][number];
type TemplateFormEntry = TemplateFormSection["entries"][number];
type CustomTemplateFormEntry = Exclude<TemplateFormEntry, { kind: "builtin" }>;
type AddTool = {
  description: string;
  group: "Content" | "Layout" | "Fields" | "Codes";
  icon: LucideIcon;
  label: string;
  pluginKey: string;
};

const HISTORY_LIMIT = 40;
const MAX_RUNTIME_REPEATER_ROWS = 500;
const PAGE_FORMAT_LABELS: Record<PageFormat, string> = {
  A4: "A4",
  LETTER: "Letter",
  RECEIPT_80MM: "80 mm",
  RECEIPT_58MM: "58 mm",
};
const CUSTOM_FIELD_CONTROLS = [
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "currency",
  "percent",
  "date",
  "time",
  "select",
  "checkbox",
] as const;
const ADD_TOOL_GROUPS = ["Content", "Layout", "Fields", "Codes"] as const;
const ADD_TOOLS: AddTool[] = [
  {
    description: "Static or bound copy",
    group: "Content",
    icon: Type,
    label: "Text",
    pluginKey: "text",
  },
  {
    description: "Mix copy with variables",
    group: "Content",
    icon: Braces,
    label: "Dynamic text",
    pluginKey: "multiVariableText",
  },
  {
    description: "Bulleted or numbered items",
    group: "Content",
    icon: ListIcon,
    label: "List",
    pluginKey: "list",
  },
  {
    description: "Logo, photo, or artwork",
    group: "Content",
    icon: ImageIcon,
    label: "Image",
    pluginKey: "image",
  },
  {
    description: "Uploaded signature image",
    group: "Content",
    icon: PenLine,
    label: "Signature",
    pluginKey: "signature",
  },
  {
    description: "Scalable vector artwork",
    group: "Content",
    icon: Shapes,
    label: "SVG graphic",
    pluginKey: "svg",
  },
  {
    description: "Horizontal or angled rule",
    group: "Layout",
    icon: Minus,
    label: "Line",
    pluginKey: "line",
  },
  {
    description: "Outlined or filled box",
    group: "Layout",
    icon: Square,
    label: "Rectangle",
    pluginKey: "rectangle",
  },
  {
    description: "Outlined or filled circle",
    group: "Layout",
    icon: Circle,
    label: "Ellipse",
    pluginKey: "ellipse",
  },
  {
    description: "Rows that flow across pages",
    group: "Layout",
    icon: Table2,
    label: "Table",
    pluginKey: "table",
  },
  {
    description: "Formatted date and time",
    group: "Fields",
    icon: CalendarClock,
    label: "Date & time",
    pluginKey: "dateTime",
  },
  {
    description: "Formatted calendar date",
    group: "Fields",
    icon: CalendarDays,
    label: "Date",
    pluginKey: "date",
  },
  {
    description: "Formatted time",
    group: "Fields",
    icon: Clock3,
    label: "Time",
    pluginKey: "time",
  },
  {
    description: "Choose from preset options",
    group: "Fields",
    icon: ListFilter,
    label: "Dropdown",
    pluginKey: "select",
  },
  {
    description: "Single-choice field",
    group: "Fields",
    icon: CircleDot,
    label: "Radio button",
    pluginKey: "radioGroup",
  },
  {
    description: "True or false field",
    group: "Fields",
    icon: SquareCheck,
    label: "Checkbox",
    pluginKey: "checkbox",
  },
  {
    description: "Circle a selected value",
    group: "Fields",
    icon: Circle,
    label: "Circle mark",
    pluginKey: "circleMark",
  },
  {
    description: "Scannable URL or text",
    group: "Codes",
    icon: QrCode,
    label: "QR code",
    pluginKey: "qrcode",
  },
  {
    description: "Code 128 product code",
    group: "Codes",
    icon: Barcode,
    label: "Barcode",
    pluginKey: "code128",
  },
];

function cloneTemplate(template: Template): Template {
  return structuredClone(template);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

const smarttoolsBridge: {
  toggleRepeat: () => void;
  deleteElement: () => void;
} = {
  toggleRepeat: () => {},
  deleteElement: () => {},
};

function renderSmarttoolsControls(props: PropPanelWidgetProps): void {
  try {
    const { rootElement, activeSchema } = props;
    rootElement.replaceChildren();
    const repeating = Boolean((activeSchema as { smarttoolsRegion?: string }).smarttoolsRegion);

    const wrap = document.createElement("div");
    wrap.style.cssText =
      "display:flex;flex-direction:column;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid #eaecef;";

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;";
    const text = document.createElement("div");
    text.innerHTML =
      `<div class="${typographyStyles.strong}" style="color:#1a1a1a;">Repeat on every page</div>` +
      `<div class="${typographyStyles.caption}" style="color:#666;">Move into header or footer</div>`;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Repeat on every page");
    toggle.style.cssText =
      "position:relative;height:24px;width:40px;flex-shrink:0;border:0;border-radius:9999px;cursor:pointer;transition:background .15s;background:" +
      (repeating ? "#0066ff" : "#d6d9de") +
      ";";
    const knob = document.createElement("span");
    knob.style.cssText =
      "position:absolute;top:3px;height:18px;width:18px;border-radius:9999px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .15s;left:" +
      (repeating ? "19px" : "3px") +
      ";";
    toggle.appendChild(knob);
    toggle.addEventListener("click", () => smarttoolsBridge.toggleRepeat());
    row.append(text, toggle);

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "Delete element";
    del.className = typographyStyles.caption;
    del.style.cssText =
      "height:36px;width:100%;border:1px solid #d6d9de;border-radius:8px;background:#fff;color:#dc2626;cursor:pointer;";
    del.addEventListener("click", () => smarttoolsBridge.deleteElement());

    wrap.append(row, del);
    rootElement.appendChild(wrap);
  } catch {
    // A widget error must never take down pdfme's property panel.
  }
}

type PdfmePlugin = Plugins[string];

function withSmarttoolsControls(plugin: PdfmePlugin): PdfmePlugin {
  const propPanel = plugin.propPanel;
  const originalSchema = propPanel.schema;
  return {
    ...plugin,
    propPanel: {
      ...propPanel,
      widgets: {
        ...(propPanel.widgets ?? {}),
        smarttoolsControls: renderSmarttoolsControls,
      },
      schema: (schemaProps) => {
        const base =
          typeof originalSchema === "function" ? originalSchema(schemaProps) : originalSchema;
        return {
          ...base,
          smarttoolsControls: {
            type: "void",
            widget: "smarttoolsControls",
            bind: false,
            span: 24,
          },
        };
      },
    },
  };
}

async function loadPlugins(): Promise<Plugins> {
  const schemas = await import("@pdfme/schemas");
  const raw: Plugins = {
    text: schemas.text,
    multiVariableText: schemas.multiVariableText,
    list: schemas.list,
    image: schemas.image,
    signature: schemas.signature,
    svg: schemas.svg,
    line: schemas.line,
    rectangle: schemas.rectangle,
    ellipse: schemas.ellipse,
    table: schemas.table,
    dateTime: schemas.dateTime,
    date: schemas.date,
    time: schemas.time,
    select: schemas.select,
    radioGroup: schemas.radioGroup,
    checkbox: schemas.checkbox,
    circleMark: schemas.circleMark,
    ...schemas.barcodes,
  };
  return Object.fromEntries(
    Object.entries(raw).map(([key, plugin]) => [key, withSmarttoolsControls(plugin)]),
  );
}

function blankBase(template: Template): PdfmeBlankBase {
  return template.basePdf as PdfmeBlankBase;
}

function panelButtonClass(active: boolean) {
  return [
    "size-8 rounded-lg p-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "bg-primary/90 text-primary-foreground shadow-sm hover:bg-primary"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  ].join(" ");
}

function schemaBindingType(type: string): "text" | "table" | "image" {
  if (type === "table") return "table";
  if (type === "image" || type === "signature") return "image";
  return "text";
}

export default function AdvancedTemplateEditor({
  template,
}: {
  template: AdvancedDocumentTemplate;
}) {
  const definition = getDocumentDefinition(template.documentType);
  const fieldDefinitions = new Map(definition.fields.map((field) => [field.key, field]));
  const initialTemplate = useRef(cloneTemplate(template.config.template as Template));
  const deletePageDialogRef = useRef<HTMLDialogElement>(null);
  const designerContainerRef = useRef<HTMLDivElement>(null);
  const designerRef = useRef<Designer | null>(null);
  const pluginsRef = useRef<Plugins | null>(null);
  const currentTemplateRef = useRef(initialTemplate.current);
  const pageFormatRef = useRef(template.config.pageFormat);
  const historyRef = useRef<HistoryEntry[]>([
    {
      pageFormat: template.config.pageFormat,
      template: cloneTemplate(initialTemplate.current),
    },
  ]);
  const historyIndexRef = useRef(0);
  const restoringHistoryRef = useRef(false);
  const saveFromDesignerRef = useRef<(next: Template) => void>(() => {});

  const [panelQuery, setPanelQuery] = useAdminQueryState("panel", "add", [
    "add",
    "layers",
    "data",
    "pages",
    "none",
  ]);
  const activePanel: ActivePanel = panelQuery === "none" ? null : panelQuery;
  const setActivePanel = (panel: ActivePanel) => setPanelQuery(panel ?? "none");
  const [addQuery, setAddQuery] = useAdminQueryState<string>("q", "");
  const [expandedBindingKey, setExpandedBindingKey] = useState<string | null>(null);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [canvasMode, setCanvasMode] = useAdminQueryState("canvas", "select", ["pan", "select"]);
  const [designerReady, setDesignerReady] = useState(false);
  const [stripQuery, setStripQuery] = useAdminQueryState("strip", "open", ["open", "closed"]);
  const documentStripOpen = stripQuery === "open";
  const [error, setError] = useState("");
  const [focusQuery] = useAdminQueryState("focus", "false", ["false", "true"]);
  const focusMode = focusQuery === "true";
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isDirty, setIsDirty] = useState(true);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [savingAction, setSavingAction] = useState<"draft" | "publish" | null>(null);
  const isSaving = savingAction !== null;
  const [name, setName] = useState(template.name);
  const [pageCount, setPageCount] = useState(initialTemplate.current.schemas.length);
  const [pageQuery, setPageQuery] = useAdminQueryState(
    "page",
    "1",
    Array.from({ length: pageCount }, (_, index) => String(index + 1)),
  );
  const currentPage = Number(pageQuery) - 1;
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const restoringPageRef = useRef(true);
  const setCurrentPage = (pageIndex: number) => {
    currentPageRef.current = pageIndex;
    restoringPageRef.current = true;
    setPageQuery(String(pageIndex + 1));
  };
  const [pageFormat, setPageFormat] = useState(template.config.pageFormat);
  const [pendingPageRemoval, setPendingPageRemoval] = useState<number | null>(null);
  const [sampleData, setSampleData] = useState(template.config.sampleData);
  const [form, setForm] = useState(template.config.form);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [selection, setSelection] = useState<DesignerSelection | null>(null);
  const [templateRevision, setTemplateRevision] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [zoom, setZoom] = useState(0.85);

  const selectedSchema = selection?.schemas[0] ?? null;
  const selectedPdfmeSchema = selectedSchema
    ? currentTemplateRef.current.schemas[selectedSchema.pageIndex]?.[selectedSchema.schemaIndex]
    : undefined;
  const selectedBindingType = selectedPdfmeSchema
    ? schemaBindingType(selectedPdfmeSchema.type)
    : null;
  const schemas = currentTemplateRef.current.schemas[currentPage] ?? [];
  const staticSchemas = blankBase(currentTemplateRef.current).staticSchema ?? [];
  const repeatingHeaderCount = staticSchemas.filter(
    (schema) => schema.smarttoolsRegion === "header",
  ).length;
  const repeatingFooterCount = staticSchemas.filter(
    (schema) => schema.smarttoolsRegion === "footer",
  ).length;

  useEffect(() => {
    smarttoolsBridge.deleteElement = () => deleteSelectedElement();
    smarttoolsBridge.toggleRepeat = () => {
      const region = (selectedPdfmeSchema as { smarttoolsRegion?: string } | undefined)
        ?.smarttoolsRegion;
      if (region) {
        const base = blankBase(currentTemplateRef.current);
        const index = (base.staticSchema ?? []).findIndex(
          (schema) => schema.name === selectedPdfmeSchema?.name,
        );
        if (index >= 0) restoreRepeatingRegion(index);
      } else {
        moveSelectionToRegion("header");
      }
    };
  });

  useEffect(() => {
    const dialog = deletePageDialogRef.current;
    if (!dialog) return;
    if (pendingPageRemoval !== null && !dialog.open) dialog.showModal();
    if (pendingPageRemoval === null && dialog.open) dialog.close();
  }, [pendingPageRemoval]);

  const layerItems = useMemo<LayerItem[]>(
    () =>
      schemas.map((schema, index) => ({
        id: `${currentPage}:${index}:${schema.name}`,
        index,
        schema,
      })),
    [currentPage, schemas, templateRevision],
  );

  const rememberTemplate = useCallback((next: Template) => {
    currentTemplateRef.current = cloneTemplate(next);
    setPageCount(next.schemas.length);
    setTemplateRevision((revision) => revision + 1);
    setIsDirty(true);

    if (restoringHistoryRef.current) return;
    const previous = historyRef.current[historyIndexRef.current] ?? historyRef.current[0];
    if (
      previous.pageFormat === pageFormatRef.current &&
      JSON.stringify(previous.template) === JSON.stringify(next)
    ) {
      return;
    }

    const history = historyRef.current.slice(0, historyIndexRef.current + 1);
    history.push({
      pageFormat: pageFormatRef.current,
      template: cloneTemplate(next),
    });
    if (history.length > HISTORY_LIMIT) history.shift();
    historyRef.current = history;
    historyIndexRef.current = history.length - 1;
    setHistoryIndex(historyIndexRef.current);
  }, []);

  const applyTemplate = useCallback((next: Template) => {
    designerRef.current?.updateTemplate(next);
  }, []);

  const persistTemplate = useCallback(
    async (publish: boolean, nextTemplate = currentTemplateRef.current) => {
      if (name.trim().length < 2) {
        setError("Template name must be at least 2 characters.");
        return;
      }

      const nextConfig: AdvancedTemplateConfig = {
        ...template.config,
        schemaVersion: 2,
        pageFormat,
        template: nextTemplate as unknown as AdvancedTemplateConfig["template"],
        sampleData,
        form,
      };
      const validation = validateAdvancedTemplateConfig(
        nextConfig,
        template.documentType,
        publish ? "publish" : "draft",
      );
      setWarnings(validation.warnings.map(({ message }) => message));
      if (!validation.valid) {
        setError(validation.errors.map(({ message }) => message).join(" "));
        return;
      }

      setError("");
      setSavingAction(publish ? "publish" : "draft");
      const formData = new FormData();
      formData.set("templateId", template.id);
      formData.set(
        "template",
        JSON.stringify({
          name: name.trim(),
          config: nextConfig,
        }),
      );

      try {
        if (publish) {
          await updateAndPublishTemplateAction(formData);
        } else {
          await updateTemplateAction(formData);
          setIsDirty(false);
          setSavedAt(new Date());
        }
      } catch (saveError) {
        setError(errorMessage(saveError));
      } finally {
        setSavingAction(null);
      }
    },
    [form, name, pageFormat, sampleData, template.config, template.id],
  );

  saveFromDesignerRef.current = (next) => {
    currentTemplateRef.current = cloneTemplate(next);
    void persistTemplate(false, next);
  };

  useEffect(() => {
    let disposed = false;
    const container = designerContainerRef.current;
    if (!container) return;

    void Promise.all([import("@pdfme/ui"), loadPlugins()])
      .then(([{ Designer: PdfmeDesigner }, plugins]) => {
        if (disposed) return;
        pluginsRef.current = plugins;
        const designer = new PdfmeDesigner({
          domContainer: container,
          template: cloneTemplate(initialTemplate.current),
          plugins,
          options: {
            sidebarOpen: false,
            zoomLevel: 0.85,
            theme: {
              token: {
                colorPrimary: "#315fea",
                borderRadius: 8,
                colorBorder: "#dce2eb",
                fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              },
            },
          },
        });
        designerRef.current = designer;
        designer.onChangeTemplate((next) => rememberTemplate(next));
        designer.onChangeSelection((next) => setSelection(next));
        designer.onPageChange(({ currentPage: page, totalPages }) => {
          if (page === currentPageRef.current) restoringPageRef.current = false;
          if (!restoringPageRef.current) {
            updateAdminQuery({ page: page > 0 ? String(page + 1) : null }, true);
          }
          setPageCount(totalPages);
        });
        designer.onSaveTemplate((next) => saveFromDesignerRef.current(next));
        designer.updateOptions({ sidebarOpen: false });
        setDesignerReady(true);
        window.setTimeout(() => {
          if (disposed) return;
          const pageIndex = currentPageRef.current;
          const firstPage = currentTemplateRef.current.schemas[pageIndex] ?? [];
          const schemaIndex = firstPage.findIndex((schema) =>
            schema.name.toLowerCase().includes("total"),
          );
          const selectedIndex = schemaIndex >= 0 ? schemaIndex : 0;
          const selected = firstPage[selectedIndex];
          designer.selectSchemas(
            selected ? [{ name: selected.name, pageIndex, schemaIndex: selectedIndex }] : [],
            { pageIndex, scroll: true },
          );
        }, 300);
      })
      .catch((loadError) => {
        if (!disposed) setError(errorMessage(loadError));
      });

    return () => {
      disposed = true;
      if (designerRef.current) {
        designerRef.current.destroy();
        designerRef.current = null;
      }
    };
  }, [rememberTemplate]);

  useEffect(() => {
    const container = designerContainerRef.current;
    if (!designerReady || !container) return;
    restoringPageRef.current = designerRef.current?.getPageCursor() !== currentPage;
    const scrollToPage = () => {
      const canvas = container.querySelector<HTMLElement>(".pdfme-designer-canvas");
      const paper = canvas?.querySelectorAll<HTMLElement>("div[style*=background-image]")[
        currentPage
      ];
      if (!canvas || !paper) return false;
      if (designerRef.current?.getPageCursor() === currentPage) restoringPageRef.current = false;
      // pdfme's selection API cannot navigate to an empty page; scroll its actual paper.
      canvas.scrollTop += paper.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
      return true;
    };
    if (scrollToPage()) return;
    const observer = new MutationObserver(() => {
      if (scrollToPage()) observer.disconnect();
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [currentPage, designerReady, pageCount]);

  useEffect(() => {
    if (!designerReady || canvasMode !== "pan") return;
    const canvas =
      designerContainerRef.current?.querySelector<HTMLElement>(".pdfme-designer-canvas");
    if (!canvas) return;

    let dragging = false;
    let previousX = 0;
    let previousY = 0;

    const startPan = (event: PointerEvent) => {
      dragging = true;
      previousX = event.clientX;
      previousY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    };
    const movePan = (event: PointerEvent) => {
      if (!dragging) return;
      canvas.scrollLeft -= event.clientX - previousX;
      canvas.scrollTop -= event.clientY - previousY;
      previousX = event.clientX;
      previousY = event.clientY;
      event.preventDefault();
      event.stopPropagation();
    };
    const stopPan = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", startPan, true);
    canvas.addEventListener("pointermove", movePan, true);
    canvas.addEventListener("pointerup", stopPan, true);
    canvas.addEventListener("pointercancel", stopPan, true);
    return () => {
      canvas.style.cursor = "";
      canvas.removeEventListener("pointerdown", startPan, true);
      canvas.removeEventListener("pointermove", movePan, true);
      canvas.removeEventListener("pointerup", stopPan, true);
      canvas.removeEventListener("pointercancel", stopPan, true);
    };
  }, [canvasMode, designerReady]);

  function togglePanel(panel: Exclude<ActivePanel, null>) {
    setActivePanel(activePanel === panel ? null : panel);
    if (panel !== "pages") setEditingRegion(null);
  }

  function openRegionPanel() {
    setActivePanel("pages");
    setEditingRegion(null);
  }

  function closePanels() {
    setActivePanel(null);
    setEditingRegion(null);
  }

  function restoreHistory(direction: -1 | 1) {
    const nextIndex = historyIndexRef.current + direction;
    const entry = historyRef.current[nextIndex];
    if (!entry) return;
    restoringHistoryRef.current = true;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    pageFormatRef.current = entry.pageFormat;
    setPageFormat(entry.pageFormat);
    setSelection(null);
    setEditingRegion(null);
    currentTemplateRef.current = cloneTemplate(entry.template);
    setPageCount(entry.template.schemas.length);
    designerRef.current?.updateTemplate(cloneTemplate(entry.template));
    restoringHistoryRef.current = false;
    setIsDirty(true);
    setTemplateRevision((revision) => revision + 1);
  }

  function changePageFormat(nextPageFormat: PageFormat) {
    if (nextPageFormat === pageFormatRef.current) return;
    const resized = resizeAdvancedTemplateConfig(
      {
        ...template.config,
        schemaVersion: 2,
        pageFormat: pageFormatRef.current,
        template: currentTemplateRef.current as unknown as AdvancedTemplateConfig["template"],
        sampleData,
        form,
      },
      template.documentType,
      nextPageFormat,
    );
    const nextTemplate = resized.template as unknown as Template;
    pageFormatRef.current = nextPageFormat;
    setPageFormat(nextPageFormat);
    setSelection(null);
    rememberTemplate(nextTemplate);
    designerRef.current?.updateTemplate(cloneTemplate(nextTemplate));
  }

  function updateZoom(next: number) {
    const value = Math.min(1.5, Math.max(0.4, next));
    setZoom(value);
    designerRef.current?.updateOptions({ zoomLevel: value });
  }

  function replacePageSchemas(nextSchemas: Schema[]) {
    const next = cloneTemplate(currentTemplateRef.current);
    next.schemas[currentPage] = nextSchemas;
    applyTemplate(next);
  }

  function addElement(tool: AddTool) {
    const plugin = pluginsRef.current?.[tool.pluginKey];
    if (!plugin) {
      setError(`${tool.label} is not available yet.`);
      return;
    }

    const next = cloneTemplate(currentTemplateRef.current);
    const page = next.schemas[currentPage];
    const schema = structuredClone(plugin.propPanel.defaultSchema);
    const usedNames = new Set(next.schemas.flat().map((item) => item.name));
    const baseName =
      tool.pluginKey === "qrcode"
        ? "qrCode"
        : tool.pluginKey === "code128"
          ? "barcode"
          : tool.pluginKey;
    let uniqueName = baseName;
    let suffix = 2;
    while (usedNames.has(uniqueName)) {
      uniqueName = `${baseName}${suffix}`;
      suffix += 1;
    }

    const basePdf = blankBase(next);
    const margin = Math.min(10, Math.max(3, basePdf.width * 0.05));
    const offset = (page.length % 5) * 3;
    schema.name = uniqueName;
    schema.width = Math.min(schema.width, basePdf.width - margin * 2);
    schema.height = Math.min(schema.height, basePdf.height - margin * 2);
    schema.position = {
      x: Math.min(margin + offset, basePdf.width - margin - schema.width),
      y: Math.min(margin + offset, basePdf.height - margin - schema.height),
    };
    const schemaIndex = page.push(schema);

    applyTemplate(next);
    const defaultContent = schema.content;
    if (typeof defaultContent === "string") {
      setSampleData((values) => ({
        ...values,
        [uniqueName]: defaultContent,
      }));
    }
    window.requestAnimationFrame(() => {
      designerRef.current?.selectSchemas(
        {
          name: uniqueName,
          pageIndex: currentPage,
          schemaIndex: schemaIndex - 1,
        },
        { pageIndex: currentPage, scroll: true },
      );
    });
  }

  function selectLayer(item: LayerItem) {
    designerRef.current?.selectSchemas(
      {
        name: item.schema.name,
        pageIndex: currentPage,
        schemaIndex: item.index,
      },
      { pageIndex: currentPage, scroll: true },
    );
  }

  function deleteSelectedElement() {
    const selected = selection?.schemas[0];
    if (!selected) return;
    const next = cloneTemplate(currentTemplateRef.current);
    next.schemas[selected.pageIndex]?.splice(selected.schemaIndex, 1);
    applyTemplate(next);
    setSelection(null);
  }

  function updateSelectedSchema(update: (schema: Schema) => void) {
    const selected = selection?.schemas[0];
    if (!selected) return;
    const next = cloneTemplate(currentTemplateRef.current);
    const schema = next.schemas[selected.pageIndex]?.[selected.schemaIndex];
    if (!schema) return;
    update(schema);
    applyTemplate(next);
  }

  function duplicateSelectedElement() {
    const selected = selection?.schemas[0];
    if (!selected) return;
    const next = cloneTemplate(currentTemplateRef.current);
    const source = next.schemas[selected.pageIndex]?.[selected.schemaIndex];
    if (!source) return;
    const duplicate = structuredClone(source);
    const usedNames = new Set(next.schemas.flat().map((schema) => schema.name));
    let suffix = 1;
    let nextName = `${source.name}Copy`;
    while (usedNames.has(nextName)) {
      suffix += 1;
      nextName = `${source.name}Copy${suffix}`;
    }
    duplicate.name = nextName;
    const basePdf = blankBase(next);
    duplicate.position = {
      x: Math.min(source.position.x + 3, basePdf.width - source.width),
      y: Math.min(source.position.y + 3, basePdf.height - source.height),
    };
    const schemaIndex = next.schemas[selected.pageIndex].push(duplicate) - 1;
    applyTemplate(next);
    window.requestAnimationFrame(() => {
      designerRef.current?.selectSchemas(
        {
          name: duplicate.name,
          pageIndex: selected.pageIndex,
          schemaIndex,
        },
        { pageIndex: selected.pageIndex, scroll: true },
      );
    });
  }

  function addPage() {
    const next = cloneTemplate(currentTemplateRef.current);
    next.schemas.push([]);
    applyTemplate(next);
    setSelection(null);
    setEditingRegion(null);
    setCurrentPage(next.schemas.length - 1);
  }

  function duplicatePage(pageIndex: number) {
    const next = cloneTemplate(currentTemplateRef.current);
    next.schemas.splice(
      pageIndex + 1,
      0,
      cloneTemplate({
        ...next,
        schemas: [next.schemas[pageIndex] ?? []],
      }).schemas[0],
    );
    applyTemplate(next);
    setSelection(null);
    setEditingRegion(null);
    setCurrentPage(pageIndex + 1);
  }

  function removePage(pageIndex: number) {
    if (currentTemplateRef.current.schemas.length === 1) return;
    const next = cloneTemplate(currentTemplateRef.current);
    next.schemas.splice(pageIndex, 1);
    applyTemplate(next);
    setSelection(null);
    setEditingRegion(null);
    setCurrentPage(Math.max(0, Math.min(pageIndex, next.schemas.length - 1)));
    setPendingPageRemoval(null);
  }

  function goToPage(pageIndex: number) {
    setSelection(null);
    setEditingRegion(null);
    setCurrentPage(pageIndex);
    const firstSchema = currentTemplateRef.current.schemas[pageIndex]?.[0];
    if (firstSchema) {
      designerRef.current?.selectSchemas(
        { name: firstSchema.name, pageIndex, schemaIndex: 0 },
        { pageIndex, scroll: true },
      );
    }
  }

  function bindSelection(name: string) {
    const selected = selection?.schemas[0];
    if (!selected) return;
    const selectedPdfmeSchema =
      currentTemplateRef.current.schemas[selected.pageIndex]?.[selected.schemaIndex];
    if (!selectedPdfmeSchema) return;
    const definitionField = fieldDefinitions.get(name);
    const formEntry = form.sections
      .flatMap((section) => section.entries)
      .find((entry) => entry.key === name);
    const bindingType = schemaBindingType(selectedPdfmeSchema.type);
    const isCompatible = definitionField
      ? definitionField.allowedBindingTypes.includes(bindingType)
      : formEntry?.kind === "repeater"
        ? bindingType === "table"
        : bindingType === "text";
    if (!isCompatible) {
      setError(`${name} cannot be bound to a ${selectedPdfmeSchema.type} element.`);
      return;
    }
    const next = cloneTemplate(currentTemplateRef.current);
    const schema = next.schemas[selected.pageIndex]?.[selected.schemaIndex];
    if (!schema) return;
    schema.name = name;
    schema.content = sampleData[name] ?? "";
    applyTemplate(next);
  }

  function setFormSections(sections: TemplateFormSection[]) {
    setForm({ sections });
    setIsDirty(true);
  }

  function updateSection(
    sectionId: string,
    update: (section: TemplateFormSection) => TemplateFormSection,
  ) {
    setFormSections(
      form.sections.map((section) => (section.id === sectionId ? update(section) : section)),
    );
  }

  function updateFormEntry(
    sectionId: string,
    key: string,
    update: (entry: TemplateFormEntry) => TemplateFormEntry,
  ) {
    updateSection(sectionId, (section) => ({
      ...section,
      entries: section.entries.map((entry) => (entry.key === key ? update(entry) : entry)),
    }));
  }

  function uniqueCustomKey(base: string) {
    const used = new Set(
      form.sections.flatMap((section) => section.entries.map((entry) => entry.key)),
    );
    let key = `custom.${base}`;
    let suffix = 2;
    while (used.has(key)) {
      key = `custom.${base}-${suffix}`;
      suffix += 1;
    }
    return key;
  }

  function addCustomSection() {
    setFormSections([
      ...form.sections,
      {
        id: `custom-section-${crypto.randomUUID()}`,
        label: "Custom section",
        entries: [],
      },
    ]);
  }

  function addCustomEntry(sectionId: string, kind: CustomTemplateFormEntry["kind"]) {
    const isRepeater = kind === "repeater";
    const key = uniqueCustomKey(isRepeater ? "table" : "field");
    const entry: CustomTemplateFormEntry = isRepeater
      ? {
          kind: "repeater",
          key,
          label: "Custom table",
          helpText: "",
          required: false,
          enabled: true,
          minRows: 0,
          columns: [
            {
              key: "value",
              label: "Value",
              control: "text",
              required: false,
            },
          ],
        }
      : {
          kind: "custom",
          key,
          label: "Custom field",
          helpText: "",
          required: false,
          enabled: true,
          control: "text",
        };
    updateSection(sectionId, (section) => ({
      ...section,
      entries: [...section.entries, entry],
    }));
    setSampleData((current) => ({ ...current, [key]: isRepeater ? "[]" : "" }));
  }

  function removeCustomEntry(sectionId: string, key: string) {
    updateSection(sectionId, (section) => ({
      ...section,
      entries: section.entries.filter((entry) => entry.key !== key),
    }));
  }

  function moveFormEntry(sourceSectionId: string, targetSectionId: string, key: string) {
    if (sourceSectionId === targetSectionId) return;
    const entry = form.sections
      .find((section) => section.id === sourceSectionId)
      ?.entries.find((candidate) => candidate.key === key);
    if (!entry) return;
    setFormSections(
      form.sections.map((section) => {
        if (section.id === sourceSectionId) {
          return {
            ...section,
            entries: section.entries.filter((candidate) => candidate.key !== key),
          };
        }
        if (section.id === targetSectionId) {
          return { ...section, entries: [...section.entries, entry] };
        }
        return section;
      }),
    );
  }

  function addRepeaterColumn(sectionId: string, entryKey: string) {
    updateFormEntry(sectionId, entryKey, (entry) => {
      if (entry.kind !== "repeater") return entry;
      const used = new Set(entry.columns.map((column) => column.key));
      let key = "column";
      let suffix = 2;
      while (used.has(key)) {
        key = `column-${suffix}`;
        suffix += 1;
      }
      return {
        ...entry,
        columns: [
          ...entry.columns,
          {
            key,
            label: "Column",
            control: "text",
            required: false,
          },
        ],
      };
    });
  }

  function moveSelectionToRegion(region: Region) {
    if (!selection?.schemas.length) {
      setError("Select one or more elements before creating a repeating region.");
      return;
    }
    const pageIndex = selection.pageIndex;
    const next = cloneTemplate(currentTemplateRef.current);
    const indices = selection.schemas
      .filter((selected) => selected.pageIndex === pageIndex)
      .map((selected) => selected.schemaIndex)
      .sort((a, b) => b - a);
    const moved: PdfmeSchema[] = [];
    for (const index of indices) {
      const [schema] = next.schemas[pageIndex].splice(index, 1);
      if (schema) {
        moved.unshift({
          ...(schema as PdfmeSchema),
          smarttoolsRegion: region,
        });
      }
    }
    const basePdf = blankBase(next);
    basePdf.staticSchema = [...(basePdf.staticSchema ?? []), ...moved];
    applyTemplate(next);
    setSelection(null);
    setEditingRegion(null);
  }

  function restoreRepeatingRegion(index: number) {
    const next = cloneTemplate(currentTemplateRef.current);
    const basePdf = blankBase(next);
    const staticSchema = [...(basePdf.staticSchema ?? [])];
    const [schema] = staticSchema.splice(index, 1);
    if (!schema) return;
    const { smarttoolsRegion: region, ...editableSchema } = schema;
    const schemaIndex = next.schemas[currentPage].push(editableSchema as Schema) - 1;
    basePdf.staticSchema = staticSchema;
    applyTemplate(next);
    setEditingRegion(region === "header" || region === "footer" ? region : null);
    window.requestAnimationFrame(() => {
      designerRef.current?.selectSchemas(
        {
          name: editableSchema.name,
          pageIndex: currentPage,
          schemaIndex,
        },
        { pageIndex: currentPage, scroll: true },
      );
    });
  }

  async function previewPdf() {
    setError("");
    setIsPreviewing(true);
    const previewWindow = window.open("", "_blank");
    try {
      const [{ generate }, plugins] = await Promise.all([
        import("@pdfme/generator"),
        pluginsRef.current ? Promise.resolve(pluginsRef.current) : loadPlugins(),
      ]);
      const pdf = await generate({
        template: currentTemplateRef.current,
        inputs: [sampleData],
        plugins,
      });
      const bytes = pdf.buffer.slice(
        pdf.byteOffset,
        pdf.byteOffset + pdf.byteLength,
      ) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      if (previewWindow) {
        previewWindow.location.href = url;
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${template.slug}-preview.pdf`;
        anchor.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (previewError) {
      previewWindow?.close();
      setError(errorMessage(previewError));
    } finally {
      setIsPreviewing(false);
    }
  }

  function renderPanel() {
    if (!activePanel) return null;

    const panelTitle = {
      add: "Add elements",
      layers: "Layers",
      data: "Fields & data",
      pages: "Pages",
    }[activePanel];
    const panelTitleId = `advanced-editor-${activePanel}-panel-title`;

    return (
      <aside
        aria-labelledby={panelTitleId}
        className="absolute bottom-5 left-[5.5rem] top-[4.625rem] z-30 flex min-h-0 max-h-[574px] w-[17.5rem] flex-col overflow-hidden rounded-r-xl rounded-bl-xl border border-border bg-card shadow-[0_8px_24px_rgba(17,18,20,0.06)]"
      >
        <div className="flex h-12 shrink-0 items-center justify-between px-3">
          <H3 id={panelTitleId}>{panelTitle}</H3>
          <Button
            aria-label={`Close ${activePanel} panel`}
            className="text-muted-foreground"
            onClick={closePanels}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" size={14} strokeWidth={1.75} />
          </Button>
        </div>

        {activePanel === "add" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-3 pb-3">
            <Label className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-muted px-2.5 text-muted-foreground focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
              <Search aria-hidden="true" size={15} />
              <input
                aria-label="Search elements"
                className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                onChange={(event) => setAddQuery(event.target.value, true)}
                placeholder="Search elements"
                type="search"
                value={addQuery}
              />
            </Label>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto">
              {ADD_TOOL_GROUPS.filter((group) => group !== "Codes").map((group) => {
                const visibleTools = ADD_TOOLS.filter((tool) => {
                  const displayGroup = tool.group === "Codes" ? "Fields" : tool.group;
                  const query = addQuery.trim().toLowerCase();
                  return (
                    displayGroup === group &&
                    (!query ||
                      tool.label.toLowerCase().includes(query) ||
                      tool.description.toLowerCase().includes(query))
                  );
                });
                return (
                  <section key={group}>
                    <Overline className="mb-1 block px-1 text-muted-foreground">
                      {group === "Fields" ? "Fields & codes" : group}
                    </Overline>
                    <div className="grid gap-1">
                      {visibleTools.map((tool) => {
                        const Icon = tool.icon;
                        return (
                          <button
                            aria-label={`Add ${tool.label}`}
                            className="group flex h-10 w-full items-center gap-2 rounded-lg px-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                            disabled={!designerReady}
                            key={tool.pluginKey}
                            onClick={() => addElement(tool)}
                            type="button"
                          >
                            <span className="grid size-7 shrink-0 place-items-center rounded text-foreground">
                              <Icon aria-hidden="true" size={15} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <Caption className="block text-foreground">{tool.label}</Caption>
                              <Caption className="block truncate text-muted-foreground">
                                {tool.description}
                              </Caption>
                            </span>
                            <Plus aria-hidden="true" className="text-muted-foreground" size={13} />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        ) : null}

        {activePanel === "layers" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <div className="mb-2 flex items-center justify-between text-muted-foreground">
              <Caption>
                {layerItems.length ? "Populated" : "Empty"} · Page {currentPage + 1}
              </Caption>
              <Caption className="rounded bg-muted px-1.5 py-0.5">
                {layerItems.length} elements
              </Caption>
            </div>
            {layerItems.length ? (
              <OrderableList
                ariaLabel={`Layers on page ${currentPage + 1}`}
                className="grid gap-1"
                getId={(item) => item.id}
                items={layerItems}
                onReorder={(items) => replacePageSchemas(items.map((item) => item.schema))}
                renderItem={(item, state) => (
                  <div
                    className={`flex h-8 items-center gap-1.5 rounded border px-1.5 ${
                      state.isDragging
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border bg-card"
                    }`}
                  >
                    <button
                      {...state.attributes}
                      {...state.listeners}
                      aria-label={`Reorder ${item.schema.name}`}
                      className="grid size-4 shrink-0 touch-none place-items-center text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      ref={state.setActivatorNodeRef}
                      type="button"
                    >
                      <GripVertical aria-hidden="true" size={12} />
                    </button>
                    <Type aria-hidden="true" className="shrink-0" size={13} />
                    <button
                      className="min-w-0 flex-1 truncate text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => selectLayer(item)}
                      type="button"
                    >
                      <Caption>{item.schema.name}</Caption>
                    </button>
                    <Overline className="mr-1 text-muted-foreground">{item.schema.type}</Overline>
                  </div>
                )}
              />
            ) : (
              <div className="grid place-items-center gap-1.5 rounded-lg bg-muted p-3 text-center">
                <span className="grid size-[34px] place-items-center rounded-md bg-card text-muted-foreground">
                  <Layers aria-hidden="true" size={17} />
                </span>
                <Caption className="block ">No elements yet</Caption>
                <Caption className="block text-muted-foreground">
                  Add an element to start this page.
                </Caption>
              </div>
            )}
          </div>
        ) : null}

        {activePanel === "data" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <div className="mb-3 flex h-10 items-center justify-between rounded-lg bg-muted px-3">
              <div>
                <Overline className="block text-muted-foreground">Document type</Overline>
                <Caption className="block ">{definition.label}</Caption>
              </div>
              <ChevronDown aria-hidden="true" className="text-muted-foreground" size={14} />
            </div>
            <Overline className="block mb-2 text-muted-foreground">Canvas bindings</Overline>
            <div className="grid gap-2">
              {Array.from(new Set(definition.fields.map((field) => field.section))).map(
                (fieldSection) => (
                  <section className="grid gap-1.5" key={fieldSection}>
                    <Overline className="text-muted-foreground">{fieldSection}</Overline>
                    {definition.fields
                      .filter((field) => field.section === fieldSection)
                      .map((field) => {
                        const readOnly = field.source !== "user";
                        const compatible =
                          selectedBindingType !== null &&
                          field.allowedBindingTypes.includes(selectedBindingType);
                        return (
                          <div
                            className="rounded-lg border border-border bg-card p-2"
                            key={field.key}
                          >
                            <div className="flex items-center gap-2">
                              <button
                                aria-expanded={expandedBindingKey === field.key}
                                className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() =>
                                  setExpandedBindingKey((key) =>
                                    key === field.key ? null : field.key,
                                  )
                                }
                                type="button"
                              >
                                <Caption className="block truncate text-foreground">
                                  {field.label}
                                </Caption>
                                <Caption className="block mt-0.5 truncate text-muted-foreground">
                                  {field.key}
                                </Caption>
                              </button>
                              <Button
                                className="h-6 px-2"
                                disabled={!selectedSchema || !compatible}
                                onClick={() => {
                                  setExpandedBindingKey(field.key);
                                  bindSelection(field.key);
                                }}
                                size="xs"
                                type="button"
                                variant="ghost"
                              >
                                Bind
                              </Button>
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <StatusBadge className="px-1.5 py-0">{field.source}</StatusBadge>
                              <StatusBadge className="px-1.5 py-0">{field.valueType}</StatusBadge>
                              <Text className="min-w-0 truncate text-muted-foreground">
                                {String(sampleData[field.key] ?? field.sampleValue ?? "No sample")}
                              </Text>
                            </div>
                            {expandedBindingKey === field.key ? (
                              <Textarea
                                aria-label={`${field.label} sample value`}
                                className="mt-2 min-h-10 resize-y rounded-md border border-input bg-background px-2 py-1.5 outline-none read-only:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                                onChange={(event) => {
                                  if (readOnly) return;
                                  setSampleData((values) => ({
                                    ...values,
                                    [field.key]: event.target.value,
                                  }));
                                  setIsDirty(true);
                                }}
                                readOnly={readOnly}
                                value={sampleData[field.key] ?? String(field.sampleValue ?? "")}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                  </section>
                ),
              )}
            </div>

            <details className="mt-4 border-t border-border pt-3">
              <summary className="cursor-pointer text-muted-foreground">
                <Strong>Published form configuration</Strong>
              </summary>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div>
                  <H3>Published form</H3>
                  <Caption className="block text-muted-foreground">
                    Drag handles work with pointer and keyboard.
                  </Caption>
                </div>
                <Button onClick={addCustomSection} size="sm" type="button" variant="secondary">
                  <Plus aria-hidden="true" size={14} />
                  Section
                </Button>
              </div>

              <OrderableList
                ariaLabel="Form sections"
                className="mt-3 grid gap-3"
                getId={(section) => section.id}
                getLabel={(section) => section.label}
                items={form.sections}
                onReorder={setFormSections}
                renderItem={(section, sectionOrderState) => (
                  <section className="rounded-xl border border-border bg-background p-3">
                    <div className="flex items-center gap-2">
                      <Button
                        {...sectionOrderState.attributes}
                        {...sectionOrderState.listeners}
                        aria-label={`Reorder ${section.label} section`}
                        className="grid size-8 shrink-0 touch-none place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                        ref={sectionOrderState.setActivatorNodeRef}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <GripVertical aria-hidden="true" className="size-[15px]" />
                      </Button>
                      <Input
                        aria-label="Section label"
                        className="h-8"
                        onChange={(event) =>
                          updateSection(section.id, (current) => ({
                            ...current,
                            label: event.target.value,
                          }))
                        }
                        value={section.label}
                      />
                      {section.entries.every((entry) => entry.kind !== "builtin") ? (
                        <Button
                          aria-label={`Remove ${section.label} section`}
                          onClick={() =>
                            setFormSections(
                              form.sections.filter((candidate) => candidate.id !== section.id),
                            )
                          }
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <X aria-hidden="true" size={14} />
                        </Button>
                      ) : null}
                    </div>

                    <OrderableList
                      ariaLabel={`Fields in ${section.label}`}
                      className="mt-3 grid gap-2"
                      getId={(entry) => entry.key}
                      getLabel={(entry) => entry.label}
                      items={section.entries}
                      onReorder={(entries) =>
                        updateSection(section.id, (current) => ({
                          ...current,
                          entries,
                        }))
                      }
                      renderItem={(entry, entryOrderState) => {
                        const definitionField =
                          entry.kind === "builtin" ? fieldDefinitions.get(entry.key) : undefined;
                        const coreField = Boolean(
                          definitionField?.required || definitionField?.computationRequired,
                        );
                        const compatible =
                          selectedBindingType !== null &&
                          (definitionField
                            ? definitionField.allowedBindingTypes.includes(selectedBindingType)
                            : entry.kind === "repeater"
                              ? selectedBindingType === "table"
                              : selectedBindingType === "text");
                        return (
                          <div className="grid gap-2 rounded-lg border border-border bg-card p-2.5">
                            <div className="flex items-center gap-2">
                              <Button
                                {...entryOrderState.attributes}
                                {...entryOrderState.listeners}
                                aria-label={`Reorder ${entry.label}`}
                                className="grid size-8 shrink-0 touch-none place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                                ref={entryOrderState.setActivatorNodeRef}
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                              >
                                <GripVertical aria-hidden="true" className="size-3.5" />
                              </Button>
                              <Input
                                aria-label={`${entry.key} label`}
                                className="h-8 min-w-0"
                                onChange={(event) =>
                                  updateFormEntry(section.id, entry.key, (current) => ({
                                    ...current,
                                    label: event.target.value,
                                  }))
                                }
                                value={entry.label}
                              />
                              <Button
                                className="h-auto rounded-md px-2 py-1"
                                disabled={!selectedSchema || !compatible}
                                onClick={() => bindSelection(entry.key)}
                                size="xs"
                                type="button"
                                variant="ghost"
                              >
                                Bind
                              </Button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge>
                                {entry.kind === "builtin" ? definitionField?.source : "custom"}
                              </StatusBadge>
                              <Text className="max-w-48 truncate text-muted-foreground">
                                {entry.key}
                              </Text>
                              <span className="ml-auto flex items-center gap-1">
                                <CheckboxControl
                                  className="size-4"
                                  id={`${section.id}-${entry.key}-enabled`}
                                  checked={entry.enabled}
                                  disabled={coreField}
                                  onCheckedChange={(checked) =>
                                    updateFormEntry(section.id, entry.key, (current) => ({
                                      ...current,
                                      enabled: checked === true,
                                    }))
                                  }
                                />
                                <Label
                                  className="text-foreground"
                                  htmlFor={`${section.id}-${entry.key}-enabled`}
                                >
                                  Enabled
                                </Label>
                              </span>
                              <span className="flex items-center gap-1">
                                <CheckboxControl
                                  className="size-4"
                                  id={`${section.id}-${entry.key}-required`}
                                  checked={entry.required}
                                  disabled={coreField}
                                  onCheckedChange={(checked) =>
                                    updateFormEntry(section.id, entry.key, (current) => ({
                                      ...current,
                                      required: checked === true,
                                    }))
                                  }
                                />
                                <Label
                                  className="text-foreground"
                                  htmlFor={`${section.id}-${entry.key}-required`}
                                >
                                  Required
                                </Label>
                              </span>
                            </div>

                            <Input
                              aria-label={`${entry.label} help text`}
                              className="h-8"
                              onChange={(event) =>
                                updateFormEntry(section.id, entry.key, (current) => ({
                                  ...current,
                                  helpText: event.target.value,
                                }))
                              }
                              placeholder="Optional help text"
                              value={entry.helpText ?? ""}
                            />

                            <Field
                              className="gap-1 [&_[data-slot=field-label]]:text-foreground"
                              htmlFor={`${section.id}-${entry.key}-section`}
                              label="Move to section"
                            >
                              <Select
                                className="h-8"
                                onChange={(event) =>
                                  moveFormEntry(section.id, event.target.value, entry.key)
                                }
                                value={section.id}
                              >
                                {form.sections.map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.label}
                                  </option>
                                ))}
                              </Select>
                            </Field>

                            {entry.kind === "custom" ? (
                              <>
                                <Field
                                  className="gap-1 [&_[data-slot=field-label]]:text-foreground"
                                  htmlFor={`${section.id}-${entry.key}-control`}
                                  label="Control"
                                >
                                  <Select
                                    className="h-8"
                                    onChange={(event) =>
                                      updateFormEntry(section.id, entry.key, (current) =>
                                        current.kind === "custom"
                                          ? {
                                              ...current,
                                              control: event.target.value as typeof current.control,
                                            }
                                          : current,
                                      )
                                    }
                                    value={entry.control}
                                  >
                                    {CUSTOM_FIELD_CONTROLS.map((control) => (
                                      <option key={control}>{control}</option>
                                    ))}
                                  </Select>
                                </Field>
                                {entry.control === "select" ? (
                                  <Input
                                    aria-label={`${entry.label} select options`}
                                    className="h-8"
                                    onChange={(event) =>
                                      updateFormEntry(section.id, entry.key, (current) =>
                                        current.kind === "custom"
                                          ? {
                                              ...current,
                                              options: event.target.value
                                                .split(",")
                                                .map((value) => value.trim())
                                                .filter(Boolean),
                                            }
                                          : current,
                                      )
                                    }
                                    placeholder="Option one, option two"
                                    value={entry.options?.join(", ") ?? ""}
                                  />
                                ) : null}
                              </>
                            ) : null}

                            {entry.kind === "repeater" ? (
                              <div className="grid gap-2 rounded-lg bg-muted/40 p-2">
                                <Field
                                  className="gap-1 [&_[data-slot=field-label]]:text-foreground"
                                  htmlFor={`${section.id}-${entry.key}-min-rows`}
                                  label="Minimum rows"
                                >
                                  <Input
                                    className="h-8"
                                    max={MAX_RUNTIME_REPEATER_ROWS}
                                    min={0}
                                    onChange={(event) =>
                                      updateFormEntry(section.id, entry.key, (current) =>
                                        current.kind === "repeater"
                                          ? {
                                              ...current,
                                              minRows: Number(event.target.value || 0),
                                            }
                                          : current,
                                      )
                                    }
                                    type="number"
                                    value={entry.minRows ?? 0}
                                  />
                                </Field>
                                <OrderableList
                                  ariaLabel={`${entry.label} columns`}
                                  className="grid gap-1.5"
                                  getId={(column) => column.key}
                                  getLabel={(column) => column.label}
                                  items={entry.columns}
                                  onReorder={(columns) =>
                                    updateFormEntry(section.id, entry.key, (current) =>
                                      current.kind === "repeater"
                                        ? { ...current, columns }
                                        : current,
                                    )
                                  }
                                  renderItem={(column, columnOrderState) => (
                                    <div className="grid grid-cols-[2rem_1fr_7rem_2rem] items-center gap-1 rounded-md border border-border bg-background p-1">
                                      <Button
                                        {...columnOrderState.attributes}
                                        {...columnOrderState.listeners}
                                        aria-label={`Reorder ${column.label} column`}
                                        className="grid size-8 touch-none place-items-center rounded text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                                        ref={columnOrderState.setActivatorNodeRef}
                                        size="icon-sm"
                                        type="button"
                                        variant="ghost"
                                      >
                                        <GripVertical aria-hidden="true" className="size-[13px]" />
                                      </Button>
                                      <Input
                                        aria-label={`${column.key} column label`}
                                        className="h-8"
                                        onChange={(event) =>
                                          updateFormEntry(section.id, entry.key, (current) =>
                                            current.kind === "repeater"
                                              ? {
                                                  ...current,
                                                  columns: current.columns.map((candidate) =>
                                                    candidate.key === column.key
                                                      ? {
                                                          ...candidate,
                                                          label: event.target.value,
                                                        }
                                                      : candidate,
                                                  ),
                                                }
                                              : current,
                                          )
                                        }
                                        value={column.label}
                                      />
                                      <Select
                                        aria-label={`${column.label} control`}
                                        className="h-8"
                                        onChange={(event) =>
                                          updateFormEntry(section.id, entry.key, (current) =>
                                            current.kind === "repeater"
                                              ? {
                                                  ...current,
                                                  columns: current.columns.map((candidate) =>
                                                    candidate.key === column.key
                                                      ? {
                                                          ...candidate,
                                                          control: event.target
                                                            .value as typeof candidate.control,
                                                        }
                                                      : candidate,
                                                  ),
                                                }
                                              : current,
                                          )
                                        }
                                        value={column.control}
                                      >
                                        {CUSTOM_FIELD_CONTROLS.map((control) => (
                                          <option key={control}>{control}</option>
                                        ))}
                                      </Select>
                                      <Button
                                        aria-label={`Remove ${column.label} column`}
                                        disabled={entry.columns.length === 1}
                                        onClick={() =>
                                          updateFormEntry(section.id, entry.key, (current) =>
                                            current.kind === "repeater"
                                              ? {
                                                  ...current,
                                                  columns: current.columns.filter(
                                                    (candidate) => candidate.key !== column.key,
                                                  ),
                                                }
                                              : current,
                                          )
                                        }
                                        size="icon"
                                        type="button"
                                        variant="ghost"
                                      >
                                        <X aria-hidden="true" size={13} />
                                      </Button>
                                      {column.control === "select" ? (
                                        <Input
                                          aria-label={`${column.label} options`}
                                          className="col-span-4 h-8"
                                          onChange={(event) =>
                                            updateFormEntry(section.id, entry.key, (current) =>
                                              current.kind === "repeater"
                                                ? {
                                                    ...current,
                                                    columns: current.columns.map((candidate) =>
                                                      candidate.key === column.key
                                                        ? {
                                                            ...candidate,
                                                            options: event.target.value
                                                              .split(",")
                                                              .map((value) => value.trim())
                                                              .filter(Boolean),
                                                          }
                                                        : candidate,
                                                    ),
                                                  }
                                                : current,
                                            )
                                          }
                                          placeholder="Option one, option two"
                                          value={column.options?.join(", ") ?? ""}
                                        />
                                      ) : null}
                                    </div>
                                  )}
                                />
                                <Button
                                  onClick={() => addRepeaterColumn(section.id, entry.key)}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  <Plus aria-hidden="true" size={13} />
                                  Column
                                </Button>
                              </div>
                            ) : null}

                            <Textarea
                              aria-label={`${entry.label} sample value`}
                              className="min-h-12 resize-y rounded-lg border border-input bg-background px-2.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onChange={(event) => {
                                setSampleData((values) => ({
                                  ...values,
                                  [entry.key]: event.target.value,
                                }));
                                setIsDirty(true);
                              }}
                              value={sampleData[entry.key] ?? ""}
                            />

                            {entry.kind !== "builtin" ? (
                              <Button
                                onClick={() => removeCustomEntry(section.id, entry.key)}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                Remove custom field
                              </Button>
                            ) : null}
                          </div>
                        );
                      }}
                    />

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => addCustomEntry(section.id, "custom")}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Add custom field
                      </Button>
                      <Button
                        onClick={() => addCustomEntry(section.id, "repeater")}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Add repeatable table
                      </Button>
                    </div>
                  </section>
                )}
              />
            </details>
          </div>
        ) : null}

        {activePanel === "pages" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <div className="flex items-center justify-between text-muted-foreground">
              <Overline>Document pages</Overline>
              <button
                className="text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={addPage}
                type="button"
              >
                <Caption>+ Add</Caption>
              </button>
            </div>
            <div className="mt-2 flex h-9 items-center rounded-lg border border-border bg-muted/60 p-1">
              <Button
                aria-label="Previous document page"
                className="size-7 shrink-0"
                disabled={currentPage === 0}
                onClick={() => goToPage(currentPage - 1)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronDown
                  aria-hidden="true"
                  className="rotate-90"
                  size={13}
                  strokeWidth={1.75}
                />
              </Button>
              <button
                className="min-w-0 flex-1 truncate text-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => goToPage(currentPage)}
                type="button"
              >
                <Caption>Page </Caption>
                <Caption>{currentPage + 1}</Caption>
                <Caption> of </Caption>
                <Caption>{pageCount}</Caption>
              </button>
              <Button
                aria-label="Next document page"
                className="size-7 shrink-0"
                disabled={currentPage >= pageCount - 1}
                onClick={() => goToPage(currentPage + 1)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronDown
                  aria-hidden="true"
                  className="-rotate-90"
                  size={13}
                  strokeWidth={1.75}
                />
              </Button>
              <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
              <Button
                aria-label="Add document page"
                className="size-7 shrink-0"
                onClick={addPage}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Plus aria-hidden="true" size={13} strokeWidth={1.75} />
              </Button>
            </div>
            <div className="mt-2 grid gap-1.5">
              {currentTemplateRef.current.schemas.map((page, index) => (
                <div
                  className={`flex h-12 items-center gap-2 rounded-lg border px-2 ${
                    currentPage === index ? "border-primary bg-primary/10" : "border-border bg-card"
                  }`}
                  key={`page-${index}`}
                >
                  <button
                    aria-current={currentPage === index ? "page" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => goToPage(index)}
                    type="button"
                  >
                    <Text
                      className={`grid h-8 w-7 shrink-0 place-items-center rounded border bg-card ${
                        currentPage === index ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {index + 1}
                    </Text>
                    <span className="min-w-0">
                      <Caption className="block">Page {index + 1}</Caption>
                      <Caption className="block text-muted-foreground">
                        {page.length} elements
                      </Caption>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      aria-label={`Duplicate page ${index + 1}`}
                      className="grid size-6 place-items-center rounded text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => duplicatePage(index)}
                      type="button"
                    >
                      <FilePlus2 aria-hidden="true" size={12} strokeWidth={1.75} />
                    </button>
                    <button
                      aria-label={`Remove page ${index + 1}`}
                      className="grid size-8 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                      disabled={pageCount === 1}
                      onClick={() => setPendingPageRemoval(index)}
                      type="button"
                    >
                      <X aria-hidden="true" size={12} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <Overline className="text-muted-foreground">Repeating regions</Overline>
                <Caption
                  className={selection?.schemas.length ? "text-primary" : "text-muted-foreground"}
                >
                  {selection?.schemas.length ? "Elements ready" : "No selection"}
                </Caption>
              </div>
              <div className="mt-2 grid gap-2">
                {(["header", "footer"] as const).map((region) => {
                  const Icon = region === "header" ? PanelTop : PanelBottom;
                  const assigned =
                    region === "header" ? repeatingHeaderCount : repeatingFooterCount;
                  const editing = editingRegion === region;
                  const ready = Boolean(selection?.schemas.length);
                  const state = editing
                    ? "Editing"
                    : assigned
                      ? `${assigned} assigned`
                      : ready
                        ? "Ready to assign"
                        : "Not assigned";
                  return (
                    <div
                      className={`flex h-11 items-center gap-2 rounded-lg border px-2.5 ${
                        editing
                          ? "border-primary bg-primary/10"
                          : assigned
                            ? "border-primary/30 bg-primary/5"
                            : "border-border bg-muted/50"
                      }`}
                      key={region}
                    >
                      <Icon
                        aria-hidden="true"
                        className={editing || assigned ? "text-primary" : "text-muted-foreground"}
                        size={14}
                        strokeWidth={1.75}
                      />
                      <div className="min-w-0 flex-1">
                        <Caption className="block ">{region}</Caption>
                        <Muted
                          className={` ${editing || assigned ? "text-primary" : "text-muted-foreground"}`}
                        >
                          {state}
                        </Muted>
                      </div>
                      <Button
                        className="h-6 px-2"
                        disabled={!ready}
                        onClick={() => moveSelectionToRegion(region)}
                        size="xs"
                        type="button"
                        variant="ghost"
                      >
                        Assign
                      </Button>
                    </div>
                  );
                })}
              </div>
              {staticSchemas.length ? (
                <div className="mt-3 grid gap-1">
                  <Overline className="block text-muted-foreground">Assigned elements</Overline>
                  {staticSchemas.map((schema, index) => {
                    const region = schema.smarttoolsRegion as Region | undefined;
                    const editing = editingRegion === region;
                    return (
                      <div
                        className={`flex h-8 items-center justify-between gap-2 rounded-md border px-2 ${editing ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                        key={`${schema.name}-${index}`}
                      >
                        <Text className="min-w-0 truncate">
                          {schema.name} · {String(region ?? "repeat")}
                        </Text>
                        <Button
                          className="h-6 px-2"
                          onClick={() => restoreRepeatingRegion(index)}
                          size="xs"
                          type="button"
                          variant="ghost"
                        >
                          Edit on canvas
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>
    );
  }

  return (
    <>
      <div className="grid min-h-screen place-items-center bg-muted p-6 lg:hidden">
        <Card className="max-w-md gap-0 rounded-2xl p-6 text-center shadow-sm">
          <Maximize2 aria-hidden="true" className="mx-auto text-primary" size={28} />
          <H1 className="mt-4">Open the advanced designer on desktop</H1>
          <Muted className="mt-2 text-muted-foreground">
            Freeform positioning needs a larger workspace. You can still preview and use published
            templates from smaller devices.
          </Muted>
          <Link
            className={buttonVariants({ className: "mt-5", variant: "secondary" })}
            href="/admin/templates"
          >
            Back to templates
          </Link>
        </Card>
      </div>

      <main className="relative hidden h-dvh min-w-[1024px] flex-col overflow-hidden bg-background lg:flex">
        <header className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border bg-card px-4">
          <Link
            aria-label="Back to template lifecycle"
            className={buttonVariants({
              className: "!size-9 shrink-0 text-muted-foreground",
              size: "icon",
              variant: "ghost",
            })}
            href="/admin/templates"
          >
            <ArrowLeft aria-hidden="true" size={17} />
          </Link>
          <div className="w-[18.75rem] min-w-0 shrink-0">
            <div className="flex h-8 items-center gap-2">
              <Input
                aria-label="Template name"
                className="h-7 min-w-20 max-w-[210px] [field-sizing:content] bg-transparent text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => {
                  setName(event.target.value);
                  setIsDirty(true);
                }}
                value={name}
              />
              <Text
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 ${
                  template.status === "published"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    template.status === "published" ? "bg-emerald-600" : "bg-amber-600"
                  }`}
                />
                {template.status}
              </Text>
            </div>
            <Caption className="block truncate text-muted-foreground">
              Templates / Advanced · {definition.label} · {PAGE_FORMAT_LABELS[pageFormat]} · Version{" "}
              {template.version}
            </Caption>
          </div>
          <span className="flex h-9 w-[118px] shrink-0 items-center rounded-lg border border-border bg-muted">
            <Select
              aria-label="Page size"
              className="h-9 w-full border-0 bg-transparent px-2.5 shadow-none"
              disabled={!designerReady || isSaving}
              onChange={(event) => changePageFormat(event.target.value as PageFormat)}
              value={pageFormat}
            >
              {definition.allowedPageFormats.map((format) => (
                <option key={format} value={format}>
                  {definition.label} · {PAGE_FORMAT_LABELS[format]}
                </option>
              ))}
            </Select>
          </span>

          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            <Button
              aria-label="Undo"
              disabled={historyIndex === 0}
              onClick={() => restoreHistory(-1)}
              className="size-9 text-muted-foreground"
              size="icon"
              type="button"
              variant="ghost"
            >
              <Undo2 aria-hidden="true" size={16} />
            </Button>
            <Button
              aria-label="Redo"
              disabled={historyIndex >= historyRef.current.length - 1}
              onClick={() => restoreHistory(1)}
              className="size-9 text-muted-foreground"
              size="icon"
              type="button"
              variant="ghost"
            >
              <Redo2 aria-hidden="true" size={16} />
            </Button>
            <Button
              className="h-9 px-3.5"
              disabled={!designerReady || isPreviewing}
              loading={isPreviewing}
              onClick={() => void previewPdf()}
              size="sm"
              type="button"
              variant="secondary"
            >
              Preview
            </Button>
            <Caption
              className={`min-w-14 text-right ${
                isPreviewing
                  ? "text-primary"
                  : isSaving
                    ? "text-muted-foreground"
                    : isDirty
                      ? "text-amber-700"
                      : savedAt
                        ? "text-emerald-700"
                        : "text-muted-foreground"
              }`}
            >
              {isPreviewing
                ? "Previewing…"
                : isSaving
                  ? "Saving…"
                  : isDirty
                    ? "Unsaved"
                    : savedAt
                      ? "Saved just now"
                      : `Version ${template.version}`}
            </Caption>
            <Button
              className="h-9 px-3.5"
              disabled={isSaving || name.trim().length < 2}
              loading={savingAction === "draft"}
              onClick={() =>
                startTransition(() => {
                  void persistTemplate(false);
                })
              }
              size="sm"
              type="button"
              variant="secondary"
            >
              Save draft
            </Button>
            <Button
              className="h-9 px-4"
              disabled={isSaving || name.trim().length < 2}
              loading={savingAction === "publish"}
              onClick={() =>
                startTransition(() => {
                  void persistTemplate(true);
                })
              }
              size="sm"
              type="button"
            >
              Publish v{template.version}
            </Button>
            <Button
              aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
              className="size-9 text-foreground"
              onClick={() => {
                updateAdminQuery({ focus: focusMode ? null : "true", panel: "none" });
                setEditingRegion(null);
                designerRef.current?.updateOptions({ sidebarOpen: false });
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Maximize2 aria-hidden="true" size={16} />
            </Button>
          </div>
        </header>

        {error ? (
          <AlertBanner
            action={
              <Button
                aria-label="Dismiss error"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setError("")}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" size={14} />
              </Button>
            }
            className="min-h-10 shrink-0 rounded-none border-x-0 border-t-0 border-b border-destructive/20 px-4 py-2 text-destructive"
            variant="error"
          >
            {error}
          </AlertBanner>
        ) : null}
        {warnings.length ? (
          <details className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-amber-900">
            <summary className="cursor-pointer">
              <Strong>{warnings.length}</Strong>
              <Strong> non-blocking publish</Strong>
              <Strong> </Strong>
              <Strong>{warnings.length === 1 ? "warning" : "warnings"}</Strong>
            </summary>
            <List className="mt-2 list-disc space-y-1 pl-5">
              {warnings.map((warning) => (
                <li key={warning}>
                  <Text>{warning}</Text>
                </li>
              ))}
            </List>
          </details>
        ) : null}

        <div className="relative flex min-h-0 flex-1">
          {!focusMode ? (
            <nav
              aria-label="Designer tools"
              className={`absolute left-11 top-1/2 z-40 flex w-12 -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-xl bg-card p-2 shadow-[0_8px_20px_rgba(17,18,20,0.06)] ${
                activePanel ? "border-y border-l border-input" : "border border-input"
              }`}
            >
              <Button
                aria-pressed={activePanel === null}
                className={panelButtonClass(activePanel === null)}
                onClick={() => {
                  setCanvasMode("select");
                  closePanels();
                }}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <MousePointer2 aria-hidden="true" size={16} strokeWidth={1.75} />
                <span className="sr-only">Select</span>
              </Button>
              <Button
                aria-label="Add elements"
                aria-pressed={activePanel === "add"}
                className={panelButtonClass(activePanel === "add")}
                onClick={() => togglePanel("add")}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <CirclePlus aria-hidden="true" size={16} strokeWidth={1.75} />
                <span className="sr-only">Add</span>
              </Button>
              <Button
                aria-pressed={activePanel === "layers"}
                className={panelButtonClass(activePanel === "layers")}
                onClick={() => togglePanel("layers")}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Layers aria-hidden="true" size={16} strokeWidth={1.75} />
                <span className="sr-only">Layers</span>
              </Button>
              <span aria-hidden="true" className="h-px w-6 bg-border" />
              <Button
                aria-pressed={activePanel === "data"}
                className={panelButtonClass(activePanel === "data")}
                onClick={() => togglePanel("data")}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <TextCursorInput aria-hidden="true" size={16} strokeWidth={1.75} />
                <span className="sr-only">Fields</span>
              </Button>
              <Button
                aria-pressed={activePanel === "pages"}
                className={panelButtonClass(activePanel === "pages")}
                onClick={() => togglePanel("pages")}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Files aria-hidden="true" size={16} strokeWidth={1.75} />
                <span className="sr-only">Pages</span>
              </Button>
            </nav>
          ) : null}

          <section
            aria-label="Template canvas"
            className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[oklch(0.965_0.004_255)]"
          >
            {!focusMode ? (
              <div className="flex h-[54px] shrink-0 items-center border-b border-border bg-card px-3.5">
                <div className="flex h-full w-[292px] items-center gap-1 border-r border-border px-3.5">
                  <Overline className="mr-1 text-muted-foreground">Canvas</Overline>
                  <Button
                    aria-label="Select tool"
                    aria-pressed={canvasMode === "select"}
                    className={
                      canvasMode === "select"
                        ? "bg-accent text-accent-foreground ring-1 ring-inset ring-primary hover:bg-accent"
                        : undefined
                    }
                    onClick={() => setCanvasMode("select")}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <MousePointer2 aria-hidden="true" size={15} />
                  </Button>
                  <Button
                    aria-label="Pan canvas"
                    aria-pressed={canvasMode === "pan"}
                    className={
                      canvasMode === "pan"
                        ? "bg-accent text-accent-foreground ring-1 ring-inset ring-primary hover:bg-accent"
                        : undefined
                    }
                    onClick={() => setCanvasMode("pan")}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Hand aria-hidden="true" size={15} />
                  </Button>
                  <Button
                    aria-label="Fit canvas"
                    onClick={() => updateZoom(0.85)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Scan aria-hidden="true" size={15} />
                  </Button>
                  <Caption className="ml-1 truncate rounded-md border border-border bg-muted px-2 py-1.5">
                    {definition.label} · {PAGE_FORMAT_LABELS[pageFormat]}
                  </Caption>
                </div>

                <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
                  <Button
                    aria-label="Previous page"
                    disabled={currentPage === 0}
                    onClick={() => goToPage(currentPage - 1)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronDown aria-hidden="true" className="rotate-90" size={14} />
                  </Button>
                  <Caption className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5">
                    <File aria-hidden="true" className="text-muted-foreground" size={13} />
                    {currentPage + 1} / {pageCount}
                  </Caption>
                  <Button
                    aria-label="Next page"
                    disabled={currentPage >= pageCount - 1}
                    onClick={() => goToPage(currentPage + 1)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronDown aria-hidden="true" className="-rotate-90" size={14} />
                  </Button>
                  <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
                  <Button
                    aria-label="Zoom out"
                    onClick={() => updateZoom(zoom - 0.1)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Minus aria-hidden="true" size={14} />
                  </Button>
                  <Caption className="min-w-12 text-center">{Math.round(zoom * 100)}%</Caption>
                  <Button
                    aria-label="Zoom in"
                    onClick={() => updateZoom(zoom + 0.1)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Plus aria-hidden="true" size={14} />
                  </Button>
                  <Button
                    aria-label="Fit page to view"
                    onClick={() => updateZoom(0.85)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Maximize2 aria-hidden="true" size={14} />
                  </Button>
                  <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
                  <Button
                    aria-label="Undo canvas change"
                    disabled={historyIndex === 0}
                    onClick={() => restoreHistory(-1)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Undo2 aria-hidden="true" size={14} />
                  </Button>
                  <Button
                    aria-label="Redo canvas change"
                    disabled={historyIndex >= historyRef.current.length - 1}
                    onClick={() => restoreHistory(1)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Redo2 aria-hidden="true" size={14} />
                  </Button>
                </div>

                <div className="flex h-full w-[336px] items-center justify-end gap-1 border-l border-border pl-3">
                  <Overline className="mr-1 max-w-16 truncate text-muted-foreground">
                    {selectedPdfmeSchema ? selectedPdfmeSchema.type : "No selection"}
                  </Overline>
                  {selectedPdfmeSchema ? (
                    <>
                      <Caption className="w-[108px] truncate rounded bg-muted px-2 py-2">
                        {selectedPdfmeSchema.name} · {String(selectedPdfmeSchema.fontSize ?? 12)} px
                      </Caption>
                      <Button
                        aria-label="Bold selected text"
                        className={
                          (selectedPdfmeSchema as { fontWeight?: string }).fontWeight === "bold"
                            ? "bg-accent text-accent-foreground ring-1 ring-inset ring-primary hover:bg-accent"
                            : undefined
                        }
                        onClick={() =>
                          updateSelectedSchema((schema) => {
                            const textSchema = schema as Schema & {
                              fontWeight?: string;
                            };
                            textSchema.fontWeight =
                              textSchema.fontWeight === "bold" ? "normal" : "bold";
                          })
                        }
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Bold aria-hidden="true" size={14} />
                      </Button>
                      <Button
                        aria-label="Align selected text"
                        onClick={() =>
                          updateSelectedSchema((schema) => {
                            const textSchema = schema as Schema & {
                              alignment?: "center" | "left" | "right";
                            };
                            textSchema.alignment =
                              textSchema.alignment === "left"
                                ? "center"
                                : textSchema.alignment === "center"
                                  ? "right"
                                  : "left";
                          })
                        }
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <AlignCenter aria-hidden="true" size={14} />
                      </Button>
                      <Button
                        aria-label="Duplicate selected element"
                        onClick={duplicateSelectedElement}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Copy aria-hidden="true" size={14} />
                      </Button>
                      <Button
                        aria-label="Delete selected element"
                        className="text-destructive"
                        onClick={deleteSelectedElement}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" size={14} />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="pointer-events-none absolute left-7 top-[82px] z-10 text-muted-foreground">
              <Text>Page </Text>
              <Text>{currentPage + 1}</Text>
              <Text> of </Text>
              <Text>{pageCount}</Text>
              <Text> · </Text>
              <Text>{name}</Text>
            </div>
            {!designerReady ? (
              <div
                aria-live="polite"
                className="absolute inset-0 z-40 grid place-items-center bg-background/80"
                role="status"
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin text-primary"
                    size={20}
                  />
                  <Text>Loading designer…</Text>
                </div>
              </div>
            ) : null}
            <div
              className="advanced-pdfme-designer min-h-0 w-full flex-1"
              data-field-inspector-open={Boolean(selectedSchema && !focusMode)}
              ref={designerContainerRef}
            />
            {renderPanel()}
          </section>
        </div>

        {!focusMode ? (
          <footer
            className={`shrink-0 overflow-hidden border-t border-border bg-card transition-[height] ${
              documentStripOpen ? "h-[92px]" : "h-10"
            }`}
          >
            <div className="flex h-full min-w-0 items-center gap-3 px-4">
              <button
                aria-controls="advanced-editor-document-strip"
                aria-expanded={documentStripOpen}
                className="flex h-full w-28 shrink-0 items-center justify-between border-r border-border pr-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => setStripQuery(documentStripOpen ? "closed" : "open")}
                type="button"
              >
                <Caption>Document</Caption>
                {documentStripOpen ? (
                  <ChevronDown aria-hidden="true" size={15} />
                ) : (
                  <ChevronUp aria-hidden="true" size={15} />
                )}
              </button>

              {documentStripOpen ? (
                <div className="contents" id="advanced-editor-document-strip">
                  <div className="flex max-w-44 shrink-0 items-center gap-2 overflow-x-auto overscroll-contain">
                    {currentTemplateRef.current.schemas.map((_page, index) => (
                      <button
                        aria-current={currentPage === index ? "page" : undefined}
                        aria-label={`Go to page ${index + 1}`}
                        className={`relative h-[66px] w-12 shrink-0 rounded-md border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          currentPage === index ? "border-2 border-primary" : "border-input"
                        }`}
                        key={`strip-page-${index}`}
                        onClick={() => goToPage(index)}
                        type="button"
                      >
                        <span className="absolute left-2 top-1.5 flex h-[43px] w-[30px] flex-col gap-[3px] rounded-sm bg-muted p-1">
                          <span className="h-[3px] w-full rounded-[1px] bg-muted-foreground" />
                          <span className="h-0.5 w-full rounded-[1px] bg-input" />
                          <span className="h-0.5 w-[15px] rounded-[1px] bg-input" />
                        </span>
                        <Text
                          className={`absolute bottom-[3px] left-[3px] grid size-4 place-items-center rounded bg-card shadow-sm ${
                            currentPage === index ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {index + 1}
                        </Text>
                      </button>
                    ))}
                    <button
                      aria-label="Add page"
                      className="grid h-[66px] w-12 shrink-0 place-items-center rounded-md border border-input bg-card text-muted-foreground outline-none hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={addPage}
                      type="button"
                    >
                      <Plus aria-hidden="true" size={18} />
                    </button>
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      className={`flex h-[34px] min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        editingRegion === "header" && activePanel === "pages"
                          ? "border-primary bg-primary text-primary-foreground"
                          : repeatingHeaderCount
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : selection?.schemas.length
                              ? "border-primary/30 bg-card text-primary"
                              : "border-border bg-muted text-muted-foreground"
                      }`}
                      onClick={openRegionPanel}
                      type="button"
                    >
                      <PanelTop
                        aria-hidden="true"
                        className="shrink-0"
                        size={13}
                        strokeWidth={1.75}
                      />
                      <Text className="truncate">
                        Header ·{" "}
                        {editingRegion === "header" && activePanel === "pages"
                          ? "editing"
                          : repeatingHeaderCount
                            ? `${repeatingHeaderCount} assigned`
                            : selection?.schemas.length
                              ? "ready"
                              : "not set"}
                      </Text>
                    </button>
                    <button
                      className={`flex h-[34px] min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        editingRegion === "footer" && activePanel === "pages"
                          ? "border-primary bg-primary text-primary-foreground"
                          : repeatingFooterCount
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : selection?.schemas.length
                              ? "border-primary/30 bg-card text-primary"
                              : "border-border bg-muted text-muted-foreground"
                      }`}
                      onClick={openRegionPanel}
                      type="button"
                    >
                      <PanelBottom
                        aria-hidden="true"
                        className="shrink-0"
                        size={13}
                        strokeWidth={1.75}
                      />
                      <Text className="truncate">
                        Footer ·{" "}
                        {editingRegion === "footer" && activePanel === "pages"
                          ? "editing"
                          : repeatingFooterCount
                            ? `${repeatingFooterCount} assigned`
                            : selection?.schemas.length
                              ? "ready"
                              : "not set"}
                      </Text>
                    </button>
                  </div>
                </div>
              ) : (
                <Caption className="text-muted-foreground">
                  Page {currentPage + 1} of {pageCount}
                </Caption>
              )}

              <div
                aria-live="polite"
                className="ml-auto flex shrink-0 items-center gap-2 text-muted-foreground"
                role="status"
              >
                <Text className="hidden items-center gap-1.5 xl:flex">
                  <span
                    className={`size-[7px] rounded-full ${
                      error
                        ? "bg-destructive"
                        : warnings.length
                          ? "bg-amber-500"
                          : designerReady
                            ? "bg-emerald-500"
                            : "bg-muted-foreground"
                    }`}
                  />
                  {error
                    ? "Validation error"
                    : warnings.length
                      ? `${warnings.length} publish warning${warnings.length === 1 ? "" : "s"}`
                      : designerReady
                        ? "No overflow errors"
                        : "Checking template"}
                </Text>
                <Text className="hidden 2xl:inline">
                  {Object.keys(sampleData).length} sample fields
                </Text>
                <div className="flex h-8 items-center rounded-lg border border-border bg-muted/50">
                  <button
                    aria-label="Zoom out"
                    className="grid size-8 place-items-center rounded-l-lg outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => updateZoom(zoom - 0.1)}
                    type="button"
                  >
                    <Minus aria-hidden="true" size={14} />
                  </button>
                  <Caption className="min-w-10 text-center text-foreground">
                    {Math.round(zoom * 100)}%
                  </Caption>
                  <button
                    aria-label="Zoom in"
                    className="grid size-8 place-items-center rounded-r-lg outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => updateZoom(zoom + 0.1)}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={14} />
                  </button>
                </div>
                <Text className="flex items-center gap-1.5">
                  {designerReady ? (
                    <Check aria-hidden="true" className="text-emerald-600" size={13} />
                  ) : (
                    <LoaderCircle aria-hidden="true" className="animate-spin" size={13} />
                  )}
                  {designerReady ? "pdfme ready" : "Loading designer"}
                </Text>
              </div>
            </div>
          </footer>
        ) : null}
        <dialog
          aria-describedby="delete-page-description"
          aria-labelledby="delete-page-title"
          className="m-auto h-[340px] w-[calc(100%_-_3rem)] max-w-[530px] overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-[0_18px_48px_rgba(0,0,0,0.18)] backdrop:bg-foreground/45"
          onCancel={(event) => {
            event.preventDefault();
            setPendingPageRemoval(null);
          }}
          onClick={(event) => {
            if (event.currentTarget === event.target) {
              setPendingPageRemoval(null);
            }
          }}
          ref={deletePageDialogRef}
        >
          {pendingPageRemoval !== null ? (
            <section className="flex h-full w-full flex-col">
              <div className="flex items-center gap-3 border-b border-border px-[22px] py-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
                  <Trash2 aria-hidden="true" size={19} />
                </span>
                <div className="grid gap-0.5">
                  <H3 id="delete-page-title">Delete page {pendingPageRemoval + 1}?</H3>
                  <Caption className="block text-muted-foreground">
                    Selected page ·{" "}
                    {currentTemplateRef.current.schemas[pendingPageRemoval]?.length ?? 0} elements
                  </Caption>
                </div>
              </div>
              <div
                className="min-h-0 flex-1 px-[22px] py-[18px] text-muted-foreground"
                id="delete-page-description"
              >
                <P>
                  Deleting this page will not remove document fields or data bindings. Header and
                  footer regions stay unchanged.
                </P>
                <P className="mt-4">
                  Page{" "}
                  {Math.max(
                    0,
                    Math.min(pendingPageRemoval, currentTemplateRef.current.schemas.length - 2),
                  ) + 1}{" "}
                  becomes selected after deletion. You can undo until the draft is saved.
                </P>
              </div>
              <div className="flex justify-end gap-2.5 border-t border-border px-[22px] py-4">
                <Button
                  autoFocus
                  onClick={() => setPendingPageRemoval(null)}
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => removePage(pendingPageRemoval)}
                  type="button"
                  variant="destructive"
                >
                  Delete page {pendingPageRemoval + 1}
                </Button>
              </div>
            </section>
          ) : null}
        </dialog>
      </main>
      <style jsx global>{`
        .advanced-pdfme-designer .pdfme-ui-control-bar {
          display: none !important;
        }

        .advanced-pdfme-designer .ruler-container,
        .advanced-pdfme-designer .ruler-container + div,
        .advanced-pdfme-designer .ruler-container + div + div,
        .advanced-pdfme-designer .pdfme-designer-delete-button,
        .advanced-pdfme-designer .moveable-rotation,
        .advanced-pdfme-designer .moveable-origin,
        .advanced-pdfme-designer .moveable-line {
          display: none !important;
        }

        .advanced-pdfme-designer div[style*="opacity: 0.25"] {
          display: none !important;
        }

        .advanced-pdfme-designer .pdfme-designer-canvas {
          background: var(--muted) !important;
        }

        .advanced-pdfme-designer .pdfme-designer-left-sidebar {
          display: none !important;
        }

        .advanced-pdfme-designer .pdfme-designer-left-sidebar + div {
          margin-left: 0 !important;
          width: 100% !important;
        }

        .advanced-pdfme-designer .pdfme-designer-left-sidebar + div > :first-child,
        .advanced-pdfme-designer .pdfme-designer-canvas {
          width: 100% !important;
        }

        .advanced-pdfme-designer .pdfme-designer-canvas {
          margin-right: 0 !important;
        }

        .advanced-pdfme-designer .pdfme-designer-sidebar-toggle {
          display: none !important;
        }

        .advanced-pdfme-designer .pdfme-designer-right-sidebar {
          pointer-events: none;
        }

        .advanced-pdfme-designer[data-field-inspector-open="true"] .pdfme-designer-right-sidebar {
          top: 14px !important;
          right: 82px !important;
          z-index: 30 !important;
          width: 320px !important;
          height: min(578px, calc(100% - 28px)) !important;
          pointer-events: auto;
        }

        .advanced-pdfme-designer[data-field-inspector-open="true"]
          .pdfme-designer-right-sidebar
          > div {
          position: absolute !important;
          inset: 0 !important;
          display: flex !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden;
          box-sizing: border-box;
          border: 1px solid var(--border) !important;
          border-radius: 12px;
          background: var(--card) !important;
          box-shadow: 0 8px 24px rgb(17 18 20 / 0.08);
        }

        .advanced-pdfme-designer[data-field-inspector-open="true"] .pdfme-designer-detail-view {
          height: 100% !important;
        }
      `}</style>
    </>
  );
}
