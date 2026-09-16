# Tool Runtime Architecture — Layouts Own UI + Execution, Tools Own Logic + Config

## Context

Audit of all 144 non-Paperwork tools (114 DevTools, 30 Media) found exactly **5 reusable workbench layouts**: `SourceResultWorkbench` (96), `GeneratorWorkbench` (18), `FileProcessorWorkbench` (10), `CollectionWorkbench` (10), `VisualEditorWorkbench` (10). Today the abstraction boundary is wrong:

- DevTools: 4 workbenches in one 2,127-line client file (`app/devtools/json-formatter/json-workbench.tsx`), dispatch via if-chain in `app/devtools/[slug]/page.tsx:163`; logic is a 3,939-line, ~119-case switch in `lib/devtools/format-json.ts`.
- Media: one 2,007-line `app/media/components/MediaWorkbench.tsx` handles all 30 tools with per-slug if/else scattered through it.
- Tool metadata duplicated between `packages/tool-catalog` and per-app registries.

**Goal:** tools declare ONLY logic + rich config (renderer, fields, capabilities, interaction mode); the 5 layouts own all UI and execution (debounce, live/manual, workers, cancellation, staleness, downloads). Escape hatch: a tool may supply a `customWorkArea` component that replaces the work area while keeping the page shell.

**User decisions:** full cutover per app (no allowlist), zod-based settings schemas, bespoke tools (json-formatter, json-viewer, json-to-csv, csv-to-json) become `customWorkArea` overrides, logic split included, **folder-per-tool structure** — each tool is a self-contained folder holding its definition, runner, and optional UI override; nothing crammed into central files.

### Folder-per-tool layout (flat, app-agnostic)

```
tools/<slug>/                 # ONE flat root for all 144 tools — no /devtools|/media nesting
  definition.ts               # ToolDefinition: app, category, layout, inputs, settings (zod),
                              # trigger, renderer, page metadata (seo, howToUse steps,
                              # relatedTools slugs, examples, faq)
  run.ts                      # ToolRunFn logic (devtools sync tools; moved from the big switch)
  jobOptions.ts               # media tools: settings+files → MediaJobOptionsByOperation[slug]
  WorkArea.tsx                # OPTIONAL customWorkArea client component (4 bespoke tools)
tools/index.ts                # explicit imports → Record<slug, ToolDefinition>; asserts unique slugs
```

`definition.ts` carries what today is spread across tool-catalog + per-app registries + page files:

```ts
interface ToolPageMeta {
  seo: { title: string; description: string; keywords?: readonly string[] };
  howToUse: readonly { title: string; description: string }[]; // feeds HowItWorks primitive
  relatedTools: readonly string[]; // slugs → related-tools section
  examples?: readonly { label: string; input: string }[];
  faq?: readonly { q: string; a: string }[];
}
// Base gains: app: "devtools" | "media"; category: string; meta: ToolPageMeta
```

Both `[slug]/page.tsx` files resolve from the SAME `tools/index.ts` (filtered by `app`), build `generateMetadata` + `generateStaticParams` from `definition.meta` (devtools finally gets per-tool metadata — today only media has it). DB overlay via `getAvailableToolBySlug` still wins for name/description display; `packages/tool-catalog` manifest becomes derived-from/validated-against `tools/index.ts` (parity test), with an eye to generating it from definitions later.

Rules: `definition.ts` never imports React except a lazy `WorkArea` reference; heavy deps (bcryptjs, qrcode, marked, js-yaml) import only inside the `run.ts` files that need them; shared helpers used by several runners live in `lib/devtools/shared/` (transformJson, MAX_JSON_INPUT_CHARS, etc.).

---

## Architecture

### Runtime core — `lib/tool-runtime/` (new, app-shared; NOT a package per devlog rule)

**`lib/tool-runtime/settings.ts`** — zod-backed settings system (zod 4 already a dep):

```ts
// Each field = zod validator + UI metadata in one builder.
// field.select / field.toggle / field.checkbox / field.number / field.text / field.slider / field.preset
export interface FieldUiMeta {
  label: string;
  kind:
    | "select"
    | "checkbox"
    | "toggle"
    | "number"
    | "text"
    | "slider"
    | "preset"
    | "password"
    | "color"
    | "date"; // masked secrets (HMAC/basic-auth), color pickers (QR/watermark/bg), date inputs
  choices?: readonly { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  helpText?: string;
  visibleWhen?: { key: string; equals: string | number | boolean }; // e.g. UUID v3/v5 namespace fields
}

export function defineSettings(fields: Record<string, FieldSpec>): SettingsSchema;
// SettingsSchema = { schema: z.ZodObject (with .default()s), fields: readonly ResolvedField[] }
// - schema.parse(raw) replaces normalizeUtilityOptions (coercion + range + enum checks)
// - fields[] drives generic form renderers (layouts never see zod directly)
```

The existing `option()` / `singleTool()` / `dualTool()` / `generatorTool()` factory call sites in `format-json.ts` are preserved as authoring syntax — their internals swap to emit `defineSettings` fields, so the 110 option sets migrate mechanically, not by hand-rewrite.

**`lib/tool-runtime/definition.ts`** — `ToolDefinition` = discriminated union on `layout`:

```ts
export type TriggerSpec = { mode: "live"; debounceMs?: number } | { mode: "manual"; runLabel: string };
export type RendererKind =
  | "text" | "code" | "json-tree" | "table" | "key-value" | "html" | "image"
  | "diff" | "validation" | "stat-tiles" | "download-list";
// Structured result — feature research (TOOL_FEATURE_SPECS.md §A) showed a plain string
// can't carry verdict badges, size stats, multi-section output, or positional errors:
export interface ToolRunResult {
  renderer: RendererKind;
  primary: string;                                     // main output payload
  sections?: readonly { label: string; renderer: RendererKind; content: string }[]; // jwt parts, checksum rows
  stats?: readonly { label: string; value: string; tone?: "neutral"|"success"|"warning" }[]; // size saved, counts
  verdict?: { status: "pass"|"fail"|"warn"; label: string };  // valid/expired/match badges
  issues?: readonly { message: string; line?: number; col?: number; row?: number }[]; // validators
  downloads?: readonly { name: string; mime: string; data: string | Uint8Array }[];   // files, binary fallback
  details?: unknown;                                   // renderer-specific (table rows, diff hunks)
}
export type ToolRunFn = (input: {primary: string; secondary?: string; files?: File[]}, settings: SettingsValues, signal?: AbortSignal) => ToolRunResult | Promise<ToolRunResult>;

export type ExecutionSpec =
  | { runtime: "sync"; run: ToolRunFn }
  | { runtime: "server-action" }               // page injects the action (keeps "use server" boundary)
  | { runtime: "worker"; operation: string };  // media: routed via workerProtocol

interface Base {
  id: string;                                   // componentKey / media slug
  settings: SettingsSchema;
  trigger: TriggerSpec;
  capabilities?: { cancel?: boolean; progress?: boolean; download?: boolean };
  // Three override tiers — use the smallest that fits:
  // 1. result.renderer: "custom" + component — swap ONLY output pane (jwt sections, diff view, csv table).
  //    Layout keeps toolbar/settings/execution/status.
  // 2. slots.input — swap ONLY input pane (regex highlight overlay, key/value rows, CodeMirror).
  //    Layout passes { value, onChange, definition }; debounce/run wiring stays in layout.
  // 3. customWorkArea — replace whole work area. Only when interaction model itself differs.
  slots?: { input?: ComponentType<InputSlotProps> };
  customWorkArea?: ComponentType<WorkAreaProps>;
}

export type ToolDefinition =
  | Base & { layout: "source-result";
             inputs: { primary: SourcePanelSpec; secondary?: SourcePanelSpec };
             // SourcePanelSpec.fileInput?: { accept: string; maxBytes: number } — hash/base64/checksum file mode
             variant: "utility"|"conversion"; result: { renderer: RendererKind };
             accessory?: ComponentType<AccessoryProps>;   // small live widgets: epoch clock, JWT countdown
             execution: sync | server-action }
  | Base & { layout: "generator"; result: { renderer: RendererKind };
             preview?: { kind: "css-box"|"html-card" };   // simple visual previews (box-shadow, SERP card)
             execution: sync }
  | Base & { layout: "file-processor"; accept: string[]; multiple: boolean; engine: "image"|"pdf";
             preview?: { kind: "before-after"|"thumbnails" };  // compress/resize/convert previews (audit fixes)
             execution: worker }
  | Base & { layout: "collection"; accept: string[]; engine;
             collection: { kind: "pdf-pages"|"images"; reorder?; remove?; partition?;
                           itemOps?: { rotate?: boolean } };   // per-item state (rotate-pdf-pages, rotate-image)
             execution: worker }
  | Base & { layout: "visual-editor"; accept: string[]; engine;
             editor: { overlay: "crop"|"resize"|"watermark"|"page-numbers"; navigator?: boolean; beforeAfter?: boolean };
             execution: worker };
// Media jobOptions signature: jobOptions(settings, files, items) — items carries per-item collection state.
```

No `name`/`description`/`category` in `ToolDefinition` — pages already source display text from `getAvailableToolBySlug` (tool-catalog + DB overlay). Duplication killed by omission.

**`lib/tool-runtime/runState.ts`** — pure, tested reducer for sync/server-action runs (mirrors `workerProtocol.ts` discipline): `status idle|running|completed|failed`, monotonic `runId` staleness guard, `beginToolRun/resolveToolRun/failToolRun`.

**`lib/tool-runtime/useToolExecution.ts`** — client hook layouts consume: `useToolExecution(definition, input, settings, serverAction?) → { state, run }`. Owns debounce (default 250ms for live mode — fixes today's per-keystroke re-runs), AbortController, settings parse via `settings.schema.parse`, staleness.

**Worker execution stays on `app/media/_lib/workerProtocol.ts`** (403 lines, pure, tested) — wrapped by new `useMediaWorker` hook, NOT merged into a mega-reducer. `new Worker(new URL(...))` stays literal inside the hook so Next code-splitting keeps working.

### Layout ownership (per audit recommendation)

- `app/devtools/components/layouts/` — `SourceResultWorkbench.tsx`, `GeneratorWorkbench.tsx`, `shared.tsx` (moved `ToolPageFrame`, `ToolWorkspace`)
- `app/media/components/layouts/` — `FileProcessorWorkbench.tsx`, `CollectionWorkbench.tsx`, `VisualEditorWorkbench.tsx`
- `packages/ui` — unchanged: `ToolPageShell`, `WorkbenchShell`, `patterns.tsx` primitives, `OrderableList`

### Renderer registry (devtools-local, `app/devtools/components/renderers.tsx`)

`Record<RendererKind, ComponentType<{result: ToolRunResult}>>` — `text`, `html`, `image` new-thin; `json-tree` wraps existing `JsonResultRenderer.tsx` (461 lines, reused); `table`/`diff`/`validation` added as tools get enriched. Media results render via existing `patterns.tsx` (`DownloadResult`, `ProcessingStatus`) — no shared registry, avoids bundling tree viewer into media.

### Dispatch

Both `[slug]/page.tsx` files become: resolve tool → look up `ToolDefinition` → `definition.customWorkArea ?? layoutComponents[definition.layout]` → render inside `ToolPageShell`. If-chains deleted.

---

## Phases

### Phase 0 — Runtime core (no app change)

Create `lib/tool-runtime/{definition.ts, settings.ts, runState.ts, useToolExecution.ts}` + `tests/tool-runtime.test.mjs` (reducer + zod settings parse/defaults/coercion tests; node --test imports .ts directly per `tests/media-processing-rules.test.mjs` pattern).
**Verify:** `pnpm lint && pnpm test` green, zero behavior change.

### Phase 1 — DevTools layouts + dispatch (cutover on old registry)

1. Build `app/devtools/components/layouts/{shared,SourceResultWorkbench,GeneratorWorkbench}.tsx` (extraction of `UtilityToolWorkbench` split by mode, driven by `ToolDefinition` + `useToolExecution`), `app/devtools/components/SettingsFields.tsx` (generic FieldUiMeta renderer, extracted from `UtilityOptionControl`/`UtilityToolbarOptionControl`), `app/devtools/components/renderers.tsx`.
2. Temporary bridge in `tools/index.ts` — `deriveToolDefinitions()` maps all ~110 `utilityToolDefinitions` → `ToolDefinition` (`mode single/dual → source-result`, `generator → generator`, `outputKind → result.renderer`, `live → trigger`, `CONVERSION_WORKBENCH_TOOL_KEYS` (moved from json-workbench.tsx:1366) → `variant: "conversion"`; `execution.run` wired to `runUtilityTool`). `domain-rating-checker` → `runtime: "server-action"`. Bridge shrinks to nothing as Phase 2 folders land.
3. Rewrite `app/devtools/[slug]/page.tsx` dispatch: definition → `customWorkArea ?? layoutComponents[layout]`; keep `checkDomainRatingAction` in page (server module), injected as prop.
4. Bespoke tools become folders with overrides: `tools/{json-formatter,json-viewer,json-to-csv,csv-to-json}/{definition.ts, WorkArea.tsx}` — WorkArea content split out of `json-workbench.tsx`; delete `app/devtools/json-formatter/json-workbench.tsx` when empty.

**Verify:** `pnpm lint && pnpm test`; update `tests/devtools-layout-reuse.test.mjs` / `workspace-structure.test.mjs` if they assert file layout; manual spot-check per category + one conversion-variant tool + domain-rating-checker + all 4 custom tools.

### Phase 2 — Explode monolith into per-tool folders

For each of ~110 tools create `tools/<slug>/`:

- `run.ts` — switch case body from `format-json.ts` moved verbatim (heavy deps localize: bcryptjs → password tools, qrcode → qr tool, marked/js-yaml → converters).
- `definition.ts` — hand-authored: app/category, layout, inputs, `defineSettings(...)` zod fields (converted from the tool's `option()` calls), trigger, renderer, `meta` (seo/howToUse/relatedTools). Once a folder exists, its entry leaves the derive-bridge.
- `tools/index.ts` becomes explicit imports of all folders; asserts unique slugs.

Shared helpers used by multiple runners move to `lib/devtools/shared/` (transformJson, repairJson, csv/json converters, MAX_INPUT guard, color/date helpers). When the switch and `utilityToolDefinitions` are empty, delete them and `normalizeUtilityOptions` from `format-json.ts` (file shrinks to shared exports or dies).

Do this in category-sized tranches (json, encoding, hashing, text, converters, generators, web, time…), `pnpm lint && pnpm test` per tranche.

### Phase 3 — Media hooks extraction (no visual change)

Extract from `MediaWorkbench.tsx`, logic verbatim: `app/media/_hooks/useMediaWorker.ts` (worker lifecycle around `beginWorkerJob/reduceWorkerJobState/cancelWorkerJob` + transferables; Worker constructor stays literal here), `useFileQueue.ts` (magic-byte validation via `_lib/validation.ts`, lifecycle staleness guard), `useObjectUrls.ts` (URL registry + revoke). `MediaWorkbench` consumes hooks.
**Verify:** `pnpm test:media` (coverage gate on `_lib`/`_workers` unaffected) + `playwright test -c playwright.media.config.ts`.

### Phase 4 — Media full cutover to 3 layouts

1. Per-tool folders `tools/<slug>/definition.ts` (30 folders, same flat root + `tools/index.ts`): app/category/meta, layout, accept/engine/multiple, `settings` via `defineSettings` (presets like `IMAGE_COMPRESSION_PRESETS` → `kind: "preset"` choices), `collection`/`editor` config, `jobOptions.ts` — the tool's branch of today's `buildJobOptions` moved into its folder (typed against `MediaJobOptionsByOperation[slug]`, still the trust-boundary mapping). Replaces `ToolOptions` if/else chain, `createDefaultOptions`, and central `buildJobOptions`. `app/media/_lib/tools.ts` shrinks to shared types/helpers or dies.
2. Build `app/media/components/SettingsFields.tsx` (media flavor; merge with devtools one later only if they converge), `layouts/FileProcessorWorkbench.tsx` (10 simple tools; composed from hooks + `patterns.tsx` primitives), `layouts/CollectionWorkbench.tsx` (pdf-inspection thumbnails, `OrderableList` for reorder, rotate/delete/partition per config), `layouts/VisualEditorWorkbench.tsx` (extract `CropOverlay` → own file; geometry stays in `_lib/geometry.ts`; navigator + before/after per config). Fixes audit-flagged design issues (compress/resize image previews, watermark rendered page, combine-images composed preview) as part of layout build.
3. Rewrite `app/media/[slug]/page.tsx` dispatch by `definition.layout`; delete `MediaWorkbench.tsx`.

**Verify:** `pnpm test:media`, media e2e spec, manual check per layout; explicitly test a qpdf-backed route (`compress-pdf` preserve mode) for `crossOriginIsolated` still holding.

### Phase 5 — Parity test + cleanup

New `tests/tool-definitions.test.mjs`: every non-Paperwork `toolManifest` entry has a tool folder registered in its app's `tools/index.ts` and vice versa; every definition's layout is one of 5; every settings schema parses its own defaults; folder slug === definition id. Delete dead code (`CONVERSION_WORKBENCH_TOOL_KEYS` original, `UtilityToolWorkbench`, `ToolOptions`, `createDefaultOptions`, `normalizeUtilityOptions`, derive-bridge).

---

## Feature research validation (TOOL_FEATURE_SPECS.md)

Deep feature audit of all 144 tools against best-in-class equivalents saved at `TOOL_FEATURE_SPECS.md` (repo root). Plan accommodates its findings as follows:

- **Structured `ToolRunResult`** (sections/stats/verdict/issues/downloads) — covers verdict badges (bcrypt/hash-compare, validators), size-saved stats (minifiers, compress), multi-section output (jwt-decoder, checksum rows), positional errors (line/col/row), binary download fallback (base64). Layouts render these in dedicated slots; every tool gets them free.
- **Renderer registry** grows to: text, code (highlighted), json-tree, table (sortable), key-value, html, image, diff (structured hunks), validation, stat-tiles (word/char counter dashboards), download-list.
- **Field kinds** add password/color/date + visibleWhen conditionals. Repeatable key/value rows (url-query-builder, robots groups) ship as textarea `k=v` fallback v1.
- **File input on source panels** — hash/checksum/base64 file mode via `SourcePanelSpec.fileInput`.
- **Override tiers keep customWorkArea rare.** Output-only overrides (custom result component via renderer registry): jwt-decoder, text-diff-checker, csv-viewer, json-viewer, diagram-generator, open-graph-preview, checksum rows. Input-only overrides (`slots.input`): regex-tester highlight overlay, url-query-builder key/value rows. Full `customWorkArea` only where interaction model differs: color-picker, gradient-generator, css-box-shadow, border-radius-generator, json-editor (+ existing bespoke json-formatter, json-to-csv, csv-to-json). Folder `WorkArea.tsx`/`ResultView.tsx`/`InputView.tsx` all colocate per tool.
- **Generator `preview` slot** for simple visual previews; hardest four use WorkArea.
- **Media**: shared zip util (fflate) for multi-output (split-pdf, extract-per-page, pdf-to-jpg/png, batch images); collection `itemOps` per-item rotation (rotate-pdf-pages needs worker option extension to per-item angles); client-side canvas preview layer fixes all audit-flagged preview misses (compress/resize/social/watermark/combine) without invoking worker per tweak; surface existing `inputBytes/outputBytes` as stats; friendly password-protected-PDF error.
- **Runtime**: regex-tester execution in worker with timeout; heavy libs (Prettier, terser, ajv, croner, mermaid) lazy-imported inside tool folders; shared single-source parsers — RFC 4180 CSV, cURL (fetch+axios), JWT decode core (3 slugs), page-range parser.
- **Feature debts** (quality, not architecture — tracked in specs §J): real formatters/minifiers, JSONPath filters, ajv validation, cron next-run times, bcrypt default cost, option-depth expansion across ~40 tools. These land per-tool inside Phase 2 folder migration where cheap, else post-migration.

## Key reuse (do not rewrite)

- `app/media/_lib/workerProtocol.ts` reducer + message constructors — wrap, don't touch
- `app/devtools/components/JsonResultRenderer.tsx` — becomes `json-tree` renderer
- `packages/ui` `ToolPageShell`, `WorkbenchShell`, `patterns.tsx`, `OrderableList` — consumed as-is
- `app/media/_lib/{validation,geometry}.ts`, `_workers/*` — untouched
- `getAvailableToolBySlug` control-plane flow — untouched

## Risks

- **Full-cutover regression surface**: Phase 1 flips 110 tools at once. Mitigate: layouts are extractions (not rewrites) of `UtilityToolWorkbench`; visual parity spot-check matrix per category + both variants before merge.
- **Zod migration**: factory-internal swap keeps authoring sites; risk is subtle coercion differences vs `normalizeUtilityOptions` (e.g. number clamping vs reject). Port its exact semantics into field builders (clamp via `.transform`, enum fallback to default) + unit tests comparing old/new normalization on all 110 defaults.
- **Worker code-splitting**: never move `new Worker(new URL(...))` out of `app/media/_hooks/useMediaWorker.ts`.
- **Server actions**: `"use server"` can't live in client definition modules — definitions only mark `runtime: "server-action"`; page injects. Preserved pattern.
- **Bundle size**: runner registry bundles same code as today's monolith (no regression); per-category `next/dynamic` is a later optimization if measured.

## Verification (end-to-end)

1. `pnpm lint && pnpm test && pnpm test:media` after every phase.
2. Playwright: `playwright test -c playwright.media.config.ts` + devtools e2e if present.
3. Manual matrix: 1 tool per DevTools category, 1 conversion-variant, 1 generator, domain-rating-checker, 4 custom work areas, 1 tool per media layout, qpdf compress-pdf.
4. Parity test (Phase 5) locks manifest ↔ definition alignment permanently.
