/**
 * The execution contract. A tool's `run.ts` / `run.worker.ts` / `run.server.ts`
 * default-exports a `ToolRun`; the filename decides the host, so nothing here
 * needs to name one.
 *
 * `ToolRunFile.source` keeps the browser's original `File` so large inputs can
 * cross the worker boundary without first being copied into one contiguous
 * main-thread allocation.
 */

import type { ArtifactWriteInput, StoredToolArtifact } from "./artifacts";
import type { ToolResult } from "./result";

export type ToolRunFile = {
  readonly id: string;
  readonly name: string;
  readonly mime: string;
  readonly size: number;
  readonly source: File;
};

/** Per-item state for collection layouts (reorder, rotate, include/exclude). */
export type ToolRunItem = {
  readonly id: string;
  readonly rotation: 0 | 90 | 180 | 270;
  readonly selected: boolean;
};

export type ToolRunProgress = {
  readonly completed: number;
  readonly total: number;
  readonly stage: string;
};

export type ToolRunInput = {
  readonly text: string;
  readonly secondary?: string;
  readonly files: readonly ToolRunFile[];
  readonly items?: readonly ToolRunItem[];
};

export type ToolRunContext<S> = {
  readonly input: ToolRunInput;
  readonly settings: S;
  readonly signal: AbortSignal;
  readonly progress: (p: ToolRunProgress) => void;
  readonly writeArtifact: (input: ArtifactWriteInput) => Promise<StoredToolArtifact>;
};

export type ToolRun<S = never> = (ctx: ToolRunContext<S>) => ToolResult | Promise<ToolResult>;

/**
 * Page geometry produced by PDF inspection, in PDF points.
 *
 * Structurally a subset of `PdfPageThumbnail` (`media/pdfRender.ts`), declared
 * here rather than imported so this module keeps importing nothing but
 * `result.ts` — `pdfRender.ts` already depends on this file.
 */
export type ToolPagePreview = {
  readonly pageNumber: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
};

/**
 * Optional pre-run readiness check, exported from `tools/<key>/hooks.ts`.
 *
 * Returns `null` when the job may start, or the reason it may not, which is
 * shown to the user. Must be pure and cheap — no DOM, no I/O, and safe to call
 * on every keystroke, because the workspace re-runs it on every settings edit.
 */
export type ToolValidate<S = never> = (settings: S, files: readonly ToolRunFile[]) => string | null;

/**
 * Optional seed applied after PDF page inspection completes, exported from
 * `tools/<key>/hooks.ts`. Pure: it maps page geometry to settings, nothing else.
 */
export type ToolPagesInspected<S = never> = (previews: readonly ToolPagePreview[]) => Partial<S>;

/**
 * Optional re-derivation applied whenever settings change while page previews
 * exist, exported from `tools/<key>/hooks.ts`.
 *
 * It exists because a setting can invalidate another setting only in the light
 * of page geometry — re-clamping a box against the pages currently selected is
 * neither a pre-run check (it repairs rather than reports) nor post-inspection
 * seeding (the previews did not change). Returns only the keys it changes; the
 * workspace applies them as a patch and skips any value already equal, so a
 * hook that returns its input unchanged settles instead of looping.
 *
 * Pure, and must be idempotent: `f(f(s)) === f(s)`.
 */
export type ToolSettingsChanged<S = never> = (
  settings: S,
  previews: readonly ToolPagePreview[],
) => Partial<S>;

/**
 * Everything `tools/<key>/hooks.ts` may export. Every member is optional —
 * most tools have no `hooks.ts` at all, and `loadToolHooks` resolves to `{}`
 * for them.
 *
 * Hooks are a separate file from `run` on purpose: a run file may statically
 * import worker-only modules (`media/pdfRender.ts` owns `pdfjs-dist`), and
 * calling a hook means importing the module that holds it.
 */
export type ToolHooks<S = never> = {
  readonly validate?: ToolValidate<S>;
  readonly onPagesInspected?: ToolPagesInspected<S>;
  readonly onSettingsChanged?: ToolSettingsChanged<S>;
};

/** Carries a stable code and a user-facing recovery hint alongside the message. */
export class ToolError extends Error {
  readonly code: string;
  readonly recovery?: string;

  constructor(code: string, message: string, recovery?: string) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.recovery = recovery;
  }
}
