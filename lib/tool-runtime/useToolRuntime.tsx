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

function sameValues(left: object | undefined, right: object | undefined): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right) return false;
  const entries = Object.entries(left);
  return (
    entries.length === Object.keys(right).length &&
    entries.every(
      ([key, value]) => Object.hasOwn(right, key) && Object.is(value, (right as Record<string, unknown>)[key]),
    )
  );
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
  const timeoutRef = useRef<number | null>(null);
  const specRef = useRef(spec);
  specRef.current = spec;
  const previousEvaluationRef = useRef<{
    input: Input;
    settings: Settings;
    refreshSettings: ToolRuntimeSpec<Input, Settings, Result>["refreshOnSettingsChange"];
    isEmpty: boolean;
    issues: ToolRuntimeController<Input, Settings, Result>["issues"];
    trigger: ToolRuntimeSpec<Input, Settings, Result>["trigger"];
    autoRun: boolean;
  } | null>(null);

  const execute = useCallback(
    async (manual = false) => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      const retainOutput = completedInputRef.current !== null && Object.is(completedInputRef.current.input, input);
      const revision = ++revisionRef.current;
      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;
      setLifecycle("running");
      setError("");
      if (retainOutput) setNotice("");
      if (!retainOutput) {
        setResult(null);
        setArtifacts([]);
        setFacts([]);
      }

      if (manual) trackToolEvent("tool_start", analyticsToolKey);
      try {
        const outcome = await specRef.current.execute(input, settings, abortController.signal);
        if (revision !== revisionRef.current || abortController.signal.aborted) {
          return;
        }
        completedInputRef.current = outcome.result === null ? null : { input };
        setResult(outcome.result);
        setArtifacts(outcome.artifacts ?? []);
        setFacts(outcome.facts ?? []);
        setLifecycle("completed");
        if (manual) trackToolEvent("tool_complete", analyticsToolKey);
      } catch (caught) {
        if (revision !== revisionRef.current || abortController.signal.aborted) {
          return;
        }
        if (!retainOutput) {
          setResult(null);
          setArtifacts([]);
          setFacts([]);
        }
        setError(caught instanceof Error ? caught.message : "Unable to run this tool.");
        setLifecycle("failed");
        if (manual) trackToolEvent("tool_error", analyticsToolKey);
      }
    },
    [analyticsToolKey, input, settings],
  );

  useEffect(() => {
    const isEmpty = spec.isEmpty(input);
    const nextIssues = isEmpty ? [] : [...spec.validate(input, settings)];
    const autoRun = !isEmpty && nextIssues.length === 0 && spec.shouldAutoRun?.(input) !== false;
    const previous = previousEvaluationRef.current;
    const settingsChanged =
      previous !== null &&
      (!sameValues(previous.settings, settings) || !sameValues(previous.refreshSettings, spec.refreshOnSettingsChange));
    const changed =
      previous === null ||
      !Object.is(previous.input, input) ||
      settingsChanged ||
      previous.isEmpty !== isEmpty ||
      previous.trigger !== spec.trigger ||
      previous.autoRun !== autoRun ||
      previous.issues.length !== nextIssues.length ||
      nextIssues.some((issue, index) => !sameValues(issue, previous.issues[index]));
    previousEvaluationRef.current = {
      input,
      settings,
      refreshSettings: spec.refreshOnSettingsChange,
      isEmpty,
      issues: nextIssues,
      trigger: spec.trigger,
      autoRun,
    };
    // A new spec or validator function with the same values must not cancel a
    // pending refresh or erase the last successful output.
    if (!changed) return;

    const retainOutput =
      !isEmpty && completedInputRef.current !== null && Object.is(completedInputRef.current.input, input);
    if (!retainOutput) completedInputRef.current = null;
    revisionRef.current += 1;
    abortRef.current?.abort();
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setError("");
    setIssues(nextIssues);
    if (!retainOutput) {
      setResult(null);
      setArtifacts([]);
      setFacts([]);
    }

    if (isEmpty) {
      setLifecycle("empty");
      return;
    }

    if (nextIssues.length > 0) {
      setLifecycle("invalid");
      return;
    }

    const refreshExistingResult = retainOutput && settingsChanged;
    if (!refreshExistingResult && (spec.trigger !== "live" || !autoRun)) {
      setLifecycle(retainOutput ? "completed" : "ready");
      return;
    }
    setLifecycle(retainOutput ? "running" : "ready");
    if (retainOutput) setNotice("");

    const revision = revisionRef.current;
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      if (revision === revisionRef.current) void execute();
    }, spec.debounceMs ?? 200);
  }, [execute, input, settings, spec]);

  useEffect(
    () => () => {
      revisionRef.current += 1;
      abortRef.current?.abort();
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      previousEvaluationRef.current = null;
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
      setSettings((current) => (Object.is(current[key], value) ? current : { ...current, [key]: value }));
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
    const retainOutput = completedInputRef.current !== null && Object.is(completedInputRef.current.input, input);
    if (!retainOutput) completedInputRef.current = null;
    revisionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    const nextIssues = spec.isEmpty(input) ? [] : [...spec.validate(input, settings)];
    setIssues(nextIssues);
    if (!retainOutput) {
      setResult(null);
      setArtifacts([]);
      setFacts([]);
    }
    setError("");
    setNotice(
      retainOutput
        ? "Update cancelled. Showing the previous result."
        : "Processing cancelled. Your input is unchanged.",
    );
    setLifecycle(
      spec.isEmpty(input) ? "empty" : nextIssues.length > 0 ? "invalid" : retainOutput ? "completed" : "ready",
    );
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
