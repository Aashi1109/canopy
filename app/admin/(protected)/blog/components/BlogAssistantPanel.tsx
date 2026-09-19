"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import {
  ArrowUp,
  Check,
  ChevronRight,
  CloudOff,
  MessagesSquare,
  NotebookPen,
  ListChecks,
  ScanSearch,
  ScanText,
  Globe,
  History,
  ImagePlus,
  ImageIcon,
  ExternalLink,
  Link2,
  LoaderCircle,
  Paperclip,
  Plus,
  FileText,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquarePen,
  X,
} from "lucide-react";
import {
  BackButton,
  Button,
  ContentState,
  Popover,
  Input,
  Label,
  Select,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  toast,
} from "@/components/ui/index.tsx";
import type { BlogDocument } from "@/lib/blog/document";
import type {
  BlogAssistantRun,
  BlogAssistantThread,
  BlogProposal,
  BlogOperation,
  BlogRequestSettings,
  BlogMessage,
  BlogAttachment,
} from "@/lib/blog/assistantTypes";
import styles from "./BlogEditor.module.css";
import { supportedArtifact } from "@/lib/blog/agentArtifacts";
import { BLOG_AGENTS, getBlogAgent } from "@/lib/blog/agentCatalog";
import { BlogAgentRunCard, BlogAgentLibrary, BlogAgentResultActions, readableArtifact } from "./BlogAgentOutput";
import { agentSlashQuery, sameComposerSelection } from "../lib/agentComposer";
import { assistantRequest } from "../lib/assistantApi";
import { BlogAgentComposer, type BlogAgentComposerHandle } from "./BlogAgentComposer";
import { BlogSidePanelHeader } from "./BlogSidePanelHeader";
import { BlogLinkForm } from "./BlogLinkForm";
import { BlogAssistantMarkdown } from "./BlogAssistantMarkdown";
import { BlogAssistantProgress } from "./BlogAssistantProgress";
import { BlogProposalCard } from "./BlogProposalCard";
import { useBlogAssistant } from "../lib/useBlogAssistant";
import {
  captureAssistantSelection,
  captureAssistantInsertion,
  canCaptureAssistantInsertion,
  findAssistantPassage,
  assistantBodyMatches,
} from "../lib/assistantSelection";

type Target = ReturnType<typeof captureAssistantSelection>;
const LAUNCH_ACTIONS = [
  { agentId: "planner", label: "Plan & write", description: "Turn an idea into a first draft", icon: NotebookPen },
  {
    agentId: "auditor",
    label: "Audit this draft",
    description: "Find gaps, unclear sections, and fixes",
    icon: ListChecks,
  },
  {
    agentId: "optimizer",
    label: "Optimize for SEO",
    description: "Improve titles, structure, and keywords",
    icon: ScanSearch,
  },
  {
    agentId: "auditor",
    label: "Check originality",
    description: "Check for matches and verify sources",
    icon: ScanText,
    instruction:
      "Review this draft for originality and source attribution using the attached references. Flag matching passages, missing citations, and claims that need verification. Clearly state what could not be checked; do not claim a comprehensive plagiarism scan.",
  },
];
type Props = {
  postId: string;
  ownerId: string;
  editor: Editor | null;
  initialReview?: boolean;
  onClose?: () => void;
  document: BlogDocument;
  onReplaceDocument: (document: BlogDocument) => void;
  onMetadata: (field: "seoTitle" | "seoDescription", value: string) => void;
};
function readable(cause: unknown) {
  return cause instanceof Error ? cause.message : "Could not complete the action. Try again.";
}
function plain(nodes: JSONContent[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return node.text ?? "";
      if (node.type === "hardBreak") return "\n";
      const text = plain(node.content ?? []);
      return ["paragraph", "heading", "codeBlock", "listItem"].includes(node.type ?? "") ? `${text}\n` : text;
    })
    .join("");
}

export function groupConversationHistory(threads: BlogAssistantThread[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const groups = new Map<string, { label: string; threads: BlogAssistantThread[] }>();
  const timestamp = (value: string) => Date.parse(value) || 0;
  for (const thread of [...threads].sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))) {
    const date = new Date(thread.updatedAt);
    const valid = !Number.isNaN(date.getTime());
    const day = valid ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() : null;
    const key = day === null ? "earlier" : String(day);
    const label =
      day === today.getTime()
        ? "Today"
        : day === yesterday.getTime()
          ? "Yesterday"
          : valid
            ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
            : "Earlier";
    const group = groups.get(key) ?? { label, threads: [] };
    group.threads.push(thread);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function BlogAssistantPanel({
  postId,
  ownerId,
  editor,
  document,
  onMetadata,
  onReplaceDocument,
  initialReview = false,
  onClose,
}: Props) {
  const assistant = useBlogAssistant(postId, ownerId);
  const [tab, setTab] = useState("assistant");
  const [sourcesVisited, setSourcesVisited] = useState(false);
  useEffect(() => {
    if (tab === "sources") setSourcesVisited(true);
  }, [tab]);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [activeResult, setActiveResult] = useState<{ attachment: BlogAttachment; html?: string } | null>(null);
  const [caret, setCaret] = useState(0);
  const [dismissedSlash, setDismissedSlash] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const [showReferences, setShowReferences] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [keywords, setKeywords] = useState<Record<string, string>>({});
  const [draftContext, setDraftContext] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<{ url: string; filename: string; scope: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const sendLock = useRef(false);
  const [confirm, setConfirm] = useState<"history" | "thread" | "new" | null>(null);
  const [changing, setChanging] = useState(false);
  const [hiddenProposalActions, setHiddenProposalActions] = useState<Record<string, boolean>>({});
  const composer = useRef<BlogAgentComposerHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const messages = useRef<HTMLDivElement>(null);
  const targets = useRef(new Map<string, Target>());
  const consumed = useRef(new Set<string>());
  const metadataSnapshots = useRef(new Map<string, Pick<BlogDocument, "seoTitle" | "seoDescription">>());
  const scope = assistant.selected ?? "new";
  const selectedAgentId = assistant.composerSelection.agentId;
  const selectedAgent = getBlogAgent(selectedAgentId);
  const includeDraft = selectedAgent?.requiresDocument || (draftContext[scope] ?? true);
  function setSelectedFiles(update: (value: Record<string, string[]>) => Record<string, string[]>) {
    const previous = Object.fromEntries(
      Object.entries(assistant.composerSelectionsByThread).map(([id, value]) => [id, value.attachmentIds]),
    );
    const next = update(previous);
    for (const [id, attachmentIds] of Object.entries(next))
      if (attachmentIds !== previous[id])
        assistant.composerState({ ...assistant.getComposerSelection(id), attachmentIds }, id);
  }
  const detail = assistant.detail;
  const settings = assistant.requestSettings;
  const runs = detail?.runs ?? [];
  const running = assistant.stream?.run;
  const busy = assistant.submitting || preparing;
  const ready = !!assistant.availability?.enabled && !assistant.loading;
  const refs = references[scope] ?? "";
  const referenceLinks = refs
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  const attachmentIds = assistant.composerSelection.attachmentIds;
  const invalidInputs = attachmentIds.some((id) => {
    const file = detail?.attachments.find((item) => item.id === id);
    return !file || file.status !== "ready" || !!(file.expiresAt && Date.parse(file.expiresAt) <= Date.now());
  });
  const unknownAgent = !!selectedAgentId && !selectedAgent;
  const contextProblem =
    ["auditor", "optimizer"].includes(selectedAgentId ?? "") && !editor?.getText().trim()
      ? "Write some article content before running this agent."
      : selectedAgentId === "planner" && !assistant.message.trim() && (!includeDraft || !editor?.getText().trim())
        ? "Describe the topic you want to plan."
        : "";
  const executions = (detail?.executions ?? []).filter((execution) => execution.operation === "agent");
  const slashToken = agentSlashQuery(assistant.message, caret);
  const slashKey = slashToken ? `${slashToken.start}:${slashToken.end}:${slashToken.query}` : null;
  const commands = BLOG_AGENTS.filter(
    (agent) =>
      !slashToken?.query ||
      `${agent.name} ${agent.command} ${agent.aliases.join(" ")}`.toLowerCase().includes(slashToken.query),
  );
  const agentIcons = { planner: NotebookPen, writer: SquarePen, auditor: ScanSearch, optimizer: Sparkles };
  const slashOpen = !!slashToken && slashKey !== dismissedSlash;
  function selectAgent(id: string) {
    assistant.composerState({ ...assistant.getComposerSelection(), agentId: id, agentOffset: caret });
    composer.current?.insertAgent(id);
    setTab("assistant");
    setShowHistory(false);
    requestAnimationFrame(() => composer.current?.focus());
  }
  function chooseCommand(index: number) {
    const command = commands[index];
    if (!command || !slashToken) return;
    setDismissedSlash(slashKey);
    composer.current?.insertAgent(command.id, slashToken.start, slashToken.end);
  }

  function prepareAgentRequest(agentId: string | undefined, inputs: string[], instruction: string) {
    const ids = [...new Set([...assistant.getComposerSelection().attachmentIds, ...inputs])];
    if (ids.length > 5) {
      toast.error("Remove some composer attachments before adding this result. You can attach up to five.");
      return;
    }
    assistant.composerState({ ...assistant.getComposerSelection(), agentId, attachmentIds: ids });
    if (!assistant.message.trim()) assistant.draft(instruction);
    setTab("assistant");
    requestAnimationFrame(() => composer.current?.focus());
  }
  function openAgentPicker() {
    const text = assistant.message + (assistant.message && !/\s$/.test(assistant.message) ? " /" : "/");
    assistant.draft(text);
    setCaret(text.length);
    setDismissedSlash(null);
    setTab("assistant");
    requestAnimationFrame(() => {
      composer.current?.focus();
      composer.current?.setSelectionRange(text.length, text.length);
    });
  }
  async function prepareRetry(id: string) {
    try {
      const { run } = await assistantRequest<{ run: BlogAssistantRun }>(`/api/admin/blog/ai/runs/${id}`);
      prepareAgentRequest(run.request.agentId ?? "auditor", run.request.attachmentIds ?? [], run.request.message);
    } catch (cause) {
      toast.error(readable(cause));
    }
  }
  useEffect(() => {
    setArtifactId(null);
    setActiveResult(null);
  }, [scope]);
  useEffect(() => {
    setSlashIndex(0);
  }, [slashKey]);
  useEffect(() => {
    if (initialReview) selectAgent("auditor");
  }, [initialReview]);
  useEffect(() => {
    if (slashOpen)
      globalThis.document.getElementById(`blog-command-${slashIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [slashOpen, slashIndex]);
  const bodyChanged = (run: BlogAssistantRun) => !editor || !assistantBodyMatches(editor, run.request.editorJson);
  const reportChanged = bodyChanged;
  const seoChanged = (run: BlogAssistantRun, field: "seoTitle" | "seoDescription") => {
    const captured = metadataSnapshots.current.get(run.id);
    return !captured || document[field] !== captured[field];
  };

  function addReferenceLink() {
    try {
      const url = new URL(linkDraft.trim());
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password)
        throw new Error("Use a public HTTPS URL.");
      if (referenceLinks.length >= 5) throw new Error("Use at most five reference links.");
      if (referenceLinks.includes(url.href)) throw new Error("This link is already attached.");
      setReferences((value) => ({ ...value, [scope]: [...referenceLinks, url.href].join("\n") }));
      setLinkDraft("");
      setLinkError("");
      setShowReferences(false);
      setAttachmentMenu(false);
    } catch (cause) {
      setLinkError(cause instanceof TypeError ? "Enter a valid public HTTPS URL." : readable(cause));
      linkInput.current?.focus();
    }
  }
  function closeHistory() {
    setShowHistory(false);
    requestAnimationFrame(() => historyTrigger.current?.focus());
  }
  function threadTime(value: string) {
    const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
    if (minutes < 1) return "Now";
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  useEffect(() => {
    if (!editor) return;
    for (const run of runs) {
      if (
        run.status !== "completed" ||
        !assistant.freshRunIds.includes(run.id) ||
        run.request.selectedText ||
        bodyChanged(run)
      )
        continue;
      for (const proposal of run.response?.proposals ?? []) {
        if (proposal.type === "edit") targetFor(run, proposal, true);
      }
    }
  }, [runs, editor, assistant.freshRunIds]);

  useEffect(
    () => () => {
      for (const target of targets.current.values()) target.dispose();
    },
    [],
  );
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);
  useEffect(() => {
    messages.current?.scrollTo({ top: messages.current.scrollHeight });
  }, [assistant.selected, detail?.messages, assistant.stream?.text, executions.length]);
  useEffect(() => {
    if (!assistant.selected || !detail) return;
    const id = assistant.selected;
    const timer = setTimeout(() => {
      void assistant.saveDraft(assistant.message, id).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [
    assistant.selected,
    assistant.message,
    selectedAgentId,
    attachmentIds,
    assistant.composerSelection.agentOffset,
    assistant.composerSelection.content,
  ]);

  function transferComposer(nextScope: string) {
    if (scope !== "new") return;
    setReferences((value) => ({ ...value, [nextScope]: value.new ?? "" }));
    setKeywords((value) => ({ ...value, [nextScope]: value.new ?? "" }));
    setDraftContext((value) => ({ ...value, [nextScope]: value.new ?? true }));
  }
  async function updateSettings(next: BlogRequestSettings) {
    try {
      await assistant.settings(next);
    } catch (cause) {
      toast.error(readable(cause));
    }
  }
  async function send(operation: BlogOperation = "chat", retry?: BlogAssistantRun, messageOverride?: string) {
    if (!ready || busy || sendLock.current || !editor) return;
    if (operation === "chat" && selectedAgent) operation = "agent";
    if (!retry && contextProblem) {
      composer.current?.focus();
      return;
    }
    if (!retry && (invalidInputs || unknownAgent)) {
      toast.error("Remove or replace unavailable composer selections first.");
      return;
    }
    const submittedSelection = { ...assistant.getComposerSelection(), attachmentIds: [...attachmentIds] };
    const submittedText = assistant.message;
    const message =
      messageOverride ??
      retry?.request.message ??
      (operation === "review"
        ? "Review this draft and suggest SEO improvements."
        : operation === "check_sources"
          ? "Check this draft's claims and possible matching passages using sources."
          : assistant.message.trim() || (operation === "agent" ? `${selectedAgent?.name ?? "Review"} this blog.` : ""));
    if (!message) {
      composer.current?.focus();
      return;
    }
    const previousTarget = retry ? targets.current.get(`${retry.id}:selection`) : null;
    const restoredRange = retry?.request.selectedText ? findAssistantPassage(editor, retry.request.selectedText) : null;
    const range =
      operation === "chat" || operation === "rewrite"
        ? (previousTarget?.range ??
          (restoredRange && retry?.request.selectedText
            ? { ...restoredRange, text: retry.request.selectedText }
            : undefined))
        : undefined;
    if (!range && operation === "rewrite") {
      toast.error("This passage changed. Select it again before improving it.");
      return;
    }
    const target = range ? captureAssistantSelection(editor, { ...editor.state.selection, ...range }) : null;
    sendLock.current = true;
    setPreparing(true);
    try {
      let selectedAttachmentIds = retry?.request.attachmentIds ?? attachmentIds;
      if (!retry && refs.trim()) {
        try {
          const urls = refs
            .split(/\r?\n/)
            .map((value) => value.trim())
            .filter(Boolean);
          if (urls.length > 5) throw new Error("Use at most five reference links.");
          for (const [index, url] of urls.entries()) {
            const link = await assistant.addLink(url);
            selectedAttachmentIds = [...selectedAttachmentIds, link.id];
            const ids = selectedAttachmentIds;
            setSelectedFiles((value) => ({ ...value, [link.threadId]: ids }));
            const remaining = urls.slice(index + 1).join("\n");
            setReferences((value) => ({ ...value, [scope]: remaining, [link.threadId]: remaining }));
          }
        } catch (cause) {
          target?.dispose();
          toast.error(readable(cause));
          return;
        }
      }
      const sent = await assistant.send(
        {
          operation: range && operation === "chat" ? "rewrite" : operation,
          message,
          ...(operation === "agent"
            ? {
                agentId: retry?.request.agentId ?? selectedAgentId,
                ...(includeDraft ? { document: { ...document, body: editor.getJSON() as BlogDocument["body"] } } : {}),
              }
            : range
              ? { selectedText: range.text }
              : {
                  editorJson:
                    retry?.request.editorJson ??
                    (includeDraft
                      ? (editor.getJSON() as BlogDocument["body"])
                      : { type: "doc", content: [{ type: "paragraph" }] }),
                }),
          ...(retry?.inputMessageId ? { inputMessageId: retry.inputMessageId } : {}),
          settings: { ...settings, keyword: keywords[scope] ?? settings.keyword },
          attachmentIds: selectedAttachmentIds,
        },
        (run) => {
          sendLock.current = false;
          setPreparing(false);
          if (run.threadId) transferComposer(run.threadId);
          if (run.operation === "agent" && run.threadId && !retry) {
            const currentSelection = assistant.getComposerSelection(run.threadId);
            if (
              sameComposerSelection(currentSelection, submittedSelection) &&
              composer.current?.value === submittedText
            ) {
              assistant.composerState({ attachmentIds: [] }, run.threadId);
              assistant.draft("", run.threadId);
            }
            if (scope === "new") assistant.composerState({ attachmentIds: [] }, "new");
          }
          metadataSnapshots.current.set(run.id, {
            seoTitle: document.seoTitle,
            seoDescription: document.seoDescription,
          });
          if (target) targets.current.set(`${run.id}:selection`, target);
        },
      );
      if (!sent) target?.dispose();
      if (
        sent?.status === "completed" &&
        sent.operation !== "agent" &&
        sameComposerSelection(assistant.getComposerSelection(sent.threadId ?? scope), submittedSelection)
      )
        setSelectedFiles((value) => ({ ...value, [sent.threadId ?? scope]: [] }));
    } finally {
      sendLock.current = false;
      setPreparing(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024 || !file.size) {
      toast.error("Choose a JPEG, PNG, or WebP image up to 5 MiB.");
      return;
    }
    if (attachmentIds.length >= 3) {
      toast.error("Use at most three images per request.");
      return;
    }
    setUploading(true);
    setPreview({ filename: file.name, url: URL.createObjectURL(file), scope });
    try {
      const attachment = await assistant.upload(file);
      transferComposer(attachment.threadId);
      setSelectedFiles((value) => ({
        ...value,
        [attachment.threadId]: [...(value[attachment.threadId] ?? []), attachment.id],
      }));
      setPreview(null);
    } catch (cause) {
      toast.error(readable(cause));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  function targetFor(run: BlogAssistantRun, proposal: BlogProposal, create = false) {
    const key = `${run.id}:${run.request.selectedText ? "selection" : proposal.toolCallId}`;
    const tracked = targets.current.get(key);
    if (tracked) return tracked;
    if (!editor || (!run.request.selectedText && bodyChanged(run))) return null;
    if (proposal.action === "insert" && !proposal.originalText) {
      if (!canCaptureAssistantInsertion(editor)) return null;
      if (!create) return { valid: () => true, apply: () => false };
      const target = captureAssistantInsertion(editor);
      if (target) targets.current.set(key, target);
      return target;
    }
    const range =
      run.request.selectedText || proposal.originalText
        ? findAssistantPassage(editor, run.request.selectedText ?? proposal.originalText!)
        : null;
    if (
      !range ||
      range.from < 0 ||
      range.to > editor.state.doc.content.size ||
      range.from >= range.to ||
      editor.state.doc.textBetween(range.from, range.to, "\n") !== (run.request.selectedText ?? proposal.originalText)
    )
      return null;
    if (!create) return { valid: () => true, apply: () => false };
    const target = captureAssistantSelection(editor, { ...editor.state.selection, ...range });
    targets.current.set(key, target);
    return target;
  }
  function dismissProposal(key: string) {
    consumed.current.add(key);
    setHiddenProposalActions((value) => ({ ...value, [key]: true }));
  }
  function apply(run: BlogAssistantRun, proposal: BlogProposal) {
    const key = `${run.id}:${proposal.toolCallId}`;
    if (consumed.current.has(key) || !assistant.freshRunIds.includes(run.id)) return;
    try {
      if (proposal.type === "seo") {
        const field = proposal.seoTitle !== undefined ? "seoTitle" : "seoDescription";
        if (reportChanged(run) || seoChanged(run, field)) {
          toast.error("This SEO field changed. Run a fresh review before applying it.");
          return;
        }
        const value = proposal[field];
        if (value === undefined) return;
        onMetadata(field, value);
      } else {
        const target = targetFor(run, proposal, true);
        const action = proposal.action ?? "replace";
        if (
          !target?.valid() ||
          !target.apply(proposal.replacement ? { type: "doc", content: proposal.replacement } : undefined, action)
        ) {
          toast.error("This section changed. Ask for a fresh suggestion.");
          return;
        }
      }
      dismissProposal(key);
      toast.success("Applied to your draft. Use Save draft to confirm it is saved.");
    } catch (cause) {
      toast.error(readable(cause));
    }
  }
  function proposalCard(run: BlogAssistantRun, proposal: BlogProposal, compact: boolean) {
    const key = `${run.id}:${proposal.toolCallId}`;
    const actionable =
      assistant.freshRunIds.includes(run.id) && !hiddenProposalActions[key] && proposal.status === "pending";
    const kind = proposal.action ?? "replace";
    const seoField = proposal.seoTitle !== undefined ? "seoTitle" : "seoDescription";
    const stale =
      actionable &&
      (proposal.type === "edit" ? !targetFor(run, proposal)?.valid() : reportChanged(run) || seoChanged(run, seoField));
    const before =
      proposal.type === "seo"
        ? (metadataSnapshots.current.get(run.id)?.[seoField] ?? "")
        : (proposal.originalText ?? "");
    const after = proposal.type === "seo" ? (proposal[seoField] ?? "") : plain(proposal.replacement ?? []).trim();
    const title =
      proposal.title ??
      (proposal.type === "seo"
        ? seoField === "seoTitle"
          ? "Improve the SEO title"
          : "Improve the SEO description"
        : kind === "insert"
          ? "Add a new section"
          : kind === "delete"
            ? "Remove this section"
            : "Improve this section");
    const placement =
      proposal.placement ??
      (proposal.type === "seo"
        ? seoField === "seoTitle"
          ? "SEO title"
          : "SEO description"
        : run.request.selectedText
          ? "selected passage"
          : kind === "insert" && !before
            ? "start of the draft"
            : "in the draft");
    return (
      <BlogProposalCard
        key={key}
        kind={kind}
        title={title}
        placement={placement}
        before={before}
        after={after}
        compact={compact}
        actionable={actionable}
        stale={stale}
        actionLabel={
          proposal.type === "seo"
            ? seoField === "seoTitle"
              ? "Apply title"
              : "Apply description"
            : kind === "insert"
              ? "Insert section"
              : kind === "delete"
                ? "Delete section"
                : "Apply edit"
        }
        onApply={() => apply(run, proposal)}
        onDiscard={() => dismissProposal(key)}
      />
    );
  }
  const generatingStatus = <BlogAssistantProgress>Generating response…</BlogAssistantProgress>;
  function result(run: BlogAssistantRun, message: BlogMessage) {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    const proposals = message.parts.filter((part) => part.type === "proposal").map((part) => part.proposal);
    return (
      <article key={message.id} className={styles.assistantResponse}>
        {run.status !== "completed" &&
          (tab === "assistant" || assistant.stream?.run.id !== run.id) &&
          (assistant.stream?.run.id === run.id && run.status !== "failed" && run.status !== "cancelled" ? (
            generatingStatus
          ) : (
            <p role="status" className="text-caption text-muted-foreground">
              {run.status === "failed"
                ? "Generation failed"
                : run.status === "cancelled"
                  ? "Request stopped"
                  : "Saved outcome unconfirmed · Refresh history to check"}
            </p>
          ))}
        {run.errorMessage && <p className="text-caption text-destructive">{run.errorMessage}</p>}
        {(assistant.stream?.run.id === run.id ? assistant.stream.text || text : text) && (
          <BlogAssistantMarkdown text={assistant.stream?.run.id === run.id ? assistant.stream.text || text : text} />
        )}
        {["review", "check_sources"].includes(run.operation) && run.status === "completed" && reportChanged(run) && (
          <p className="text-caption text-warning">
            This report is outdated because the draft changed. Run it again before using its suggestions.
          </p>
        )}
        {run.response?.keywords.length ? (
          <p className="text-caption">Suggested keywords: {run.response.keywords.join(", ")}</p>
        ) : null}
        {run.response?.findings.map((finding, index) => (
          <div key={index} className="space-y-2 border-b border-border pb-3 last:border-0">
            <BlogAssistantMarkdown text={`${finding.status ? `${finding.status}: ` : ""}${finding.text}`} />
            {finding.urls?.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block break-all text-caption text-primary underline"
              >
                {url}
              </a>
            ))}
          </div>
        ))}
        {run.response?.citations.map((citation) => (
          <a
            key={citation.url}
            className="block break-words text-caption text-primary underline"
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {citation.title || citation.url}
          </a>
        ))}
        {run.operation === "check_sources" && run.status === "completed" && (
          <p className="text-caption text-muted-foreground">
            {run.response?.searchStatus === "failed"
              ? "Search failed. Retry the source check."
              : run.response?.citations.length
                ? "Limited to the sources checked. This does not certify originality."
                : "The search completed without useful sources. This does not certify originality."}
          </p>
        )}
        {run.status === "completed" && proposals.map((proposal) => proposalCard(run, proposal, proposals.length > 1))}
        {["failed", "cancelled"].includes(run.status) && (
          <Button size="sm" variant="outline" disabled={busy || !ready} onClick={() => void send(run.operation, run)}>
            Try again
          </Button>
        )}
      </article>
    );
  }
  function openSourceLink() {
    setTab("assistant");
    setShowReferences(true);
    setLinkError("");
    setAttachmentMenu(true);
    requestAnimationFrame(() => linkInput.current?.focus());
  }
  const visibleMessages = detail?.messages ?? [];
  const timeline = [
    ...visibleMessages.map((message) => ({ kind: "message" as const, message, createdAt: message.createdAt })),
    ...executions.map((execution) => ({ kind: "execution" as const, execution, createdAt: execution.createdAt })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const showLaunch = tab === "assistant" && !assistant.loading && !timeline.length && !assistant.stream;
  async function newThread() {
    setChanging(true);
    try {
      if (assistant.submitting) await assistant.stop(running);
      assistant.startNewThread();
      setReferences((value) => ({ ...value, new: "" }));
      setKeywords((value) => ({ ...value, new: "" }));
      setDraftContext((value) => ({ ...value, new: true }));
      setSelectedFiles((value) => ({ ...value, new: [] }));
      setShowHistory(false);
      setShowNewThread(true);
      setTab("assistant");
      setConfirm(null);
      requestAnimationFrame(() => composer.current?.focus());
    } catch (cause) {
      toast.error(readable(cause));
    } finally {
      setChanging(false);
    }
  }
  return (
    <div
      className={`${styles.sidePanelContent} ${styles.agentPanel}`}
      data-history={showHistory}
      onKeyDown={(event) => {
        if (event.key === "Escape" && showHistory) {
          event.preventDefault();
          event.stopPropagation();
          closeHistory();
        }
      }}
    >
      <BlogSidePanelHeader
        title={showHistory ? "Conversations" : "Blog assistant"}
        onClose={onClose}
        closeLabel="Close assistant"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="New thread"
              disabled={changing || assistant.loading}
              onClick={() => {
                if (busy) setConfirm("new");
                else void newThread();
              }}
            >
              <SquarePen aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New thread</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={historyTrigger}
              size="icon-sm"
              variant="ghost"
              aria-label="History"
              aria-pressed={showHistory}
              onClick={() => setShowHistory((value) => !value)}
            >
              <History aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>History</TooltipContent>
        </Tooltip>
      </BlogSidePanelHeader>
      {showHistory && (
        <section className={styles.assistantHistory} aria-label="Conversation history">
          <p className="shrink-0 truncate text-caption text-muted-foreground">
            This blog · {document.title || "Untitled blog"}
          </p>
          <div className="flex h-9 shrink-0 items-center justify-between gap-2">
            <BackButton label="Back to chat" showLabel onClick={closeHistory} />
            {!!assistant.activeThreadIds.length && (
              <span
                className="flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-caption text-accent-text"
                role="status"
              >
                <LoaderCircle className="size-3 motion-safe:animate-spin" aria-hidden="true" />
                {assistant.activeThreadIds.length} responding
              </span>
            )}
          </div>
          {!assistant.threads.length ? (
            assistant.historyStatus === "loading" ? (
              <BlogAssistantProgress centered>Loading conversations…</BlogAssistantProgress>
            ) : (
              <ContentState
                className="my-auto"
                density="panel"
                headingLevel="h3"
                announcement="polite"
                state={assistant.historyStatus === "error" ? "error" : "empty"}
                icon={assistant.historyStatus === "error" ? <CloudOff /> : <MessagesSquare />}
                title={assistant.historyStatus === "error" ? "Couldn’t load history" : "No conversations yet"}
                description={
                  assistant.historyStatus === "error" ? (
                    <>
                      Try again to see your conversations.
                      <br />
                      You can still start a new thread.
                    </>
                  ) : (
                    "Start a thread about this blog."
                  )
                }
                action={
                  assistant.historyStatus === "error" ? (
                    <Button size="sm" variant="outline" className="text-body" onClick={() => void assistant.refresh()}>
                      Try again
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="text-body"
                      disabled={changing}
                      onClick={() => {
                        if (busy) setConfirm("new");
                        else void newThread();
                      }}
                    >
                      New thread
                    </Button>
                  )
                }
              />
            )
          ) : (
            <nav
              className={styles.assistantHistoryRows}
              aria-label="Recent conversations"
              aria-busy={assistant.historyStatus === "loading"}
            >
              {groupConversationHistory(assistant.threads).map((group) => (
                <section key={group.label} className={styles.assistantHistoryGroup} aria-label={group.label}>
                  <h3 className={styles.assistantHistoryGroupLabel}>{group.label}</h3>
                  {group.threads.map((thread) => (
                    <Button
                      variant="ghost"
                      type="button"
                      key={thread.id}
                      className={`${styles.assistantHistoryRow} ${assistant.selected === thread.id ? styles.assistantHistorySelected : ""}`}
                      aria-current={assistant.selected === thread.id ? "true" : undefined}
                      onClick={() => {
                        void assistant.choose(thread.id);
                        setShowNewThread(false);
                        setShowHistory(false);
                      }}
                    >
                      <span className={styles.assistantHistoryMain}>
                        <span className={styles.assistantHistoryTitle}>{thread.title}</span>
                        {assistant.selected === thread.id && (
                          <Check className="size-3.5 shrink-0 text-accent-text" aria-hidden="true" />
                        )}
                        <time className={styles.assistantHistoryTime} dateTime={thread.updatedAt}>
                          {threadTime(thread.updatedAt)}
                        </time>
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </span>
                      {assistant.activeThreadIds.includes(thread.id) && (
                        <span className="flex items-center gap-1 text-caption text-accent-text">
                          <LoaderCircle className="size-3 motion-safe:animate-spin" aria-hidden="true" />
                          Responding
                        </span>
                      )}
                    </Button>
                  ))}
                </section>
              ))}
            </nav>
          )}
          {!!assistant.threads.length && !!assistant.activeThreadIds.length && (
            <p className="shrink-0 text-caption leading-relaxed text-muted-foreground">
              Switch freely. Other responses keep running.
            </p>
          )}
        </section>
      )}
      {assistant.error && (!showHistory || assistant.historyStatus !== "error") && (
        <div className="py-2">
          <p role="alert" className="text-caption text-destructive">
            {assistant.error}
          </p>
          <Button variant="ghost" size="sm" onClick={() => void assistant.refresh()}>
            Refresh history
          </Button>
        </div>
      )}
      <Tabs
        value={tab}
        onValueChange={(next) => {
          setActiveResult(null);
          setTab(next);
        }}
        className={`min-h-0 flex-1 gap-2.5 ${showHistory ? "hidden" : ""}`}
      >
        <TabsList className={styles.assistantTabs} aria-label="Assistant workspace">
          <TabsTrigger value="assistant" className="flex-none" onClick={() => setActiveResult(null)}>
            Chat
          </TabsTrigger>
          <TabsTrigger value="sources" className="flex-none">
            Sources
          </TabsTrigger>
        </TabsList>
        {(sourcesVisited || tab === "sources") && (
          <TabsContent value="sources" forceMount className="min-h-0 flex flex-col data-[state=inactive]:hidden">
            <BlogAgentLibrary
              key={`${postId}:${assistant.selected}`}
              active={tab === "sources" && !showHistory}
              postId={postId}
              threadId={assistant.selected}
              artifactId={artifactId}
              document={document}
              refreshKey={JSON.stringify([
                (detail?.attachments ?? [])
                  .filter((file) => file.type !== "artifact")
                  .map((file) => `${file.id}:${file.updatedAt}:${file.status}`)
                  .sort(),
                executions.flatMap((entry) => (entry.artifact ? [entry.artifact.attachmentId] : [])).sort(),
              ])}
              onOpen={setArtifactId}
              onShowRun={(id) => {
                setTab("assistant");
                requestAnimationFrame(() =>
                  (() => {
                    const activity = globalThis.document.querySelector<HTMLElement>(
                      `[data-agent-run="${CSS.escape(id)}"]`,
                    );
                    activity?.scrollIntoView({ block: "nearest" });
                    activity?.focus({ preventScroll: true });
                  })(),
                );
              }}
            />
          </TabsContent>
        )}
        {tab !== "sources" &&
          (activeResult && activeResult.attachment.threadId === assistant.selected ? (
            <BlogAgentResultActions
              key={activeResult.attachment.id}
              {...activeResult}
              document={document}
              onApply={onReplaceDocument}
              onRetry={() => {
                setActiveResult(null);
                if (activeResult.attachment.expiresAt && Date.parse(activeResult.attachment.expiresAt) <= Date.now())
                  openAgentPicker();
                else if (activeResult.attachment.runId) void prepareRetry(activeResult.attachment.runId);
              }}
              onBack={() => setActiveResult(null)}
              onAttach={(id, agentId) => {
                setActiveResult(null);
                assistant.rememberAttachment(activeResult.attachment);
                prepareAgentRequest(
                  agentId,
                  [id],
                  agentId === "writer"
                    ? "Write a complete article using this plan."
                    : agentId === "optimizer"
                      ? "Optimize this blog using the attached audit."
                      : "Use the attached result to ",
                );
              }}
            />
          ) : (
            <>
              {assistant.selected && (
                <p className="truncate text-[11px] leading-[1.45] text-muted-foreground">
                  {detail?.thread.title || "Conversation"} · This thread
                </p>
              )}
              <div
                ref={messages}
                className={`min-h-0 flex-1 overflow-y-auto ${showLaunch || assistant.loading ? "flex flex-col" : "space-y-3.5"}`}
              >
                <>
                  {showLaunch && (
                    <section
                      aria-label="Start a conversation"
                      className="my-auto flex shrink-0 flex-col gap-2 py-2 text-left"
                    >
                      <h3 className="text-xl font-semibold leading-[1.25]">Make your next draft better.</h3>
                      <p className="text-caption leading-[1.4] text-muted-foreground">
                        Choose a starting point, or ask anything.
                      </p>
                      <div className="flex flex-col gap-2">
                        {LAUNCH_ACTIONS.map((action) => {
                          const Icon = action.icon;
                          return (
                            <Button
                              key={action.label}
                              size="sm"
                              variant="ghost"
                              className="h-auto min-h-10 w-full justify-start gap-2.5 whitespace-normal px-2.5 py-1 text-left font-normal"
                              disabled={!ready || busy}
                              onClick={() =>
                                action.instruction
                                  ? prepareAgentRequest(action.agentId, [], action.instruction)
                                  : selectAgent(action.agentId)
                              }
                            >
                              <Icon className="size-[17px] text-accent-text" aria-hidden="true" />
                              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="text-sm font-medium leading-4">{action.label}</span>
                                <span className="text-xs leading-[14px] text-muted-foreground">
                                  {action.description}
                                </span>
                              </span>
                            </Button>
                          );
                        })}
                      </div>
                      <div className="space-y-1 text-xs leading-normal text-muted-foreground">
                        <p>You review every change before applying it.</p>
                        {!includeDraft && (
                          <p>Your draft is excluded. Reattach it in settings to audit or optimize it.</p>
                        )}
                      </div>
                    </section>
                  )}
                  {assistant.loading ? (
                    <BlogAssistantProgress centered>Loading private conversations…</BlogAssistantProgress>
                  ) : timeline.length ? (
                    timeline.map((entry) => {
                      if (entry.kind === "execution")
                        return (
                          <BlogAgentRunCard
                            key={entry.execution.id}
                            execution={entry.execution}
                            document={document}
                            busy={busy}
                            onOpen={(id) => {
                              setArtifactId(id);
                              setTab("sources");
                            }}
                            onUse={async (id) => {
                              setPreparing(true);
                              try {
                                const result = await assistantRequest<{ attachment: BlogAttachment; html?: string }>(
                                  `/api/admin/blog/${postId}/threads/${assistant.selected}/attachments/${id}`,
                                );
                                setActiveResult(result);
                              } catch (cause) {
                                toast.error(readable(cause));
                              } finally {
                                setPreparing(false);
                              }
                            }}
                            onRetry={(id) => void prepareRetry(id)}
                            onNewRequest={openAgentPicker}
                            onCopy={(id) => {
                              void assistantRequest<{ attachment: BlogAttachment }>(
                                `/api/admin/blog/${postId}/threads/${assistant.selected}/attachments/${id}`,
                              )
                                .then(async ({ attachment }) => {
                                  if (!supportedArtifact(attachment.data.artifact))
                                    throw new Error("This output is unavailable.");
                                  await navigator.clipboard.writeText(readableArtifact(attachment.data.artifact));
                                  toast.success("Copied");
                                })
                                .catch((cause) => toast.error(readable(cause)));
                            }}
                            onRefresh={() => void assistant.refresh()}
                          />
                        );
                      const message = entry.message;
                      const run = runs.find((entry) => entry.id === message.runId);
                      if (message.role === "assistant" && run) return result(run, message);
                      return (
                        <article key={message.id} className={styles.assistantUserMessage}>
                          {message.parts.map((part, index) => {
                            if (part.type === "text")
                              return (
                                <p key={index} className="whitespace-pre-wrap break-words text-sm leading-[1.4]">
                                  {part.text}
                                </p>
                              );
                            if (part.type !== "attachment") return null;
                            const attachment = detail?.attachments.find((entry) => entry.id === part.attachmentId);
                            if (
                              !attachment ||
                              attachment.status !== "ready" ||
                              (attachment.expiresAt && Date.parse(attachment.expiresAt) <= Date.now())
                            )
                              return (
                                <p key={index} className="text-caption text-muted-foreground">
                                  Attachment unavailable
                                </p>
                              );
                            return attachment.type === "link" &&
                              attachment.data.url &&
                              /^https:\/\//i.test(attachment.data.url) ? (
                              <a
                                key={index}
                                href={attachment.data.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 rounded-lg bg-card p-2 text-sm"
                              >
                                <Globe className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate">{attachment.label}</span>
                                  <span className="text-caption text-muted-foreground">Link · Open reference</span>
                                </span>
                                <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden="true" />
                              </a>
                            ) : (
                              <div key={index} className="flex items-center gap-3 rounded-lg bg-card p-2">
                                <span className="flex h-14 w-12 shrink-0 items-center justify-center rounded bg-muted">
                                  <ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm">{attachment.label}</span>
                                  <span className="text-caption text-muted-foreground">
                                    Image · Sent with your message
                                  </span>
                                </span>
                              </div>
                            );
                          })}
                        </article>
                      );
                    })
                  ) : null}
                  {detail?.executionsCursor && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void assistant.loadExecutions().catch((cause) => toast.error(readable(cause)))}
                    >
                      Load earlier activity
                    </Button>
                  )}
                  {assistant.stream &&
                    assistant.stream.run.operation !== "agent" &&
                    !visibleMessages.some((message) => message.runId === assistant.stream?.run.id) && (
                      <div className="py-4">
                        {tab === "assistant" && generatingStatus}
                        <BlogAssistantMarkdown text={assistant.stream.text} />
                      </div>
                    )}
                  {!assistant.loading && assistant.availability && !assistant.availability.enabled && (
                    <p className="text-caption text-muted-foreground">
                      {assistant.availability.reason ??
                        "AI assistance is not configured. You can continue writing manually."}
                    </p>
                  )}
                </>
              </div>
              {includeDraft && (
                <div className="-mb-1.5 flex shrink-0">
                  <span className="inline-flex h-[26px] max-w-full items-center gap-1 rounded-md border border-border bg-card pl-1.5 pr-0.5 text-xs">
                    <FileText className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">Current blog</span>
                    {!selectedAgent?.requiresDocument && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="size-6 shrink-0 [&_svg]:size-3"
                            aria-label="Remove draft context"
                            onClick={() => {
                              setDraftContext((value) => ({ ...value, [scope]: false }));
                              composer.current?.focus();
                            }}
                          >
                            <X aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove draft context</TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                </div>
              )}
              <div className={styles.agentComposerAnchor}>
                {slashOpen && (
                  <div className={styles.agentCommandMenu}>
                    <div
                      role="listbox"
                      id="blog-agent-commands"
                      aria-label="Agents"
                      className={styles.agentCommandOptions}
                    >
                      <p role="presentation" className={styles.agentCommandHeading}>
                        Agents · who helps
                      </p>
                      {!commands.length && (
                        <p className="px-2 py-3 text-caption text-muted-foreground">No matching agents</p>
                      )}
                      {commands.map((command, index) => {
                        const Icon = agentIcons[command.id];
                        return (
                          <Button
                            key={command.id}
                            id={`blog-command-${index}`}
                            role="option"
                            aria-selected={index === slashIndex}
                            variant="ghost"
                            className={styles.agentCommandOption}
                            onMouseDown={(event) => event.preventDefault()}
                            onPointerMove={() => setSlashIndex(index)}
                            onClick={() => chooseCommand(index)}
                          >
                            <Icon aria-hidden="true" />
                            <span>
                              <span className={styles.agentCommandName}>{command.name}</span>
                              <span className={styles.agentCommandDescription}>{command.description}</span>
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                    <div className={styles.agentCommandHints} aria-label="Agent picker keyboard shortcuts">
                      <span>
                        <kbd>↑ ↓</kbd> Move
                      </span>
                      <span>
                        <kbd>↵</kbd> Insert
                      </span>
                      <span>
                        <kbd>Esc</kbd> Close
                      </span>
                    </div>
                  </div>
                )}
                <div
                  className={`${styles.assistantComposer} m-0 min-h-0 overflow-y-auto bg-card data-[state=inactive]:hidden`}
                >
                  {preview && preview.scope === scope && (
                    <div className="flex items-center gap-2">
                      <img
                        src={preview.url}
                        alt={`Attachment preview: ${preview.filename}`}
                        className="size-12 rounded-md object-cover"
                      />
                      <p className="truncate text-caption">
                        {uploading ? "Uploading… " : "Upload failed. Choose the image again to retry. "}
                        {preview.filename}
                      </p>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Dismiss attachment preview"
                        disabled={uploading}
                        onClick={() => setPreview(null)}
                      >
                        <X />
                      </Button>
                    </div>
                  )}
                  {!!attachmentIds.length && (
                    <div className="flex max-h-32 flex-col gap-1 overflow-auto">
                      {attachmentIds.map((id) => {
                        const file = detail?.attachments.find((entry) => entry.id === id);
                        const unavailable =
                          !file ||
                          file.status !== "ready" ||
                          !!(file.expiresAt && Date.parse(file.expiresAt) <= Date.now());
                        return (
                          <div
                            key={id}
                            className="flex min-w-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-caption"
                          >
                            <FileText className="size-3 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">
                              {file?.label ?? "Attachment"}
                              {unavailable ? " · Unavailable" : ""}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Remove ${file?.label ?? "unavailable attachment"} from message`}
                              onClick={() =>
                                assistant.composerState({
                                  ...assistant.getComposerSelection(),
                                  attachmentIds: attachmentIds.filter((entry) => entry !== id),
                                })
                              }
                            >
                              <X />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {(invalidInputs || unknownAgent) && (
                    <p role="alert" className="text-caption text-destructive">
                      Remove or replace unavailable selections before sending.
                    </p>
                  )}
                  {!!referenceLinks.length && (
                    <div className="flex max-h-40 flex-col gap-2 overflow-auto">
                      {referenceLinks.map((url) => (
                        <div key={url} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
                          <Globe className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-w-0 flex-1 text-caption hover:underline"
                          >
                            <span className="block truncate">{new URL(url).hostname}</span>
                            <span className="text-muted-foreground">Link · Not read</span>
                          </a>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove reference ${url}`}
                            onClick={() =>
                              setReferences((value) => ({
                                ...value,
                                [scope]: referenceLinks.filter((entry) => entry !== url).join("\n"),
                              }))
                            }
                          >
                            <X aria-hidden="true" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Label htmlFor="blog-assistant-message" className="sr-only">
                    Message to assistant
                  </Label>
                  <BlogAgentComposer
                    key={scope}
                    ref={composer}
                    value={assistant.message}
                    content={assistant.composerSelection.content}
                    agentId={selectedAgentId}
                    agentOffset={assistant.composerSelection.agentOffset}
                    expanded={slashOpen}
                    describedBy={contextProblem ? "blog-agent-context-error" : undefined}
                    activeDescendant={
                      slashOpen && commands.length
                        ? `blog-command-${Math.min(slashIndex, commands.length - 1)}`
                        : undefined
                    }
                    onCaret={setCaret}
                    onChange={({ text, agentId, agentOffset, content }) => {
                      assistant.draft(text);
                      assistant.composerState({ ...assistant.getComposerSelection(), agentId, agentOffset, content });
                      setDismissedSlash(null);
                    }}
                    placeholder={
                      showNewThread && !visibleMessages.length
                        ? "What would you like to work on?"
                        : visibleMessages.length
                          ? "Write a follow-up…"
                          : "Ask about this blog…"
                    }
                    onKeyDown={(event) => {
                      if (event.isComposing) return;
                      if (slashOpen) {
                        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                          event.preventDefault();
                          setSlashIndex((index) =>
                            commands.length
                              ? (index + (event.key === "ArrowDown" ? 1 : -1) + commands.length) % commands.length
                              : 0,
                          );
                          return;
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          setDismissedSlash(slashKey);
                          return;
                        }
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          chooseCommand(slashIndex);
                          return;
                        }
                      }
                      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                  />
                  {contextProblem && (
                    <p id="blog-agent-context-error" role="status" className="text-caption text-destructive">
                      {contextProblem}
                    </p>
                  )}
                  <div className="flex items-center gap-1">
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      hidden
                      onChange={(event) => void upload(event.target.files?.[0])}
                    />
                    <Popover.Root
                      open={attachmentMenu}
                      onOpenChange={(open) => {
                        setAttachmentMenu(open);
                        if (!open) setShowReferences(false);
                      }}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Popover.Trigger asChild>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-muted-foreground"
                              aria-label="Attach files or links"
                            >
                              <Paperclip aria-hidden="true" />
                            </Button>
                          </Popover.Trigger>
                        </TooltipTrigger>
                        <TooltipContent>Attach files or links</TooltipContent>
                      </Tooltip>
                      <Popover.Portal>
                        <Popover.Content
                          side="top"
                          align="start"
                          sideOffset={8}
                          collisionPadding={16}
                          className={`z-50 flex max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-border bg-card shadow-md ${showReferences ? "w-80 gap-3 p-4" : "w-56 p-1"}`}
                          onEscapeKeyDown={(event) => event.stopPropagation()}
                        >
                          {showReferences ? (
                            <BlogLinkForm
                              title="Add a reference link"
                              inputRef={linkInput}
                              url={linkDraft}
                              error={linkError}
                              help="Attach a public HTTPS page as a reference."
                              onUrlChange={(value) => {
                                setLinkDraft(value);
                                setLinkError("");
                              }}
                              onSubmit={addReferenceLink}
                              onCancel={() => {
                                setAttachmentMenu(false);
                                setShowReferences(false);
                              }}
                            />
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="justify-start"
                                disabled={
                                  !ready ||
                                  uploading ||
                                  !assistant.availability?.capabilities.images ||
                                  attachmentIds.length >= 3
                                }
                                onClick={() => {
                                  setAttachmentMenu(false);
                                  fileInput.current?.click();
                                }}
                              >
                                <ImagePlus />
                                Upload image
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="justify-start"
                                onClick={() => {
                                  setShowReferences(true);
                                  setLinkError("");
                                  requestAnimationFrame(() => linkInput.current?.focus());
                                }}
                              >
                                <Link2 />
                                Add link
                              </Button>
                              {(detail?.attachments ?? [])
                                .filter(
                                  (file) =>
                                    file.status === "ready" &&
                                    (selectedAgent || !file.messageId || file.type === "artifact"),
                                )
                                .map((file) => (
                                  <Button
                                    key={file.id}
                                    size="sm"
                                    variant="ghost"
                                    className="justify-start truncate"
                                    aria-pressed={attachmentIds.includes(file.id)}
                                    disabled={
                                      !attachmentIds.includes(file.id) &&
                                      attachmentIds.length >= (selectedAgent ? 5 : 3)
                                    }
                                    onClick={() => {
                                      assistant.composerState({
                                        ...assistant.getComposerSelection(),
                                        attachmentIds: attachmentIds.includes(file.id)
                                          ? attachmentIds.filter((id) => id !== file.id)
                                          : [...attachmentIds, file.id],
                                      });
                                      setAttachmentMenu(false);
                                    }}
                                  >
                                    <FileText />
                                    <span className="truncate">{file.label}</span>
                                  </Button>
                                ))}
                              <p className="px-3 py-2 text-caption text-muted-foreground">
                                {attachmentIds.length >= 3
                                  ? "Three images selected. Remove one to upload another."
                                  : "JPEG, PNG, WebP · up to 5 MiB · three per request"}
                              </p>
                            </>
                          )}
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                    <Popover.Root open={showSettings} onOpenChange={setShowSettings}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Popover.Trigger asChild>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className={showSettings ? "bg-accent text-accent-text" : "text-muted-foreground"}
                              aria-label="Assistant settings"
                            >
                              <SlidersHorizontal aria-hidden="true" />
                            </Button>
                          </Popover.Trigger>
                        </TooltipTrigger>
                        <TooltipContent>Assistant settings</TooltipContent>
                      </Tooltip>
                      <Popover.Portal>
                        <Popover.Content
                          side="top"
                          align="start"
                          sideOffset={8}
                          collisionPadding={16}
                          className="z-50 max-h-96 w-80 max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-md"
                          onEscapeKeyDown={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-base font-medium">Assistant settings</h3>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Close assistant settings"
                              onClick={() => setShowSettings(false)}
                            >
                              <X aria-hidden="true" />
                            </Button>
                          </div>
                          <p className="text-caption text-muted-foreground">For your next message</p>
                          <div className="flex items-center gap-3 border-b border-border py-3">
                            <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <div className="flex-1">
                              <Label htmlFor="assistant-draft-context">Include current draft</Label>
                              <p className="mt-1 text-caption text-muted-foreground">
                                Use your article as context for the next message.
                              </p>
                            </div>
                            <Switch
                              id="assistant-draft-context"
                              checked={includeDraft}
                              disabled={selectedAgent?.requiresDocument}
                              onCheckedChange={(included) =>
                                setDraftContext((value) => ({ ...value, [scope]: included }))
                              }
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2">
                            <Globe className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <div className="flex-1">
                              <Label htmlFor="assistant-web">Web search</Label>
                              <p className="mt-1 text-caption text-muted-foreground">Find up-to-date sources online.</p>
                            </div>
                            <Switch
                              id="assistant-web"
                              checked={settings.webSearch ?? false}
                              disabled={!assistant.availability?.capabilities.webSearch}
                              onCheckedChange={(webSearch) => void updateSettings({ webSearch })}
                            />
                          </div>
                          <p className="text-caption text-muted-foreground">Web search uses an external provider.</p>
                          <details className="text-sm">
                            <summary className="cursor-pointer py-1 text-muted-foreground">More settings</summary>
                            <div className="space-y-1">
                              <Label htmlFor="assistant-tone">Tone</Label>
                              <Select
                                id="assistant-tone"
                                value={settings.tone ?? "From your idea"}
                                onChange={(event) => void updateSettings({ tone: event.target.value })}
                              >
                                {["From your idea", "Professional", "Conversational", "Educational"].map((tone) => (
                                  <option key={tone}>{tone}</option>
                                ))}
                              </Select>
                            </div>
                            {assistant.selected && (
                              <details className="text-caption text-muted-foreground">
                                <summary className="cursor-pointer py-2">Manage current conversation</summary>
                                <div className="flex flex-wrap gap-2 py-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => setConfirm("history")}
                                  >
                                    Clear history
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => setConfirm("thread")}
                                  >
                                    Delete thread
                                  </Button>
                                </div>
                                {busy && <p>Stop the active request before clearing or deleting this conversation.</p>}
                              </details>
                            )}
                          </details>
                          <p className="text-caption text-muted-foreground">
                            {assistant.availability?.enabled
                              ? `${includeDraft ? "Your draft, request," : "Your request"} and selected attachments are sent to ${assistant.availability.provider}. Changes require your approval.`
                              : (assistant.availability?.reason ??
                                "AI assistance is not configured. You can continue writing manually.")}
                          </p>
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                    <span className="flex-1" />
                    {assistant.message.length > 7600 && (
                      <span className="text-caption text-muted-foreground">{assistant.message.length}/8,000</span>
                    )}
                    {busy ? (
                      <Button
                        size="icon-sm"
                        aria-label="Stop"
                        className={styles.assistantSend}
                        onClick={() => void assistant.stop(running).catch((cause) => toast.error(readable(cause)))}
                      >
                        <Square className="size-3 fill-current" aria-hidden="true" />
                      </Button>
                    ) : (
                      <Button
                        size="icon-sm"
                        aria-label="Send message"
                        className={`${styles.assistantSend} disabled:opacity-50`}
                        disabled={
                          !ready ||
                          busy ||
                          uploading ||
                          invalidInputs ||
                          unknownAgent ||
                          !!contextProblem ||
                          (!assistant.message.trim() && !selectedAgent)
                        }
                        onClick={() => void send()}
                      >
                        <ArrowUp className="size-4.5" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          ))}
      </Tabs>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !changing) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "new"
                ? "Stop generation and create a thread?"
                : confirm === "history"
                  ? "Clear this conversation?"
                  : "Delete this thread?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "new"
                ? "Your current request is still generating. Keep it running, or stop it before creating a new conversation."
                : "Its private messages and attachments will be removed. Your article and other conversations are preserved."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={changing}>
              {confirm === "new" ? "Keep generating" : "Keep conversation"}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              loading={changing}
              onClick={() => {
                if (confirm === "new") {
                  void newThread();
                  return;
                }
                setChanging(true);
                void assistant
                  .remove(confirm === "history")
                  .then(() => {
                    setSelectedFiles((value) => ({ ...value, [scope]: [] }));
                    setReferences((value) => ({ ...value, [scope]: "" }));
                    setConfirm(null);
                  })
                  .catch((cause) => toast.error(readable(cause)))
                  .finally(() => setChanging(false));
              }}
            >
              {confirm === "new" ? "Stop and create thread" : confirm === "history" ? "Clear history" : "Delete thread"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
