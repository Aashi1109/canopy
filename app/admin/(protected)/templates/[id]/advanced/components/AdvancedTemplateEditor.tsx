"use client";

import { appHref } from "@/lib/routing/subdomains.ts";
import { supportsAdvancedTextBold, withPdfmeTextFormatting } from "@/lib/invoice-templates/pdfmeTextFormatting.ts";
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
} from "@/lib/invoice-templates/index.ts";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
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
  InlineTextEditor,
  Label,
  Select,
  StatusBadge,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  typographyStyles,
  BackButton,
} from "@/components/ui/index.tsx";
import { OrderableList } from "@/components/ui/components/OrderableList.tsx";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Barcode,
  Bold,
  Braces,
  CalendarClock,
  CalendarDays,
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
import { updateAdminQuery, useAdminQueryState } from "@/app/admin/hooks/useAdminQueryState";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import type { Designer, DesignerSelection } from "@pdfme/ui";
import { updateAndPublishTemplateAction, updateTemplateAction } from "../../../../../actions";
import {
  DESIGNER_ZOOM,
  clampDesignerZoom,
  getCanvasPanSpace,
  getHorizontalRevealDelta,
} from "../lib/designerViewport.ts";

type ActivePanel = "add" | "layers" | "data" | "pages" | null;

function DesignerToolPanel({
  panel,
  titleId,
  children,
}: {
  panel: Exclude<ActivePanel, null>;
  titleId: string;
  children: ReactNode;
}) {
  const isPresent = useIsPresent();
  const reduceMotion = useReducedMotion();

  return (
    <motion.aside
      aria-labelledby={titleId}
      aria-hidden={!isPresent}
      inert={!isPresent}
      id={`advanced-editor-${panel}-panel`}
      data-slot="designer-tool-panel"
      initial={reduceMotion ? false : { opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: reduceMotion ? 0 : isPresent ? 0.24 : 0.16, ease: [0.22, 1, 0.36, 1] }}
      className={`${isPresent ? "pointer-events-auto" : "pointer-events-none"} -ms-px flex h-full min-h-0 min-w-0 max-h-[574px] w-80 max-w-[calc(100vw-6.5rem)] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card`}
    >
      <motion.div
        key={panel}
        initial={reduceMotion ? false : { opacity: 0.88, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        {children}
      </motion.div>
    </motion.aside>
  );
}

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
const TEXT_ALIGNMENTS = ["left", "center", "right", "justify"] as const;
const TEXT_ALIGNMENT_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify };
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

const canopyBridge: {
  toggleRepeat: () => void;
  deleteElement: () => void;
  nativeEditor: {
    rootElement: HTMLDivElement;
    schemaId: string;
    schemaIds: string[];
    changeSchemas: PropPanelWidgetProps["changeSchemas"];
  } | null;
} = {
  toggleRepeat: () => {},
  deleteElement: () => {},
  nativeEditor: null,
};

function renderCanopyControls(props: PropPanelWidgetProps): void {
  try {
    const { rootElement, activeSchema, activeElements, changeSchemas } = props;
    canopyBridge.nativeEditor = {
      rootElement,
      schemaId: activeSchema.id,
      schemaIds: activeElements.map((element) => element.id),
      changeSchemas,
    };
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
    toggle.addEventListener("click", () => canopyBridge.toggleRepeat());
    row.append(text, toggle);

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "Delete element";
    del.className = typographyStyles.caption;
    del.style.cssText =
      "height:36px;width:100%;border:1px solid #d6d9de;border-radius:8px;background:#fff;color:#dc2626;cursor:pointer;";
    del.addEventListener("click", () => canopyBridge.deleteElement());

    wrap.append(row, del);
    rootElement.appendChild(wrap);
  } catch {
    // A widget error must never take down pdfme's property panel.
  }
}

type PdfmePlugin = Plugins[string];

function withCanopyControls(plugin: PdfmePlugin): PdfmePlugin {
  const propPanel = plugin.propPanel;
  const originalSchema = propPanel.schema;
  return {
    ...plugin,
    propPanel: {
      ...propPanel,
      widgets: {
        ...(propPanel.widgets ?? {}),
        canopyControls: renderCanopyControls,
      },
      schema: (schemaProps) => {
        const base = typeof originalSchema === "function" ? originalSchema(schemaProps) : originalSchema;
        return {
          ...base,
          canopyControls: {
            type: "void",
            widget: "canopyControls",
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
    text: withPdfmeTextFormatting(schemas.text),
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
  return Object.fromEntries(Object.entries(raw).map(([key, plugin]) => [key, withCanopyControls(plugin)]));
}

function blankBase(template: Template): PdfmeBlankBase {
  return template.basePdf as PdfmeBlankBase;
}

function panelButtonClass(active: boolean) {
  return [
    "size-8 rounded-lg p-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "bg-primary/90 text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground hover:[&_svg]:text-primary-foreground active:bg-primary active:text-primary-foreground active:[&_svg]:text-primary-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  ].join(" ");
}

function schemaBindingType(type: string): "text" | "table" | "image" {
  if (type === "table") return "table";
  if (type === "image" || type === "signature") return "image";
  return "text";
}

export default function AdvancedTemplateEditor({ template }: { template: AdvancedDocumentTemplate }) {
  const definition = getDocumentDefinition(template.documentType);
  const fieldDefinitions = new Map(definition.fields.map((field) => [field.key, field]));
  const initialTemplate = useRef(cloneTemplate(template.config.template as Template));
  const deletePageDialogRef = useRef<HTMLDialogElement>(null);
  const designerContainerRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
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

  const [panelQuery, setPanelQuery] = useAdminQueryState("panel", "add", ["add", "layers", "data", "pages", "none"]);
  const activePanel: ActivePanel = panelQuery === "none" ? null : panelQuery;
  const [panelRetained, setPanelRetained] = useState(Boolean(activePanel));
  const panelAttached = Boolean(activePanel) || panelRetained;

  const setActivePanel = (panel: ActivePanel) => setPanelQuery(panel ?? "none");
  const [addQuery, setAddQuery] = useAdminQueryState<string>("q", "");
  const [expandedBindingKey, setExpandedBindingKey] = useState<string | null>(null);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [canvasMode, setCanvasMode] = useAdminQueryState("canvas", "select", ["pan", "select"]);
  const [designerReady, setDesignerReady] = useState(false);
  const [canvasElement, setCanvasElement] = useState<HTMLElement | null>(null);
  const alignedPageCountRef = useRef<number | null>(null);
  const [stripQuery, setStripQuery] = useAdminQueryState("strip", "open", ["open", "closed"]);
  const documentStripOpen = stripQuery === "open";
  const [error, setError] = useState("");
  const [focusQuery] = useAdminQueryState("focus", "false", ["false", "true"]);
  const focusMode = focusQuery === "true";

  useEffect(() => {
    if (focusMode) setPanelRetained(false);
    else if (activePanel) setPanelRetained(true);
  }, [activePanel, focusMode]);

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
  const [zoom, setZoom] = useState<number>(DESIGNER_ZOOM.initial);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const syncViewportRef = useRef<() => void>(() => {});
  const revealSelectionRef = useRef<() => void>(() => {});
  const zoomAnchorRef = useRef<{
    pageIndex: number;
    x: number;
    y: number;
    viewportX: number;
    viewportY: number;
    width: number;
  } | null>(null);

  // Match the native inspector's last selected element in page order.
  const selectedSchema =
    selection?.schemas.reduce<DesignerSelection["schemas"][number] | null>(
      (active, schema) => (!active || schema.schemaIndex > active.schemaIndex ? schema : active),
      null,
    ) ?? null;
  const selectedPdfmeSchema = selectedSchema
    ? currentTemplateRef.current.schemas[selectedSchema.pageIndex]?.[selectedSchema.schemaIndex]
    : undefined;
  const selectedBindingType = selectedPdfmeSchema ? schemaBindingType(selectedPdfmeSchema.type) : null;
  const canBoldSelection = supportsAdvancedTextBold(selectedPdfmeSchema);
  const canAlignSelection =
    selectedPdfmeSchema &&
    (["text", "multiVariableText"].includes(selectedPdfmeSchema.type) ||
      typeof selectedPdfmeSchema.alignment === "string");
  const alignmentIndex = Math.max(
    0,
    TEXT_ALIGNMENTS.findIndex((value) => value === selectedPdfmeSchema?.alignment),
  );
  const nextAlignment = TEXT_ALIGNMENTS[(alignmentIndex + 1) % TEXT_ALIGNMENTS.length];
  const AlignmentIcon = TEXT_ALIGNMENT_ICONS[TEXT_ALIGNMENTS[alignmentIndex]];
  const schemas = currentTemplateRef.current.schemas[currentPage] ?? [];
  const staticSchemas = blankBase(currentTemplateRef.current).staticSchema ?? [];
  const repeatingHeaderCount = staticSchemas.filter((schema) => schema.smarttoolsRegion === "header").length;
  const repeatingFooterCount = staticSchemas.filter((schema) => schema.smarttoolsRegion === "footer").length;

  useEffect(() => {
    const inspector = designerContainerRef.current?.querySelector<HTMLElement>(".pdfme-designer-right-sidebar");
    if (!inspector) return;
    const hidden = !selectedSchema || focusMode;
    inspector.inert = hidden;
    inspector.setAttribute("aria-hidden", String(hidden));
  }, [designerReady, selectedSchema, focusMode]);

  useEffect(() => {
    canopyBridge.deleteElement = () => deleteSelectedElement();
    canopyBridge.toggleRepeat = () => {
      const region = (selectedPdfmeSchema as { smarttoolsRegion?: string } | undefined)?.smarttoolsRegion;
      if (region) {
        const base = blankBase(currentTemplateRef.current);
        const index = (base.staticSchema ?? []).findIndex((schema) => schema.name === selectedPdfmeSchema?.name);
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
    if (previous.pageFormat === pageFormatRef.current && JSON.stringify(previous.template) === JSON.stringify(next)) {
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
            zoomLevel: zoomRef.current,
            maxZoom: DESIGNER_ZOOM.max * 100,
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
        designer.onChangeSelection((next) => {
          const nativeEditor = canopyBridge.nativeEditor;
          if (
            nativeEditor &&
            (next.schemas.length !== nativeEditor.schemaIds.length ||
              next.schemas.some((schema) => !nativeEditor.schemaIds.includes(schema.schemaId)))
          ) {
            canopyBridge.nativeEditor = null;
          }
          setSelection(next);
        });
        designer.onPageChange(({ currentPage: page, totalPages }) => {
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
          const schemaIndex = firstPage.findIndex((schema) => schema.name.toLowerCase().includes("total"));
          const selectedIndex = schemaIndex >= 0 ? schemaIndex : 0;
          const selected = firstPage[selectedIndex];
          designer.selectSchemas(selected ? [{ name: selected.name, pageIndex, schemaIndex: selectedIndex }] : [], {
            pageIndex,
            scroll: false,
          });
        }, 300);
      })
      .catch((loadError) => {
        if (!disposed) setError(errorMessage(loadError));
      });

    return () => {
      disposed = true;
      canopyBridge.nativeEditor = null;
      if (designerRef.current) {
        designerRef.current.destroy();
        designerRef.current = null;
      }
    };
  }, [rememberTemplate]);

  useEffect(() => {
    const container = designerContainerRef.current;
    if (!designerReady || !container) return;
    let frame = 0;
    let observedCanvas: HTMLElement | null = null;

    const syncWorkspace = () => {
      const canvas = container.querySelector<HTMLElement>(".pdfme-designer-canvas");
      const papers = canvas?.querySelectorAll<HTMLElement>("div[style*=background-image]");
      if (!canvas || !papers?.length || !canvas.clientWidth || !canvas.clientHeight) return;
      if (observedCanvas !== canvas) {
        if (observedCanvas) resizeObserver.unobserve(observedCanvas);
        observedCanvas = canvas;
        setCanvasElement(canvas);
        resizeObserver.observe(canvas);
      }
      const viewport = canvas.getBoundingClientRect();
      const oldGutterX = Number.parseFloat(canvas.style.getPropertyValue("--canvas-gutter-x")) || 0;
      const oldGutterY = Number.parseFloat(canvas.style.getPropertyValue("--canvas-gutter-y")) || 0;
      const bounds = Array.from(papers, (paper) => paper.getBoundingClientRect());
      const space = getCanvasPanSpace(
        { width: canvas.clientWidth, height: canvas.clientHeight },
        {
          right: Math.max(...bounds.map((bounds) => bounds.right - viewport.left + canvas.scrollLeft - oldGutterX)),
          bottom: Math.max(...bounds.map((bounds) => bounds.bottom - viewport.top + canvas.scrollTop - oldGutterY)),
        },
      );
      for (const [key, value] of Object.entries({
        "--canvas-gutter-x": space.gutterX,
        "--canvas-gutter-y": space.gutterY,
        "--canvas-scroll-width": space.width,
        "--canvas-scroll-height": space.height,
      })) {
        const pixels = `${value}px`;
        if (canvas.style.getPropertyValue(key) !== pixels) canvas.style.setProperty(key, pixels);
      }
      // Gutters are outside pdfme's scale, so resizing the workspace must not move the page.
      canvas.scrollLeft += space.gutterX - oldGutterX;
      canvas.scrollTop += space.gutterY - oldGutterY;
      const anchor = zoomAnchorRef.current;
      const page = anchor && papers[anchor.pageIndex];
      if (anchor && page) {
        const bounds = page.getBoundingClientRect();
        if (Math.abs(bounds.width - anchor.width) > 0.01) {
          // Restore the same document point after pdfme's own zoom layout has settled.
          canvas.scrollLeft += bounds.left + anchor.x * bounds.width - viewport.left - anchor.viewportX;
          canvas.scrollTop += bounds.top + anchor.y * bounds.height - viewport.top - anchor.viewportY;
          zoomAnchorRef.current = null;
          revealSelectionRef.current();
        }
      }
    };
    const scheduleSync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncWorkspace);
    };
    const resizeObserver = new ResizeObserver(scheduleSync);
    const observer = new MutationObserver(scheduleSync);
    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    resizeObserver.observe(container);
    syncViewportRef.current = syncWorkspace;
    syncWorkspace();
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      observer.disconnect();
      syncViewportRef.current = () => {};
    };
  }, [designerReady]);

  useEffect(() => {
    const reveal = () => {
      const container = designerContainerRef.current;
      const canvas = container?.querySelector<HTMLElement>(".pdfme-designer-canvas");
      const node =
        selectedSchema && container?.querySelector<HTMLElement>(`[id="${CSS.escape(selectedSchema.schemaId)}"]`);
      if (!canvas || !node || focusMode) return;
      const viewport = canvas.getBoundingClientRect();
      let left = viewport.left + 16;
      let right = viewport.right - 16;
      const inspector = container?.querySelector<HTMLElement>(".pdfme-designer-right-sidebar");
      if (inspector) {
        const bounds = inspector.getBoundingClientRect();
        const translation = new DOMMatrixReadOnly(getComputedStyle(inspector).transform).m41;
        right = Math.min(right, bounds.left - translation - 16);
      }
      const panel = activePanel && toolsRef.current?.querySelector<HTMLElement>('[data-slot="designer-tool-panel"]');
      if (panel) left = Math.max(left, panel.getBoundingClientRect().right + 16);
      if (right <= left) return;
      canvas.scrollLeft += getHorizontalRevealDelta(node.getBoundingClientRect(), { left, right });
    };
    revealSelectionRef.current = reveal;
    const frame = window.requestAnimationFrame(() => {
      syncViewportRef.current();
      reveal();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedSchema?.schemaId, activePanel, focusMode, designerReady]);

  function alignPageViewport(pageIndex: number) {
    const canvas = designerContainerRef.current?.querySelector<HTMLElement>(".pdfme-designer-canvas");
    const paper = canvas?.querySelectorAll<HTMLElement>("div[style*=background-image]")[pageIndex];
    if (!canvas || !paper) return false;
    syncViewportRef.current();
    canvas.scrollTop += paper.getBoundingClientRect().top - canvas.getBoundingClientRect().top - 16;
    restoringPageRef.current = false;
    return true;
  }

  useEffect(() => {
    const container = designerContainerRef.current;
    if (!designerReady || !container) return;
    // Native page changes while scrolling must not recenter an ongoing pan.
    if (
      !restoringPageRef.current &&
      designerRef.current?.getPageCursor() === currentPage &&
      alignedPageCountRef.current === pageCount
    )
      return;
    alignedPageCountRef.current = pageCount;
    if (alignPageViewport(currentPage)) return;
    const observer = new MutationObserver(() => {
      if (alignPageViewport(currentPage)) observer.disconnect();
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [currentPage, designerReady, pageCount]);

  useEffect(() => {
    const canvas = canvasElement;
    if (!canvas) return;
    const zoomWithWheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || !event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      updateZoom(zoomRef.current * Math.exp(-event.deltaY * 0.002));
    };
    canvas.addEventListener("wheel", zoomWithWheel, { capture: true, passive: false });
    return () => canvas.removeEventListener("wheel", zoomWithWheel, true);
  }, [canvasElement]);

  useEffect(() => {
    const canvas = canvasElement;
    if (!canvas || canvasMode !== "pan") return;

    let pointerId: number | null = null;
    let previousX = 0;
    let previousY = 0;
    const oldCursor = canvas.style.cursor;
    const oldTouchAction = canvas.style.touchAction;
    const isControl = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest('input, textarea, select, button, [contenteditable="true"]'));

    const startPan = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || pointerId !== null || isControl(event.target)) return;
      const viewport = canvas.getBoundingClientRect();
      if (event.clientX >= viewport.left + canvas.clientWidth || event.clientY >= viewport.top + canvas.clientHeight)
        return;
      pointerId = event.pointerId;
      previousX = event.clientX;
      previousY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const movePan = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      canvas.scrollLeft -= event.clientX - previousX;
      canvas.scrollTop -= event.clientY - previousY;
      previousX = event.clientX;
      previousY = event.clientY;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const stopPan = () => {
      const captured = pointerId;
      pointerId = null;
      canvas.style.cursor = "grab";
      if (captured !== null && canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured);
    };
    const stopNativeDrag = (event: MouseEvent) => {
      if (event.button !== 0 || isControl(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const stopNativeTouchDrag = (event: TouchEvent) => {
      if (event.touches.length !== 1 || isControl(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    canvas.style.cursor = "grab";
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", startPan, true);
    canvas.addEventListener("pointermove", movePan, true);
    canvas.addEventListener("pointerup", stopPan, true);
    canvas.addEventListener("pointercancel", stopPan, true);
    canvas.addEventListener("lostpointercapture", stopPan, true);
    canvas.addEventListener("mousedown", stopNativeDrag, true);
    canvas.addEventListener("touchstart", stopNativeTouchDrag, { capture: true, passive: false });
    return () => {
      stopPan();
      canvas.style.cursor = oldCursor;
      canvas.style.touchAction = oldTouchAction;
      canvas.removeEventListener("pointerdown", startPan, true);
      canvas.removeEventListener("pointermove", movePan, true);
      canvas.removeEventListener("pointerup", stopPan, true);
      canvas.removeEventListener("pointercancel", stopPan, true);
      canvas.removeEventListener("lostpointercapture", stopPan, true);
      canvas.removeEventListener("mousedown", stopNativeDrag, true);
      canvas.removeEventListener("touchstart", stopNativeTouchDrag, true);
    };
  }, [canvasMode, canvasElement]);

  function togglePanel(panel: Exclude<ActivePanel, null>) {
    setActivePanel(activePanel === panel ? null : panel);
    if (panel !== "pages") setEditingRegion(null);
  }

  function openRegionPanel() {
    setActivePanel("pages");
    setEditingRegion(null);
  }

  function closePanels() {
    const panel = toolsRef.current?.querySelector('[data-slot="designer-tool-panel"]');
    const trigger =
      activePanel && panel?.contains(document.activeElement)
        ? toolsRef.current?.querySelector<HTMLButtonElement>(`[data-panel="${activePanel}"]`)
        : null;
    setActivePanel(null);
    setEditingRegion(null);
    trigger?.focus({ preventScroll: true });
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
    const value = clampDesignerZoom(next);
    if (value === zoomRef.current) return;
    const canvas = designerContainerRef.current?.querySelector<HTMLElement>(".pdfme-designer-canvas");
    const page = canvas?.querySelectorAll<HTMLElement>("div[style*=background-image]")[currentPageRef.current];
    if (canvas && page) {
      const viewport = canvas.getBoundingClientRect();
      const bounds = page.getBoundingClientRect();
      zoomAnchorRef.current = {
        pageIndex: currentPageRef.current,
        x: (viewport.left + canvas.clientWidth / 2 - bounds.left) / bounds.width,
        y: (viewport.top + canvas.clientHeight / 2 - bounds.top) / bounds.height,
        viewportX: canvas.clientWidth / 2,
        viewportY: canvas.clientHeight / 2,
        width: bounds.width,
      };
    }
    zoomRef.current = value;
    setZoom(value);
    designerRef.current?.updateOptions({ zoomLevel: value, maxZoom: DESIGNER_ZOOM.max * 100 });
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
    const baseName = tool.pluginKey === "qrcode" ? "qrCode" : tool.pluginKey === "code128" ? "barcode" : tool.pluginKey;
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
        { pageIndex: currentPage, scroll: false },
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
      { pageIndex: currentPage, scroll: false },
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
    const nativeEditor = canopyBridge.nativeEditor;
    const selected = designerRef.current?.getSelection().schemas ?? [];
    if (
      !nativeEditor?.rootElement.isConnected ||
      selected.length !== nativeEditor.schemaIds.length ||
      selected.some((schema) => !nativeEditor.schemaIds.includes(schema.schemaId))
    ) {
      canopyBridge.nativeEditor = null;
      return;
    }
    const active = selected.find((schema) => schema.schemaId === nativeEditor.schemaId);
    const schema = active && currentTemplateRef.current.schemas[active.pageIndex]?.[active.schemaIndex];
    if (!schema || schema.name !== active?.name) return;
    const next = structuredClone(schema);
    update(next);
    const changes = [...new Set([...Object.keys(schema), ...Object.keys(next)])]
      .filter((key) => JSON.stringify(schema[key]) !== JSON.stringify(next[key]))
      .map((key) => ({ key, value: next[key], schemaId: nativeEditor.schemaId }));
    if (changes.length > 0) nativeEditor.changeSchemas(changes);
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
        { pageIndex: selected.pageIndex, scroll: false },
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
    window.requestAnimationFrame(() => alignPageViewport(pageIndex));
    const firstSchema = currentTemplateRef.current.schemas[pageIndex]?.[0];
    if (firstSchema) {
      designerRef.current?.selectSchemas(
        { name: firstSchema.name, pageIndex, schemaIndex: 0 },
        { pageIndex, scroll: false },
      );
    }
  }

  function bindSelection(name: string) {
    const selected = selection?.schemas[0];
    if (!selected) return;
    const selectedPdfmeSchema = currentTemplateRef.current.schemas[selected.pageIndex]?.[selected.schemaIndex];
    if (!selectedPdfmeSchema) return;
    const definitionField = fieldDefinitions.get(name);
    const formEntry = form.sections.flatMap((section) => section.entries).find((entry) => entry.key === name);
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

  function updateSection(sectionId: string, update: (section: TemplateFormSection) => TemplateFormSection) {
    setFormSections(form.sections.map((section) => (section.id === sectionId ? update(section) : section)));
  }

  function updateFormEntry(sectionId: string, key: string, update: (entry: TemplateFormEntry) => TemplateFormEntry) {
    updateSection(sectionId, (section) => ({
      ...section,
      entries: section.entries.map((entry) => (entry.key === key ? update(entry) : entry)),
    }));
  }

  function uniqueCustomKey(base: string) {
    const used = new Set(form.sections.flatMap((section) => section.entries.map((entry) => entry.key)));
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
        { pageIndex: currentPage, scroll: false },
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
      const bytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
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
      <DesignerToolPanel key="designer-tools" panel={activePanel} titleId={panelTitleId}>
        <div className="flex h-12 min-w-0 shrink-0 items-center justify-between gap-2 px-3">
          <H3 className="min-w-0 truncate" id={panelTitleId}>
            {panelTitle}
          </H3>
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
          <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-2.5 px-3 pb-3">
            <Label className="flex h-9 min-w-0 w-full shrink-0 items-center gap-2 rounded-lg border border-border bg-muted px-2.5 text-muted-foreground focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
              <Search aria-hidden="true" className="shrink-0" size={15} />
              <input
                aria-label="Search elements"
                className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                onChange={(event) => setAddQuery(event.target.value, true)}
                placeholder="Search elements"
                type="search"
                value={addQuery}
              />
            </Label>
            <div className="min-h-0 min-w-0 w-full flex-1 space-y-2.5 overflow-x-hidden overflow-y-auto">
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
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
                      {visibleTools.map((tool) => {
                        const Icon = tool.icon;
                        return (
                          <button
                            aria-label={`Add ${tool.label}`}
                            className="group flex h-10 w-full items-center gap-2 rounded-lg px-1.5 text-left outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                            disabled={!designerReady}
                            key={tool.pluginKey}
                            onClick={() => addElement(tool)}
                            type="button"
                          >
                            <span className="grid size-7 shrink-0 place-items-center rounded text-foreground group-hover:text-accent-foreground">
                              <Icon aria-hidden="true" size={15} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <Caption className="block truncate text-foreground group-hover:text-accent-foreground">
                                {tool.label}
                              </Caption>
                              <Caption className="block truncate text-muted-foreground group-hover:text-accent-foreground">
                                {tool.description}
                              </Caption>
                            </span>
                            <Plus
                              aria-hidden="true"
                              className="shrink-0 text-muted-foreground group-hover:text-accent-foreground"
                              size={13}
                            />
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
          <div className="min-h-0 min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
              <Caption>
                {layerItems.length ? "Populated" : "Empty"} · Page {currentPage + 1}
              </Caption>
              <Caption className="rounded bg-muted px-1.5 py-0.5">{layerItems.length} elements</Caption>
            </div>
            {layerItems.length ? (
              <OrderableList
                ariaLabel={`Layers on page ${currentPage + 1}`}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 [&>li]:min-w-0"
                getId={(item) => item.id}
                items={layerItems}
                onReorder={(items) => replacePageSchemas(items.map((item) => item.schema))}
                renderItem={(item, state) => (
                  <div
                    className={`flex h-8 min-w-0 w-full items-center gap-1.5 rounded border px-1.5 ${
                      state.isDragging ? "border-primary bg-primary/5 shadow-md" : "border-border bg-card"
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
                    <Overline className="mr-1 max-w-20 shrink-0 truncate text-muted-foreground">
                      {item.schema.type}
                    </Overline>
                  </div>
                )}
              />
            ) : (
              <div className="grid place-items-center gap-1.5 rounded-lg bg-muted p-3 text-center">
                <span className="grid size-[34px] place-items-center rounded-md bg-card text-muted-foreground">
                  <Layers aria-hidden="true" size={17} />
                </span>
                <Caption className="block ">No elements yet</Caption>
                <Caption className="block text-muted-foreground">Add an element to start this page.</Caption>
              </div>
            )}
          </div>
        ) : null}

        {activePanel === "data" ? (
          <div className="min-h-0 min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3">
            <div className="mb-3 flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg bg-muted px-3">
              <div className="min-w-0 flex-1">
                <Overline className="block text-muted-foreground">Document type</Overline>
                <Caption className="block truncate">{definition.label}</Caption>
              </div>
              <ChevronDown aria-hidden="true" className="shrink-0 text-muted-foreground" size={14} />
            </div>
            <Overline className="block mb-2 text-muted-foreground">Canvas bindings</Overline>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
              {Array.from(new Set(definition.fields.map((field) => field.section))).map((fieldSection) => (
                <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5" key={fieldSection}>
                  <Overline className="break-words text-muted-foreground">{fieldSection}</Overline>
                  {definition.fields
                    .filter((field) => field.section === fieldSection)
                    .map((field) => {
                      const readOnly = field.source !== "user";
                      const compatible =
                        selectedBindingType !== null && field.allowedBindingTypes.includes(selectedBindingType);
                      return (
                        <div className="min-w-0 w-full rounded-lg border border-border bg-card p-2" key={field.key}>
                          <div className="flex items-center gap-2">
                            <button
                              aria-expanded={expandedBindingKey === field.key}
                              className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => setExpandedBindingKey((key) => (key === field.key ? null : field.key))}
                              type="button"
                            >
                              <Caption className="block truncate text-foreground">{field.label}</Caption>
                              <Caption className="block mt-0.5 truncate text-muted-foreground">{field.key}</Caption>
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
                          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                            <StatusBadge className="px-1.5 py-0">{field.source}</StatusBadge>
                            <StatusBadge className="px-1.5 py-0">{field.valueType}</StatusBadge>
                            <Text className="min-w-0 flex-1 truncate text-muted-foreground">
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
              ))}
            </div>

            <Accordion className="mt-4 border-t border-border" collapsible type="single">
              <AccordionItem value="published-form">
                <AccordionTrigger className="py-3 text-muted-foreground">Published form configuration</AccordionTrigger>
                <AccordionContent className="pb-0">
                  <div className="mt-3 flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
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
                    className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 [&>li]:min-w-0"
                    getId={(section) => section.id}
                    getLabel={(section) => section.label}
                    items={form.sections}
                    onReorder={setFormSections}
                    renderItem={(section, sectionOrderState) => (
                      <section className="min-w-0 w-full rounded-xl border border-border bg-background p-3">
                        <div className="flex items-center gap-2">
                          <Button
                            {...sectionOrderState.attributes}
                            {...sectionOrderState.listeners}
                            aria-label={`Reorder ${section.label} section`}
                            className="grid size-8 shrink-0 touch-none place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            ref={sectionOrderState.setActivatorNodeRef}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <GripVertical aria-hidden="true" className="size-[15px]" />
                          </Button>
                          <Input
                            aria-label="Section label"
                            className="h-8 min-w-0 flex-1"
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
                                setFormSections(form.sections.filter((candidate) => candidate.id !== section.id))
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
                          className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 [&>li]:min-w-0"
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
                              <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border border-border bg-card p-2.5">
                                <div className="flex items-center gap-2">
                                  <Button
                                    {...entryOrderState.attributes}
                                    {...entryOrderState.listeners}
                                    aria-label={`Reorder ${entry.label}`}
                                    className="grid size-8 shrink-0 touch-none place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
                                  <Text className="min-w-0 max-w-full truncate text-muted-foreground">{entry.key}</Text>
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
                                    <Label className="text-foreground" htmlFor={`${section.id}-${entry.key}-enabled`}>
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
                                    <Label className="text-foreground" htmlFor={`${section.id}-${entry.key}-required`}>
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
                                    onChange={(event) => moveFormEntry(section.id, event.target.value, entry.key)}
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
                                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-lg bg-muted/40 p-2">
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
                                      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 [&>li]:min-w-0"
                                      getId={(column) => column.key}
                                      getLabel={(column) => column.label}
                                      items={entry.columns}
                                      onReorder={(columns) =>
                                        updateFormEntry(section.id, entry.key, (current) =>
                                          current.kind === "repeater" ? { ...current, columns } : current,
                                        )
                                      }
                                      renderItem={(column, columnOrderState) => (
                                        <div className="grid min-w-0 w-full grid-cols-[2rem_minmax(0,1fr)_2.25rem] items-center gap-1 rounded-md border border-border bg-background p-1">
                                          <Button
                                            {...columnOrderState.attributes}
                                            {...columnOrderState.listeners}
                                            aria-label={`Reorder ${column.label} column`}
                                            className="grid size-8 touch-none place-items-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                            ref={columnOrderState.setActivatorNodeRef}
                                            size="icon-sm"
                                            type="button"
                                            variant="ghost"
                                          >
                                            <GripVertical aria-hidden="true" className="size-[13px]" />
                                          </Button>
                                          <Input
                                            aria-label={`${column.key} column label`}
                                            className="h-8 min-w-0"
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
                                            className="col-span-3 row-start-2 h-8 min-w-0 w-full"
                                            onChange={(event) =>
                                              updateFormEntry(section.id, entry.key, (current) =>
                                                current.kind === "repeater"
                                                  ? {
                                                      ...current,
                                                      columns: current.columns.map((candidate) =>
                                                        candidate.key === column.key
                                                          ? {
                                                              ...candidate,
                                                              control: event.target.value as typeof candidate.control,
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
                                            className="col-start-3 row-start-1"
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
                                              className="col-span-3 h-8 min-w-0"
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

                        <div className="mt-3 grid min-w-0 grid-cols-1 gap-2">
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
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        ) : null}

        {activePanel === "pages" ? (
          <div className="min-h-0 min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
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
                <ChevronDown aria-hidden="true" className="rotate-90" size={13} strokeWidth={1.75} />
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
                <ChevronDown aria-hidden="true" className="-rotate-90" size={13} strokeWidth={1.75} />
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
            <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              {currentTemplateRef.current.schemas.map((page, index) => (
                <div
                  className={`flex h-12 min-w-0 w-full items-center gap-2 rounded-lg border px-2 ${
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
                    <span className="min-w-0 flex-1">
                      <Caption className="block truncate">Page {index + 1}</Caption>
                      <Caption className="block truncate text-muted-foreground">{page.length} elements</Caption>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      aria-label={`Duplicate page ${index + 1}`}
                      className="grid size-6 place-items-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Overline className="text-muted-foreground">Repeating regions</Overline>
                <Caption className={selection?.schemas.length ? "text-primary" : "text-muted-foreground"}>
                  {selection?.schemas.length ? "Elements ready" : "No selection"}
                </Caption>
              </div>
              <div className="mt-2 grid gap-2">
                {(["header", "footer"] as const).map((region) => {
                  const Icon = region === "header" ? PanelTop : PanelBottom;
                  const assigned = region === "header" ? repeatingHeaderCount : repeatingFooterCount;
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
                        <Caption className="block truncate">{region}</Caption>
                        <Muted className={`truncate ${editing || assigned ? "text-primary" : "text-muted-foreground"}`}>
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
                        <Text className="min-w-0 flex-1 truncate">
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
      </DesignerToolPanel>
    );
  }

  return (
    <>
      <div className="grid min-h-screen place-items-center bg-muted p-6 lg:hidden">
        <Card className="max-w-md gap-0 rounded-2xl p-6 text-center shadow-sm">
          <Maximize2 aria-hidden="true" className="mx-auto text-primary" size={28} />
          <H1 className="mt-4">Open the advanced designer on desktop</H1>
          <Muted className="mt-2 text-muted-foreground">
            Freeform positioning needs a larger workspace. You can still preview and use published templates from
            smaller devices.
          </Muted>
          <BackButton className="mt-5" href={appHref("/admin/templates")} label="Back to templates" />
        </Card>
      </div>

      <main className="relative hidden h-dvh min-w-[1024px] flex-col overflow-hidden bg-background lg:flex">
        <header className="flex min-h-16 shrink-0 items-center gap-2.5 bg-card px-4 py-2">
          <BackButton href={appHref("/admin/templates")} label="Back to template lifecycle" className="shrink-0" />
          <div className="w-[18.75rem] min-w-0 shrink-0">
            <div className="flex min-h-8 items-start gap-2">
              <InlineTextEditor
                activation="click"
                showKeyboardHint={false}
                label="Template name"
                className="min-w-0 max-w-[210px] py-1 text-sm font-semibold text-foreground"
                onChange={(nextName) => {
                  setName(nextName);
                  setIsDirty(true);
                }}
                value={name}
              />
              <Text
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 ${
                  template.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
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
              Templates / Advanced · {definition.label} · {PAGE_FORMAT_LABELS[pageFormat]} · Version {template.version}
            </Caption>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-1.5">
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
              disabled={!designerReady || isPreviewing}
              loading={isPreviewing}
              onClick={() => void previewPdf()}
              size="sm"
              type="button"
              variant="secondary"
            >
              Preview
            </Button>
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent>{focusMode ? "Exit focus mode" : "Focus mode: hide editing panels"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
          <Accordion
            className="shrink-0 border-b border-status-warning/20 bg-status-warning-soft px-4 text-status-warning"
            collapsible
            type="single"
          >
            <AccordionItem value="publish-warnings">
              <AccordionTrigger className="py-2 text-status-warning [&>svg]:text-status-warning">
                <span>
                  {warnings.length} non-blocking publish {warnings.length === 1 ? "warning" : "warnings"}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                <List className="list-disc space-y-1 pl-5">
                  {warnings.map((warning) => (
                    <li key={warning}>
                      <Text>{warning}</Text>
                    </li>
                  ))}
                </List>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}

        <div className="relative flex min-h-0 flex-1">
          <section
            aria-label="Template canvas"
            className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[oklch(0.965_0.004_255)]"
          >
            {!focusMode ? (
              <div className="flex h-[54px] shrink-0 items-center border-b border-border bg-card px-3.5">
                <div className="flex h-full shrink-0 items-center gap-1 border-r border-border pr-3.5">
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
                  <Select
                    aria-label="Page size"
                    className="ml-2 w-auto shrink-0 bg-muted"
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
                    disabled={!designerReady || zoom <= DESIGNER_ZOOM.min}
                    onClick={() => updateZoom(zoomRef.current - DESIGNER_ZOOM.step)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Minus aria-hidden="true" size={14} />
                  </Button>
                  <Caption className="min-w-12 text-center">{Math.round(zoom * 100)}%</Caption>
                  <Button
                    aria-label="Zoom in"
                    disabled={!designerReady || zoom >= DESIGNER_ZOOM.max}
                    onClick={() => updateZoom(zoomRef.current + DESIGNER_ZOOM.step)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Plus aria-hidden="true" size={14} />
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

                {selectedPdfmeSchema ? (
                  <div className="flex h-full w-[336px] items-center justify-end gap-1 border-l border-border pl-3">
                    <Overline className="mr-1 max-w-16 truncate text-muted-foreground">
                      {selectedPdfmeSchema.type}
                    </Overline>
                    <Caption className="w-[108px] truncate rounded bg-muted px-2 py-2">
                      {selectedPdfmeSchema.name} · {String(selectedPdfmeSchema.fontSize ?? 12)} px
                    </Caption>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex" tabIndex={!canBoldSelection ? 0 : undefined}>
                            <Button
                              aria-label="Bold selected text"
                              aria-pressed={selectedPdfmeSchema.fontWeight === "bold"}
                              disabled={!canBoldSelection}
                              className={
                                (selectedPdfmeSchema as { fontWeight?: string }).fontWeight === "bold"
                                  ? "bg-accent text-accent-foreground ring-1 ring-inset ring-primary hover:bg-accent"
                                  : undefined
                              }
                              onClick={() =>
                                updateSelectedSchema((schema) => {
                                  if (!supportsAdvancedTextBold(schema)) return;
                                  const textSchema = schema as Schema & {
                                    fontWeight?: string;
                                  };
                                  textSchema.fontWeight = textSchema.fontWeight === "bold" ? "normal" : "bold";
                                })
                              }
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                            >
                              <Bold aria-hidden="true" size={14} />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {canBoldSelection ? "Bold text" : "Bold is available for plain text"}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex" tabIndex={!canAlignSelection ? 0 : undefined}>
                            <Button
                              aria-label={`Align selected text ${nextAlignment}`}
                              disabled={!canAlignSelection}
                              onClick={() =>
                                updateSelectedSchema((schema) => {
                                  const textSchema = schema as Schema & {
                                    alignment?: "center" | "left" | "right" | "justify";
                                  };
                                  const index = Math.max(
                                    0,
                                    TEXT_ALIGNMENTS.findIndex((value) => value === textSchema.alignment),
                                  );
                                  textSchema.alignment = TEXT_ALIGNMENTS[(index + 1) % TEXT_ALIGNMENTS.length];
                                })
                              }
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                            >
                              <AlignmentIcon aria-hidden="true" size={14} />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {canAlignSelection ? `Align ${nextAlignment}` : "Alignment is available for text"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
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
                  </div>
                ) : null}
              </div>
            ) : null}
            {!designerReady ? (
              <div
                aria-live="polite"
                className="absolute inset-0 z-40 grid place-items-center bg-background/80"
                role="status"
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <LoaderCircle aria-hidden="true" className="animate-spin text-primary" size={20} />
                  <Text>Loading designer…</Text>
                </div>
              </div>
            ) : null}
            <div
              className="advanced-pdfme-designer min-h-0 w-full flex-1"
              data-field-inspector-open={Boolean(selectedSchema && !focusMode)}
              ref={designerContainerRef}
            />
            {!focusMode ? (
              <div
                data-slot="designer-tool-menu"
                ref={toolsRef}
                className="pointer-events-none absolute bottom-5 left-7 top-[4.625rem] z-30 flex items-center drop-shadow-lg"
                onKeyDown={(event) => {
                  if (event.key !== "Escape" || event.defaultPrevented || !activePanel) return;
                  event.preventDefault();
                  event.stopPropagation();
                  closePanels();
                }}
              >
                <nav
                  aria-label="Designer tools"
                  data-attached={panelAttached}
                  className="pointer-events-auto relative z-10 flex w-12 shrink-0 flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-2 transition-[border-radius] duration-[180ms] ease-out motion-reduce:transition-none data-[attached=true]:rounded-l-xl data-[attached=true]:rounded-r-none data-[attached=true]:border-r-0"
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
                    aria-expanded={activePanel === "add"}
                    aria-controls={activePanel === "add" ? "advanced-editor-add-panel" : undefined}
                    data-panel="add"
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
                    aria-expanded={activePanel === "layers"}
                    aria-controls={activePanel === "layers" ? "advanced-editor-layers-panel" : undefined}
                    data-panel="layers"
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
                    aria-expanded={activePanel === "data"}
                    aria-controls={activePanel === "data" ? "advanced-editor-data-panel" : undefined}
                    data-panel="data"
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
                    aria-expanded={activePanel === "pages"}
                    aria-controls={activePanel === "pages" ? "advanced-editor-pages-panel" : undefined}
                    data-panel="pages"
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
                <AnimatePresence initial={false} onExitComplete={() => setPanelRetained(Boolean(activePanel))}>
                  {renderPanel()}
                </AnimatePresence>
              </div>
            ) : null}
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

                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      className={`flex h-[34px] min-w-0 w-auto max-w-56 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
                      <PanelTop aria-hidden="true" className="shrink-0" size={13} strokeWidth={1.75} />
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
                      className={`flex h-[34px] min-w-0 w-auto max-w-56 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
                      <PanelBottom aria-hidden="true" className="shrink-0" size={13} strokeWidth={1.75} />
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
                <Text className="hidden 2xl:inline">{Object.keys(sampleData).length} sample fields</Text>
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
                    Selected page · {currentTemplateRef.current.schemas[pendingPageRemoval]?.length ?? 0} elements
                  </Caption>
                </div>
              </div>
              <div className="min-h-0 flex-1 px-[22px] py-[18px] text-muted-foreground" id="delete-page-description">
                <P>
                  Deleting this page will not remove document fields or data bindings. Header and footer regions stay
                  unchanged.
                </P>
                <P className="mt-4">
                  Page {Math.max(0, Math.min(pendingPageRemoval, currentTemplateRef.current.schemas.length - 2)) + 1}{" "}
                  becomes selected after deletion. You can undo until the draft is saved.
                </P>
              </div>
              <div className="flex justify-end gap-2.5 border-t border-border px-[22px] py-4">
                <Button autoFocus onClick={() => setPendingPageRemoval(null)} type="button" variant="ghost">
                  Cancel
                </Button>
                <Button onClick={() => removePage(pendingPageRemoval)} type="button" variant="destructive">
                  Delete page {pendingPageRemoval + 1}
                </Button>
              </div>
            </section>
          ) : null}
        </dialog>
      </main>
      <style jsx global>{`
        [data-slot="designer-tool-menu"] nav[data-attached="true"]::before,
        [data-slot="designer-tool-menu"] nav[data-attached="true"]::after {
          position: absolute;
          right: -1px;
          width: calc(var(--radius-xl) + 1px);
          height: calc(var(--radius-xl) + 1px);
          pointer-events: none;
          content: "";
        }

        [data-slot="designer-tool-menu"] nav[data-attached="true"]::before {
          top: calc(var(--radius-xl) * -1);
          background: radial-gradient(
            circle at top left,
            transparent calc(var(--radius-xl) - 1px),
            var(--border) calc(var(--radius-xl) - 1px),
            var(--border) var(--radius-xl),
            var(--card) var(--radius-xl)
          );
        }

        [data-slot="designer-tool-menu"] nav[data-attached="true"]::after {
          bottom: calc(var(--radius-xl) * -1);
          background: radial-gradient(
            circle at bottom left,
            transparent calc(var(--radius-xl) - 1px),
            var(--border) calc(var(--radius-xl) - 1px),
            var(--border) var(--radius-xl),
            var(--card) var(--radius-xl)
          );
        }

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
          overflow-anchor: none;
          overscroll-behavior: contain;
        }

        .advanced-pdfme-designer .pdfme-designer-canvas::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: var(--canvas-scroll-width, 0px);
          height: var(--canvas-scroll-height, 0px);
          pointer-events: none;
        }

        .advanced-pdfme-designer .pdfme-designer-canvas > div[style*="transform: scale("] {
          margin-left: var(--canvas-gutter-x, 0px);
          margin-top: var(--canvas-gutter-y, 0px);
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
          top: 14px !important;
          right: 1.5rem !important;
          z-index: 30 !important;
          width: 320px !important;
          height: min(578px, calc(100% - 28px)) !important;
          opacity: 0;
          transform: translateX(12px);
          visibility: hidden;
          pointer-events: none;
          transition:
            opacity 180ms cubic-bezier(0.22, 1, 0.36, 1),
            transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
            visibility 0s linear 180ms;
        }

        .advanced-pdfme-designer[data-field-inspector-open="true"] .pdfme-designer-right-sidebar {
          opacity: 1;
          transform: translateX(0);
          visibility: visible;
          pointer-events: auto;
          transition-delay: 0s;
        }

        .advanced-pdfme-designer .pdfme-designer-right-sidebar > div {
          position: absolute !important;
          inset: 0 !important;
          display: flex !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden;
          box-sizing: border-box;
          border: 1px solid var(--border) !important;
          border-radius: var(--radius-xl);
          background: var(--card) !important;
          box-shadow: 0 8px 24px rgb(17 18 20 / 0.08);
        }

        .advanced-pdfme-designer .pdfme-designer-detail-view {
          height: 100% !important;
        }

        @media (prefers-reduced-motion: reduce) {
          .advanced-pdfme-designer .pdfme-designer-right-sidebar {
            transform: none;
            transition: none;
          }
        }
      `}</style>
    </>
  );
}
