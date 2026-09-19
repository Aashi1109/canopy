"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/index.tsx";
import type {
  BlogAssistantAvailability,
  BlogAssistantRun,
  BlogAssistantThread,
  BlogAttachment,
  BlogThreadDetail,
  BlogRunRequest,
  BlogRequestSettings,
  BlogMessage,
  BlogExecutionSummary,
  BlogComposerSelection,
} from "@/lib/blog/assistantTypes";
import { activeRun, assistantRequest, AssistantRequestError, streamAssistantRun } from "./assistantApi";
import { parseComposerContent } from "@/lib/blog/composerDocument.ts";
import { sameComposerSelection } from "./agentComposer.ts";

function restoredAgentOffset(value: unknown): { agentOffset?: number } {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 8000
    ? { agentOffset: value }
    : {};
}

function restoredComposerContent(value: unknown): Pick<BlogComposerSelection, "content"> {
  const content = parseComposerContent(value);
  return content ? { content } : {};
}

export function useBlogAssistant(postId: string, ownerId: string) {
  const base = `/api/admin/blog/${postId}/threads`;
  const storageKey = `blog-assistant:${ownerId}:${postId}`;
  const [threads, setThreads] = useState<BlogAssistantThread[]>([]);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<string | null>(null);
  const [newSettings, setNewSettings] = useState<BlogRequestSettings>({});
  const startingNew = useRef(false);
  const [details, setDetails] = useState<Record<string, BlogThreadDetail>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [composerStates, setComposerStates] = useState<Record<string, BlogComposerSelection>>({});
  const composerStatesRef = useRef(composerStates);
  composerStatesRef.current = composerStates;
  const [availability, setAvailability] = useState<BlogAssistantAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const alive = useRef(true);
  const controllers = useRef(new Map<string, AbortController>());
  const [streams, setStreams] = useState<Record<string, { run: BlogAssistantRun; text: string }>>({});
  const [freshRunIds, setFreshRunIds] = useState<string[]>([]);
  const detailsRef = useRef(details);
  detailsRef.current = details;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const creating = useRef<Promise<BlogAssistantThread> | null>(null);
  const pending = useRef<Record<string, BlogRunRequest>>({});
  const locks = useRef(new Set<string>());
  const threadLoads = useRef<Record<string, number>>({});
  const refreshVersion = useRef(0);
  const settingsQueue = useRef<Record<string, Promise<void>>>({});
  const clearing = useRef(new Set<string>());

  const remember = useCallback(
    (id: string | null) => {
      selectedRef.current = id;
      setSelected(id);
      setError("");
      try {
        sessionStorage.setItem(`${storageKey}:selected`, id ?? "");
      } catch {
        /* Storage can be unavailable. */
      }
    },
    [storageKey],
  );
  const loadThread = useCallback(
    async (id: string) => {
      const version = (threadLoads.current[id] ?? 0) + 1;
      threadLoads.current[id] = version;
      const knownRuns = new Set(detailsRef.current[id]?.runs.map((run) => run.id));
      const detail = await assistantRequest<BlogThreadDetail>(`${base}/${id}`);
      if (!alive.current || threadLoads.current[id] !== version) return;
      setThreads((value) =>
        value.map((thread) => (thread.id === id ? { ...thread, title: detail.thread.title } : thread)),
      );
      setDetails((value) => ({
        ...value,
        [id]: {
          ...detail,
          executions: [
            ...(detail.executions ?? []).map((entry) => {
              const current = value[id]?.executions?.find((old) => old.id === entry.id);
              return current &&
                (current.updatedAt > entry.updatedAt ||
                  (!activeRun(current.status) && activeRun(entry.status)) ||
                  (current.status === "unknown" && ["queued", "running"].includes(entry.status)))
                ? current
                : entry;
            }),
            ...(value[id]?.executions ?? []).filter(
              (entry) => !detail.executions?.some((server) => server.id === entry.id),
            ),
          ],
          runs: [
            ...detail.runs.map((run) => {
              const current = value[id]?.runs.find((entry) => entry.id === run.id);
              return current &&
                (current.updatedAt > run.updatedAt ||
                  (!activeRun(current.status) && activeRun(run.status)) ||
                  (current.status === "unknown" && ["queued", "running"].includes(run.status)))
                ? current
                : run;
            }),
            ...(value[id]?.runs ?? []).filter(
              (run) => !knownRuns.has(run.id) && !detail.runs.some((entry) => entry.id === run.id),
            ),
          ].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        },
      }));
      if (detail.runs.some((run) => run.request.clientRequestId === pending.current[id]?.clientRequestId))
        delete pending.current[id];
      setDrafts((value) => {
        if (id in value) return value;
        let local: string | null = null;
        try {
          local = sessionStorage.getItem(`${storageKey}:draft:${id}`);
        } catch {
          /* Optional recovery. */
        }
        return { ...value, [id]: local ?? detail.thread.composerDraft ?? "" };
      });
      setComposerStates((value) => {
        if (id in value) return value;
        let saved = detail.thread.composerState ?? { attachmentIds: [] };
        try {
          const raw = JSON.parse(sessionStorage.getItem(`${storageKey}:selection:${id}`) ?? "null");
          if (
            raw &&
            Array.isArray(raw.attachmentIds) &&
            raw.attachmentIds.every((entry: unknown) => typeof entry === "string")
          )
            saved = {
              agentId: typeof raw.agentId === "string" ? raw.agentId : undefined,
              ...restoredAgentOffset(raw.agentOffset),
              ...restoredComposerContent(raw.content),
              attachmentIds: raw.attachmentIds,
            };
        } catch {
          /* Server restoration remains available. */
        }
        return { ...value, [id]: saved };
      });
      setAvailability(detail);
    },
    [base, storageKey],
  );
  const refresh = useCallback(async () => {
    setFreshRunIds([]);
    const version = ++refreshVersion.current;
    setLoading(true);
    setHistoryStatus("loading");
    setError("");
    try {
      const [config, history] = await Promise.allSettled([
        assistantRequest<BlogAssistantAvailability>("/api/admin/blog/ai"),
        assistantRequest<{ threads: BlogAssistantThread[] }>(base),
      ]);
      if (!alive.current || refreshVersion.current !== version) return;
      if (config.status === "fulfilled") setAvailability(config.value);
      if (history.status === "rejected") {
        const message =
          history.reason instanceof Error ? history.reason.message : "Could not load private conversations.";
        setHistoryStatus("error");
        setError(message);
        if (threadsRef.current.length) toast.error(message);
        return;
      }
      const list = history.value;
      setThreads(list.threads);
      setHistoryStatus("ready");
      setDetails((value) =>
        Object.fromEntries(Object.entries(value).filter(([id]) => list.threads.some((thread) => thread.id === id))),
      );
      let id = selectedRef.current ?? new URLSearchParams(window.location.search).get("thread");
      try {
        id ??= sessionStorage.getItem(`${storageKey}:selected`);
      } catch {
        /* Optional selection restoration. */
      }
      id = startingNew.current
        ? null
        : list.threads.some((thread) => thread.id === id)
          ? id
          : (list.threads[0]?.id ?? null);
      remember(id);
      if (config.status === "rejected")
        setError(config.reason instanceof Error ? config.reason.message : "Could not load assistant settings.");
      if (id) await loadThread(id);
    } catch (cause) {
      if (alive.current && refreshVersion.current === version)
        setError(cause instanceof Error ? cause.message : "Could not load private conversations.");
    } finally {
      if (alive.current && refreshVersion.current === version) setLoading(false);
    }
  }, [base, loadThread, remember, storageKey]);
  useEffect(() => {
    alive.current = true;
    try {
      const local = sessionStorage.getItem(`${storageKey}:draft:new`);
      if (local !== null) setDrafts((value) => ("new" in value ? value : { ...value, new: local }));
      const raw = JSON.parse(sessionStorage.getItem(`${storageKey}:selection:new`) ?? "null");
      if (raw && Array.isArray(raw.attachmentIds) && raw.attachmentIds.every((id: unknown) => typeof id === "string"))
        setComposerStates((value) =>
          "new" in value
            ? value
            : {
                ...value,
                new: {
                  agentId: typeof raw.agentId === "string" ? raw.agentId : undefined,
                  ...restoredAgentOffset(raw.agentOffset),
                  ...restoredComposerContent(raw.content),
                  attachmentIds: raw.attachmentIds,
                },
              },
        );
    } catch {
      /* Optional draft recovery. */
    }
    void refresh();
    return () => {
      alive.current = false;
      for (const controller of controllers.current.values()) controller.abort();
    };
  }, [refresh, storageKey]);

  function updateRun(run: BlogAssistantRun) {
    if (!run.threadId) return;
    const id = run.threadId;
    setDetails((value) => {
      const detail = value[id];
      if (!detail) return value;
      const current = detail.runs.find((entry) => entry.id === run.id);
      if (
        current &&
        (current.updatedAt > run.updatedAt ||
          (!activeRun(current.status) && activeRun(run.status)) ||
          (current.status === "unknown" && ["queued", "running"].includes(run.status)))
      )
        return value;
      const runs = [...detail.runs.filter((entry) => entry.id !== run.id), run].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      const executions =
        run.operation === "agent"
          ? [
              ...(detail.executions ?? []).filter((entry) => entry.id !== run.id),
              {
                id: run.id,
                agentId: run.request.agentId,
                requestMessage: run.request.message,
                operation: run.operation,
                status: run.status,
                label: run.response?.artifact?.label ?? "Agent request",
                artifact: run.response?.artifact,
                errorMessage: run.errorMessage,
                createdAt: run.createdAt,
                updatedAt: run.updatedAt,
                completedAt: run.completedAt,
                expiresAt: new Date(Date.parse(run.createdAt) + 30 * 86400000).toISOString(),
              } satisfies BlogExecutionSummary,
            ].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          : detail.executions;
      return { ...value, [id]: { ...detail, runs, executions } };
    });
  }
  useEffect(() => {
    const abort = () => {
      for (const controller of controllers.current.values()) controller.abort();
    };
    window.addEventListener("pagehide", abort);
    return () => window.removeEventListener("pagehide", abort);
  }, []);

  function startNewThread() {
    setFreshRunIds([]);
    startingNew.current = true;
    remember(null);
    draft("", "new");
    composerState({ attachmentIds: [] }, "new");
    setNewSettings({});
  }
  async function createThread(preserveDraft = false, message?: string) {
    if (creating.current) return creating.current;
    creating.current = (async () => {
      const { thread } = await assistantRequest<{ thread: BlogAssistantThread }>(base, {
        settings: newSettings,
        ...(message ? { title: message.trim().replace(/\s+/g, " ").slice(0, 80) } : {}),
      });
      if (preserveDraft) {
        draft(draftsRef.current.new ?? "", thread.id);
        composerState(composerStatesRef.current.new ?? { attachmentIds: [] }, thread.id);
      }
      setThreads((value) => [thread, ...value.filter((entry) => entry.id !== thread.id)]);
      await loadThread(thread.id);
      startingNew.current = false;
      remember(thread.id);
      return thread;
    })();
    try {
      return await creating.current;
    } finally {
      creating.current = null;
    }
  }
  async function choose(id: string) {
    setFreshRunIds([]);
    startingNew.current = false;
    remember(id);
    try {
      await loadThread(id);
      if (selectedRef.current === id) setError("");
    } catch (cause) {
      if (selectedRef.current !== id) return;
      if (cause instanceof AssistantRequestError && cause.status === 404) {
        remember(null);
        await refresh();
      } else setError(cause instanceof Error ? cause.message : "Could not open this thread.");
    }
  }
  function draft(text: string, id = selected ?? "new") {
    draftsRef.current = { ...draftsRef.current, [id]: text };
    setDrafts((value) => ({ ...value, [id]: text }));
    try {
      sessionStorage.setItem(`${storageKey}:draft:${id}`, text);
    } catch {
      /* Keep in-memory draft. */
    }
  }
  function composerState(value: BlogComposerSelection, id = selectedRef.current ?? "new") {
    composerStatesRef.current = { ...composerStatesRef.current, [id]: value };
    setComposerStates((previous) => ({ ...previous, [id]: value }));
    try {
      sessionStorage.setItem(`${storageKey}:selection:${id}`, JSON.stringify(value));
    } catch {
      /* Optional recovery. */
    }
  }
  async function loadExecutions() {
    const id = selectedRef.current;
    if (!id) return;
    const cursor = detailsRef.current[id]?.executionsCursor;
    if (!cursor) return;
    const page = await assistantRequest<{ executions: BlogExecutionSummary[]; nextCursor: string | null }>(
      `${base}/${id}?view=results&cursor=${encodeURIComponent(cursor)}`,
    );
    setDetails((all) =>
      all[id]
        ? {
            ...all,
            [id]: {
              ...all[id],
              executions: [
                ...(all[id].executions ?? []),
                ...page.executions.filter((entry) => !all[id].executions?.some((old) => old.id === entry.id)),
              ],
              executionsCursor: page.nextCursor,
            },
          }
        : all,
    );
  }
  async function settings(value: BlogRequestSettings, composerDraft?: string, id = selected) {
    if (!id) {
      setNewSettings((current) => ({ ...current, ...value }));
      return;
    }
    const save = (settingsQueue.current[id] ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const result = await assistantRequest<{ thread: BlogAssistantThread }>(
          `${base}/${id}`,
          { settings: value, ...(composerDraft === undefined ? {} : { composerDraft }) },
          "PATCH",
        );
        setThreads((threads) => threads.map((thread) => (thread.id === id ? result.thread : thread)));
        setDetails((details) =>
          details[id] ? { ...details, [id]: { ...details[id], thread: result.thread } } : details,
        );
      });
    settingsQueue.current[id] = save;
    await save;
  }
  async function saveDraft(composerDraft: string, id: string) {
    if (clearing.current.has(id)) return;
    try {
      const save = (settingsQueue.current[id] ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          await assistantRequest(
            `${base}/${id}`,
            { composerDraft, composerState: composerStatesRef.current[id] ?? { attachmentIds: [] } },
            "PATCH",
          );
        });
      settingsQueue.current[id] = save;
      await save;
    } catch (cause) {
      setError("Your message is kept in this browser, but could not be synced. Refresh history before leaving.");
      throw cause;
    }
  }
  async function send(
    input: Omit<BlogRunRequest, "threadId" | "clientRequestId" | "postId">,
    onCreated?: (run: BlogAssistantRun) => void,
  ) {
    let id = selectedRef.current ?? "new";
    if (locks.current.has(id)) return;
    locks.current.add(id);
    setError("");
    setSubmitting((value) => ({ ...value, [id]: true }));
    const lockId = id;
    const submittedSelection = composerStatesRef.current[id] ?? { attachmentIds: [] };
    const controller = new AbortController();
    let observedRun: BlogAssistantRun | undefined;
    controllers.current.set(id, controller);
    try {
      if (id === "new") id = (await createThread(true, input.message)).id;
      controller.signal.throwIfAborted();
      if (lockId !== id) {
        locks.current.delete(lockId);
        controllers.current.delete(lockId);
        setSubmitting((value) => ({ ...value, [lockId]: false }));
      }
      const previous = pending.current[id];
      const { clientRequestId: _previousKey, ...previousInput } = previous ?? {};
      const sameSubmission =
        previous && JSON.stringify(previousInput) === JSON.stringify({ ...input, postId, threadId: id });
      const request = sameSubmission
        ? previous
        : { ...input, postId, threadId: id, clientRequestId: crypto.randomUUID() };
      pending.current[id] = request;
      locks.current.add(id);
      setSubmitting((value) => ({ ...value, [id]: true }));
      controllers.current.set(id, controller);
      const run = await streamAssistantRun(request, controller.signal, (event) => {
        if (!alive.current || controller.signal.aborted) return;
        if (event.type === "run" || event.type === "completed" || (event.type === "error" && event.run)) {
          const next = event.run!;
          observedRun = next;
          updateRun(next);
          if (event.type === "completed" && next.status === "completed" && selectedRef.current === id)
            setFreshRunIds((value) => (value.includes(next.id) ? value : [...value, next.id]));
          if (event.type === "run") {
            delete pending.current[id];
            setStreams((value) => ({ ...value, [id]: { run: next, text: value[id]?.text ?? "" } }));
            onCreated?.(next);
            void loadThread(id).catch(() => {});
          }
        } else if (event.type === "text-delta") {
          setStreams((value) =>
            value[id] ? { ...value, [id]: { ...value[id], text: value[id].text + event.text } } : value,
          );
        }
      });
      delete pending.current[id];
      try {
        await loadThread(id);
      } catch (cause) {
        if (run.status !== "completed" || !run.response) throw cause;
        if (run.operation === "agent") {
          updateRun(run);
          toast.error("Your result is saved. History could not refresh; open its card to read it.");
          return run;
        }
        if (!run.assistantMessageId) throw cause;
        // Completion is already acknowledged; a failed history read must not discard its proposal.
        const response = run.response;
        const assistantMessageId = run.assistantMessageId;
        setDetails((value) => {
          const detail = value[id];
          if (!detail) return value;
          const messages = [...detail.messages];
          if (run.inputMessageId && !messages.some((message) => message.id === run.inputMessageId))
            messages.push({
              id: run.inputMessageId,
              threadId: id,
              runId: null,
              role: "user",
              parts: [
                { type: "text", text: request.message },
                ...(request.attachmentIds ?? []).map((attachmentId) => ({ type: "attachment" as const, attachmentId })),
              ],
              meta: {},
              createdAt: run.createdAt,
              updatedAt: run.createdAt,
            });
          const previous = messages.find((message) => message.id === assistantMessageId);
          const message: BlogMessage = {
            id: assistantMessageId,
            threadId: id,
            runId: run.id,
            role: "assistant",
            parts: [
              ...(response.text ? [{ type: "text" as const, text: response.text }] : []),
              ...(previous?.parts.filter((part) => part.type === "tool-call" || part.type === "tool-result") ?? []),
              ...response.proposals.map((proposal) => ({ type: "proposal" as const, proposal })),
            ],
            meta: previous?.meta ?? {},
            createdAt: previous?.createdAt ?? run.createdAt,
            updatedAt: run.updatedAt,
          };
          return {
            ...value,
            [id]: { ...detail, messages: [...messages.filter((entry) => entry.id !== message.id), message] },
          };
        });
        toast.error("Your response is ready, but conversation history could not refresh. You can continue here.");
      }
      setThreads((value) =>
        value
          .map((thread) =>
            thread.id === id
              ? {
                  ...thread,
                  updatedAt: run.updatedAt,
                }
              : thread,
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
      if (run.status === "completed" && ["chat", "rewrite"].includes(input.operation)) {
        for (const scope of lockId === "new" ? [id, "new"] : [id]) {
          if (
            draftsRef.current[scope]?.trim() === request.message &&
            sameComposerSelection(composerStatesRef.current[scope] ?? { attachmentIds: [] }, submittedSelection)
          ) {
            draft("", scope);
            composerState({ attachmentIds: [] }, scope);
          }
        }
      }
      setError("");
      return run;
    } catch (cause) {
      if (controller.signal.aborted) {
        void loadThread(id).catch(() => {
          if (selectedRef.current === id)
            setError("Could not confirm the stopped request. Refresh history to check its saved outcome.");
        });
        return null;
      }
      if (observedRun && ["queued", "running"].includes(observedRun.status))
        updateRun({
          ...observedRun,
          status: "unknown",
          errorMessage: "Connection interrupted. Check the saved status before retrying.",
        });
      if (
        cause instanceof AssistantRequestError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        ![408, 409, 425].includes(cause.status)
      )
        delete pending.current[id];
      if (!observedRun || observedRun.operation !== "agent") {
        if (selectedRef.current === id)
          setError(
            cause instanceof Error ? cause.message : "Could not confirm this request. Refresh history to recover it.",
          );
        toast.error(cause instanceof Error ? cause.message : "Could not send. Your message is still here.");
      }
      return null;
    } finally {
      locks.current.delete(lockId);
      locks.current.delete(id);
      controllers.current.delete(id);
      controllers.current.delete(lockId);
      if (alive.current) {
        setSubmitting((value) => ({ ...value, [lockId]: false, [id]: false }));
        setStreams((value) => {
          const next = { ...value };
          delete next[id];
          return next;
        });
      }
    }
  }
  async function stop(run?: BlogAssistantRun) {
    const id = run?.threadId ?? selectedRef.current ?? "new";
    if (id) controllers.current.get(id)?.abort();
    setError("");
  }
  async function remove(historyOnly: boolean) {
    if (!selected) return;
    setFreshRunIds([]);
    clearing.current.add(selected);
    try {
      await settingsQueue.current[selected]?.catch(() => {});
      await assistantRequest(`${base}/${selected}${historyOnly ? "/history" : ""}`, undefined, "DELETE");
      threadLoads.current[selected] = (threadLoads.current[selected] ?? 0) + 1;
      delete pending.current[selected];
      draft("", selected);
      composerState({ attachmentIds: [] }, selected);
      setDetails((value) => {
        const next = { ...value };
        delete next[selected];
        return next;
      });
      if (historyOnly) await loadThread(selected);
      else {
        remember(null);
        await refresh();
      }
    } finally {
      clearing.current.delete(selected);
    }
  }
  async function upload(file: File) {
    const id = selectedRef.current ?? (await createThread(true)).id;
    const body = new FormData();
    body.set("file", file);
    const result = await assistantRequest<{ attachment: BlogAttachment }>(`${base}/${id}/attachments`, body);
    setDetails((value) =>
      value[id]
        ? { ...value, [id]: { ...value[id], attachments: [...value[id].attachments, result.attachment] } }
        : value,
    );
    return result.attachment;
  }
  async function addLink(url: string) {
    const id = selectedRef.current ?? (await createThread(true)).id;
    const { attachment } = await assistantRequest<{ attachment: BlogAttachment }>(`${base}/${id}/attachments`, {
      type: "link",
      label: url,
      url,
    });
    setDetails((value) =>
      value[id] ? { ...value, [id]: { ...value[id], attachments: [...value[id].attachments, attachment] } } : value,
    );
    return attachment;
  }
  async function removeAttachment(attachment: BlogAttachment) {
    await assistantRequest(`${base}/${attachment.threadId}/attachments/${attachment.id}`, undefined, "DELETE");
    setDetails((value) =>
      value[attachment.threadId]
        ? {
            ...value,
            [attachment.threadId]: {
              ...value[attachment.threadId],
              attachments: value[attachment.threadId].attachments.filter((entry) => entry.id !== attachment.id),
            },
          }
        : value,
    );
  }
  return {
    threads,
    freshRunIds,
    activeThreadIds: Object.keys(submitting).filter((id) => submitting[id]),
    selected,
    detail: selected ? details[selected] : undefined,
    message: drafts[selected ?? "new"] ?? "",
    availability,
    loading,
    historyStatus,
    error,
    submitting: submitting[selected ?? "new"] || submitting.new || false,
    draft,
    refresh,
    choose,
    startNewThread,
    createThread,
    composerSelection: composerStates[selected ?? "new"] ?? { attachmentIds: [] },
    composerState,
    rememberAttachment: (file: BlogAttachment) =>
      setDetails((value) =>
        value[file.threadId]
          ? {
              ...value,
              [file.threadId]: {
                ...value[file.threadId],
                attachments: [...value[file.threadId].attachments.filter((old) => old.id !== file.id), file],
              },
            }
          : value,
      ),
    getComposerSelection: (id = selectedRef.current ?? "new") => composerStatesRef.current[id] ?? { attachmentIds: [] },
    composerSelectionsByThread: composerStates,
    loadExecutions,
    requestSettings: selected ? (details[selected]?.thread.settings ?? {}) : newSettings,
    settings,
    saveDraft,
    send,
    stop,
    remove,
    upload,
    addLink,
    stream: selected ? streams[selected] : undefined,
    removeAttachment,
    updateRun,
  };
}
