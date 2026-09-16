"use client";

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
  EmptyState,
  MetricCard,
  SectionHeading,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@smarttools/ui";
import {
  AlertTriangle,
  Check,
  Copy,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { trackToolEvent } from "@/lib/analytics/ga4";
import { useAnalyticsToolKey } from "@/lib/tool-runtime/useToolRuntime";
import { DiffView } from "@/components/DiffView";
import { JsonResultRenderer, type JsonResultView } from "@/components/JsonResultRenderer";
import { SandboxedHtmlPreview } from "@/components/SandboxedHtmlPreview";
import { GeneratedList } from "@/components/Surfaces";
import type {
  ToolRender,
  ToolRenderKind,
  ToolResult,
} from "@/lib/tool-framework/result";
import {
  readArtifact,
  type StoredToolArtifact,
} from "@/lib/tool-framework/artifacts";

export interface ResultViewProps {
  hideJsonHeader?: boolean;
  initialJsonView?: JsonResultView;
  jsonHeader?: ReactNode;
  result: ToolResult;
}

type ResultRendererOptions = Pick<ResultViewProps, "hideJsonHeader" | "initialJsonView" | "jsonHeader">;

type ResultRendererRegistry = {
  [Kind in ToolRenderKind]: (
    result: Extract<ToolRender, { render: Kind }>,
    options?: ResultRendererOptions,
  ) => ReactNode;
};

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
  content: string;
  disabled?: boolean;
  iconOnly?: boolean;
  label?: string;
}

function saveBlob(content: BlobPart, mime: string, name: string, toolKey?: string) {
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

function DownloadButton({
  content,
  disabled = false,
  href,
  label = "Download",
  iconOnly = false,
  mime,
  name,
}: DownloadButtonProps) {
  const toolKey = useAnalyticsToolKey();
  return (
    <ToolActionButton action="download" iconOnly={iconOnly}
      disabled={disabled}
      onClick={() => href ? saveUrl(href, name, toolKey) : content !== undefined ? saveBlob(content, mime, name, toolKey) : undefined}
      type="button"
    >
      {label}
    </ToolActionButton>
  );
}

function ArtifactDownloadButton({
  artifact,
  label = "Download file",
  iconOnly = false,
}: {
  artifact: StoredToolArtifact;
  iconOnly?: boolean;
  label?: string;
}) {
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
      setFailure(
        error instanceof Error
          ? error.message
          : "The generated file is unavailable. Run the tool again.",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <ToolActionButton action="download" iconOnly={iconOnly} disabled={pending} onClick={() => void download()} type="button">
        {pending ? "Preparing…" : failure ? "Try download again" : label}
      </ToolActionButton>
      {failure ? (
        <Caption className="text-destructive" role="alert">
          {failure}
        </Caption>
      ) : null}
    </div>
  );
}

function CopyButton({
  content,
  disabled = false,
  iconOnly = false,
  label = "Copy",
}: CopyButtonProps) {
  const toolKey = useAnalyticsToolKey();
  const [feedback, setFeedback] = useState<{
    content: string;
    status: "copied" | "failed";
  } | null>(null);
  const contentRef = useRef(content);
  const copyRequest = useRef(0);
  const resetTimeout = useRef<number | undefined>(undefined);
  contentRef.current = content;

  useEffect(() => () => {
    copyRequest.current += 1;
    window.clearTimeout(resetTimeout.current);
  }, []);

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
  const statusLabel = status === "copied"
    ? "Copied"
    : status === "failed"
      ? "Copy failed — try again"
      : label;
  const StatusIcon = status === "copied"
    ? Check
    : status === "failed"
      ? AlertTriangle
      : Copy;

  return (
    <ToolActionButton
      action="copy"
      aria-label={iconOnly ? statusLabel : undefined}
      icon={<StatusIcon aria-hidden="true" />}
      iconOnly={iconOnly}
      disabled={disabled}
      onClick={() => void copy()}
      title={iconOnly ? statusLabel : undefined}
      type="button"
    >
      <span aria-live="polite" className={iconOnly ? "sr-only" : undefined}>{statusLabel}</span>
    </ToolActionButton>
  );
}

function RenderFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
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

function resultArtifact(result: ToolResult | null): ResultArtifact | null {
  if (!result) return null;

  switch (result.render) {
    case "text":
      return {
        copy: result.text,
        download: result.downloadName
          ? { content: result.text, mime: "text/plain;charset=utf-8", name: result.downloadName }
          : undefined,
      };
    case "code":
      return {
        copy: result.code,
        copyLabel: result.truncated ? "Copy preview" : undefined,
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
      const content = [result.columns, ...result.rows]
        .map((row) => row.map(csvCell).join(","))
        .join("\n");
      return {
        copy: content,
        copyLabel: result.truncated ? "Copy shown rows" : undefined,
        download: result.downloadName
          ? {
              content,
              label: result.truncated ? "Download shown rows" : undefined,
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
        copyLabel: result.truncated ? "Copy shown items" : undefined,
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
    case "image":
      return {
        download: result.downloadName
          ? { href: result.src, mime: result.mime, name: result.downloadName }
          : undefined,
      };
    case "diff":
      return {
        copy: result.lines
          .map((line) => `${line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}${line.text}`)
          .join("\n"),
      };
    case "files":
    case "none":
      return null;
  }
}

function firstStoredArtifact(result: ToolResult | null): StoredToolArtifact | null {
  if (!result) return null;
  const direct = result.artifacts?.find(
    (artifact): artifact is StoredToolArtifact => artifact.storage !== "inline",
  );
  if (direct) return direct;
  for (const section of result.sections ?? []) {
    if (section.body.render !== "files") continue;
    const stored = section.body.files.find(
      (file): file is StoredToolArtifact => "storage" in file,
    );
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
  result,
}: {
  canCopy: boolean;
  canDownload: boolean;
  result: ToolResult | null;
}) {
  const artifact = resultArtifact(result);
  const storedArtifact = firstStoredArtifact(result);
  const download = artifact?.download;
  const extension = download?.name.match(/\.[^.]+$/)?.[0];

  return (
    <>
      {canCopy ? (
        <CopyButton
          content={artifact?.copy ?? ""}
          disabled={artifact?.copy === undefined}
          iconOnly
          label={artifact?.copyLabel ?? "Copy all"}
        />
      ) : null}
      {canDownload ? (
        storedArtifact ? (
          <ArtifactDownloadButton artifact={storedArtifact} iconOnly />
        ) : (
          <DownloadButton
            iconOnly
            content={download?.content}
            disabled={!download}
            href={download?.href}
            label={download?.label ?? (extension ? `Download ${extension}` : "Download")}
            mime={download?.mime ?? "application/octet-stream"}
            name={download?.name ?? "result"}
          />
        )
      ) : null}
    </>
  );
}

const RESULT_RENDERERS: ResultRendererRegistry = {
  text: (result) => (
    <RenderFrame>
      <CodeBlock className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4">{result.text}</CodeBlock>
    </RenderFrame>
  ),
  code: (result) => (
    <RenderFrame>
      <CodeBlock className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all bg-muted/45 p-4" data-language={result.language}>{result.code}</CodeBlock>
    </RenderFrame>
  ),
  "json-tree": (result, options) => {
    const json = result.text ?? JSON.stringify(result.value, null, 2)!;
    return (
      <JsonResultRenderer
        key={options?.initialJsonView}
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
  },
  table: (result) => {
    return (
      <RenderFrame>
        <div className="min-h-0 flex-1 overflow-auto">
          <Table showColumnDividers={result.showColumnDividers}>
            <TableHeader>
              <TableRow>{result.columns.map((column, index) => <TableHead key={`${index}-${column}`}>{column}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {result.columns.map((_, columnIndex) => <TableCell key={columnIndex}>{row[columnIndex] ?? ""}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {result.truncated ? <Muted className="border-t border-border p-3 text-muted-foreground">Only part of the result is shown.</Muted> : null}
        </div>
      </RenderFrame>
    );
  },
  "key-value": (result) => {
    return (
      <RenderFrame>
        <dl className="min-h-0 flex-1 divide-y divide-border overflow-auto">
          {result.entries.map((entry) => (
            <div className="grid grid-cols-[minmax(8rem,0.4fr)_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3" key={`${entry.label}-${entry.value}`}>
              <dt><Text><Strong>{entry.label}</Strong></Text></dt>
              <dd className="break-words text-muted-foreground"><InlineCode>{entry.value}</InlineCode></dd>
              <CopyButton content={entry.value} iconOnly label={`Copy ${entry.label}`} />
            </div>
          ))}
        </dl>
      </RenderFrame>
    );
  },
  list: (result) => {
    const items = result.items.map((value, index) => ({
      description: result.labels?.[index],
      id: `${index}-${value}`,
      label: String(index + 1).padStart(2, "0"),
      value,
    }));
    return (
      <RenderFrame>
        <GeneratedList
          getDescription={(item) => item.description}
          getId={(item) => item.id}
          getLabel={(item) => item.label}
          getValue={(item) => item.value}
          items={items}
          renderAction={(item, index) => (
            <CopyButton content={item.value} iconOnly label={`Copy item ${index + 1}`} />
          )}
        />
      </RenderFrame>
    );
  },
  html: (result) => (
    <RenderFrame>
      <SandboxedHtmlPreview html={result.html} />
    </RenderFrame>
  ),
  image: (result) => (
    <RenderFrame>
      <div className="grid min-h-80 flex-1 place-items-center overflow-auto bg-muted/45 p-6">
        <img
          alt={result.alt}
          className="max-h-full max-w-full object-contain"
          height={result.height}
          src={result.src}
          width={result.width}
        />
      </div>
    </RenderFrame>
  ),
  diff: (result) => {
    return (
      <RenderFrame>
        <DiffView result={result} />
      </RenderFrame>
    );
  },
  files: (result) => (
    <div className="grid gap-3 p-4">
      {result.files.map((file) => {
        return (
        <DownloadResult
          action={<ArtifactDownloadButton artifact={file} />}
          className="[&_p]:truncate"
          key={`${file.name}-${file.size}`}
          metadata={`${file.mime} · ${file.size.toLocaleString()} bytes`}
          title={file.name}
        />
        );
      })}
      {result.inputBytes !== undefined || result.outputBytes !== undefined ? (
        <Muted className="text-muted-foreground">
          {result.inputBytes !== undefined ? `Input: ${result.inputBytes.toLocaleString()} bytes` : null}
          {result.inputBytes !== undefined && result.outputBytes !== undefined ? " · " : null}
          {result.outputBytes !== undefined ? `Output: ${result.outputBytes.toLocaleString()} bytes` : null}
        </Muted>
      ) : null}
    </div>
  ),
  none: () => (
    <EmptyState
      className="min-h-40"
      title="The action completed without a displayable result."
    />
  ),
};

function renderPrimary(result: ToolRender, options?: ResultRendererOptions): ReactNode {
  return RESULT_RENDERERS[result.render](result as never, options);
}

function CommonResultDetails({ result }: ResultViewProps) {
  const hasDetails = Boolean(
    result.stats?.length ||
    result.verdict ||
    result.issues?.length ||
    result.artifacts?.length ||
    result.sections?.length,
  );
  if (!hasDetails) return null;
  const generatedFileSections = result.sections?.filter(
    (section) => section.body.render === "files",
  );
  const otherSections = result.sections?.filter(
    (section) => section.body.render !== "files",
  );
  return (
    <div className="grid gap-4 border-t border-border p-4">
      {generatedFileSections?.map((section) => (
        <section key={section.title}>
          <SectionHeading title={section.title} />
          {renderPrimary(section.body)}
        </section>
      ))}
      {result.stats?.length ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
          {result.stats.map((stat) => (
            <MetricCard key={`${stat.label}-${stat.value}`} label={stat.label} value={stat.value} />
          ))}
        </div>
      ) : null}
      {result.verdict ? (
        <AlertBanner
          action={(
            <StatusBadge variant={result.verdict.level === "ok" ? "success" : result.verdict.level === "error" ? "danger" : "warning"}>
              {result.verdict.level === "ok" ? "OK" : result.verdict.level === "error" ? "Error" : "Warning"}
            </StatusBadge>
          )}
          title={result.verdict.label}
          variant={result.verdict.level === "ok" ? "success" : result.verdict.level === "error" ? "error" : "warning"}
        >
          {result.verdict.detail}
        </AlertBanner>
      ) : null}
      {result.issues?.length ? (
        <AlertBanner title="Issues" variant="warning">
          <List className="list-disc space-y-1 pl-4">
            {result.issues.map((issue, index) => (
              <li key={`${index}-${issue.message}`}>
                {issue.target ? `${issue.target[0].toUpperCase()}${issue.target.slice(1)}: ` : null}
                {issue.message}
                {issue.line !== undefined ? ` (line ${issue.line}${issue.column !== undefined ? `, column ${issue.column}` : ""})` : ""}
              </li>
            ))}
          </List>
        </AlertBanner>
      ) : null}
      {result.artifacts?.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <Text>Downloads</Text>
          {result.artifacts.map((artifact) => artifact.storage === "inline" ? (
            <DownloadButton content={artifact.content} label={artifact.name} key={artifact.name} mime={artifact.mimeType} name={artifact.name} />
          ) : (
            <ArtifactDownloadButton artifact={artifact} key={artifact.id} label={artifact.name} />
          ))}
        </div>
      ) : null}
      {otherSections?.map((section) => (
        <section key={section.title}>
          <SectionHeading title={section.title} />
          {renderPrimary(section.body)}
        </section>
      ))}
    </div>
  );
}

export function ResultView({ hideJsonHeader, initialJsonView, jsonHeader, result }: ResultViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {renderPrimary(result, { hideJsonHeader, initialJsonView, jsonHeader })}
      <CommonResultDetails result={result} />
    </div>
  );
}
