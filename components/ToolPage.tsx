"use client";

/**
 * The single renderer for every tool.
 *
 * It knows nothing about any individual tool. Everything it needs arrives as
 * data (`spec`, resolved by `lib/tool-framework/catalog.ts` from the database
 * row), and the two dynamic imports below are bundler context modules over
 * `tools/*` — a lookup by folder name, never an enumeration.
 *
 * The folder key is `definitionKey`, which the catalogue derives from `toolId`.
 * It is never derived from the public slug: a slug is admin-owned and plenty of
 * live tools have one that differs from their folder name.
 *
 * EXECUTION HOST. A tool declares its host by which run file it ships, so the
 * host is resolved by trying to load one, not by consulting a list:
 *
 *   `tools/<key>/run.ts`        -> main thread, through `createExecute`
 *   `tools/<key>/run.worker.ts` -> the one tool worker, through `useToolRun`
 *   `tools/<key>/run.server.ts` -> `POST /api/tools/<key>`
 *
 * The main-thread import template ends in the static suffix `/run`, so the
 * context module it creates contains `run.ts` and nothing else: neither
 * `run.worker` nor `run.server` matches `^\./.*\/run$`, so neither is reachable
 * from this module — a worker tool's run function cannot be pulled onto the
 * main thread even by mistake.
 */

import { Button, Select } from "@/components/ui/index.tsx";
import { Loader2, Undo2 } from "lucide-react";
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
} from "react";

import { UniversalWorkbench } from "@/components/UniversalWorkbench";
import { ToolIcon } from "@/components/ToolIcon";
import type { ResolvedIcon } from "@/lib/tool-framework/icons";
import { workspaceFileId } from "@/components/FileInput";
import { resolveImageConversion } from "@/app/media/lib/imageConversion";
import {
  ToolWorkspace,
  type WorkspaceInputState,
  type WorkspaceProps,
  type WorkspaceToolbarActions,
} from "@/components/ToolWorkspace";
import { createExecute } from "@/lib/tool-framework/host";
import type { ToolResult } from "@/lib/tool-framework/result";
import { ToolError, type ToolRun, type ToolRunInput } from "@/lib/tool-framework/run";
import type { SettingsOf, SettingsSpec } from "@/lib/tool-framework/settings";
import type { ToolInputSpec, ToolSpec } from "@/lib/tool-framework/spec";
import { isLargeTextFile } from "@/lib/tool-framework/textFileInput";
import { useToolRun } from "@/lib/tool-framework/useToolRun";
import { cleanupArtifactJobWithRetry, sweepStaleArtifactJobsOnce } from "@/lib/tool-framework/artifacts";
import { createToolRunFile, type ToolRunRequestInput } from "@/lib/tool-framework/workerProtocol";
import { useToolRuntime } from "@/lib/tool-runtime/useToolRuntime";
import type {
  ToolDefinition,
  ToolExecutionOutcome,
  ToolRuntimeSpec,
  ToolSettings,
  ToolValidationIssue,
} from "@/lib/tool-runtime/types";

/** A run function whose settings type is only known at runtime. */
type LoadedRun = ToolRun<SettingsOf<SettingsSpec>>;

type RuntimeSettings = Readonly<Record<string, unknown>>;

const EMPTY_INPUT: WorkspaceInputState = { files: [], text: "" };
/** The tool's own settings live in `ToolPage`; the runtime holds none. */
const RUNTIME_SETTINGS: ToolSettings = {};
const NO_ISSUES: readonly ToolValidationIssue[] = [];

// ---------------------------------------------------------------------------
// Module resolution by folder name.
// ---------------------------------------------------------------------------

function isMissingModule(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code: unknown = (error as { code?: unknown }).code;
  return code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND" || /cannot find module/i.test(error.message);
}

function readExport(module: unknown, name: string): unknown {
  if (typeof module !== "object" || module === null) return undefined;
  // Own properties only — never read a value through a poisoned prototype.
  return Object.hasOwn(module, name) ? (module as Record<string, unknown>)[name] : undefined;
}

/**
 * Loads a tool's main-thread run function, or `null` when it ships none.
 *
 * A folder without `run.ts` is the normal case for the worker and server hosts,
 * not an error; a `run.ts` that throws while evaluating is a bug and rethrows.
 */
async function loadMainThreadRun(key: string): Promise<LoadedRun | null> {
  let module: unknown;
  try {
    module = await import(`../tools/${key}/run`);
  } catch (error: unknown) {
    if (isMissingModule(error)) return null;
    throw error;
  }
  const run = readExport(module, "default") ?? readExport(module, "run");
  return typeof run === "function" ? (run as LoadedRun) : null;
}

/**
 * The tool's own workspace when it ships one, otherwise the shared workspace.
 *
 * A missing file, or one that does not default-export a workspace, falls back
 * rather than throwing — most tools ship no `workspace.tsx` at all.
 */
function resolveWorkspace(key: string): ComponentType<WorkspaceProps> {
  const fallback: { default: ComponentType<WorkspaceProps> } = {
    default: ToolWorkspace,
  };
  return lazy(async () => {
    let module: unknown;
    try {
      module = await import(`../tools/${key}/workspace`);
    } catch (error: unknown) {
      if (isMissingModule(error)) return fallback;
      throw error;
    }
    const workspace = readExport(module, "default");
    return typeof workspace === "function" ? { default: workspace as ComponentType<WorkspaceProps> } : fallback;
  });
}

// ---------------------------------------------------------------------------
// Input adapters.
// ---------------------------------------------------------------------------

function isEmptyInput(kind: ToolInputSpec["kind"], input: WorkspaceInputState): boolean {
  switch (kind) {
    // Every value comes from the settings, so there is nothing to be empty of.
    case "none":
      return false;
    case "files":
      return input.files.length === 0;
    default:
      return input.text.trim() === "" && input.files.length === 0;
  }
}

function toRunInput(input: WorkspaceInputState): ToolRunInput {
  return {
    files: input.files.map((file) => createToolRunFile(workspaceFileId(file), file)),
    secondary: input.secondary,
    text: input.text,
  };
}

function toWorkerFiles(files: readonly File[]): ToolRunInput["files"] {
  return files.map((file) => createToolRunFile(workspaceFileId(file), file));
}

function toOutcome(result: ToolResult): ToolExecutionOutcome<ToolResult> {
  return { artifacts: result.artifacts, facts: result.stats, result };
}

// ---------------------------------------------------------------------------
// Hosts.
// ---------------------------------------------------------------------------

/** Turns the worker's job state into the promise the runtime's `execute` needs. */
function useWorkerHost() {
  const { cancel, cleanupArtifacts, reset, state, start } = useToolRun();
  const pending = useRef<{
    reject: (reason: unknown) => void;
    resolve: (result: ToolResult) => void;
  } | null>(null);

  useEffect(() => {
    const waiter = pending.current;
    if (!waiter || state.status === "idle" || state.status === "running") return;
    pending.current = null;
    if (state.status === "completed" && state.result) {
      waiter.resolve(state.result);
      return;
    }
    if (state.status === "failed") {
      waiter.reject(
        new ToolError(
          state.error?.code ?? "processing-failed",
          state.error?.message ?? "This tool could not finish.",
          state.error?.recovery,
        ),
      );
      return;
    }
    waiter.reject(new DOMException("Aborted", "AbortError"));
  }, [state]);

  const run = useCallback(
    (request: ToolRunRequestInput, signal: AbortSignal) =>
      new Promise<ToolResult>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        pending.current = { reject, resolve };
        signal.addEventListener("abort", cancel, { once: true });
        start(request);
      }),
    [cancel, start],
  );

  return {
    cleanupArtifacts,
    reset,
    progress: state.status === "running" ? state.progress : null,
    run,
  };
}

function readServerResult(payload: unknown): ToolResult {
  const result = readExport(payload, "result");
  if (typeof result === "object" && result !== null && "render" in result) {
    return result as ToolResult;
  }
  const error = readExport(payload, "error");
  const code = readExport(error, "code");
  const message = readExport(error, "message");
  const recovery = readExport(error, "recovery");
  throw new ToolError(
    typeof code === "string" ? code : "processing-failed",
    typeof message === "string" ? message : "This tool could not finish.",
    typeof recovery === "string" ? recovery : undefined,
  );
}

async function runOnServer(
  key: string,
  input: WorkspaceInputState,
  settings: RuntimeSettings,
  signal: AbortSignal,
): Promise<ToolResult> {
  const response = await fetch(`/api/tools/${encodeURIComponent(key)}`, {
    body: JSON.stringify({
      secondary: input.secondary,
      settings,
      text: input.text,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal,
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new ToolError("processing-failed", "This tool returned an invalid response.");
  }
  return readServerResult(payload);
}

// ---------------------------------------------------------------------------
// Chrome shared with the workbench's toolbar and workspace slots.
// ---------------------------------------------------------------------------

interface ToolChrome {
  readonly cleanupWorkerArtifacts: () => void;
  readonly onSettingChange: (key: string, value: unknown) => void;
  readonly onValidationChange: (reason: string | null) => void;
  readonly progress: WorkspaceProps["progress"];
  readonly resetPageState: () => void;
  readonly settings: RuntimeSettings;
  readonly spec: ToolSpec;
  readonly setToolbarActions: (actions: WorkspaceToolbarActions | null) => void;
  readonly toolbarActions: WorkspaceToolbarActions | null;
  readonly validationReason: string | null;
  readonly Workspace: ComponentType<WorkspaceProps>;
  readonly workspaceKey: number;
}

const ToolChromeContext = createContext<ToolChrome | null>(null);

function useToolChrome(): ToolChrome {
  const chrome = useContext(ToolChromeContext);
  if (!chrome) throw new Error("Tool chrome is only available inside ToolPage.");
  return chrome;
}

function useRuntime() {
  return useToolRuntime<WorkspaceInputState, ToolSettings, ToolResult>();
}

function usePrimaryAction(): WorkspaceProps["primaryAction"] {
  const chrome = useToolChrome();
  const runtime = useRuntime();
  const running = runtime.lifecycle === "running";

  const maxEditableBytes =
    chrome.spec.input.kind === "text" ? chrome.spec.input.acceptFiles?.maxEditableBytes : undefined;
  const largeFile = isLargeTextFile(runtime.input.files[0], maxEditableBytes);
  const hasPrimaryAction = chrome.spec.trigger.mode === "manual" || largeFile;

  return useMemo(
    () =>
      hasPrimaryAction
        ? {
            disabled:
              running ||
              chrome.validationReason !== null ||
              runtime.lifecycle === "empty" ||
              runtime.lifecycle === "invalid",
            label: chrome.spec.trigger.mode === "manual" ? chrome.spec.trigger.actionLabel : "Run",
            onCancel: runtime.cancelRun,
            onRun: runtime.run,
            running,
          }
        : null,
    [
      chrome.spec.trigger,
      chrome.validationReason,
      hasPrimaryAction,
      running,
      runtime.cancelRun,
      runtime.lifecycle,
      runtime.run,
    ],
  );
}

function ToolToolbar(): ReactElement {
  const chrome = useToolChrome();
  const runtime = useRuntime();
  const primaryAction = usePrimaryAction();
  const examples = chrome.spec.content.examples ?? [];
  const exampleIcon = chrome.toolbarActions?.exampleIcon;
  const exampleLabel = chrome.toolbarActions?.exampleLabel ?? "Example";
  const exampleVariant = chrome.toolbarActions?.exampleVariant ?? "link";
  const running = runtime.lifecycle === "running";
  const [resetSnapshot, setResetSnapshot] = useState<{
    input: WorkspaceInputState;
    settings: RuntimeSettings;
  } | null>(null);

  const loadExample = (index: number) => {
    const example = examples[index];
    if (!example) return;
    setResetSnapshot(null);
    chrome.toolbarActions?.onExample?.();
    runtime.setInput({
      files: [],
      secondary: example.secondary,
      text: example.text,
    });
    for (const [key, value] of Object.entries(example.settings ?? {})) {
      chrome.onSettingChange(key, value);
    }
  };

  const reset = () => {
    setResetSnapshot({ input: runtime.input, settings: chrome.settings });
    runtime.setInput({ files: [], text: "" });
    chrome.resetPageState();
  };

  const undoReset = () => {
    if (!resetSnapshot) return;
    runtime.setInput(resetSnapshot.input);
    for (const [key, value] of Object.entries(resetSnapshot.settings)) {
      chrome.onSettingChange(key, value);
    }
    setResetSnapshot(null);
  };

  return (
    <>
      {chrome.toolbarActions?.before}
      {examples.length === 1 ? (
        <Button
          className={exampleVariant === "link" ? "no-underline hover:no-underline" : undefined}
          disabled={running}
          onClick={() => loadExample(0)}
          size="xs"
          type="button"
          variant={exampleVariant}
        >
          {exampleIcon}
          {exampleLabel}
        </Button>
      ) : examples.length > 1 ? (
        <Select
          aria-label="Choose an example"
          className={
            exampleVariant === "outline"
              ? "w-auto"
              : "w-auto border-transparent bg-transparent text-primary [&>svg]:text-primary"
          }
          disabled={running}
          onChange={(event) => loadExample(Number(event.target.value))}
          size="xs"
          value=""
        >
          <option disabled hidden value="">
            {exampleIcon}
            {exampleLabel}
          </option>
          {examples.map((example, index) => (
            <option key={`${example.label}-${index}`} value={index}>
              {example.label}
            </option>
          ))}
        </Select>
      ) : null}
      {chrome.toolbarActions?.afterExample}
      <Button disabled={running || resetSnapshot !== null} onClick={reset} size="xs" type="button" variant="outline">
        Reset
      </Button>
      {resetSnapshot ? (
        <Button disabled={running} onClick={undoReset} size="xs" type="button" variant="ghost">
          <Undo2 aria-hidden="true" />
          Undo reset
        </Button>
      ) : null}
      {primaryAction && !chrome.toolbarActions?.primaryActionInWorkspace ? (
        <Button
          aria-busy={primaryAction.running || undefined}
          disabled={primaryAction.running && primaryAction.onCancel ? false : primaryAction.disabled}
          onClick={primaryAction.running && primaryAction.onCancel ? primaryAction.onCancel : primaryAction.onRun}
          size="xs"
          type="button"
        >
          {primaryAction.running && !primaryAction.onCancel ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          {primaryAction.running && primaryAction.onCancel
            ? "Cancel"
            : (chrome.toolbarActions?.primaryActionLabel ?? primaryAction.label)}
        </Button>
      ) : null}
    </>
  );
}

function ToolWorkspaceSlot(): ReactElement {
  const chrome = useToolChrome();
  const runtime = useRuntime();
  const primaryAction = usePrimaryAction();
  const Workspace = chrome.Workspace;
  const running = runtime.lifecycle === "running";
  const previousResult = useRef(runtime.result);

  useEffect(() => {
    const previous = previousResult.current;
    if (previous !== null && previous !== runtime.result) {
      cleanupResultArtifacts(previous);
    }
    if (previous !== null && runtime.result === null) {
      chrome.cleanupWorkerArtifacts();
    }
    previousResult.current = runtime.result;
  }, [chrome.cleanupWorkerArtifacts, runtime.result]);

  useEffect(() => () => cleanupResultArtifacts(previousResult.current), []);

  return (
    <Suspense fallback={null}>
      <Workspace
        key={chrome.workspaceKey}
        disabled={running}
        error={runtime.error || undefined}
        input={runtime.input}
        lifecycle={runtime.lifecycle}
        onInputChange={runtime.setInput}
        onSettingChange={chrome.onSettingChange}
        onToolbarActionsChange={chrome.setToolbarActions}
        onValidationChange={chrome.onValidationChange}
        primaryAction={primaryAction}
        progress={chrome.progress}
        result={runtime.result}
        running={running}
        settings={chrome.settings}
        spec={chrome.spec}
      />
    </Suspense>
  );
}

function cleanupResultArtifacts(result: ToolResult | null): void {
  if (!result) return;
  const jobIds = new Set<string>();
  for (const artifact of result.artifacts ?? []) {
    if (artifact.storage !== "inline") jobIds.add(artifact.jobId);
  }
  if (result.render === "files") {
    for (const artifact of result.files) jobIds.add(artifact.jobId);
  }
  for (const section of result.sections ?? []) {
    if (section.body.render !== "files") continue;
    for (const artifact of section.body.files) jobIds.add(artifact.jobId);
  }
  for (const jobId of jobIds) {
    void cleanupArtifactJobWithRetry(jobId).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// The page.
// ---------------------------------------------------------------------------

function defaultSettings(spec: ToolSpec): RuntimeSettings {
  return Object.fromEntries(Object.entries(spec.settings.fields).map(([key, field]) => [key, field.default]));
}

/**
 * The legacy `ToolDefinition` the workbench frame still consumes, derived from
 * the spec rather than declared a second time. `iconKey` is empty because icons
 * are database-owned data now, and the settings list is empty because
 * `SettingsPanel` renders the spec's own typed fields.
 */
function toWorkbenchDefinition(spec: ToolSpec, definitionKey: string): ToolDefinition {
  return {
    app: spec.app,
    capabilities: spec.capabilities ?? {},
    definitionKey,
    iconKey: "",
    input: {
      // The frame reads no input field; "none" has no legacy counterpart.
      kind: spec.input.kind === "files" ? "files" : spec.input.kind === "fields" ? "fields" : "text",
      label: spec.input.kind === "none" ? spec.name : spec.input.label,
    },
    labels: {
      empty: spec.labels.empty,
      primaryAction: spec.trigger.mode === "manual" ? spec.trigger.actionLabel : undefined,
      ready: spec.labels.ready,
      running: spec.labels.running,
    },
    settings: [],
    toolId: spec.toolId,
    trigger: {
      debounceMs: spec.trigger.mode === "live" ? spec.trigger.debounceMs : undefined,
      mode: spec.trigger.mode,
    },
  };
}

export interface ToolPageProps {
  account: { returnTo: string; user: { name: string; isAdmin?: boolean } | null };
  category: string;
  /** The tool's folder under `tools/`. Never the public slug. */
  definitionKey: string;
  description: string;
  icon: ResolvedIcon;
  relatedTools: readonly { href: string; label: string }[];
  spec: ToolSpec;
  title: string;
}

export default function ToolPage({
  account,
  category,
  definitionKey,
  description,
  icon,
  relatedTools,
  spec,
  title,
}: ToolPageProps): ReactElement {
  const [settings, setSettings] = useState<RuntimeSettings>(() => defaultSettings(spec));
  const [validationReason, setValidationReason] = useState<string | null>(null);
  const [toolbarActions, setToolbarActions] = useState<WorkspaceToolbarActions | null>(null);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const { cleanupArtifacts: cleanupWorkerArtifacts, progress, reset: resetWorker, run: runOnWorker } = useWorkerHost();

  useEffect(() => {
    void sweepStaleArtifactJobsOnce().catch(() => undefined);
  }, []);

  const onSettingChange = useCallback((key: string, value: unknown) => {
    setSettings((current) => (Object.is(current[key], value) ? current : { ...current, [key]: value }));
  }, []);

  const resetPageState = useCallback(() => {
    setSettings(defaultSettings(spec));
    setValidationReason(null);
    resetWorker();
    setWorkspaceKey((current) => current + 1);
  }, [resetWorker, spec]);

  const execute = useCallback(
    async (
      input: WorkspaceInputState,
      _runtimeSettings: ToolSettings,
      signal: AbortSignal,
    ): Promise<ToolExecutionOutcome<ToolResult>> => {
      const conversion = resolveImageConversion(spec, settings);
      const runKey = conversion.choices.length ? conversion.key : definitionKey;
      const run = await loadMainThreadRun(runKey);
      signal.throwIfAborted();
      if (run) {
        // `parseSettings` treats this as `unknown` and coerces every declared
        // field, so the runtime's flat-scalar view is not the trust boundary.
        return createExecute(conversion.spec, run)(
          await toRunInput(input),
          conversion.settings as ToolSettings,
          signal,
        );
      }

      try {
        const result = await runOnWorker(
          {
            files: toWorkerFiles(input.files),
            key: runKey,
            secondary: input.secondary,
            settings: conversion.settings,
            text: input.text,
          },
          signal,
        );
        return toOutcome(result);
      } catch (error: unknown) {
        // The worker reports a folder with no `run.worker` as an unknown tool;
        // that is the signal to fall through to the server host.
        if (!(error instanceof ToolError) || error.code !== "unknown-tool") throw error;
      }

      return toOutcome(await runOnServer(runKey, input, conversion.settings, signal));
    },
    [definitionKey, runOnWorker, settings, spec],
  );

  // Memoised on purpose: `useToolRuntime` keys its effects on the whole spec, so
  // a new object every render would re-enter execution forever.
  const runtimeSpec = useMemo<ToolRuntimeSpec<WorkspaceInputState, ToolSettings, ToolResult>>(
    () => ({
      debounceMs: spec.trigger.mode === "live" ? spec.trigger.debounceMs : undefined,
      execute,
      initialInput: EMPTY_INPUT,
      initialSettings: RUNTIME_SETTINGS,
      isEmpty: (input) => isEmptyInput(spec.input.kind, input),
      refreshOnSettingsChange: spec.category === "developer-generators" ? settings : undefined,
      shouldAutoRun: (input) => {
        const maxEditableBytes = spec.input.kind === "text" ? spec.input.acceptFiles?.maxEditableBytes : undefined;
        return !isLargeTextFile(input.files[0], maxEditableBytes);
      },
      trigger: spec.trigger.mode,
      validate: () => NO_ISSUES,
    }),
    [execute, settings, spec],
  );

  const Workspace = useMemo(() => resolveWorkspace(definitionKey), [definitionKey]);

  const chrome = useMemo<ToolChrome>(
    () => ({
      cleanupWorkerArtifacts,
      onSettingChange,
      onValidationChange: setValidationReason,
      progress,
      resetPageState,
      settings,
      spec,
      setToolbarActions,
      toolbarActions,
      validationReason,
      Workspace,
      workspaceKey,
    }),
    [
      cleanupWorkerArtifacts,
      onSettingChange,
      progress,
      resetPageState,
      settings,
      spec,
      toolbarActions,
      validationReason,
      Workspace,
      workspaceKey,
    ],
  );

  return (
    <ToolChromeContext.Provider value={chrome}>
      <UniversalWorkbench
        account={account}
        category={category}
        content={spec.content}
        definition={toWorkbenchDefinition(spec, definitionKey)}
        description={description}
        relatedTools={relatedTools}
        runtimeSpec={runtimeSpec}
        statusMeta={toolbarActions?.statusMeta}
        validationReason={validationReason}
        title={title}
        Toolbar={ToolToolbar}
        workbenchIcon={icon.kind === "url" ? <ToolIcon icon={icon} size={28} /> : undefined}
        workbenchMark={spec.workbenchMark}
        Workspace={ToolWorkspaceSlot}
      />
    </ToolChromeContext.Provider>
  );
}
