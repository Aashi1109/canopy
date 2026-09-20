"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

import { trackToolEvent } from "@/lib/analytics/ga4";

import type {
  ToolCommandOutcome,
  ToolExecutionOutcome,
  ToolLifecycle,
  ToolRuntimeController,
  ToolRuntimeSpec,
  ToolSettingValue,
  ToolSettings,
} from "./types";

const ToolRuntimeContext = createContext<ToolRuntimeController<unknown, ToolSettings, unknown> | null>(null);

function initialLifecycle<Input>(input: Input, isEmpty: (input: Input) => boolean): ToolLifecycle {
  return isEmpty(input) ? "empty" : "ready";
}

export function ToolRuntimeProvider<Input, Settings extends ToolSettings, Result>({
  analyticsToolKey,
  children,
  spec,
}: {
  analyticsToolKey?: string;
  children: ReactNode;
  spec: ToolRuntimeSpec<Input, Settings, Result>;
}) {
  const [input, setInputState] = useState(spec.initialInput);
  const [settings, setSettings] = useState(spec.initialSettings);
  const [lifecycle, setLifecycle] = useState<ToolLifecycle>(() => initialLifecycle(spec.initialInput, spec.isEmpty));
  const [issues, setIssues] = useState(() =>
    spec.isEmpty(spec.initialInput) ? [] : [...spec.validate(spec.initialInput, spec.initialSettings)],
  );
  const [result, setResult] = useState<Result | null>(null);
  const [artifacts, setArtifacts] = useState<ToolExecutionOutcome<Result>["artifacts"]>([]);
  const [facts, setFacts] = useState<ToolExecutionOutcome<Result>["facts"]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastChanges, setLastChanges] = useState<readonly string[]>([]);
  const [pendingCommand, setPendingCommand] = useState<{
    outcome: ToolCommandOutcome<Input>;
    previousInput: Input;
  } | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<{ input: Input } | null>(null);
  const revisionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const completedInputRef = useRef<{ input: Input } | null>(null);
  const previousRefreshSettingsRef = useRef(spec.refreshOnSettingsChange);

  const execute = useCallback(
    async (manual = false) => {
      const revision = ++revisionRef.current;
      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;
      setLifecycle("running");
      setError("");
      setResult(null);
      setArtifacts([]);
      setFacts([]);

      if (manual) trackToolEvent("tool_start", analyticsToolKey);
      try {
        const outcome = await spec.execute(input, settings, abortController.signal);
        if (revision !== revisionRef.current || abortController.signal.aborted) {
          return;
        }
        completedInputRef.current = { input };
        setResult(outcome.result);
        setArtifacts(outcome.artifacts ?? []);
        setFacts(outcome.facts ?? []);
        setLifecycle("completed");
        if (manual) trackToolEvent("tool_complete", analyticsToolKey);
      } catch (caught) {
        if (revision !== revisionRef.current || abortController.signal.aborted) {
          return;
        }
        setResult(null);
        setArtifacts([]);
        setFacts([]);
        setError(caught instanceof Error ? caught.message : "Unable to run this tool.");
        setLifecycle("failed");
        if (manual) trackToolEvent("tool_error", analyticsToolKey);
      }
    },
    [analyticsToolKey, input, settings, spec],
  );

  useEffect(() => {
    const refreshExistingResult =
      spec.refreshOnSettingsChange !== undefined &&
      !Object.is(previousRefreshSettingsRef.current, spec.refreshOnSettingsChange) &&
      completedInputRef.current !== null &&
      Object.is(completedInputRef.current.input, input);
    previousRefreshSettingsRef.current = spec.refreshOnSettingsChange;
    if (completedInputRef.current && !Object.is(completedInputRef.current.input, input)) {
      completedInputRef.current = null;
    }
    revisionRef.current += 1;
    abortRef.current?.abort();
    setError("");

    if (spec.isEmpty(input)) {
      setIssues([]);
      setResult(null);
      setArtifacts([]);
      setFacts([]);
      setLifecycle("empty");
      return;
    }

    const nextIssues = [...spec.validate(input, settings)];
    setIssues(nextIssues);
    setResult(null);
    setArtifacts([]);
    setFacts([]);
    if (nextIssues.length > 0) {
      setLifecycle("invalid");
      return;
    }

    setLifecycle("ready");
    if ((spec.trigger !== "live" && !refreshExistingResult) || spec.shouldAutoRun?.(input) === false) return;

    const revision = revisionRef.current;
    const timeout = window.setTimeout(() => {
      if (revision === revisionRef.current) void execute();
    }, spec.debounceMs ?? 200);
    return () => window.clearTimeout(timeout);
  }, [execute, input, settings, spec]);

  useEffect(
    () => () => {
      revisionRef.current += 1;
      abortRef.current?.abort();
    },
    [],
  );

  const setInput = useCallback(
    (nextInput: Input) => {
      setNotice(pendingCommand ? "Pending action cancelled because input changed." : "");
      setLastChanges([]);
      setPendingCommand(null);
      setUndoSnapshot(null);
      setInputState(nextInput);
    },
    [pendingCommand],
  );

  const updateSetting = useCallback(
    (key: keyof Settings, value: ToolSettingValue) => {
      setNotice(pendingCommand ? "Pending action cancelled because settings changed." : "");
      setLastChanges([]);
      setPendingCommand(null);
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [pendingCommand],
  );

  const run = useCallback(() => {
    if (spec.isEmpty(input) || spec.validate(input, settings).length > 0) {
      return;
    }
    void execute(true);
  }, [execute, input, settings, spec]);

  const cancelRun = useCallback(() => {
    if (lifecycle !== "running") return;
    completedInputRef.current = null;
    revisionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const nextIssues = spec.isEmpty(input) ? [] : [...spec.validate(input, settings)];
    setIssues(nextIssues);
    setResult(null);
    setArtifacts([]);
    setFacts([]);
    setError("");
    setNotice("Processing cancelled. Your input is unchanged.");
    setLifecycle(spec.isEmpty(input) ? "empty" : nextIssues.length > 0 ? "invalid" : "ready");
  }, [input, lifecycle, settings, spec]);

  const runCommand = useCallback(
    async (command: string) => {
      const handler = spec.commands?.[command];
      if (!handler) throw new Error(`Unknown tool command: ${command}`);
      const cancelledPendingAction = Boolean(pendingCommand);
      if (cancelledPendingAction) {
        setPendingCommand(null);
        setLastChanges([]);
      }
      try {
        const outcome = await handler({ input, result, settings });
        if (outcome.confirmation) {
          setPendingCommand({ outcome, previousInput: input });
          setLastChanges(outcome.changes ?? []);
          setNotice(outcome.confirmation.description);
          return;
        }
        setNotice(cancelledPendingAction ? `Pending action cancelled. ${outcome.notice}` : outcome.notice);
        setLastChanges(outcome.changes ?? []);
        if (outcome.input !== undefined) {
          if (outcome.offerUndo) setUndoSnapshot({ input });
          setInputState(outcome.input);
        }
      } catch (caught) {
        setNotice(caught instanceof Error ? caught.message : "Unable to run that action.");
      }
    },
    [input, pendingCommand, result, settings, spec.commands],
  );

  const confirmPendingCommand = useCallback(() => {
    if (!pendingCommand) return;
    const { outcome, previousInput } = pendingCommand;
    setPendingCommand(null);
    setNotice(outcome.notice);
    setLastChanges(outcome.changes ?? []);
    if (outcome.input !== undefined) {
      if (outcome.offerUndo) setUndoSnapshot({ input: previousInput });
      setInputState(outcome.input);
    }
  }, [pendingCommand]);

  const cancelPendingCommand = useCallback(() => {
    setPendingCommand(null);
    setLastChanges([]);
    setNotice("Action cancelled. Your input was not changed.");
  }, []);

  const undo = useCallback(() => {
    if (!undoSnapshot) return;
    setInputState(undoSnapshot.input);
    setUndoSnapshot(null);
    setPendingCommand(null);
    setLastChanges([]);
    setNotice("Last change undone.");
  }, [undoSnapshot]);

  const controller: ToolRuntimeController<Input, Settings, Result> = {
    analyticsToolKey,
    artifacts: artifacts ?? [],
    cancelRun,
    cancelPendingCommand,
    canUndo: Boolean(undoSnapshot),
    confirmPendingCommand,
    error,
    facts: facts ?? [],
    input,
    issues,
    lastChanges,
    lifecycle,
    notice,
    pendingConfirmation: pendingCommand?.outcome.confirmation ?? null,
    result,
    run,
    runCommand,
    setInput,
    setNotice,
    settings,
    undo,
    updateSetting,
  };

  return (
    <ToolRuntimeContext.Provider value={controller as unknown as ToolRuntimeController<unknown, ToolSettings, unknown>}>
      {children}
    </ToolRuntimeContext.Provider>
  );
}

export function useToolRuntime<Input, Settings extends ToolSettings, Result>(): ToolRuntimeController<
  Input,
  Settings,
  Result
> {
  const runtime = useContext(ToolRuntimeContext);
  if (!runtime) {
    throw new Error("useToolRuntime must be used inside ToolRuntimeProvider.");
  }
  return runtime as ToolRuntimeController<Input, Settings, Result>;
}

/** Result renderers also work outside a runtime provider. */
export function useAnalyticsToolKey() {
  return useContext(ToolRuntimeContext)?.analyticsToolKey;
}
