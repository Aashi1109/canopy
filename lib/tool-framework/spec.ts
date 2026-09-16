/**
 * The declaration a tool ships.
 *
 * Two things are deliberately absent and must stay absent:
 *  - no key/id for the implementation module — the folder name is the key;
 *  - no execution-host field — the filename (`run.ts` / `run.worker.ts` /
 *    `run.server.ts`) declares where the tool runs.
 * Catalogue icons are absent for the same reason: they are uploaded data, not
 * code. `workbenchMark` is deliberately narrower: short text rendered only in
 * the tool's own workbench chrome.
 */

import type { CategoryKey, ToolApp } from "./categories";
import type { SettingsSpec } from "./settings";

export type { ToolApp };

/**
 * One field of a multi-field input surface. `channel` names which
 * `ToolRunContext["input"]` slot it fills, so a field can never reference a
 * channel the run function cannot read.
 *
 * `secret: true` renders masked with a reveal toggle. A secret belongs here
 * rather than in `settings` — settings are persisted UI state, and a shared
 * secret must not be.
 */
export type ToolInputField = {
  readonly channel: "text" | "secondary";
  readonly label: string;
  readonly placeholder?: string;
  readonly secret?: boolean;
  readonly required?: boolean;
  readonly multiline?: boolean;
  readonly maxLength?: number;
};

export type ToolInputSpec =
  | {
      kind: "text";
      label: string;
      placeholder?: string;
      maxLength?: number;
      secondary?: { label: string; placeholder?: string };
      acceptFiles?: {
        accept: string;
        maxBytes: number;
        maxEditableBytes?: number;
      };
    }
  | { kind: "fields"; label: string; fields: readonly ToolInputField[] }
  /**
   * The tool reads no input channel — every value comes from its settings.
   * Generators need this: declaring `fields: []` to mean "nothing" made the
   * spec claim a multi-field surface it does not have.
   */
  | { kind: "none" }
  | {
      kind: "files";
      label: string;
      /** The dot-separated meta line shown below the dropzone title in the design. */
      dropzoneDescription?: string;
      accept: string;
      multiple: boolean;
      engine: "image" | "pdf";
      maxFiles?: number;
      maxBytes?: number;
      maxTotalBytes?: number;
      inspect?: boolean;
    };

export type ToolTrigger = { mode: "live"; debounceMs?: number } | { mode: "manual"; actionLabel: string };

export type ToolCapabilities = {
  cancel?: boolean;
  copy?: boolean;
  download?: boolean;
  progress?: boolean;
  network?: boolean;
};

export type ToolLabels = {
  empty: string;
  ready: string;
  result?: string;
  running: string;
};

export type ToolFaqEntry = { q: string; a: string };

export type ToolExample = {
  label: string;
  text: string;
  secondary?: string;
  readonly settings?: Readonly<Record<string, unknown>>;
};

export type ToolContent = {
  seoTitle?: string;
  howToUse: readonly string[];
  limitations?: readonly string[];
  faq?: readonly ToolFaqEntry[];
  examples?: readonly ToolExample[];
  relatedToolIds?: readonly string[];
};

export type ToolWorkbenchMark = {
  readonly text: string;
  readonly tone?: "accent" | "contrast";
};

export type ToolLayout = "side-by-side" | "stacked";

export type ToolOptionsPanel = {
  readonly collapsible?: boolean;
  readonly defaultCollapsed?: boolean;
  readonly layout?: "grid" | "stack";
  readonly note?: string;
  readonly title?: string;
};

export type ToolSpec<S extends SettingsSpec = SettingsSpec> = {
  /** `"<app>.<folderName>"`. Primary key in the database; never changes. */
  readonly toolId: string;
  readonly app: ToolApp;
  /** Omit to derive from `name`. Applied at first insert only. */
  readonly slug?: string;
  readonly category: CategoryKey;
  readonly keywords: readonly string[];
  readonly name: string;
  readonly description: string;
  readonly input: ToolInputSpec;
  readonly settings: S;
  readonly trigger: ToolTrigger;
  readonly capabilities?: ToolCapabilities;
  /** How the source and derived result share the main task surface. */
  readonly layout?: ToolLayout;
  /** Optional behavior for the persistent settings rail. */
  readonly optionsPanel?: ToolOptionsPanel;
  readonly workbenchMark?: ToolWorkbenchMark;
  readonly labels: ToolLabels;
  readonly content: ToolContent;
};

/**
 * Identity function that pins the settings spec to a literal type, so
 * `SettingsOf<typeof spec.settings>` resolves to concrete value types.
 */
export function defineTool<const S extends SettingsSpec>(spec: ToolSpec<S>): ToolSpec<S> {
  return spec;
}
