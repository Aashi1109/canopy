/**
 * The single text-input trust boundary, shared by every execution host.
 *
 * This replaces the shared preamble guard that used to live in
 * `components/UtilityToolPrimitives.tsx` (which checked both input channels
 * against `MAX_JSON_INPUT_CHARS` before dispatching). That file is deleted by
 * this migration, so without this module the bound would silently disappear
 * for every tool — a spec could declare `maxLength` and nothing would enforce
 * it.
 *
 * It is spec-driven and names no tool: the limit comes from the tool's own
 * `input` declaration, with a framework-wide ceiling as the backstop for
 * specs that declare nothing.
 */

import { ToolError } from "./run";
import type { ToolSpec } from "./spec";

/**
 * Backstop for a spec that declares no `maxLength`. Matches the legacy
 * `MAX_JSON_INPUT_CHARS` so no tool's effective bound loosens in the move.
 */
export const MAX_TOOL_INPUT_CHARS = 2_000_000;

function limitFor(spec: ToolSpec): number {
  const declared = spec.input.kind === "text" ? spec.input.maxLength : undefined;
  return typeof declared === "number" && declared > 0 ? Math.min(declared, MAX_TOOL_INPUT_CHARS) : MAX_TOOL_INPUT_CHARS;
}

/**
 * Throws when either text channel exceeds the tool's declared bound. Call
 * before `run`, on every host — the text arrives from a textarea on the main
 * thread, over `postMessage` in the worker, and from an HTTP body in a route
 * handler, and only the first of those is under our control.
 */
export function assertRunnableText(
  spec: ToolSpec,
  input: { readonly text?: string; readonly secondary?: string },
): void {
  if (spec.input.kind === "files") return;
  const limit = limitFor(spec);
  const longest = Math.max(input.text?.length ?? 0, input.secondary?.length ?? 0);
  if (longest > limit) {
    throw new ToolError(
      "input-too-large",
      `Input must be ${limit.toLocaleString("en-US")} characters or fewer.`,
      "Shorten the input, or split it into smaller batches.",
    );
  }
}
