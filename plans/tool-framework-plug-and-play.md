# Tool Framework: one contract, auto-wired, 144 tools migrated

## Context

Adding one tool today means editing up to 11 files across 4 unrelated architectures, and the
tool's definition, execution, and UI live in three different trees. The goal: `pnpm tool:new <key>`
creates a folder, you write a spec and a function, and the tool is live — routed, catalogued,
SEO'd, worker-hosted, no import maps, no registry edits, no switch arms.

### Verified current state

Four architectures, five copies of the tool inventory, and ~11,500 lines of central machinery:

| File                                             | Lines | Role                                                                                                           |
| ------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------- |
| `lib/devtools/format-json.ts`                    | 4218  | pure lib + `utilityToolDefinitions` catalog (110 keys) + 110-arm `runUtilityTool` switch + ~90 private helpers |
| `app/devtools/json-formatter/json-workbench.tsx` | 1842  | `UtilityToolWorkbench` + `DataConversionWorkbench` — renders all 103 legacy devtools                           |
| `app/media/components/MediaWorkbench.tsx`        | 1788  | media lifecycle + 55-key options bag + 30-arm `buildJobOptions` + 18 `definition.slug ===` branches            |
| `app/media/_workers/pdf.worker.ts`               | 1053  | 12-arm `processPdf` switch, 13 handlers, ~15 shared helpers                                                    |
| `app/media/_workers/image.worker.ts`             | 702   | `processImages` switch, 17 handlers                                                                            |
| `packages/tool-catalog/src/index.ts`             | 782   | `toolManifest` from positional tuples                                                                          |
| `components/UtilityToolPrimitives.tsx`           | 611   | `createUtilityRuntimeSpec` — bridges 11 foldered tools back into the monolith                                  |
| `app/media/_lib/tools.ts`                        | 361   | 4th duplicate of the catalog; the definition that actually drives media                                        |
| `tools/client-registry.ts`                       | 116   | 44 static imports, 2 maps with different prop types                                                            |

Two findings that shape the plan:

1. **`mergeToolManifest` is not fail-closed.** `seedById` is derived from `toolManifest`, so the
   lookup at `packages/tool-catalog/src/index.ts:695` always hits → a new manifest entry resolves to
   `slug: componentKey, enabled: true`. **A new tool folder is live on deploy today.** The
   `{ slug: null, enabled: false }` branch only fires for a custom manifest array passed by a test.
2. **`iconKey` is declared in all 43 `definition.ts` files, typed `string`, asserted by two tests,
   and read by zero runtime code.** Icons come from 4 duplicated `TOOL_ICONS` maps plus a
   category fallback plus a name-string guess in `AuthDiscoveryNavigation.tsx`.

### The non-negotiable invariant

**No shared file may contain any tool's identity.** Not a `switch`, not an `if (key === …)`, not a
lookup literal, not a name in a comment. Every dispatch resolves a tool by **its folder name used
directly as a module path** — `import(\`../../tools/${key}/run.worker\`)`. Tool-specific logic lives
in `tools/<key>/` and nowhere else. Shared logic lives in exactly one place per capability and is
called _by_ tools, never dispatches _to_ them.

Enforced, not promised — in `tests/tool-registry.test.mjs`:

```js
// No tool key may appear in any shared file. No exceptions — there is no generated directory.
const shared = await globFiles(["lib/tool-framework/**", "components/**", "app/**", "packages/**"]);
for (const file of shared) {
  const source = await readFile(file, "utf8");
  const leaked = toolKeys.filter((key) => source.includes(key));
  assert.deepEqual(leaked, [], `${file} names tools: ${leaked.join(", ")}`);
}
// And no dispatch on tool identity, anywhere.
assert.doesNotMatch(source, /\b(componentKey|definitionKey|slug|operation|key)\s*===\s*["']/);
```

This is the invariant that makes every other part of the plan true. It also kills the four dispatch
tables, the 18 slug branches, and the four `TOOL_ICONS` maps as a _consequence_ rather than as
separate cleanup items — none of them can survive the test.

Corollary: **one worker file, not two.** `app/media/_workers/{pdf,image}.worker.ts` both die.
`engine: "image" | "pdf"` survives only as a client-side hint (which accept filter, whether to
request PDF page inspection) — it no longer selects a worker, because per-tool chunks mean a single
generic worker downloads only the code the requested tool actually needs.

### Decisions taken

- **Metadata: DB-owned CMS, code-fallback shaped.** New `tool_content` table, every column
  nullable, NULL-coalesced onto `definition.ts`. No row → code values → folder works immediately.
- **Paperwork is out of scope.** 7 tools, separate product surface, untouched. Scope = **144 tools**
  (114 devtools + 30 media).
- **Big-bang single branch**, phased internally. No `legacy-allowlist.ts`, no ratchet, no adapter.
- **Migrate and improve together** — `TOOL_FEATURE_SPECS.md` §J gaps close in the same PR as each
  tool's move.

---

## Part 1 — Framework core

### 1.1 Per-tool folder contract

```
tools/<definitionKey>/
  definition.ts       REQUIRED  server-safe spec. React-free, dependency-free.
  run.ts              the function, main thread    ─┐
  run.worker.ts       the function, worker          ├─ exactly one
  run.server.ts       the function, route handler  ─┘
  workspace.tsx       OPTIONAL  custom surface; overrides the layout default
  fixtures.json       OPTIONAL  test cases; auto-discovered, no test-file edit
```

**Everything is derived from the filesystem. Nothing is declared twice.**

| Fact                       | How it is known                |
| -------------------------- | ------------------------------ |
| the tool's key             | the folder name                |
| where `run` executes       | which `run*.ts` file exists    |
| whether it has a custom UI | whether `workspace.tsx` exists |
| whether it has tests       | whether `fixtures.json` exists |

`definitionKey` is **not a field** — it is the folder name. There is **no `runtime` field** either:
a file named `run.worker.ts` cannot disagree with reality the way `runtime: "worker"` can. Tests
assert no definition declares either. `capabilities.cancel` and `capabilities.progress` are likewise
derived — a `run.worker.ts` always has both.

`execution.ts` and `result.ts` fold into the run file; all 13 `<Name>Tool.tsx` delete.

Keep the filename `definition.ts` — 43 folders already have one, so migration is an in-place edit,
not 43 `git mv`s.

### 1.2 `lib/tool-framework/spec.ts`

One type replaces `packages/tool-catalog` tuples, `lib/tool-runtime/types.ts` `ToolDefinition`,
`app/media/_lib/tools.ts` `MediaToolDefinition`, and every `utilityToolDefinitions` entry.

```ts
export type ToolApp = "devtools" | "media";

/** Selects the DEFAULT generic workspace. workspace.tsx overrides it. */
export type ToolLayout =
  "source-result" | "generator" | "file-processor" | "collection" | "visual-editor";

export type ToolInputSpec =
  | {
      kind: "text";
      label: string;
      placeholder?: string;
      maxLength?: number;
      secondary?: { label: string; placeholder?: string };
      acceptFiles?: { accept: string; maxBytes: number };
    }
  | { kind: "fields"; label: string }
  | {
      kind: "files";
      label: string;
      accept: string;
      multiple: boolean;
      engine: "image" | "pdf";
      maxFiles?: number;
      maxBytes?: number;
      inspect?: boolean;
    };

export type ToolTrigger =
  { mode: "live"; debounceMs?: number } | { mode: "manual"; actionLabel: string };

/** Code-owned FALLBACK content. tool_content rows override field-by-field. */
export type ToolContent = {
  seoTitle?: string;
  howToUse: readonly string[];
  limitations?: readonly string[];
  faq?: readonly { q: string; a: string }[];
  examples?: readonly { label: string; text: string; secondary?: string }[];
  relatedToolIds?: readonly string[]; // stable toolIds, never slugs
};

export type ToolSpec<S extends SettingsSpec = SettingsSpec> = {
  readonly toolId: string; // "media.watermark-pdf" — DB primary key, immutable
  readonly app: ToolApp;
  /** Public URL segment. Omit → slugFromName(name). Used at FIRST INSERT only, then frozen. */
  readonly slug?: string;
  readonly category: CategoryKey; // typo fails tsc
  readonly keywords: readonly string[];
  readonly name: string;
  readonly description: string;
  readonly input: ToolInputSpec;
  readonly settings: S;
  readonly trigger: ToolTrigger;
  readonly layout: ToolLayout;
  readonly capabilities?: {
    cancel?: boolean;
    copy?: boolean;
    download?: boolean;
    progress?: boolean;
    network?: boolean;
  };
  readonly labels: { empty: string; ready: string; running: string };
  readonly content: ToolContent;
};

export function defineTool<const S extends SettingsSpec>(spec: ToolSpec<S>): ToolSpec<S> {
  return spec;
}
```

### 1.3 Settings: hand-rolled descriptor union, not zod

`zod@^4.4.3` is a root dependency but imported by exactly one file
(`packages/invoice-templates/src/templateValidation.ts`). Declining it here: zod gives inference and
coercion but **not UI metadata**, so every field would be authored twice — `z.number().min(1)` plus a
parallel `{ label, kind, min, max }`. Two sources of truth for one control is the disease being
cured. One descriptor produces the type, the default, the coercion, and the control.

zod is retained for exactly one job: validating the untrusted `tool_content.content_doc` jsonb
(Part 3).

```ts
// lib/tool-framework/settings.ts
type Base = {
  label: string;
  help?: string;
  visibleWhen?: { key: string; equals: string | number | boolean };
};

export type FieldSpec =
  | (Base & { kind: "text"; default: string; placeholder?: string; maxLength?: number })
  | (Base & { kind: "textarea"; default: string; rows?: number })
  | (Base & { kind: "password"; default: string; placeholder?: string })
  | (Base & {
      kind: "number";
      default: number;
      min?: number;
      max?: number;
      step?: number;
      suffix?: string;
    })
  | (Base & {
      kind: "slider";
      default: number;
      min: number;
      max: number;
      step?: number;
      suffix?: string;
    })
  | (Base & { kind: "toggle"; default: boolean })
  | (Base & {
      kind: "select";
      default: string;
      choices: readonly { label: string; value: string }[];
    })
  | (Base & {
      kind: "preset";
      default: string;
      choices: readonly { label: string; value: string; detail?: string }[];
    })
  | (Base & { kind: "color"; default: string; allowTransparent?: boolean })
  | (Base & { kind: "date"; default: string })
  | (Base & { kind: "position"; default: WatermarkPosition }) // 3x3 grid, 3 media tools
  | (Base & { kind: "pages"; default: "all" | readonly number[] }) // "1,3,5-9"/odd/even, 8 media tools
  | (Base & {
      kind: "rows";
      default: readonly { key: string; value: string }[];
      keyLabel: string;
      valueLabel: string;
    });

export type SettingsSpec = { readonly fields: Readonly<Record<string, FieldSpec>> };
export type SettingsOf<S extends SettingsSpec> = {
  [K in keyof S["fields"]]: ValueOf<S["fields"][K]>;
};
export function parseSettings<S extends SettingsSpec>(spec: S, raw: unknown): SettingsOf<S>;
```

`visibleWhen` is what collapses `MediaJobOptionsByOperation`'s discriminated unions into flat
settings — `run.ts` narrows on `settings.kind` itself. **This deletes the 30-arm `buildJobOptions`
switch and the 55-key options bag outright**, because a tool's settings are already typed as its own.

`components/SettingsPanel.tsx` renders `FieldSpec` → control against a closed registry, replacing
four separate option renderers.

### 1.4 Execution: one signature, three hosts

```ts
// lib/tool-framework/run.ts
export type ToolRunContext<S> = {
  readonly input: {
    readonly text: string;
    readonly secondary?: string;
    readonly files: readonly ToolRunFile[];
    readonly items?: readonly { id: string; rotation: 0 | 90 | 180 | 270; selected: boolean }[];
  };
  readonly settings: S;
  readonly signal: AbortSignal;
  readonly progress: (p: { completed: number; total: number; stage: string }) => void;
};
export type ToolRun<S = never> = (ctx: ToolRunContext<S>) => ToolResult | Promise<ToolResult>;
export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly recovery?: string,
  ) {
    super(message);
  }
}
```

`ToolResult` is discriminated on `render` — no `details?: unknown`, one registered renderer per key.
Ten views cover `TOOL_FEATURE_SPECS.md` §A in full: `text`, `code`, `json-tree`, `table`,
`key-value`, `html`, `image`, `diff`, `files`, `none`. Plus optional `stats`, `verdict`, `issues`,
`artifacts`, `sections`. Rendered by `components/ResultView.tsx`, a closed registry.

- **(a) Main thread** — `lib/tool-framework/host.ts` `createExecute()` synthesises the `execute`
  member of the existing `ToolRuntimeSpec`. `useToolRuntime` and `UniversalWorkbench` are consumed
  unchanged. No new runtime.
- **(b) One common worker runner** — `lib/tool-framework/tool.worker.ts`, ~50 lines, **the only worker
  file in the repo**. Zero tool names, zero branches on tool identity, **no registry import**. Its
  entire body is: read `key` off the message → resolve the spec → import the tool's run file **by
  folder name** → call it → post the result. Cancellation is `AbortController` +
  `signal.throwIfAborted()`; progress is `ctx.progress` → `postMessage`; failures map through one
  `toFailureMessage`. It never knows what a PDF is.

  ```ts
  // key arrives over postMessage — shape-check before it reaches a module path.
  if (!TOOL_SLUG_PATTERN.test(key)) return fail("unknown-tool");

  const { default: spec } = await import(`../../tools/${key}/definition`);
  const { run } = await import(`../../tools/${key}/run.worker`);
  //                                      ^^^^^^^^^^^^^ static prefix  ^^^^^^ static suffix

  assertRunnableFiles(spec, message.files); // one trust boundary, spec-driven
  const settings = parseSettings(spec.settings, message.settings);
  const result = await run({ input, settings, signal, progress });
  ```

  **No map, not even for the spec** — the folder name is the path for both imports. The static prefix
  and suffix are what make these context modules rather than unanalyzable expressions: the bundler
  globs `tools/*/definition.*` and `tools/*/run.worker.*` at build time, emits one chunk per match,
  and fetches only the one requested. That is exactly the code-splitting a generated map bought, with
  no map. Path traversal cannot escape the glob, but `TOOL_SLUG_PATTERN` (already exported from
  `packages/tool-catalog`) runs first so a bad key gives a clean failure instead of a module-not-found.

  `new Worker(new URL("./tool.worker.ts", import.meta.url))` stays literal in `useToolRun.ts`.
  **Bundle size improves**: a merge-pdf job fetches `pdf-lib` and nothing else, where today
  `pdf.worker.ts` bundles every PDF tool's `pdf-lib` + `pdfjs-dist` + `qpdf-wasm` + `fflate` together.

- **(c) Server** — `app/api/tools/[key]/route.ts`, same shape:
  `await import(\`../../../tools/${key}/run.server\`)`. The `.server`suffix is a **separate bundler
context**, so`process.env`/`node:net` / API keys can never be reached from the client or worker
  context — enforced by the module graph, not by discipline. A route handler rather than a server
  action, because an action can't be resolved dynamically without dragging every tool's server module
  into the client graph.

Six helpers **delete rather than move**: `checkCanceled`/`canceledJobId` (×2) → `signal.throwIfAborted()`;
`progress`/`progressRaw` (×2) → `ctx.progress`; `safeFailure` (×2) → one `toFailureMessage`;
`PdfWorkerError`/`MediaWorkerError` → one `ToolError`; duplicate `clamp` (×2) → one;
all of `app/media/_workers/operations.ts` → dead.

The 30 handler bodies move **verbatim** into `tools/<key>/run.ts`. Shared helpers split by measured
consumer count into `lib/tool-framework/media/` — these are **libraries tools import**, never
dispatchers that know tool names. `pdfDocument.ts` exports `loadPdf`; it does not know
`merge-pdf` exists.

| Destination            | Contents                                                                                                                            | Consumers                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `media/pdfDocument.ts` | `loadPdf`, `pdfOutput`, `positionedBox`, `resolvePageNumbers`, `enforcePageLimit`, `validatePdfInput`, `getPdfContentBox`, …        | 13 PDF tools (pdf-lib only)                                                                                                                         |
| `media/pdfRender.ts`   | `forEachRenderedPdfPage`, `encodeCanvas`, `applyColorMode`, `context2d`, `inspectPdf`                                               | ~6 raster tools. **Sole owner of `pdfjs-dist`** and of `GlobalWorkerOptions.workerSrc = new URL(...)` — must never be imported from the main thread |
| `media/imageCodec.ts`  | `decodeImage`, `encodeImage`, `resizeForOptions`, `cropImage`, `rotateImage`, `flipImage`, `flattenImage`, `resolveOutputFormat`, … | 17 image tools; every `await import("@jsquash/…")` unchanged                                                                                        |

Moved unchanged: `qpdfAdapter.ts` → `media/qpdf.ts`, `workerRules.ts` → `media/pdfRules.ts`,
`_lib/validation.ts` → `media/validation.ts`, `_lib/geometry.ts` → `media/geometry.ts`.
New: `media/zip.ts` (one fflate packaging helper for split-pdf, pdf-to-jpg/png, batch image tools).

**qpdf constraint — do not break this.** `next.config.ts:23-40` scopes COOP/COEP `require-corp` to
`source: "/media/:path*"` plus `/_next/static/chunks/:path*`. That is what makes
`crossOriginIsolated` and `SharedArrayBuffer` available, which is what makes preserve-mode PDF
compression work. `qpdfAdapter.ts:87` already checks it and already lazily imports. **This is the
reason the three URL scopes survive** — a unified `/t/<slug>` either loses isolation or forces
`require-corp` site-wide. `tests/single-app-architecture.test.mjs:61` covers this; keep it.

### 1.5 Registration: none. The folder name is the path.

**No generated files. No registry script. No staleness gate.** A folder existing under `tools/` is
the registration; its name is the module path. Two mechanisms, both native to the bundler:

**Dispatch — direct dynamic import by folder name.** Used by the worker, the main-thread host, and
the server route. Covered in §1.4:

```ts
await import(`../../tools/${key}/run.worker`); // bundler globs tools/*/run.worker.*
```

`workspace.tsx` resolves the same way: `lazy(() => import(\`../../tools/${key}/workspace\`))`,
wrapped so a missing file falls back to `DEFAULT_WORKSPACES[spec.layout]`.

**Enumeration — the database. Never the bundle.** Catalog pages, the sitemap, and the admin list need
the whole _list_, not a keyed lookup. That list lives in `managed_tools` + `tool_content` and is read
with SQL. **No bundled module ever holds a set of tools** — not a generated map, not a glob result,
not an array. The only way to learn a tool exists is to query the DB or read the filesystem.

| Need                                                | Source                           | Mechanism                     |
| --------------------------------------------------- | -------------------------------- | ----------------------------- |
| every tool (catalog, sitemap, admin, related-tools) | `managed_tools` + `tool_content` | SQL                           |
| one tool's spec / run / workspace                   | `tools/<key>/`                   | dynamic import by folder name |
| getting folders _into_ the DB                       | `pnpm db:seed`, and dev boot     | Node `fs.readdir("tools")`    |

`packages/database/src/seedManagedTools.ts` does the walk, in plain Node where the filesystem genuinely
exists — the one context where `fs` is the right tool. Dev seeds on boot, so locally a new folder
appears everywhere on restart.

```ts
const folders = (await readdir("tools", { withFileTypes: true }))
  .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
  .map((e) => e.name);

for (const definitionKey of folders) {
  const { default: spec } = await import(`../../../tools/${definitionKey}/definition.ts`);

  await db
    .insert(managedToolsTable)
    .values({
      toolId: spec.toolId, // "<app>.<definitionKey>" — frozen
      app: spec.app,
      slug: spec.slug ?? slugFromName(spec.name), // declared or derived; applied ONCE (see Part 3)
      name: spec.name,
      description: spec.description,
      order: folders.indexOf(definitionKey),
      enabled: true,
    })
    .onConflictDoNothing({ target: managedToolsTable.toolId });

  await db
    .insert(toolContentTable)
    .values({ toolId: spec.toolId }) // all-null row; resolver falls back to the spec
    .onConflictDoNothing({ target: toolContentTable.toolId });
}
```

`onConflictDoNothing` is the entire safety story: the first deploy inserts, every later deploy is a
no-op, and admin edits to name/description/slug/order survive forever. Never `DO UPDATE`.

Before inserting, the seed validates the resolved slug (`TOOL_SLUG_PATTERN`, not reserved) and — for
tools already in the database — asserts it still equals the stored value, failing with the message
shown in Part 3 if a developer has edited a published `slug:`.

A `unique(app, slug)` violation means two tool names slugify identically — **let the seed fail.** Renaming
the new tool is a five-second fix; a silently suffixed `-2` URL is permanent.

This is also the natural shape given Part 3: the DB already owns category, keywords, SEO, and page
content. Making it own _existence_ too means one registry, not two.

**Rejected: `import.meta.glob`.** Turbopack ships the Vite-compatible glob API in
[Next.js 16.3](https://nextjs.org/blog/next-16-3-turbopack), and `{ eager: true }` over
`tools/*/definition.ts` would enumerate without a script. Not used, for three reasons, in order of
force:

1. It puts a set of every tool back into a bundled module — the thing the §0 invariant exists to
   prevent. A glob result is a generated map with a nicer syntax.
2. It requires 16.3, which is `preview`/`canary` today (`latest` is 16.2.12; this repo is on 16.2.11).
   Avoiding it keeps the whole project on stable.
3. It is Turbopack-only, so it would couple the framework to one bundler forever.

Net: **no generated files, no registry script, no bundler-specific API, and no list of tools anywhere
in the shipped bundle.**

**Honest cost:** a brand-new folder is **routable immediately** at `/<app>/<key>` — dispatch needs no
registry — but does not appear in _listings_ until a seed runs. Automatic in dev; in prod it is the
migrate step already in the deploy. Naming it because it dents "folder = working tool" at the listing
layer, and nowhere else.

```json
"tool:new": "node scripts/new-tool.mjs",
"dev":   "pnpm run prepare:vendor && next dev -p 3000",
"build": "pnpm run prepare:vendor && tsc --noEmit && next build",
"test":  "node --test tests/*.test.mjs"
```

Nothing to chain, nothing to check, nothing to commit. **`--webpack` is dropped** — Turbopack for both
`dev` and `build`, the Next 16 default. See §1.5b.

#### 1.5b Dropping `--webpack`

One bundler instead of two removes a whole class of "works in dev, breaks in build" — dev and build
currently disagree on which bundler runs, and this design leans on dynamic module resolution, exactly
where the two differ most.

The `webpack()` block at `next.config.ts:60-79` currently shims two things the `turbopack` block at
`:54-59` does not:

| Shim                                                          | Who needs it                                                                                              | Fate                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NormalModuleReplacementPlugin(/^node:/)`                     | `app/devtools/[slug]/page.tsx:6` — `import { isIP } from "node:net"` for the domain-rating-checker action | **Phase 8 deletes it.** The action becomes `tools/domain-rating-checker/run.server.ts`, off the client graph entirely |
| `fs/promises`, `url`, `zlib`, `module` → `browserEmptyModule` | Nothing first-party (zero direct imports). Transitive from `@pdfme/*`, `@react-pdf/renderer`, `fontkit`   | Paperwork only — out of scope, but still must build                                                                   |

So the migration is three added aliases, in the shape the file already uses for `module`:

```ts
turbopack: {
  resolveAlias: {
    "@": appRoot,
    module:        { browser: "./lib/paperwork/browserEmptyModule.ts" },
    "fs/promises": { browser: "./lib/paperwork/browserEmptyModule.ts" },   // add
    url:           { browser: "./lib/paperwork/browserEmptyModule.ts" },   // add
    zlib:          { browser: "./lib/paperwork/browserEmptyModule.ts" },   // add
  },
},
```

Then delete the `webpack()` block entirely. Confirm when flipping: `output: "standalone"`
(`next.config.ts:43`) still produces a working server bundle under a Turbopack build, and paperwork
PDF generation — the thing those shims protect — still works.

**One risk already retired.** WASM-in-worker under Turbopack used to be the strongest argument for
keeping webpack: workers bootstrapped through a `blob://` URL with an empty `location.origin`, so
`importScripts()` and `fetch()` inside them failed. Next.js 16.2 fixed the worker bootstrap so
`origin` points at the real domain — explicitly called out as unblocking WASM in workers. This repo is
already on 16.2.11, so `qpdf-wasm` and `pdfjs-dist` are covered. Related: workers may no longer be
blob-based, so re-check `worker-src 'self' blob:` in the CSP at `next.config.ts:16`.

`scripts/new-tool.mjs` (~30 lines) writes `definition.ts` + a run file from templates and stops —
no generator to invoke. Flags `--app --category --layout --worker|--server`. The emitted run file
returns `{ render: "text", text: ctx.input.text }`, so the tool is live and round-trips before you
write a line.

> ⚠️ **Verify first — ~30 minutes, task 1 of Phase 1.** Two checks, on current stable (16.2.x):
>
> 1. **Does Turbopack resolve `import(\`../../tools/${key}/run.worker\`)`, and emit one chunk per
match?** Check the `.next` output, not just that it resolves — a bundler that inlines all 144
>    matches into one chunk "works" while shipping a worse worker than today. Related history:
>    [#56531](https://github.com/vercel/next.js/issues/56531) (dynamic requests) is closed;
>    [#74664](https://github.com/vercel/next.js/issues/74664) (a directory-glob resolution bug) was
>    fixed in PR #77986, which is itself evidence the resolution path exists.
> 2. **Does a WASM tool still run in the worker** (`compress-pdf` → `qpdf-wasm`)? Next 16.2 fixed Web
>    Worker `location.origin` — workers no longer bootstrap via `blob://` — which is what makes
>    Turbopack viable here at all. Also re-check `worker-src 'self' blob:` in the CSP
>    (`next.config.ts:16`), which may now be describing something that no longer happens.
>
> Scaffold `tools/__spike/`, verify, delete.
>
> **If dynamic resolution fails or does not split:** one `scripts/generate-tool-registry.mjs` emitting
> a single `runs.ts` of static `() => import(...)` arrows, plus `--check` in `pnpm test`. Dispatch stays
> keyed by folder name; one generated file is the whole cost, and enumeration is unaffected because it
> was never in the bundle.

> ⚠️ `next.config.ts:47` sets `typescript: { ignoreBuildErrors: true }`. This design leans hard on
> the type system; `next build` will not enforce it. The `build` script chains `tsc --noEmit` first,
> so the gate holds — but revisit the flag.

> ⚠️ `next.config.ts:47` sets `typescript: { ignoreBuildErrors: true }`. This design leans hard on
> the type system; `next build` will not enforce it. The `build` script chains `tsc --noEmit` first,
> so the gate holds — but revisit the flag.

### 1.6 Routing, metadata, discovery

Three ~20-line routes over one resolver and one renderer.

- `lib/tool-framework/catalog.ts` (server, `cache()`) — derives the manifest from `toolSpecs`,
  merges DB rows via the unchanged `mergeToolManifest`, resolves content (Part 3), computes
  related tools. Exports `getTools`, `resolveToolPage`, `relatedTools`.
- `components/ToolPage.tsx` — the single renderer for 144 tools: `ToolPageShell` (from
  `packages/ui`) wrapping `UniversalWorkbench`, workspace resolved as
  `workspaces[key] ?? DEFAULT_WORKSPACES[spec.layout]`, both lazy. Deletes both fallthrough
  branches in `app/devtools/[slug]/page.tsx`, `getUniversalToolWorkbench`, `getMediaToolWorkspace`.
- `lib/tool-framework/metadata.ts` — `toolMetadata(app)` factory. Generalises the only existing
  `generateMetadata` (`app/media/[slug]/page.tsx`) to both scopes; **devtools gets per-tool SEO for
  the first time**.
- `app/sitemap.ts` (~15 lines) and `app/robots.ts` (~8 lines) — **neither exists today**.
- **Skip `generateStaticParams`.** Slugs and enablement come from `managed_tools` and an admin can
  toggle them at runtime; prerendering would require a redeploy per admin change. Correctness, not
  laziness. Revisit only with measured TTFB and `revalidate`.
- `lib/tool-framework/categories.ts` — one `TOOL_CATEGORIES: Record<CategoryKey, {...}>` replacing
  the local `CATEGORIES` arrays in `app/devtools/page.tsx:73` and `app/media/page.tsx:35`, plus
  `FEATURED_TOOL_IDS` (today's `QUICK_TOOL_KEYS`/`POPULAR_TOOL_KEYS`).
- **Icons — uploaded per tool, no registry at all.** See §1.7b. `iconKey` is deleted from `ToolSpec`,
  and with it the 4 duplicated `TOOL_ICONS` maps (`app/devtools/page.tsx:43`,
  `app/paperwork/page.tsx:23`, `app/paperwork/components/RelatedTools.tsx:20`,
  `app/admin/(protected)/tools/components/ToolList.tsx:54`), plus `app/media/page.tsx`'s
  category-derived icon and `AuthDiscoveryNavigation.tsx`'s name-string guess.

### 1.7b Icons: uploaded, not mapped

A closed `IconKey` union plus a `Record<IconKey, LucideIcon>` map is still a shared file that must
change when a tool changes — a smaller version of the exact problem this plan exists to remove. Icons
become **data the admin owns**, like name and description. `iconKey` leaves `ToolSpec` entirely.

Three states, in precedence order:

| State            | Source                                                         | Cost                             |
| ---------------- | -------------------------------------------------------------- | -------------------------------- |
| uploaded         | Cloudinary, referenced by `tool_icons`                         | one row, no bytes in Postgres    |
| nothing uploaded | **generated identicon** — initials + hue derived from `toolId` | zero storage, computed at render |
| unknown tool     | 404                                                            | —                                |

`lib/tool-framework/identicon.ts` renders a deterministic inline SVG: up to two initials from the
name, colours from `hash(toolId) % 360` as an HSL hue. Same input, same output, forever — so a
brand-new folder has a stable, distinct icon on first render, with nothing uploaded and no migration.
This is what actually replaces lucide.

**Storage — Cloudinary.** Net-new integration: `cloudinary` is not currently a dependency and no
`CLOUDINARY_*` vars exist in `.env.example`. Postgres stores only the reference, never bytes:

```sql
CREATE TABLE tool_icons (
  tool_id    text PRIMARY KEY REFERENCES managed_tools(tool_id) ON DELETE CASCADE,
  public_id  text        NOT NULL,     -- "smarttools/tool-icons/<toolId>"
  version    text        NOT NULL,     -- Cloudinary version, for immutable URLs
  format     text        NOT NULL,     -- always "png" — we pin it, never echo the upload
  width      integer     NOT NULL,
  height     integer     NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

`lib/tool-framework/icons.ts` builds the delivery URL — no SDK on the client, no route to serve bytes,
no `next/image` loader config:

```
https://res.cloudinary.com/<cloud>/image/upload/f_png,c_fill,w_256,h_256,q_auto/v<version>/<public_id>.png
```

Cloudinary does the resizing and the CDN caching, so the whole rasterize-on-client step from the
previous design disappears. `f_png` is pinned in the URL, so **whatever was uploaded is always
delivered as PNG.** Including `v<version>` makes the URL content-addressed and safe to cache forever.

**Upload path — signed, server-side, admin-only.**

1. Admin submits the file to a server action / route under the existing `app/admin/(protected)`
   authorization. Reject >1 MB before anything else.
2. **The server uploads to Cloudinary** with `cloudinary.v2.uploader.upload`, using a signed request.
   Never an unsigned preset and never a browser-direct upload — an unsigned preset is a public write
   endpoint for anyone who reads the bundle. `CLOUDINARY_API_SECRET` stays server-only.
3. Upload options pin every dimension of the result rather than trusting the input:
   ```ts
   {
     public_id: `smarttools/tool-icons/${toolId}`,
     overwrite: true,
     invalidate: true,                                   // purge the CDN on replace
     resource_type: "image",                             // never "raw" / "auto"
     allowed_formats: ["png", "jpg", "webp"],            // SVG rejected at the boundary
     format: "png",                                      // stored as PNG regardless of input
     transformation: [{ width: 512, height: 512, crop: "limit" }],
   }
   ```
4. Persist `public_id`, the returned `version`, width and height. Record it through the existing
   admin-audit path.

**Security.** Cloudinary changes the shape of the risk but does not remove it:

- **SVG never enters.** `allowed_formats` excludes it and `format: "png"` forces a raster result, so
  there is no path by which a `<script>`-bearing SVG is stored or delivered. Do not relax either.
- `resource_type: "image"` explicitly — `"auto"` or `"raw"` would let arbitrary files through and
  serve them back under your cloud name.
- The API secret is server-only; the upload is signed. No unsigned preset, ever.
- Cloudinary is now a place your brand can be defaced if credentials leak — scope the API key to a
  single folder and rotate it like any other secret.

**Cross-origin delivery — why this needs a paragraph at all.** Icons are the only cross-origin
subresource on pages that are deliberately locked down for an unrelated reason:

```
compress-pdf preserve mode → qpdf-wasm → SharedArrayBuffer → crossOriginIsolated
  → COOP: same-origin + COEP: require-corp on /media/:path*  (next.config.ts:23-27)
    → require-corp constrains EVERY subresource those pages embed → including icons
```

qpdf never touches an icon. It is the reason those pages carry a header that restricts what they may
embed. Under `require-corp` a cross-origin image is blocked unless it carries
`Cross-Origin-Resource-Policy: cross-origin` **or** is fetched in CORS mode. Note `:path*` matches
`/media` itself, so the **media listing page is affected** — exactly where tool icons appear.

**The trap is bidirectional, and worth writing down:** if icons disappear on `/media/*` and someone
"fixes" it by relaxing COEP, `compress-pdf` preserve mode silently stops working. Neither symptom
points at the other. `tests/single-app-architecture.test.mjs:61` asserts these headers — keep it.

**Chosen fix: one attribute.** `components/ToolIcon.tsx` is the single component that renders every
tool icon, so this is one line in one file:

```tsx
<img src={iconUrl} crossOrigin="anonymous" alt="" width={40} height={40} />
```

Cloudinary sends `Access-Control-Allow-Origin: *`, so CORS mode satisfies `require-corp`. Plus one CSP
change: `next.config.ts:13` currently sets `img-src 'self' blob: data:` — add
`https://res.cloudinary.com`.

**Alternative considered: `images.remotePatterns` + `next/image`.** This is genuinely tidier in
principle — `next/image` serves through `/_next/image?url=…`, which is **same-origin**, so COEP stops
applying and `img-src 'self'` already covers it. Both problems vanish rather than being handled. Not
chosen here for two measured reasons:

- **`sharp` is not installed and `next/image` is used nowhere in this repo.** Since Next 14 removed
  squoosh, production optimization requires `sharp`, a native binary that must also trace correctly
  into `output: "standalone"` (`next.config.ts:43`). That is a new native dependency and a new build
  risk for 144 small icons.
- **It re-does work already done.** The Cloudinary URL already pins `w_256,h_256,f_png`, so the
  optimizer would fetch an optimized 256px PNG only to re-encode it.

Revisit if `next/image` is adopted elsewhere in the app — at that point `sharp` is already paid for
and `remotePatterns` becomes the cheaper of the two.

`.env.example` gains `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. All three
are validated at startup; when absent, `resolveIcon` returns the identicon and uploads are disabled —
so local development and CI need no Cloudinary account.

**Favicons come free.** `generateMetadata` sets `icons: { icon: "/api/tools/{toolId}/icon?v=…" }`, so
every tool page gets its own browser-tab icon — which no tool has today.

**Deleted by this:** `iconKey` from 43 definitions and from `ToolSpec`, `iconKeys.ts`, all four
`TOOL_ICONS` maps. **Added:** one table, one dependency (`cloudinary`), three env vars, one upload
action, one URL builder, one identicon function, one admin upload field.

> Trade-off, stated plainly: generated initials look worse than hand-picked lucide glyphs. That is the
> price of self-serve icons, and it shows only until someone uploads. If the default is unacceptable
> for the top ~20 tools, upload those during Phase 2 and let the rest ride on the identicon.

### 1.7 Two required edits to reused code — the traps

1. **`useToolRuntime.tsx` spec identity.** Effects depend on the whole `spec` object
   (`useEffect(…, [execute, input, settings, spec])`). Safe today only because all 13 specs are
   module-scoped constants. Once `ToolPage` synthesises specs per tool, an unmemoised spec is a new
   reference every render → **infinite execute loop**. Fix: build in `useMemo` keyed on
   `definitionKey`, narrow effect deps to primitives (`spec.trigger`, `spec.debounceMs`), callbacks
   in a `useRef`. ~10 lines. This is the one genuine hazard in the auto-wiring layer.
2. **`UniversalWorkbench.tsx` `SUPPORT_ITEMS`.** Hardcodes three support cards; `tools/AGENTS.md`
   already calls this transitional. Take `content` as a prop, render `howToUse`/`limitations`/privacy
   from resolved content. ~20 lines, no structural change.

### 1.8 Where the code lives

**`lib/tool-framework/`, not a package.** Root `AGENTS.md`: _"Packages must not import from the
application."_ The framework must import `components/Stacks.tsx`, `components/Surfaces.tsx`, and
`lib/devtools/shared/*`, and must be imported by app-owned `tools/*`. A package can't do that
without the forbidden cycle. The placement table's _"Domain logic reused across routes →
`lib/<domain>`"_ is the exact fit.

`packages/tool-catalog` **shrinks 782 → ~130 lines**, keeping only the pure merge/validation logic
that `packages/control-plane` and `packages/database` genuinely import: `mergeToolManifest`,
`mergeManagedTool`, `isToolAvailable`, `getEnabledTools`, `findAvailableToolBySlug`,
`isValidToolSlug`, `reservedToolSlugs`, `assertToolSlugImmutable`, `areToolSlugsUnique`, and the
`ManagedTool`/`ToolManifestEntry` types. What leaves is the ~650 lines of tuple data plus
`toolManifest`/`seededManagedTools`, now derived from `toolSpecs` in the app.
`mergeToolManifest` becomes always-two-arg. ~8 call sites, edited once.

**Files created**

```
lib/tool-framework/
  spec.ts  settings.ts  result.ts  run.ts
  categories.ts  identicon.ts  icons.ts    # identicon fallback + Cloudinary URL builder
  catalog.ts  content.ts  metadata.ts
  host.ts  useToolRun.ts  tool.worker.ts  workerProtocol.ts
  media/{validation,geometry,pdfDocument,pdfRender,imageCodec,qpdf,pdfRules,zip}.ts
  (no generated/ directory — resolution is by folder name)
components/
  ToolPage.tsx  SettingsPanel.tsx  ResultView.tsx  ToolIcon.tsx
  workspaces/{SourceResult,Generator,FileProcessor,Collection,VisualEditor}Workspace.tsx
app/sitemap.ts  app/robots.ts
app/api/tools/[key]/route.ts          # server-runtime tools
scripts/new-tool.mjs  scripts/capture-tool-fixtures.mjs
packages/database/src/{seedManagedTools.ts,toolContent.ts,toolIcon.ts}
lib/tool-framework/cloudinary.ts      # server-only: signed upload, env validation
tests/{tool-registry,tool-settings,tool-execution,tool-content}.test.mjs
```

**Files deleted**

```
lib/devtools/format-json.ts                       4218  → lib/devtools/shared/*
app/devtools/json-formatter/json-workbench.tsx    1842
app/media/components/MediaWorkbench.tsx           1788
app/media/_workers/pdf.worker.ts                  1053
app/media/_workers/image.worker.ts                 702
components/UtilityToolPrimitives.tsx               611
app/media/_lib/tools.ts                            361
tools/client-registry.ts                           116
app/media/_workers/operations.ts                        (dead routing table)
lib/tool-runtime/types.ts                               → lib/tool-framework/spec.ts
tools/*/<Name>Tool.tsx  (13)   tools/*/execution.ts   tools/*/result.ts
tests/devtools-layout-reuse.test.mjs
tests/tool-category-devtools-a.test.mjs
tests/tool-category-devtools-b.test.mjs
tests/tool-category-representatives-integration.test.mjs
tests/tool-workbench-primitives.test.mjs
tests/json-viewer-tool-pattern.test.mjs
DEVTOOLS_DEVLOG.md                                      (stale; contradicts tools/AGENTS.md)
```

**Kept verbatim:** `lib/tool-runtime/useToolRuntime.tsx` (moves, one fix above),
`components/UniversalWorkbench.tsx`, `components/Stacks.tsx`, `components/Surfaces.tsx`,
`packages/ui/*`, `workerProtocol`'s `beginWorkerJob`/`reduceWorkerJobState`/`cancelWorkerJob` and
transferable helpers, `packages/control-plane` merge flow.

---

## Part 2 — Draining `lib/devtools/format-json.ts`

Four measured regions:

| Lines     | Content                                                                                                              | Fate                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1–716     | `transformJson`, `repairJson`, `convertJsonToCsv`, `convertCsvToJson`, `summarizeJson`, `MAX_JSON_INPUT_CHARS`       | **Survives** → `lib/devtools/shared/{json,csv}.ts`. Split last, as a pure rename.                                                        |
| 717–841   | `option`/`singleTool`/`dualTool`/`generatorTool` factories + `JSON_REPAIR_OPTION`/`INDENT_OPTION`/`DELIMITER_OPTION` | Dies. **Inline** the 3 shared constants (6 lines each) into the ~28 definitions using them — one fewer file, self-contained definitions. |
| 842–2091  | `utilityToolDefinitions` (110 keys)                                                                                  | Deleted key by key.                                                                                                                      |
| 2092–3083 | `runUtilityTool` + `executeUtilityTool` (**110 arms**, matching `Object.keys(utilityToolDefinitions).length`)        | Deleted arm by arm.                                                                                                                      |
| 3084–4218 | ~90 private helpers                                                                                                  | **The actual risk.** Split by measurement, below.                                                                                        |

**Split the helpers by measurement, not guessing.** One throwaway script (scratchpad, never
committed) counts, for each helper in 3084–4218, how many `case` arms reference it:

- **1 consumer → into that tool's `run.ts`.** Expect ~50 of 90: `jsonToTypeScript`,
  `inferJsonSchema`, `xmlToJson`, `jsonToXml`, `sortJsonKeys`, `resolveJsonPath`,
  `validateJsonSchema`, `convertTextCase`, `textMetrics`, `textDiff`, `uuidV7`, `describeCron`,
  `curlAsFetch`, `curlAsAxios`, `formatHtml`, `rgbToHsl`, `LOREM_SENTENCES`, `HTTP_STATUSES`, …
- **≥2 consumers → `lib/devtools/shared/<capability>.ts`.** Expect ~9 files: `encoding.ts`
  (base64/hex/unicode/html-entity), `crypto.ts` (`getCrypto`, `secureRandomInt`, `digestText`,
  `hmacText`, `constantTimeEqual`), `table.ts` (`parseUtilityTable`, `serializeTable`,
  `tableToHtml`), `text.ts`, `color.ts`, `datetime.ts` (incl. the already-exported `nextCronRuns`),
  `curl.ts`, `code.ts`, `jwt.ts`.

This converts "split a 4218-line file safely" into a checklist, and tells you which tools must move
together (any group sharing a soon-to-be-single-consumer helper). Blast radius is small — only 5
non-test files import `format-json.ts`.

---

## Part 3 — Content CMS (DB-owned, code-fallback)

New table, additive, no change to `managed_tools`:

```sql
CREATE TABLE tool_content (
  tool_id       text PRIMARY KEY REFERENCES managed_tools(tool_id) ON DELETE CASCADE,
  category      text,          -- all nullable: NULL => fall back to definition.ts
  keywords      text[],
  seo_title     text,
  seo_description text,
  content_doc   jsonb,         -- { version, howToUse, limitations, faq, examples, relatedToolIds }
  doc_version   integer NOT NULL DEFAULT 1,
  published_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

`lib/tool-framework/content.ts` resolves per tool:

```
resolveContent(spec, row) =
  row === null || row.published_at === null   →  spec fields verbatim
  otherwise                                   →  field-by-field COALESCE(row.x, spec.x)
```

**Unpublished or absent row means the code values are used.** That is what keeps "new folder =
working tool" true under a DB-owned CMS, and it mirrors `mergeToolManifest`'s existing `seedById`
fallback rather than inventing a second merge idiom.

- `content_doc` is validated with **zod** on read (its one justified use). Invalid or
  wrong-`doc_version` → log and fall back to code. Never throw on a page render.
- `category` is validated against `TOOL_CATEGORIES` on **write** in the admin mutation and
  re-checked on read; an unknown value falls back to code. Icons are not here — they live in
  `tool_icons` (§1.7b), because bytes in a row that listings `SELECT` would be dragged on every page.
- Caching: `getTools`/`resolveToolPage` are `cache()`-wrapped per request. Admin writes call
  `revalidateTag("tool-content")`; the seven read consumers all route through `catalog.ts`, so
  invalidation has exactly one place to live.
- Admin UI: extend `app/admin/(protected)/tools/` with a content editor per tool. Draft/publish via
  `published_at`.
- **Seeds: no more hand-written SQL, ever.** `packages/database/src/seedManagedTools.ts` upserts
  from the derived manifest with `ON CONFLICT (tool_id) DO NOTHING` (never `DO UPDATE` — admin edits
  must not be clobbered by a deploy), called separately with `pnpm db:seed`.
- **Never edit an applied migration.** `0001_auth_control_plane.sql` and `0002_media_tools.sql` stay
  as historical record; `0002`'s `CHECK (app IN …)` is still load-bearing.
  `tests/database-migration.test.mjs:64-87`'s 30 character-exact tuples are replaced by a
  union-of-applied-seeds invariant (parse every `INSERT INTO managed_tools` across `migration/0001-baseline/*.sql`,
  assert the union covers the derived manifest).
- **`sort_order` collision, fix in the backfill migration.** `managed_tools` has no unique
  constraint on `(app, sort_order)`, and the existing `devtools.json-formatter` row sits at
  `sort_order = 0` while its manifest index is 2. Seeding 0..113 alongside it puts two devtools rows
  at order 0 and `getEnabledTools` sorts on `order` alone → nondeterministic catalog order.

### Slug lifecycle — generated once from the name, then frozen

| Property     | Rule                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| origin       | `spec.slug` when declared, else `slugFromName(spec.name)`                                     |
| when applied | **first insert only.** Ignored on every later deploy                                          |
| mutability   | **immutable forever.** Never regenerated, never updated, not even if the name changes         |
| uniqueness   | `unique(app, slug)`, enforced in Postgres                                                     |
| collision    | **fail the seed loudly.** Never auto-suffix — a silent `-2` URL is worse than a failed deploy |

`slug` is the one public identifier a tool may declare. Unlike `definitionKey` and the run host, it
is **not a filesystem fact** — it is a URL that can legitimately differ from the folder name, so
declaring it is meaningful rather than duplicative. Omit it and the name decides:

```ts
// tools/hmac-generator/definition.ts — omitted, derived as "hmac-generator"
name: "HMAC Generator",

// tools/dns-checker/definition.ts — declared, because the name would derive something else
slug: "dns-checker",
name: "DNS & Email Records Checker",
```

Immutability is already enforced three ways and needs no new work:
`prevent_saved_tool_slug_change` (`0001_auth_control_plane.sql:234`), `assertToolSlugImmutable`, and
the `unique(app, slug)` constraint. Generation is the only new piece: add `slugFromName(name)` to
`packages/tool-catalog`, next to the existing `TOOL_SLUG_PATTERN` / `isValidToolSlug` /
`assertToolSlugImmutable` — that module is already the slug-policy owner and is already imported by
`packages/control-plane` and `packages/database`.

**The 10 legacy mismatches declare their slug explicitly.** Measured against the current catalog: of
144 tools, `slugFromName` would produce a _different_ slug for **10**, and collides for **0**. Those
10 get an explicit `slug:` line in their `definition.ts` during migration — their live URLs are then
visible in the file that owns them, rather than depending on insertion order or an undocumented
"created before the rule" exemption.

```
csv-duplicate-remover  "CSV Duplicate Row Remover"    → csv-duplicate-row-remover
bcrypt-generator       "Bcrypt Hash Generator"        → bcrypt-hash-generator
nanoid-generator       "Nano ID Generator"            → nano-id-generator
http-status-codes      "HTTP Status Code Lookup"      → http-status-code-lookup
css-box-shadow         "CSS Box Shadow Generator"     → css-box-shadow-generator
date-difference        "Date Difference Calculator"   → date-difference-calculator
cron-builder           "Cron Expression Builder"      → cron-expression-builder
cron-parser            "Cron Expression Parser"       → cron-expression-parser
domain-age-checker     "Domain Age & WHOIS Checker"   → domain-age-and-whois-checker
dns-checker            "DNS & Email Records Checker"  → dns-and-email-records-checker
```

Those are live, indexed URLs — the explicit `slug:` is what preserves them, and the immutability rule
means it is read once and never re-applied. The other 134 omit the field entirely. Zero collisions
across 144 names says derivation holds at this scale, so new tools rarely need the escape hatch.

**Validation, enforced twice:** a declared `slug` must match `TOOL_SLUG_PATTERN` and must not be in
`reservedToolSlugs` — checked at seed time, and by `tests/tool-registry.test.mjs` so a bad value fails
before it ever reaches a database.

**The footgun, and its guard.** Because the slug is applied only at first insert, editing `slug:` in a
`definition.ts` that has already shipped does _nothing_ — the DB keeps the original, and the two
silently disagree. The seed therefore compares them and **fails loudly** on mismatch:

```
✗ tools/dns-checker: definition declares slug "dns-records-checker" but the database
  has "dns-checker". Slugs are immutable once published. Revert the definition, or
  add a redirect and retire this tool under a new toolId.
```

Loud is correct here: the alternatives are silently ignoring the developer's edit, or silently moving
an indexed URL.

### Consequence: slug ≠ folder name

Because of those 10 — and any future name edit — the public slug and the folder name are **different
identifiers that happen to match for 134 of 144 tools today.** Resolution must therefore be:

```
URL slug → managed_tools row → toolId → definitionKey → import(`tools/${definitionKey}/…`)
                                          ^ toolId.split(".")[1]
```

**Never derive the folder from the slug.** Doing so 404s those 10 tools immediately and every renamed
tool later. This is the bug `app/auth/components/AuthDiscoveryNavigation.tsx:49` already has — it
builds `/devtools/${componentKey}` from `toolManifest`, assuming the two are the same. Fix it in
Phase 1, before 144 tools make the assumption harder to find.

Corollary from `findAvailableToolBySlug`'s `matches.length === 1` guard: **never introduce a second
toolId for an existing slug, even transiently — it silently 404s a live URL.** `toolId` itself stays
frozen as `<app>.<definitionKey>`, which is what makes the folder derivable at all.

---

## Part 4 — Migration: 144 tools, one branch, phased

Branch `feat/tool-framework`. Rebase on `main` at every phase boundary; nothing else should be
landing in `tools/`, `lib/devtools/`, or `app/media/` during this window.

Since you chose **migrate-and-improve**, fixtures are **capture-then-edit**, not golden parity:

1. `scripts/capture-tool-fixtures.mjs` runs **once at the top of the branch, while the old code still
   works**, and writes `tools/<key>/fixtures.json` per tool — inputs from each definition's own
   examples and option defaults, expected output captured from the current implementation.
   `tests/json-formatter.test.mjs`'s final test (_"every locally runnable definition has a working
   example"_, ~line 605) already iterates every definition and runs it; invert it and you have the
   generator for free.
2. Where a tool's §J feature gap intentionally changes output, **hand-edit that case** and note the
   change in the PR. Everything else stays captured, so the diff between "intended change" and
   "regression" is visible in the fixture diff rather than invisible.
3. Nondeterministic tools (~15: `password-generator`, `uuid-generator`, `nanoid-generator`,
   `timestamp-converter`, `jwt-expiration-checker`, `cron-*`, …) capture
   `{ pattern, length, render }` instead of an exact string. Shape + charset, nothing more.
4. Environment-bound tools (`diagram-generator`, `dns-checker`, `domain-rating-checker`,
   `domain-age-checker`) get one hand-written error-path fixture each. The escape set already exists
   at `tests/json-formatter.test.mjs:606`.
5. `tests/tool-execution.test.mjs` (~50 lines) walks `tools/*/fixtures.json`. **Adding a tool with
   fixtures gains coverage with no test-file edit.**

### Phase order inside the branch

| #   | Phase                     | Scope                                                                                                                                                                                                                                                                                                                                                               | Notes                                                                                                                                                                                                                          |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | Test unblock              | 6 test files deleted, `tool-catalog.test.mjs` rewritten to derived invariants + one generated inventory snapshot                                                                                                                                                                                                                                                    | **Must be first.** `tests/tool-category-devtools-a.test.mjs:64` asserts the **exact directory listing** of 6 tool folders, so adding `run.ts` to `csv-filter` breaks the build before any behaviour changes.                   |
| 1   | Framework core            | Part 1.1–1.8. Resolution spike, `--webpack` removal, spec, settings, result, host, generic worker, `ToolPage`, routes, sitemap, robots, icons, categories                                                                                                                                                                                                           | No tools moved yet. Starts with the §1.5 spike. Ends with **3 pilot tools**, one per shape: `hmac-generator` (client/source-result), `merge-pdf` (worker/file-processor), `qr-code-generator` (client/generator).              |
| 2   | Content CMS               | Part 3. `tool_content` migration, resolver, zod doc validation, admin editor, `seedManagedTools`, `sort_order` fix, `0004` backfill of the 113 missing devtools rows                                                                                                                                                                                                | Independent of tool moves; can proceed in parallel with 3–5.                                                                                                                                                                   |
| 3   | Media mechanical (22)     | 8 image conversions + `remove-image-metadata` (6 identical arms), `compress-image`, `resize-image`, `rotate-image`, `flip-image`, `combine-images`, `social-media-image-resizer`, `image-to-pdf`, `pdf-to-jpg`, `pdf-to-png`, `merge-pdf`, `split-pdf`, `extract-pdf-pages`, `resize-pdf-pages`, `add-page-numbers`                                                 | **Highest tools-per-hour in the repo** — folders exist and already own their settings UI via `renderOptions`. Ends the 55-key options bag and 22 of 30 `buildJobOptions` arms.                                                 |
| 4   | Media bespoke (8)         | `compress-pdf` (qpdf/SAB + the `confirmed` guard at `MediaWorkbench.tsx:807`), `crop-pdf`, `crop-image` (crop-box readiness, `:971-995`), `watermark-pdf` (second file input, `watermarkInputId` transferable), `reorder-/delete-/rotate-pdf-pages` (post-inspection option seeding, `:720-731`)                                                                    | The 18 `definition.slug ===` branches become two folder-level hooks: `validate?.(settings, files) → string \| null` and `onPagesInspected?.(previews) → Partial<Settings>`. Serialize these.                                   |
| 5   | Foldered devtools (13)    | The 11 `createUtilityRuntimeSpec` tools + `json-viewer` + `json-formatter`                                                                                                                                                                                                                                                                                          | Lift one switch arm each into `run.ts`, options into `definition.ts`. Ends `components/UtilityToolPrimitives.tsx`. Proves a network tool (`dns-checker`) and a heavy-dep tool (`diagram-generator`, must lazy-import mermaid). |
| 6   | Monolith mechanical (~82) | Tranched **by option shape, not category** — 4a ~25 zero-option `singleTool`; 4b ~28 sharing the 3 JSON/CSV option constants; 4c ~10 `dualTool`; 4d 18 `generatorTool`; 4e ~15 text-metrics/formatters (deepest helper webs → last)                                                                                                                                 | Category tranches mix a 3-line tool with a 60-line one; option-shape tranches let one pattern be built once and repeated.                                                                                                      |
| 7   | Bespoke UI (~16)          | `color-picker`, `css-box-shadow`, `border-radius-generator`, `json-editor`, `regex-tester`, `url-query-builder`, `csv-viewer`, `html-viewer`, `jwt-expiration-checker` (live countdown), `timestamp-converter`/`iso-date-converter` (live clock), `cron-parser`, `curl-to-fetch`/`curl-to-axios`, `json-path-tester`, `json-schema-validator`, `domain-age-checker` | Each needs a real `workspace.tsx`. One at a time.                                                                                                                                                                              |
| 8   | Server tool (1)           | `domain-rating-checker` — the inlined `"use server"` Ahrefs action at `app/devtools/[slug]/page.tsx:75` (~110 lines) becomes `tools/domain-rating-checker/run.server.ts`                                                                                                                                                                                            | The one place the client/server boundary can break the build. Also the phase that removes the last `node:` import from the client graph, unblocking §1.5b. Verify with `pnpm build`, not just dev.                             |
| 9   | Conversion pair (2)       | `json-to-csv`, `csv-to-json`                                                                                                                                                                                                                                                                                                                                        | Kills `DataConversionWorkbench` and the route's second `if` branch.                                                                                                                                                            |
| 10  | Deletion + drain          | Delete all 9 files in §1.8; complete the `format-json.ts` helper split per Part 2; shrink `packages/tool-catalog` to ~130 lines; rewrite `tools/AGENTS.md` (369 → ~90)                                                                                                                                                                                              | Deletion-only, so it's trivially revertable.                                                                                                                                                                                   |

Non-tool cleanups to fold in during Phase 1: fix `app/auth/components/AuthDiscoveryNavigation.tsx`
(it imports `toolManifest` directly, bypasses the DB, assumes `slug === componentKey`, and its
`category=Web+%26+URL+Tools` link is already dead — the real category is `Web & Markup Tools`).

> ⚠️ **Coverage-gate trap, hits at the end of Phase 3.** `pnpm test:media` enforces
> `--test-coverage-lines=80 --test-coverage-branches=80` over `app/media/_lib/**` + 3 `_workers`
> files. Moving logic into `tools/*/run.ts` and `lib/tool-framework/media/*` changes the covered
> denominator and neither path is in `--test-coverage-include`. Update the globs **in the same commit
> as the first media move**, or Phase 3 blocks at the last minute.

### Effort

| Phase                        | Tools   | Days    |
| ---------------------------- | ------- | ------- |
| 0 Test unblock               | 0       | 1.0     |
| 1 Framework core + 3 pilots  | 3       | 4.0     |
| 2 Content CMS + admin editor | 0       | 3.5     |
| 3 Media mechanical           | 22      | 1.5     |
| 4 Media bespoke              | 8       | 3.5     |
| 5 Foldered devtools          | 13      | 2.0     |
| 6 Monolith mechanical        | 82      | 6.5     |
| 7 Bespoke UI                 | 16      | 3.5     |
| 8 Server tool                | 1       | 0.5     |
| 9 Conversion pair            | 2       | 1.0     |
| 10 Deletion + drain          | 0       | 1.5     |
| **Total**                    | **144** | **~28** |

Add ~15% for the §J feature work folded into phases 3–9 (migrate-and-improve). ~7 weeks solo.

---

## Part 5 — Test strategy

Six magic counts (`114`×2, `30`×4) → **zero**. Five inventories → **one generated source**.

| File                                                 | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/tool-registry.test.mjs` **new**               | **the no-tool-identity-in-shared-code invariant above** — the single most important assertion in the suite; plus: folder ↔ spec ↔ toolId bijection; keys and toolIds unique; **no definition declares `definitionKey` or a `runtime` field** (both are filesystem facts); every folder has **exactly one** of `run.ts`/`run.worker.ts`/`run.server.ts`; folder name matches `TOOL_SLUG_PATTERN`; every `category` ∈ `TOOL_CATEGORIES`; **no definition declares `iconKey`** (icons are uploaded data, §1.7b); every `layout` known; a declared `slug` matches `TOOL_SLUG_PATTERN` and is not reserved; **no `run.server.ts` importable from a client or worker context** (verified by asserting the server files' import graph never reaches `tool.worker.ts` or a `"use client"` module) |
| `tests/tool-settings.test.mjs` **new**               | every spec's defaults round-trip through `parseSettings`; every kind ∈ closed union; `visibleWhen.key` exists in the same spec; select/preset choices non-empty and contain the default; `pages` defaults parse                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tests/tool-execution.test.mjs` **new**              | walks `tools/*/fixtures.json`, runs each case through that tool's `run`. Zero-edit coverage for new tools                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `tests/tool-content.test.mjs` **new**                | absent row → code values; unpublished row → code values; partial row → per-field coalesce; invalid `content_doc` → falls back, does not throw; unknown `category` → falls back                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `tests/tool-icon.test.mjs` **new**                   | no row → identicon, deterministic per toolId and stable across runs; missing Cloudinary env → identicon, uploads disabled, no throw; the built URL always pins `f_png` and includes the version segment; an SVG upload is rejected before it reaches Cloudinary; >1 MB is rejected; upload options always carry `resource_type: "image"` and `format: "png"`                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `tests/tool-catalog.test.mjs` **rewrite**            | merge semantics only — DB overrides seed, invalid slug → `null` → disabled, archived disables, per-app slug uniqueness, `assertToolSlugImmutable`, reserved slugs, unknown toolId dropped. Counts as `specs.length === manifest.length`, never `114`/`30`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `tests/media-processing-rules.test.mjs` **retarget** | keep every validator/limits/preset/geometry/`pdfRules`/jobId-reducer test (these are the repo's crown jewels) retargeted to `lib/tool-framework/media/*`; drop the two `30` literals and the `new Worker(` count                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tests/database-migration.test.mjs`                  | keep SQL constraints + the immutability trigger; replace the 30 character-exact tuples with the union-of-applied-seeds invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tests/control-plane-admin.test.mjs`                 | keep reorder-completeness behaviour; derive the tool list from the manifest, drop `toolIds.length === 30`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

The 6 deleted test files all `readFile` source and regex for component names, JSX text, import
statements, and Tailwind pixel values — which root `AGENTS.md` explicitly forbids: _"Do not add tests
that read source files and assert imports, component names, JSX text, utility classes… Enforce
architecture boundaries with typechecking, linting, or dependency tooling instead of source-text
assertions."_ The generated registry plus `tsc --noEmit` enforces those boundaries properly.

**Keep untouched:** `workspace-structure`, `single-app-architecture` (its COOP/COEP assertion is
load-bearing for qpdf), `frontend-config`, `authorization`, `auth-*`, all `paperwork-*`, `invoice-*`,
`template-*`, `document-template-model`, `published-templates`, `admin-audit`, `feature-flags`,
`postgres-integration`, `ui-class-merging`, `design-system-alignment` (unless its
_"tool routes share the design-system page shell"_ test reads route source — delete that one test if so).

---

## Verification

**Per tool, seconds:**

```bash
pnpm lint                       # tsc --noEmit — the real type gate (next build ignores errors)
node --test tests/tool-execution.test.mjs tests/tool-registry.test.mjs tests/tool-settings.test.mjs
```

**Per phase boundary:**

```bash
pnpm test
pnpm test:media                                  # watch the coverage denominator
pnpm build                                       # catches client/server boundary + worker chunking
pnpm dev                                         # Turbopack — the context/dynamic-import path (see §1.5 spike)
pnpm test:e2e
```

`pnpm dev` is a real gate here, not a formality: dev and build use different bundlers and this design
depends on both resolving dynamic paths. A green `build` proves nothing about `dev`.

Manual smoke at every boundary — the three permanently-suspicious paths:

1. **`compress-pdf` strong mode** — `crossOriginIsolated` / `SharedArrayBuffer` / qpdf. Check
   `crossOriginIsolated === true` in the console on `/media/compress-pdf`.
2. **`domain-rating-checker`** — the only server-runtime tool.
3. **A PDF page-preview tool** (`reorder-pdf-pages`) — `pdfjs-dist` worker-src resolution inside the
   generic worker.

**Definition of done — every item runnable:**

```bash
test ! -f tools/client-registry.ts
test ! -f lib/devtools/format-json.ts
test ! -f app/devtools/json-formatter/json-workbench.tsx
test ! -f app/media/components/MediaWorkbench.tsx
test ! -f app/media/_workers/pdf.worker.ts
test ! -f app/media/_workers/image.worker.ts
test ! -f app/media/_lib/tools.ts
test ! -f components/UtilityToolPrimitives.tsx
[ "$(ls -d tools/*/ | wc -l)" -eq 144 ]
[ "$(ls app/media/_workers/*.worker.ts 2>/dev/null | wc -l)" -eq 0 ]   # one worker, in lib/tool-framework
! grep -rn 'TOOL_ICONS\|iconKey' app components lib tools packages   # icons are data now
grep -q 'res.cloudinary.com' next.config.ts                          # img-src widened for CDN
grep -q 'crossOrigin' components/ToolIcon.tsx                        # COEP: CORS mode on /media/*
! grep -rn 'CLOUDINARY_API_SECRET' app components tools               # server-only, never bundled
test ! -d lib/tool-framework/generated        # nothing generated, nothing to keep in sync
test ! -f scripts/generate-tool-registry.mjs

# the invariant — no shared file names or dispatches on any tool
! grep -rn 'componentKey ===\|definition.slug ===\|operation ===' app/ components/ lib/
! grep -rn 'runtime:' tools/*/definition.ts   # runtime is a filesystem fact, never declared
node --test tests/tool-registry.test.mjs      # includes the tool-identity-leak scan
```

Plus: every one of the 144 specs has a `fixtures.json`; `app/sitemap.ts` lists every enabled tool;
`git grep` finds zero hits for `runUtilityTool`, `utilityToolDefinitions`, `createUtilityRuntimeSpec`,
`buildJobOptions`, `createDefaultOptions`, `normalizeUtilityOptions`, `getUniversalToolWorkbench`,
`getMediaToolWorkspace`, `MediaJobOptionsByOperation`; and a click-through of one page per category
(12 devtools + 5 media = 17 pages).

**Line accounting:** ~11,500 lines of central machinery replaced by per-tool folders that already
exist for 43 of 144 tools, plus ~590 lines of deleted tests. Net repo lines should drop.

**Explicitly out of scope:** the 7 paperwork tools; `generateStaticParams`; unifying the three URL
scopes (COOP/COEP forbids it); replacing `useToolRuntime` or `UniversalWorkbench`; a media pixel-diff
harness.
