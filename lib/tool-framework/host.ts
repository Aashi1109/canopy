/**
 * The main-thread host: turns a tool's spec plus its `run.ts` into the
 * `execute` member of the existing `ToolRuntimeSpec`, so `useToolRuntime` and
 * `UniversalWorkbench` consume it unchanged. No new runtime.
 *
 * The runtime holds settings as flat scalars; `parseSettings` is what turns
 * them into the tool's declared setting types, so a run never sees raw UI
 * state. Nothing here may import a worker-only dependency: this module is
 * bundled into the main thread.
 */

import type { ToolExecutionOutcome, ToolRuntimeSpec, ToolSettings } from "@/lib/tool-runtime/types";

import { cleanupArtifactJobWithRetry, createArtifactWriter } from "./artifacts";
import { assertRunnableText } from "./inputGuard";
import type { ToolResult } from "./result";
import type { ToolRun, ToolRunInput, ToolRunProgress } from "./run";
import { parseSettings, type SettingsOf, type SettingsSpec } from "./settings";
import type { ToolSpec } from "./spec";

export type ToolExecute = ToolRuntimeSpec<ToolRunInput, ToolSettings, ToolResult>["execute"];

/** ponytail: main-thread runs report no progress; the worker host carries it. */
const NO_PROGRESS = (_progress: ToolRunProgress): void => {};

export function createExecute<S extends SettingsSpec>(spec: ToolSpec<S>, run: ToolRun<SettingsOf<S>>): ToolExecute {
  return async (
    input: ToolRunInput,
    settings: ToolSettings,
    signal: AbortSignal,
  ): Promise<ToolExecutionOutcome<ToolResult>> => {
    signal.throwIfAborted();
    assertRunnableText(spec, input);
    const jobId = crypto.randomUUID();
    const writer = createArtifactWriter(jobId, { signal });
    try {
      const result = await run({
        input,
        settings: parseSettings(spec.settings, settings),
        signal,
        progress: NO_PROGRESS,
        writeArtifact: writer.write,
      });
      signal.throwIfAborted();
      return { result, artifacts: result.artifacts, facts: result.stats };
    } catch (error) {
      await cleanupArtifactJobWithRetry(jobId).catch(() => undefined);
      throw error;
    }
  };
}
