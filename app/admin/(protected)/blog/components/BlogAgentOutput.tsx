"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  Copy,
  Download,
  Globe,
  FolderOpen,
  ImageIcon,
  NotebookPen,
  MessageSquare,
  SquarePen,
  ScanSearch,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import {
  BackButton,
  Button,
  ContentState,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  toast,
} from "@/components/ui/index.tsx";
import { BlogArticleBody } from "@/components/blog/BlogArticleBody";
import type { BlogDocument, BlogNode } from "@/lib/blog/document";
import type { BlogAttachment, BlogExecutionSummary } from "@/lib/blog/assistantTypes";
import { getBlogAgent } from "@/lib/blog/agentCatalog";
import {
  agentDocumentFingerprint,
  agentReplacement,
  sameAgentDocument,
  supportedArtifact,
  type BlogArtifact,
} from "@/lib/blog/agentArtifacts";
import { assistantRequest } from "../lib/assistantApi";
import styles from "./BlogAgentOutput.module.css";
import { BlogAssistantProgress } from "./BlogAssistantProgress";

function agentIcon(agentId: string | undefined) {
  if (agentId === "planner") return NotebookPen;
  if (agentId === "writer") return SquarePen;
  if (agentId === "auditor") return ScanSearch;
  return Sparkles;
}

function savedTime(createdAt: string) {
  return new Date(createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function SavedArtifactCard({
  label,
  summary,
  agentId,
  createdAt,
  stale = false,
  inLibrary = false,
  onOpen,
}: {
  label: string;
  summary: string;
  agentId?: string;
  createdAt: string;
  stale?: boolean;
  inLibrary?: boolean;
  onOpen: () => void;
}) {
  const Icon = agentIcon(agentId);
  return (
    <Button
      variant="outline"
      className={`${styles.artifactCard} ${inLibrary ? styles.libraryCard : ""}`}
      onClick={onOpen}
      aria-label={`Open ${label}`}
    >
      <span className={styles.cardHeading}>
        <ClipboardList className="size-4" aria-hidden="true" />
        <span>{label}</span>
        <span className={styles.cardChevron}>
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </span>
      </span>
      <span className={styles.cardSummary}>{summary}</span>
      <span className={styles.cardMeta}>
        <Icon className="size-3.5" aria-hidden="true" />
        <span className={styles.cardOrigin}>
          {getBlogAgent(agentId)?.name ?? "Saved output"} · <time dateTime={createdAt}>{savedTime(createdAt)}</time>
        </span>
        <span className={stale ? styles.stale : styles.ready}>
          {stale ? (
            "Draft changed"
          ) : (
            <>
              <span aria-hidden="true" />
              Ready
            </>
          )}
        </span>
      </span>
    </Button>
  );
}

export function BlogAgentRunCard({
  execution,
  document,
  busy,
  onOpen,
  onRetry,
  onNewRequest,
  onRefresh,
  onCopy,
  onUse,
}: {
  execution: BlogExecutionSummary;
  document: BlogDocument;
  busy: boolean;
  onOpen: (id: string) => void;
  onRetry: (id: string) => void;
  onNewRequest: () => void;
  onCopy: (id: string) => void;
  onUse: (id: string) => void;
  onRefresh: () => void;
}) {
  const [activityOpen, setActivityOpen] = useState(false);
  const agent = getBlogAgent(execution.agentId)?.name ?? "Agent";
  const AgentIcon = agentIcon(execution.agentId);
  const stale =
    !!execution.artifact?.baseDocumentFingerprint &&
    execution.artifact.baseDocumentFingerprint !== agentDocumentFingerprint(document);
  const active = ["running", "queued"].includes(execution.status);
  const unavailable = !!execution.expiresAt && Date.parse(execution.expiresAt) <= Date.now();
  return (
    <article className={styles.run} data-agent-run={execution.id} tabIndex={-1}>
      {execution.requestMessage && !unavailable && (
        <div className={styles.userRequest} aria-label={`Request to ${agent}`}>
          <span className={styles.requestAgent}>
            <AgentIcon className="size-3.5" aria-hidden="true" />
            <span>{agent}</span>
          </span>{" "}
          {execution.requestMessage}
        </div>
      )}
      <div className={styles.executionActivity}>
        <Button
          variant="input-icon"
          size="xs"
          className={styles.activityToggle}
          aria-expanded={activityOpen}
          aria-controls={`agent-activity-${execution.id}`}
          onClick={() => setActivityOpen((open) => !open)}
        >
          {activityOpen ? <ChevronDown /> : <ChevronRight />}
          View activity
        </Button>
        {activityOpen && (
          <ol className={styles.executionEvents} id={`agent-activity-${execution.id}`}>
            <li>
              <span>Request accepted</span>
              <time dateTime={execution.createdAt}>{savedTime(execution.createdAt)}</time>
            </li>
            {execution.completedAt ? (
              <li>
                <span>
                  {execution.status === "completed"
                    ? "Completed"
                    : execution.status === "cancelled"
                      ? "Stopped"
                      : execution.status === "failed"
                        ? "Failed"
                        : "Finished"}
                </span>
                <time dateTime={execution.completedAt}>{savedTime(execution.completedAt)}</time>
              </li>
            ) : (
              <li>
                <span>
                  {execution.status === "queued"
                    ? "Queued"
                    : execution.status === "running"
                      ? "Working"
                      : execution.status === "unknown"
                        ? "Status unconfirmed"
                        : execution.status === "cancelled"
                          ? "Stopped"
                          : execution.status === "failed"
                            ? "Failed"
                            : "Completed"}
                </span>
              </li>
            )}
          </ol>
        )}
      </div>
      {execution.artifact && !unavailable ? (
        <>
          <SavedArtifactCard
            label={execution.artifact.label}
            summary={execution.artifact.summary}
            agentId={execution.agentId}
            createdAt={execution.createdAt}
            stale={stale}
            onOpen={() => onOpen(execution.artifact!.attachmentId)}
          />
          <div className={styles.secondaryActions}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Use ${execution.artifact.label}`}
                  disabled={busy}
                  onClick={() => onUse(execution.artifact!.attachmentId)}
                >
                  <ArrowUpRight />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Use output or preview draft</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Copy ${execution.artifact.label}`}
                  onClick={() => onCopy(execution.artifact!.attachmentId)}
                >
                  <Copy />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy complete output</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Repeat ${agent}`}
                  disabled={busy}
                  onClick={() => onRetry(execution.id)}
                >
                  <RotateCcw />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Prepare a new request with {agent}</TooltipContent>
            </Tooltip>
          </div>
        </>
      ) : (
        <div className={styles.activity}>
          {active && !unavailable ? (
            <BlogAssistantProgress>
              {`${execution.status === "queued" ? "Starting" : "Working with"} ${agent}…`}
            </BlogAssistantProgress>
          ) : (
            <p role="status" className={styles.activityStatus}>
              <span>
                {unavailable
                  ? "This result has expired"
                  : execution.status === "failed"
                    ? `${agent} couldn’t finish`
                    : execution.status === "cancelled"
                      ? "Stopped"
                      : execution.status === "unknown"
                        ? "Connection interrupted"
                        : "Saved report unavailable"}
              </span>
            </p>
          )}
          <p className="text-caption text-muted-foreground">
            {execution.errorMessage ||
              (active
                ? ""
                : execution.status === "unknown"
                  ? "Status unconfirmed. Check before starting another run."
                  : "No report created. Your draft is unchanged.")}
          </p>
          {active ? null : execution.status === "unknown" ? (
            <Button variant="outline" size="xs" onClick={onRefresh}>
              Check status
            </Button>
          ) : unavailable ? (
            <Button variant="outline" size="xs" disabled={busy} onClick={onNewRequest}>
              Prepare new request
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Retry ${agent}`}
                  disabled={busy}
                  onClick={() => onRetry(execution.id)}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Retry {agent}</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </article>
  );
}

function nodeText(node: BlogNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? [])
    .map(nodeText)
    .join(["doc", "table", "tableRow", "bulletList", "orderedList"].includes(node.type) ? "\n" : "");
}
export function readableArtifact(artifact: BlogArtifact) {
  const content = artifact.content;
  return [
    artifact.summary,
    ...(content.document
      ? [
          content.document.title,
          content.document.excerpt,
          nodeText(content.document.body),
          `SEO title: ${content.document.seoTitle ?? ""}`,
          `SEO description: ${content.document.seoDescription ?? ""}`,
        ]
      : []),
    ...(content.sections ?? []).map((section) =>
      [
        section.heading,
        section.text,
        ...(section.items ?? []),
        ...(section.findings ?? []).map(
          (finding) => `${finding.severity}: ${finding.issue}\n${finding.passage}\n${finding.recommendation}`,
        ),
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    content.searchIntent,
    ...(content.keywords ?? []).map((item) => `${item.keyword} (${item.kind}): ${item.rationale}`),
    ...(content.changes ?? []),
    ...(content.remainingTasks ?? []),
    ...(content.citations ?? []).map((citation) => `${citation.title}: ${citation.url}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Could not copy. Select the report text and copy it manually.");
  }
}

function sourceUrl(value?: string) {
  try {
    const url = new URL(value ?? "");
    return ["https:", "http:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function SourceAttachment({ file }: { file: BlogAttachment }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const link = file.type === "link" ? sourceUrl(file.data.url) : null;
  const expired = !!file.expiresAt && Date.parse(file.expiresAt) <= Date.now();
  const imageUrl = file.type === "image" && !expired ? sourceUrl(file.data.url)?.href : undefined;
  const [imageFailed, setImageFailed] = useState(false);
  const format = file.data.mimeType?.split("/").at(-1)?.toUpperCase() ?? "Image";
  const description = expired
    ? "Expired"
    : file.status !== "ready"
      ? file.status
      : link
        ? `${link.hostname} · Reference link`
        : `${format}${file.data.sizeBytes ? ` · ${Math.ceil(file.data.sizeBytes / 1024)} KB` : ""}`;
  const content = (
    <>
      <span className={styles.thumbnail}>
        {imageUrl && !imageFailed ? (
          <img src={imageUrl} alt="" onError={() => setImageFailed(true)} />
        ) : file.type === "link" ? (
          <Globe className="size-6" aria-hidden="true" />
        ) : (
          <ImageIcon className="size-6" aria-hidden="true" />
        )}
      </span>
      <span className={styles.sourceText}>
        <span>{file.label}</span>
        <small>{description}</small>
      </span>
      {link ? (
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
      ) : (
        <ChevronRight className="size-3.5" aria-hidden="true" />
      )}
    </>
  );
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          {link && !expired ? (
            <Button asChild variant="outline" className={styles.sourceRow}>
              <a href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.label}`}>
                {content}
              </a>
            </Button>
          ) : (
            <Button
              variant="outline"
              className={styles.sourceRow}
              onClick={() => setPreviewOpen(true)}
              aria-label={`View ${file.label}`}
            >
              {content}
            </Button>
          )}
        </TooltipTrigger>
        <TooltipContent>{file.label}</TooltipContent>
      </Tooltip>
      <AlertDialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{file.label}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {imageUrl && !imageFailed ? (
            <img
              className={styles.sourcePreview}
              src={imageUrl}
              alt={file.label}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {expired ? "This attachment has expired." : "A preview is not available for this saved attachment."}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Sources is read-only. Applying and handoffs are available from agent results in Chat. */
export function BlogAgentLibrary({
  active,
  postId,
  threadId,
  artifactId,
  document,
  onOpen,
  onShowRun,
  refreshKey,
}: {
  active: boolean;
  postId: string;
  threadId: string | null;
  artifactId: string | null;
  document: BlogDocument;
  onOpen: (id: string | null) => void;
  onShowRun: (id: string) => void;
  refreshKey: string;
}) {
  const [pages, setPages] = useState<{ artifacts: BlogAttachment[]; sources: BlogAttachment[] }>({
    artifacts: [],
    sources: [],
  });
  const [cursors, setCursors] = useState<{ artifacts: string | null; sources: string | null }>({
    artifacts: null,
    sources: null,
  });
  const [selected, setSelected] = useState<{ attachment: BlogAttachment; html?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const base = `/api/admin/blog/${postId}/threads/${threadId}/attachments`;
  useEffect(() => {
    let live = true;
    setSelected(null);
    setError("");
    setLoading(true);
    if (!threadId) {
      setPages({ artifacts: [], sources: [] });
      setCursors({ artifacts: null, sources: null });
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        if (artifactId) {
          const value = await assistantRequest<{ attachment: BlogAttachment; html?: string }>(`${base}/${artifactId}`);
          if (live) {
            setSelected(value);
          }
        } else {
          const [artifacts, sources] = await Promise.all(
            ["artifacts", "sources"].map((kind) =>
              assistantRequest<{ attachments: BlogAttachment[]; nextCursor: string | null }>(`${base}?kind=${kind}`),
            ),
          );
          if (live) {
            setPages({ artifacts: artifacts.attachments, sources: sources.attachments });
            setCursors({ artifacts: artifacts.nextCursor, sources: sources.nextCursor });
          }
        }
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : "Could not load Sources.");
      } finally {
        if (live) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [threadId, artifactId, base, refreshKey, reload]);
  useEffect(() => {
    if (active && !loading && artifactId) heading.current?.focus({ preventScroll: true });
  }, [active, loading, artifactId]);
  async function more() {
    if (loadingMore) return;
    const kinds = (["artifacts", "sources"] as const).filter((kind) => cursors[kind]);
    if (!kinds.length) return;
    setLoadingMore(true);
    try {
      const nextPages = await Promise.all(
        kinds.map(async (kind) => ({
          kind,
          ...(await assistantRequest<{ attachments: BlogAttachment[]; nextCursor: string | null }>(
            `${base}?kind=${kind}&cursor=${encodeURIComponent(cursors[kind]!)}`,
          )),
        })),
      );
      for (const page of nextPages) {
        setPages((previous) => ({
          ...previous,
          [page.kind]: [
            ...previous[page.kind],
            ...page.attachments.filter((file) => !previous[page.kind].some((old) => old.id === file.id)),
          ],
        }));
        setCursors((previous) => ({ ...previous, [page.kind]: page.nextCursor }));
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not load more items.");
    } finally {
      setLoadingMore(false);
    }
  }
  const items = [...pages.artifacts, ...pages.sources].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
  const hasMore = !!(cursors.artifacts || cursors.sources);
  const artifact = selected?.attachment.data.artifact;
  const supported = supportedArtifact(artifact);
  const expired = !!selected?.attachment.expiresAt && Date.parse(selected.attachment.expiresAt) <= Date.now();
  const reportText =
    !loading && !error && !expired && selected?.attachment.id === artifactId
      ? supported
        ? `${selected.attachment.label}\n\n${readableArtifact(artifact)}`
        : JSON.stringify(selected.attachment.data, null, 2)
      : null;
  function downloadReport() {
    if (reportText === null || !selected) return;
    try {
      const url = URL.createObjectURL(
        new Blob([reportText], { type: supported ? "text/plain;charset=utf-8" : "application/json" }),
      );
      const anchor = globalThis.document.createElement("a");
      const name =
        selected.attachment.label
          .replace(/[^\p{L}\p{N}._-]+/gu, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 100) || "report";
      anchor.href = url;
      anchor.download = `${name}.${supported ? "txt" : "json"}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("Could not download the report. Try again or copy it instead.");
    }
  }
  return (
    <section className={styles.library} aria-label="Thread Sources">
      {artifactId && (
        <p className={styles.libraryScope}>
          {`${getBlogAgent(selected?.attachment.data.artifact?.agentId)?.name ?? "Saved output"}${selected ? ` · ${savedTime(selected.attachment.createdAt)}` : ""} · Read only`}
        </p>
      )}
      {artifactId && (
        <div className="flex shrink-0 items-center justify-between gap-2">
          <BackButton showLabel label="All sources" onClick={() => onOpen(null)} />
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="input-icon"
                  size="icon-sm"
                  aria-label="Download report"
                  disabled={reportText === null}
                  onClick={downloadReport}
                >
                  <Download aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download report</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="input-icon"
                  size="icon-sm"
                  aria-label="Copy report"
                  disabled={reportText === null}
                  onClick={() => reportText !== null && void copy(reportText)}
                >
                  <Copy aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy report</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
      <div className={`${styles.scroll} ${artifactId ? "" : styles.inventory}`}>
        {loading ? (
          <BlogAssistantProgress centered>Loading sources…</BlogAssistantProgress>
        ) : error ? (
          <div>
            <p role="alert" className="text-caption text-destructive">
              {error}
            </p>
            <Button size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}>
              Try again
            </Button>
          </div>
        ) : artifactId ? (
          selected && (
            <>
              <h3 className={styles.reportTitle} ref={heading} tabIndex={-1}>
                {selected.attachment.label}
              </h3>
              {expired ? (
                <p>This result has expired. Return to chat to prepare a fresh request.</p>
              ) : supported ? (
                <>
                  <p>{artifact.summary}</p>
                  {artifact.baseDocumentFingerprint &&
                    artifact.baseDocumentFingerprint !== agentDocumentFingerprint(document) && (
                      <p className="text-caption text-muted-foreground">This report describes an earlier draft.</p>
                    )}
                  <ArtifactContent artifact={artifact} />
                  {artifact.content.document && (
                    <section className={styles.savedDocument}>
                      <h4>{artifact.content.document.title}</h4>
                      {selected.html ? (
                        <BlogArticleBody html={selected.html} className={styles.article} showToaster={false} />
                      ) : (
                        <p>{nodeText(artifact.content.document.body)}</p>
                      )}
                    </section>
                  )}
                </>
              ) : (
                <p>This output version is not supported. You can download or copy its saved data.</p>
              )}
              {selected.attachment.runId && (
                <Button
                  className={styles.reportAction}
                  size="sm"
                  variant="outline"
                  onClick={() => onShowRun(selected.attachment.runId!)}
                >
                  <MessageSquare />
                  Show message
                </Button>
              )}
            </>
          )
        ) : (
          <>
            {!items.length && (
              <ContentState
                className="my-auto"
                density="panel"
                headingLevel="h3"
                icon={<FolderOpen />}
                title="No sources yet"
                description="Added files, links, and agent outputs will appear here."
              />
            )}
            {items.map((file) =>
              file.type === "artifact" ? (
                <SavedArtifactCard
                  key={file.id}
                  label={file.label}
                  summary={file.data.artifactSummary?.summary ?? "Saved agent output"}
                  agentId={file.data.artifactSummary?.agentId}
                  createdAt={file.createdAt}
                  inLibrary
                  onOpen={() => onOpen(file.id)}
                />
              ) : (
                <SourceAttachment key={file.id} file={file} />
              ),
            )}
            {hasMore && (
              <Button size="sm" variant="ghost" disabled={loadingMore} onClick={() => void more()}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function ArtifactContent({ artifact }: { artifact: BlogArtifact }) {
  const { content } = artifact;
  return (
    <div className={styles.report}>
      {content.searchIntent && (
        <section>
          <h4>Search intent</h4>
          <p>{content.searchIntent}</p>
        </section>
      )}
      {content.sections?.map((section, index) => (
        <section key={index}>
          <h4>
            {section.heading}
            {section.findings?.length
              ? ` · ${section.findings.length} ${section.findings.length === 1 ? "finding" : "findings"}`
              : ""}
          </h4>
          {section.text && <p>{section.text}</p>}
          {section.items?.length ? (
            <ul>
              {section.items.map((item, n) => (
                <li key={n}>{item}</li>
              ))}
            </ul>
          ) : null}
          {section.findings?.map((finding, n) => (
            <div key={n} className={styles.finding}>
              <p
                className={
                  finding.severity === "high"
                    ? styles.highPriority
                    : finding.severity === "medium"
                      ? styles.mediumPriority
                      : styles.lowPriority
                }
              >
                {finding.severity[0].toUpperCase() + finding.severity.slice(1)} · {finding.issue}
              </p>
              <blockquote>{finding.passage}</blockquote>
              <p>{finding.recommendation}</p>
            </div>
          ))}
        </section>
      ))}
      {content.keywords?.length ? (
        <section>
          <h4>Suggested keywords</h4>
          {content.keywords.map((item, index) => (
            <p key={index}>
              <strong>{item.keyword}</strong> · {item.kind}
              <br />
              {item.rationale}
            </p>
          ))}
        </section>
      ) : null}
      {content.changes?.length ? (
        <section>
          <h4>Proposed changes</h4>
          <ul>
            {content.changes.map((item, n) => (
              <li key={n}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {content.remainingTasks?.length ? (
        <section>
          <h4>Remaining tasks</h4>
          <ul>
            {content.remainingTasks.map((item, n) => (
              <li key={n}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {content.citations?.length ? (
        <section>
          <h4>Evidence</h4>
          {content.citations.map((item, n) => (
            <a
              key={n}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-primary underline"
            >
              {item.title || item.url}
            </a>
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function BlogAgentResultActions({
  attachment,
  html,
  document,
  onApply,
  onBack,
  onAttach,
  onRetry,
}: {
  attachment: BlogAttachment;
  html?: string;
  document: BlogDocument;
  onApply: (document: BlogDocument) => void;
  onRetry: () => void;
  onBack: () => void;
  onAttach: (id: string, agentId?: string) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [attachment.id]);
  const [replacement, setReplacement] = useState<{ before: BlogDocument; after: BlogDocument } | null>(null);
  const artifact = attachment.data.artifact;
  if (!supportedArtifact(artifact)) return <p>Unsupported output. Open Sources to inspect its saved data.</p>;
  const proposal = artifact.content.document;
  const alreadyApplied = proposal && sameAgentDocument(document, proposal);
  const stale = artifact.baseDocumentFingerprint !== agentDocumentFingerprint(document);
  const expired = !!attachment.expiresAt && Date.parse(attachment.expiresAt) <= Date.now();
  const canUndo = replacement && sameAgentDocument(document, replacement.after);
  function replace() {
    if (!supportedArtifact(artifact) || (attachment.expiresAt && Date.parse(attachment.expiresAt) <= Date.now())) {
      toast.error("This result expired. Prepare a fresh request.");
      return;
    }
    try {
      const next = agentReplacement(artifact, document);
      setReplacement({ before: document, after: next });
      onApply(next);
      setShowPreview(false);
      toast.success("Draft replaced. Your existing save settings apply.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not replace draft.");
    }
  }
  function undo() {
    if (!replacement || !canUndo) return;
    const { title, excerpt, body, seoTitle, seoDescription } = replacement.before;
    onApply({ ...document, title, excerpt, body, seoTitle, seoDescription });
    setReplacement(null);
    toast.success("Replacement undone.");
  }
  const nextAgent =
    artifact.agentId === "planner" ? "writer" : artifact.agentId === "auditor" ? "optimizer" : undefined;
  return (
    <section className={styles.library} aria-label="Agent result actions">
      <div className={styles.libraryHeader}>
        <BackButton showLabel label="Back to chat" onClick={onBack} />
        <h3 ref={heading} tabIndex={-1}>
          {attachment.label}
        </h3>
      </div>
      <div className={styles.scroll}>
        <p>{artifact.summary}</p>
        <ArtifactContent artifact={artifact} />
        {expired && <p role="status">This result expired. Prepare a new request in chat.</p>}
        {proposal ? (
          <>
            <p role="status" className="text-caption text-muted-foreground">
              {alreadyApplied
                ? "This draft is already applied."
                : stale
                  ? "Your draft changed. You can inspect this version, but run the agent again before replacing it."
                  : "Preview the complete article and metadata before replacing your draft."}
            </p>
            <Button onClick={() => setShowPreview(true)} disabled={expired || !html}>
              Preview complete draft
            </Button>
            {!html && (
              <p className="text-caption text-destructive">
                The document preview is unavailable. Reopen the saved result to retry.
              </p>
            )}
            {stale && !alreadyApplied && (
              <Button variant="outline" onClick={onRetry}>
                Prepare new request
              </Button>
            )}
            {replacement && (
              <Button variant="outline" disabled={!canUndo} onClick={undo}>
                <RotateCcw />
                Undo replacement
              </Button>
            )}
            {replacement && !canUndo && (
              <p className="text-caption text-muted-foreground">
                Newer edits prevent undo here. Use revision history to recover an earlier draft.
              </p>
            )}
          </>
        ) : null}
        <Button variant="outline" disabled={expired} onClick={() => onAttach(attachment.id, nextAgent)}>
          {nextAgent ? `Use with ${getBlogAgent(nextAgent)?.name}` : "Attach to composer"}
        </Button>
      </div>
      <AlertDialog open={showPreview} onOpenChange={setShowPreview}>
        <AlertDialogContent className={styles.draftPreview}>
          <AlertDialogHeader>
            <AlertDialogTitle>Preview complete draft</AlertDialogTitle>
            <AlertDialogDescription>
              Replacing updates the title, article, excerpt and SEO metadata. Publication settings stay unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className={styles.previewScroll}>
            <h2>{proposal?.title}</h2>
            <p>{proposal?.excerpt}</p>
            {html && <BlogArticleBody html={html} className={styles.article} showToaster={false} />}
            <section>
              <h3>Search preview</h3>
              <p>{proposal?.seoTitle || proposal?.title}</p>
              <p>{proposal?.seoDescription || proposal?.excerpt}</p>
            </section>
            <ArtifactContent artifact={artifact} />
          </div>
          <AlertDialogFooter className="shrink-0">
            <AlertDialogCancel>Keep current draft</AlertDialogCancel>
            <Button disabled={expired || stale || !!alreadyApplied} onClick={replace}>
              <Check />
              {alreadyApplied ? "Already applied" : stale ? "Draft changed · run again" : "Replace draft"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
