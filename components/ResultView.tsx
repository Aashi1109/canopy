"use client";
import { useTranslations } from "next-intl";

import {
  Strong,
  InlineCode,
  Caption,
  CodeBlock,
  Muted,
  List,
  Text,
  AlertBanner,
  ToolActionButton,
  DownloadResult,
  ContentState,
  MetricCard,
  SectionHeading,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from "@/components/ui/index.tsx";
import { AlertTriangle, Check, Copy } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { trackToolEvent } from "@/lib/analytics/ga4";
import { useAnalyticsToolKey } from "@/lib/tool-runtime/useToolRuntime";
import { DiffView } from "@/components/DiffView";
import { JsonResultRenderer, type JsonResultView } from "@/components/JsonResultRenderer";
import { CodeEditor } from "@/components/content/CodeEditor";
import { SyntaxHighlight } from "@/components/content/SyntaxHighlight";
import { SandboxedHtmlPreview } from "@/components/SandboxedHtmlPreview";
import { GeneratedList } from "@/components/Surfaces";
import type { ToolArtifact, ToolRender, ToolRenderKind, ToolResult } from "@/lib/tool-framework/result";
import type { ToolMessage } from "@/lib/tool-runtime/types";
import { readArtifact, type StoredToolArtifact } from "@/lib/tool-framework/artifacts";

const MarkdownPreview = dynamic(
  () => import("@/components/content/MarkdownPreview").then((module) => module.MarkdownPreview),
  {
    loading: function LoadingPreview() {
      const t = useTranslations("Workbench");
      return <Muted role="status">{t("loadingPreview")}</Muted>;
    },
  },
);

export interface ResultViewProps {
  colorPreviews?: boolean;
  hideArtifacts?: boolean;
  hideFileActions?: boolean;
  hideJsonHeader?: boolean;
  hideStats?: boolean;
  htmlPreview?: boolean;
  initialJsonView?: JsonResultView;
  jsonHeader?: ReactNode;
  language?: string;
  showLineNumbers?: boolean;
  markdownPreview?: boolean;
  previewLayout?: "document" | "table";
  result: ToolResult;
}

type ResultRendererOptions = Pick<
  ResultViewProps,
  | "colorPreviews"
  | "hideFileActions"
  | "hideJsonHeader"
  | "htmlPreview"
  | "initialJsonView"
  | "jsonHeader"
  | "language"
  | "showLineNumbers"
  | "markdownPreview"
  | "previewLayout"
>;

type ResultRendererRegistry = {
  [Kind in ToolRenderKind]: (
    result: Extract<ToolRender, { render: Kind }>,
    options: ResultRendererOptions & { t: ReturnType<typeof useTranslations>; message: MessageFormatter },
  ) => ReactNode;
};

type MessageFormatter = (reference: ToolMessage | undefined, fallback: string) => string;
function useResultMessage(): MessageFormatter {
  const t = useTranslations();
  return (reference, fallback) => {
    const key = reference ? `Tool.runtime.${reference.key}` : undefined;
    return key && t.has(key) ? t(key, reference?.values) : fallback;
  };
}

interface DownloadButtonProps {
  content?: BlobPart;
  disabled?: boolean;
  href?: string;
  iconOnly?: boolean;
  label?: string;
  mime: string;
  name: string;
}

interface CopyButtonProps {
  /** Optional content-only trigger, such as a copyable color value. */
  children?: ReactNode;
  content: string;
  disabled?: boolean;
  iconOnly?: boolean;
  label?: string;
}

export function downloadResultContent(content: BlobPart, mime: string, name: string, toolKey?: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.download = name;
  link.href = url;
  document.body.append(link);
  link.click();
  trackToolEvent("result_download", toolKey);
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function saveUrl(href: string, name: string, toolKey?: string) {
  const link = document.createElement("a");
  link.download = name;
  link.href = href;
  link.click();
  trackToolEvent("result_download", toolKey);
}

function DownloadButton({ content, disabled = false, href, label, iconOnly = false, mime, name }: DownloadButtonProps) {
  const t = useTranslations("Workbench");
  const toolKey = useAnalyticsToolKey();
  return (
    <ToolActionButton
      action="download"
      iconOnly={iconOnly}
      disabled={disabled}
      onClick={() =>
        href
          ? saveUrl(href, name, toolKey)
          : content !== undefined
            ? downloadResultContent(content, mime, name, toolKey)
            : undefined
      }
      type="button"
    >
      {label ?? t("download")}
    </ToolActionButton>
  );
}

function ArtifactDownloadButton({
  artifact,
  label,
  iconOnly = false,
}: {
  artifact: StoredToolArtifact;
  iconOnly?: boolean;
  label?: string;
}) {
  const t = useTranslations("Workbench");
  const toolKey = useAnalyticsToolKey();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const download = async () => {
    if (pending) return;
    setPending(true);
    setFailure("");
    try {
      const file = await readArtifact(artifact);
      const url = URL.createObjectURL(file);
      saveUrl(url, artifact.name, toolKey);
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setFailure(t("fileUnavailable"));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <ToolActionButton
        action="download"
        iconOnly={iconOnly}
        disabled={pending}
        onClick={() => void download()}
        type="button"
      >
        {pending ? t("preparing") : failure ? t("retryDownload") : (label ?? t("downloadFile"))}
      </ToolActionButton>
      {failure ? (
        <Caption className="text-destructive" role="alert">
          {failure}
        </Caption>
      ) : null}
    </div>
  );
}

// Deferred exports stay in the UI; serializable tool results still use ToolArtifact.
export type DownloadableArtifact =
  | ToolArtifact
  | {
      storage: "deferred";
      name: string;
      mimeType: string;
      getContent: () => Promise<BlobPart>;
    };

export function ArtifactDownloadMenu({ artifacts }: { artifacts?: readonly DownloadableArtifact[] }) {
  const t = useTranslations("Workbench");
  const toolKey = useAnalyticsToolKey();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const currentArtifacts = useRef(artifacts);
  currentArtifacts.current = artifacts;

  useEffect(() => {
    currentArtifacts.current = artifacts;
    setOpen(false);
    return () => {
      currentArtifacts.current = undefined;
    };
  }, [artifacts]);

  const download = async (artifact: DownloadableArtifact) => {
    if (pendingRef.current || !currentArtifacts.current?.includes(artifact)) return;
    pendingRef.current = true;
    setOpen(false);
    setPending(true);
    try {
      if (artifact.storage === "inline") {
        downloadResultContent(artifact.content, artifact.mimeType, artifact.name, toolKey);
      } else if (artifact.storage === "deferred") {
        const content = await artifact.getContent();
        if (!currentArtifacts.current?.includes(artifact)) return;
        downloadResultContent(content, artifact.mimeType, artifact.name, toolKey);
      } else {
        const file = await readArtifact(artifact);
        if (!currentArtifacts.current?.includes(artifact)) return;
        downloadResultContent(file, artifact.mime, artifact.name, toolKey);
      }
    } catch (error) {
      if (!currentArtifacts.current?.includes(artifact)) return;
      toast.error(t("downloadFailed"), {
        description: t("fileUnavailable"),
      });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <TooltipProvider>
      <DropdownMenu open={open && Boolean(artifacts?.length)} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <ToolActionButton action="download" disabled={pending || !artifacts?.length} iconOnly>
                {t(pending ? "preparingDownload" : "downloadFormat")}
              </ToolActionButton>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("chooseDownloadFormat")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" aria-label={t("downloadFormat")}>
          {artifacts?.map((artifact, index) => (
            <DropdownMenuItem
              key={`${artifact.name}-${index}`}
              disabled={pending}
              onSelect={() => void download(artifact)}
            >
              {artifact.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}

export function CopyButton({ children, content, disabled = false, iconOnly = false, label }: CopyButtonProps) {
  const t = useTranslations("Workbench");
  const toolKey = useAnalyticsToolKey();
  const [feedback, setFeedback] = useState<{
    content: string;
    status: "copied" | "failed";
  } | null>(null);
  const contentRef = useRef(content);
  const copyRequest = useRef(0);
  const resetTimeout = useRef<number | undefined>(undefined);
  contentRef.current = content;

  useEffect(
    () => () => {
      copyRequest.current += 1;
      window.clearTimeout(resetTimeout.current);
    },
    [],
  );

  async function copy() {
    const request = ++copyRequest.current;
    const copiedContent = content;
    window.clearTimeout(resetTimeout.current);
    setFeedback(null);
    try {
      await navigator.clipboard.writeText(copiedContent);
      if (request !== copyRequest.current || copiedContent !== contentRef.current) return;
      setFeedback({ content: copiedContent, status: "copied" });
      trackToolEvent("result_copy", toolKey);
      resetTimeout.current = window.setTimeout(() => setFeedback(null), 2_000);
    } catch {
      if (request !== copyRequest.current || copiedContent !== contentRef.current) return;
      setFeedback({ content: copiedContent, status: "failed" });
    }
  }

  const status = feedback?.content === content ? feedback.status : "idle";
  const statusLabel = status === "copied" ? t("copied") : status === "failed" ? t("copyFailed") : (label ?? t("copy"));
  const StatusIcon = status === "copied" ? Check : status === "failed" ? AlertTriangle : Copy;

  return (
    <ToolActionButton
      action="copy"
      aria-label={iconOnly || children ? statusLabel : undefined}
      icon={children && status === "idle" ? <></> : <StatusIcon aria-hidden="true" />}
      iconOnly={iconOnly}
      disabled={disabled}
      onClick={() => void copy()}
      title={iconOnly ? statusLabel : undefined}
      type="button"
    >
      <span aria-live="polite" className={iconOnly ? "sr-only" : undefined}>
        {status === "idle" ? (children ?? statusLabel) : statusLabel}
      </span>
    </ToolActionButton>
  );
}

function RenderFrame({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}

function ImageResultPreview({ result }: { result: Extract<ToolRender, { render: "image" }> }) {
  const t = useTranslations("Workbench");
  const [failed, setFailed] = useState(false);
  return (
    <RenderFrame>
      {failed ? (
        <ContentState
          density="compact"
          state="error"
          title={t("imageUnavailable")}
          description={result.downloadName ? t("imageDownloadHint") : t("imageRetryHint")}
        />
      ) : (
        <div className="grid min-h-80 flex-1 place-items-center overflow-auto bg-muted/45 p-6">
          <img
            alt={result.alt}
            className="max-h-full max-w-full object-contain"
            height={result.height}
            onError={() => setFailed(true)}
            src={result.src}
            width={result.width}
          />
        </div>
      )}
    </RenderFrame>
  );
}

function TruncatedResultNotice() {
  const t = useTranslations("Workbench");
  return <Muted className="shrink-0 px-4 py-2 text-muted-foreground">{t("previewNotice")}</Muted>;
}

function htmlPreviewMarkup(html: string, layout?: ResultViewProps["previewLayout"]) {
  // Preview-only styling; copy and download keep the generated HTML unchanged.
  return layout === "table" ? `<style>th,td{white-space:nowrap}</style>${html}` : html;
}

function MarkdownResultPreview({
  markdown,
  truncated,
  layout = "document",
}: {
  markdown: string;
  truncated?: boolean;
  layout?: ResultViewProps["previewLayout"];
}) {
  const tableLayout = layout === "table";
  return (
    <RenderFrame>
      <div className={`min-h-0 flex-1 ${tableLayout ? "overflow-hidden" : "overflow-auto p-4"}`}>
        <MarkdownPreview
          markdown={markdown}
          allowHtmlLineBreaks={tableLayout}
          className={
            tableLayout
              ? "h-full [&_table]:max-h-full [&_td]:whitespace-nowrap [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:whitespace-nowrap"
              : undefined
          }
        />
      </div>
      {truncated ? <TruncatedResultNotice /> : null}
    </RenderFrame>
  );
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

type ResultArtifact = {
  copy?: string;
  copyLabel?: string;
  download?: {
    content?: BlobPart;
    href?: string;
    label?: string;
    mime: string;
    name: string;
  };
};

function resultArtifact(result: ToolResult | null, t: ReturnType<typeof useTranslations>): ResultArtifact | null {
  if (!result) return null;

  switch (result.render) {
    case "text":
      return {
        copy: result.text,
        copyLabel: result.truncated ? t("copyPreview") : undefined,
        download: result.downloadName
          ? { content: result.text, mime: "text/plain;charset=utf-8", name: result.downloadName }
          : undefined,
      };
    case "code":
      return {
        copy: result.code,
        copyLabel: result.truncated ? t("copyPreview") : undefined,
        download: result.downloadName
          ? { content: result.code, mime: "text/plain;charset=utf-8", name: result.downloadName }
          : undefined,
      };
    case "json-tree": {
      const content = result.text ?? JSON.stringify(result.value, null, 2) ?? String(result.value);
      return {
        copy: content,
        download: { content, mime: "application/json;charset=utf-8", name: "result.json" },
      };
    }
    case "table": {
      const content = [result.columns, ...result.rows].map((row) => row.map(csvCell).join(",")).join("\n");
      return {
        copy: content,
        copyLabel: result.truncated ? t("copyRows") : undefined,
        download: result.downloadName
          ? {
              content,
              label: result.truncated ? t("downloadRows") : undefined,
              mime: "text/csv;charset=utf-8",
              name: result.downloadName,
            }
          : undefined,
      };
    }
    case "key-value":
      return {
        copy: result.entries.map((entry) => `${entry.label}: ${entry.value}`).join("\n"),
      };
    case "list": {
      const content = result.items.join("\n");
      return {
        copy: content,
        copyLabel: result.truncated ? t("copyItems") : undefined,
        download: result.downloadName
          ? { content, mime: "text/plain;charset=utf-8", name: result.downloadName }
          : undefined,
      };
    }
    case "html":
      return {
        copy: result.html,
        download: result.downloadName
          ? { content: result.html, mime: "text/html;charset=utf-8", name: result.downloadName }
          : undefined,
      };
    case "link-preview":
      return {
        copy: result.tags,
        download: result.downloadName
          ? { content: result.tags, mime: "text/html;charset=utf-8", name: result.downloadName }
          : undefined,
      };
    case "image":
      return {
        copy: result.src.startsWith("data:image/") ? result.src : undefined,
        copyLabel: t("copyImageUrl"),
        download: result.downloadName ? { href: result.src, mime: result.mime, name: result.downloadName } : undefined,
      };
    case "diff": {
      const content = result.lines
        .map((line) => `${line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}${line.text}`)
        .join("\n");
      return {
        copy: content,
        download: result.downloadName
          ? { content, mime: "text/plain;charset=utf-8", name: result.downloadName }
          : undefined,
      };
    }
    case "files":
    case "none":
      return null;
  }
}

function firstStoredArtifact(result: ToolResult | null): StoredToolArtifact | null {
  if (!result) return null;
  if (result.render === "files" && result.files.length === 1) return result.files[0];
  const direct = result.artifacts?.find((artifact): artifact is StoredToolArtifact => artifact.storage !== "inline");
  if (direct) return direct;
  for (const section of result.sections ?? []) {
    if (section.body.render !== "files") continue;
    const stored = section.body.files.find((file): file is StoredToolArtifact => "storage" in file);
    if (stored) return stored;
  }
  return null;
}

export function getResultCount(result: ToolResult | null): number | null {
  if (!result) return null;
  switch (result.render) {
    case "list":
      return result.items.length;
    case "table":
      return result.rows.length;
    case "key-value":
      return result.entries.length;
    case "files":
      return result.files.length;
    default:
      return null;
  }
}

export function ResultActions({
  canCopy,
  canDownload,
  downloadMenu = false,
  result,
}: {
  canCopy: boolean;
  canDownload: boolean;
  downloadMenu?: boolean;
  result: ToolResult | null;
}) {
  const t = useTranslations("Workbench");
  const artifact = resultArtifact(result, t);
  const storedArtifact = firstStoredArtifact(result);
  const download = artifact?.download;
  const extension = download?.name.match(/\.[^.]+$/)?.[0];

  return (
    <>
      {canCopy && (!result || artifact?.copy !== undefined) ? (
        <CopyButton
          content={artifact?.copy ?? ""}
          disabled={artifact?.copy === undefined}
          iconOnly
          label={artifact?.copyLabel ?? t("copyAll")}
        />
      ) : null}
      {canDownload ? (
        downloadMenu ? (
          <ArtifactDownloadMenu artifacts={result?.artifacts} />
        ) : storedArtifact ? (
          <ArtifactDownloadButton artifact={storedArtifact} iconOnly />
        ) : (
          <DownloadButton
            iconOnly
            content={download?.content}
            disabled={!download}
            href={download?.href}
            label={download?.label ?? (extension ? t("downloadExtension", { extension }) : t("download"))}
            mime={download?.mime ?? "application/octet-stream"}
            name={download?.name ?? "result"}
          />
        )
      ) : null}
    </>
  );
}

const RESULT_RENDERERS: ResultRendererRegistry = {
  "link-preview": (result) => (
    <RenderFrame>
      <div className="space-y-3 overflow-auto p-4">
        <Strong>{result.metadata.title || result.resolvedUrl}</Strong>
        <Text>{result.metadata.description}</Text>
        <CodeBlock className="whitespace-pre-wrap break-words">
          <SyntaxHighlight code={result.tags} language="html" />
        </CodeBlock>
      </div>
    </RenderFrame>
  ),
  text: (result, options) =>
    options?.markdownPreview ? (
      <MarkdownResultPreview markdown={result.text} truncated={result.truncated} layout={options.previewLayout} />
    ) : (
      <RenderFrame>
        {options?.language ? (
          <CodeEditor
            aria-label={options.t("resultCode")}
            className="min-h-0 flex-1"
            colorPreviews={options.colorPreviews}
            value={result.text}
            language={options.language}
            readOnly
            showLineNumbers={options.showLineNumbers ?? false}
          />
        ) : (
          <CodeBlock className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4">
            {result.language ? <SyntaxHighlight code={result.text} language={result.language} /> : result.text}
          </CodeBlock>
        )}
        {result.truncated ? <TruncatedResultNotice /> : null}
      </RenderFrame>
    ),
  code: (result, options) =>
    options?.htmlPreview ? (
      <RenderFrame>
        <SandboxedHtmlPreview className="min-h-0" html={htmlPreviewMarkup(result.code, options.previewLayout)} />
        {result.truncated ? <TruncatedResultNotice /> : null}
      </RenderFrame>
    ) : options?.markdownPreview ? (
      <MarkdownResultPreview markdown={result.code} truncated={result.truncated} layout={options.previewLayout} />
    ) : (
      <RenderFrame>
        <CodeEditor
          aria-label={options.t("resultCode")}
          className="min-h-0 flex-1"
          colorPreviews={options?.colorPreviews}
          value={result.code}
          language={result.language}
          readOnly
          showLineNumbers={options?.showLineNumbers ?? false}
        />
        {result.truncated ? <TruncatedResultNotice /> : null}
      </RenderFrame>
    ),
  "json-tree": (result, options) => {
    const json = result.text ?? JSON.stringify(result.value, null, 2)!;
    const tree = (
      <JsonResultRenderer
        key={options?.hideJsonHeader && options.initialJsonView === "read-only" ? json : options?.initialJsonView}
        className={`h-full ${options?.hideJsonHeader ? "!bg-transparent" : ""}`}
        defaultOpenDepth={1}
        defaultView={options?.initialJsonView}
        downloadName={result.downloadName ?? "result.json"}
        formattedValue={json}
        header={options?.hideJsonHeader ? "hidden" : "visible"}
        headerStart={options?.jsonHeader}
        maxVisibleEntries={1_000}
        value={result.value}
      />
    );
    return result.truncated ? (
      <RenderFrame>
        {tree}
        <Muted className="shrink-0 px-4 py-2 text-muted-foreground">{options.t("partialResult")}</Muted>
      </RenderFrame>
    ) : (
      tree
    );
  },
  table: (result, options) => {
    if (result.columns.length === 0) {
      return (
        <ContentState
          density="compact"
          state="empty"
          title={options.t("noColumns")}
          description={options.t("noColumnsDescription")}
        />
      );
    }
    const tableLayout = options?.previewLayout === "table";
    const truncationNotice = result.truncated ? (
      <Muted className="shrink-0 border-t border-border p-3 text-muted-foreground">{options.t("partialTable")}</Muted>
    ) : null;
    return (
      <RenderFrame>
        <div className={`min-h-0 flex-1 ${tableLayout ? "overflow-hidden" : "overflow-auto"}`}>
          <Table showColumnDividers={result.showColumnDividers}>
            <TableHeader>
              <TableRow>
                {result.columns.map((column, index) => (
                  <TableHead className="whitespace-pre" key={`${index}-${column}`}>
                    {options.message(result.columnMessages?.[index], column)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {result.columns.map((_, columnIndex) => (
                    <TableCell className="whitespace-pre" key={columnIndex}>
                      {options.message(result.rowMessages?.[rowIndex]?.[columnIndex], row[columnIndex] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!tableLayout ? truncationNotice : null}
        </div>
        {tableLayout ? truncationNotice : null}
      </RenderFrame>
    );
  },
  "key-value": (result, options) => {
    return (
      <RenderFrame>
        <dl className="min-h-0 flex-1 divide-y divide-border overflow-auto">
          {result.entries.map((entry) => (
            <div
              className="grid grid-cols-[minmax(8rem,0.4fr)_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3"
              key={`${entry.label}-${entry.value}`}
            >
              <dt>
                <Text>
                  <Strong>{options.message(entry.labelMessage, entry.label)}</Strong>
                </Text>
              </dt>
              <dd className="break-words text-muted-foreground">
                {entry.valueMessage ? (
                  <Text>{options.message(entry.valueMessage, entry.value)}</Text>
                ) : (
                  <InlineCode>{entry.value}</InlineCode>
                )}
              </dd>
              <CopyButton
                content={entry.value}
                iconOnly
                label={options.t("copyValue", { label: options.message(entry.labelMessage, entry.label) })}
              />
            </div>
          ))}
        </dl>
      </RenderFrame>
    );
  },
  list: (result, options) => {
    const items = result.items.map((value, index) => ({
      description: result.labels?.[index],
      id: `${index}-${value}`,
      label: String(index + 1).padStart(2, "0"),
      value,
      displayValue: options.message(result.itemMessages?.[index], value),
    }));
    return (
      <RenderFrame>
        <GeneratedList
          getDescription={(item) => item.description}
          getId={(item) => item.id}
          getLabel={(item) => item.label}
          getValue={(item) => item.displayValue}
          items={items}
          renderAction={(item, index) => (
            <CopyButton content={item.value} iconOnly label={options.t("copyItem", { count: index + 1 })} />
          )}
        />
      </RenderFrame>
    );
  },
  html: (result, options) =>
    result.tablePreview && !options?.htmlPreview ? (
      RESULT_RENDERERS.table(result.tablePreview, options)
    ) : (
      <RenderFrame>
        <SandboxedHtmlPreview html={htmlPreviewMarkup(result.html, options?.previewLayout)} />
      </RenderFrame>
    ),
  image: (result) => <ImageResultPreview key={result.src} result={result} />,
  diff: (result) => {
    return (
      <RenderFrame>
        <DiffView result={result} />
      </RenderFrame>
    );
  },
  files: (result, options) => (
    <div className="grid gap-3 p-4">
      {result.files.map((file) => {
        return (
          <DownloadResult
            action={options?.hideFileActions ? undefined : <ArtifactDownloadButton artifact={file} />}
            className="[&_p]:truncate"
            key={`${file.name}-${file.size}`}
            metadata={`${file.mime} · ${options.t("bytes", { count: file.size })}`}
            title={file.name}
          />
        );
      })}
      {result.inputBytes !== undefined || result.outputBytes !== undefined ? (
        <Muted className="text-muted-foreground">
          {result.inputBytes !== undefined ? options.t("inputBytes", { count: result.inputBytes }) : null}
          {result.inputBytes !== undefined && result.outputBytes !== undefined ? " · " : null}
          {result.outputBytes !== undefined ? options.t("outputBytes", { count: result.outputBytes }) : null}
        </Muted>
      ) : null}
    </div>
  ),
  none: (_result, options) => (
    <ContentState
      density="compact"
      state="complete"
      title={options.t("completed")}
      description={options.t("completedDescription")}
    />
  ),
};

function renderPrimary(
  result: ToolRender,
  t: ReturnType<typeof useTranslations>,
  message: MessageFormatter,
  options?: ResultRendererOptions,
): ReactNode {
  return RESULT_RENDERERS[result.render](result as never, { ...options, t, message });
}

function CommonResultDetails({ hideArtifacts, hideStats, result }: ResultViewProps) {
  const t = useTranslations("Workbench");
  const message = useResultMessage();
  const hasDetails = Boolean(
    (!hideStats && result.stats?.length) ||
    result.verdict ||
    result.issues?.length ||
    (!hideArtifacts && result.artifacts?.length) ||
    result.sections?.length,
  );
  if (!hasDetails) return null;
  const generatedFileSections = result.sections?.filter((section) => section.body.render === "files");
  const otherSections = result.sections?.filter((section) => section.body.render !== "files");
  return (
    <div className="grid gap-4 border-t border-border p-4">
      {generatedFileSections?.map((section) => (
        <section key={section.title}>
          <SectionHeading title={section.title} />
          {renderPrimary(section.body, t, message)}
        </section>
      ))}
      {!hideStats && result.stats?.length ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
          {result.stats.map((stat) => (
            <MetricCard
              key={`${stat.label}-${stat.value}`}
              label={message(stat.labelMessage, stat.label)}
              value={message(stat.valueMessage, stat.value)}
            />
          ))}
        </div>
      ) : null}
      {result.verdict ? (
        <AlertBanner
          action={
            <StatusBadge
              variant={
                result.verdict.level === "ok" ? "success" : result.verdict.level === "error" ? "danger" : "warning"
              }
            >
              {t(result.verdict.level === "ok" ? "ok" : result.verdict.level === "error" ? "error" : "warning")}
            </StatusBadge>
          }
          title={result.verdict.label}
          variant={result.verdict.level === "ok" ? "success" : result.verdict.level === "error" ? "error" : "warning"}
        >
          {result.verdict.detail}
        </AlertBanner>
      ) : null}
      {result.issues?.length ? (
        <AlertBanner title={t("issues")} variant="warning">
          <List className="list-disc space-y-1 pl-4">
            {result.issues.map((issue, index) => (
              <li key={`${index}-${issue.message}`}>
                {issue.target ? `${issue.target[0].toUpperCase()}${issue.target.slice(1)}: ` : null}
                {issue.message}
                {issue.line !== undefined
                  ? ` ${t(issue.column !== undefined ? "lineColumn" : "line", { line: issue.line, column: issue.column ?? 0 })}`
                  : ""}
              </li>
            ))}
          </List>
        </AlertBanner>
      ) : null}
      {!hideArtifacts && result.artifacts?.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <Text>{t("downloads")}</Text>
          {result.artifacts.map((artifact) =>
            artifact.storage === "inline" ? (
              <DownloadButton
                content={artifact.content}
                label={artifact.name}
                key={artifact.name}
                mime={artifact.mimeType}
                name={artifact.name}
              />
            ) : (
              <ArtifactDownloadButton artifact={artifact} key={artifact.id} label={artifact.name} />
            ),
          )}
        </div>
      ) : null}
      {otherSections?.map((section) => (
        <section key={section.title}>
          <SectionHeading title={section.title} />
          {renderPrimary(section.body, t, message)}
        </section>
      ))}
    </div>
  );
}

export function ResultView({
  colorPreviews,
  hideArtifacts,
  hideFileActions,
  hideJsonHeader,
  hideStats,
  htmlPreview,
  initialJsonView,
  jsonHeader,
  language,
  showLineNumbers,
  markdownPreview,
  previewLayout,
  result,
}: ResultViewProps) {
  const t = useTranslations("Workbench");
  const message = useResultMessage();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {renderPrimary(result, t, message, {
        colorPreviews,
        hideFileActions,
        hideJsonHeader,
        htmlPreview,
        initialJsonView,
        jsonHeader,
        language,
        showLineNumbers,
        markdownPreview,
        previewLayout,
      })}
      <CommonResultDetails hideArtifacts={hideArtifacts} hideStats={hideStats} result={result} />
    </div>
  );
}
