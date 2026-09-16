# Tool Platform Architecture and Full Migration Plan

## Status and relationship to the existing plan

This is a separate follow-up plan. It does not modify
`plans/tool-runtime-architecture.md`.

The existing plan remains the source for:

- the audit of all 144 non-Paperwork tools;
- the five unique layout families;
- the initial reusable runtime direction;
- the approved custom-UI candidates;
- the detailed per-tool feature research in `TOOL_FEATURE_SPECS.md`.

This plan resolves the remaining architecture decisions before implementation:

1. how custom tool UI fits without creating more layouts;
2. how the flat `tools/<definition-key>/` hierarchy works;
3. how server, client, worker, and server-action boundaries stay valid;
4. how results remain strongly typed;
5. how all 144 tools move through a sequential, verifiable migration;
6. how future features extend the system without another platform refactor;
7. how the database owns catalog and page content, not only visibility.

Paperwork is explicitly outside this plan.

---

## 1. Fixed decisions

### Scope

- Migrate all 144 non-Paperwork tools:
  - 114 DevTools;
  - 30 Media tools.
- The migration is incremental for safety, but it is not a pilot and does not
  finish until every one of the 144 tools is migrated and verified.
- Feature improvements may be delivered during migration when they are required
  for parity or for the new layout contract. Unrelated quality upgrades remain
  a separate backlog.

### Five layouts

The platform has exactly five operation-level layouts:

| Layout                   | Current coverage | Operation model                                     |
| ------------------------ | ---------------: | --------------------------------------------------- |
| `SourceResultWorkbench`  |      96 DevTools | Enter or load a source and inspect a result         |
| `GeneratorWorkbench`     |      18 DevTools | Configure values and generate an artifact or value  |
| `FileProcessorWorkbench` |         10 Media | Upload file or files, process, and download results |
| `CollectionWorkbench`    |         10 Media | Manipulate an ordered collection of pages or files  |
| `VisualEditorWorkbench`  |         10 Media | Directly manipulate a visual object and export it   |

A visual permutation, different setting list, different renderer, or different
preview does not create a sixth layout. A new layout is justified only if a
future tool introduces a genuinely different operation model.

### Ownership goal

Each tool owns:

- its stable definition key;
- its runtime logic;
- input and setting contracts;
- defaults;
- result contract;
- capabilities;
- optional operation-specific surface adapter;
- safe fallback content used for bootstrap and recovery.

The platform owns:

- page composition;
- layout and responsive behavior;
- field and setting rendering;
- lifecycle state and UI visibility;
- live/manual execution behavior;
- debounce, cancellation, progress, stale-result prevention, and recovery;
- validation presentation;
- result presentation;
- download/copy/export actions;
- analytics and accessibility conventions.

The database owns the effective published catalog and page content described in
section 5.

---

## 2. Custom UI without custom layouts

Skipping all custom UI would force direct-manipulation tools into generic text
fields and generic result panes. That would make tools such as the color picker,
gradient editor, box-shadow editor, border-radius editor, JSON editor, regex
tester, and structured viewers materially worse.

The solution is to keep custom UI but constrain its ownership. Custom UI is an
adapter mounted inside one of the five layouts; it is not a replacement page or
a sixth layout.

### Three extension tiers

Use the smallest tier that supports the tool:

| Tier | Extension           | May customize                             | Must remain layout-owned                                                    |
| ---- | ------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| 1    | Result renderer     | Output visualization only                 | Inputs, settings, execution, status, actions                                |
| 2    | Input surface       | The direct input/editor surface only      | Settings, execution, status, result actions                                 |
| 3    | Interaction surface | The central direct-manipulation workspace | Page shell, lifecycle, settings boundary, feedback, recovery, final actions |

Approved examples from the earlier plan are classified as follows:

- Result renderers:
  - JWT decoder;
  - text diff checker;
  - CSV viewer;
  - JSON viewer;
  - diagram generator;
  - Open Graph preview;
  - checksum rows.
- Input surfaces:
  - regex tester;
  - URL query builder.
- Interaction surfaces:
  - color picker;
  - gradient generator;
  - CSS box-shadow generator;
  - border-radius generator;
  - JSON editor;
  - JSON formatter;
  - JSON to CSV;
  - CSV to JSON.

The classification can be corrected during the golden-tool validation if an
approved tool fits a smaller tier. Moving downward is allowed; silently
promoting a tool to a more powerful tier is not.

### Interaction-surface contract

An interaction surface receives normalized state and callbacks from its layout.
It can render and edit the operation-specific object, but it must not own:

- route or page metadata;
- global settings panel visibility;
- async lifecycle state;
- cancellation or stale-run handling;
- completed, empty, validation, processing, or error state conventions;
- download, copy, print, or export placement;
- responsive page framing.

This preserves the user's goal: tool authors write logic, options, and any
irreducibly custom interaction; the layout decides what UI is visible for each
lifecycle state.

### Governance

- Renderer, input-surface, and interaction-surface keys are closed,
  type-checked registries.
- The approved Tier 3 list is locked by an architecture test.
- Adding a Tier 3 adapter requires an operation-model note explaining why Tier 1
  or Tier 2 cannot represent the tool.
- Database content can never select a React component or arbitrary registry key.
- Custom surfaces use shared design-system primitives and remain subject to the
  same end-user and UI validation as standard layouts.

---

## 3. Flat tool hierarchy

The approved structure is one flat application-owned root:

```text
tools/<definition-key>/
```

There is no `tools/devtools/` or `tools/media/` nesting. The folder name is a
stable definition key, not necessarily the current public route slug.

Because the repository's current placement rules do not list a root `tools`
directory, implementation must first document `tools/` as an intentional,
first-class application-owned boundary. It is not a workspace package and must
not be imported by `packages/*`.

### Folder responsibilities

A normal folder contains only what that tool needs:

- a definition describing its app, layout, inputs, settings, capabilities,
  result kinds, and fallback content;
- a client runner, worker operation mapping, or server executor reference;
- optional media job-option mapping;
- optional renderer, input surface, or interaction surface from the approved
  extension model;
- focused fixtures used for parity verification.

Files are optional by capability. A simple synchronous formatter should not
receive media, worker, server, or custom-UI scaffolding.

### Definition key versus public slug

These are separate identities:

- `definitionKey`: immutable, code-owned, equal to the flat folder name;
- `toolId`: immutable cross-system identity;
- `publicSlug`: DB-owned route value within an app.

Route resolution is:

1. resolve `app + publicSlug` through the control plane;
2. obtain the stable `definitionKey`;
3. load `tools/<definitionKey>`;
4. merge DB content with the code runtime contract;
5. dispatch the resolved definition to one of the five layouts.

Code must never dynamically import a folder using an untrusted DB slug.

### Registry generation

Adding a tool should require adding its folder, not editing a central switch or
large manifest by hand. A deterministic registry generator should:

- discover immediate folders under `tools/`;
- emit explicit server-safe and client-lazy registries required by the bundler;
- reject duplicate definition keys and tool IDs;
- reject missing required exports;
- keep executor code out of server metadata bundles and unrelated client
  bundles;
- fail CI when generated registry state is stale.

The generated registry is an implementation artifact, not a second source of
truth.

---

## 4. Runtime and rendering architecture

### Architecture layers

| Layer             | Responsibility                                              | Source of truth                       |
| ----------------- | ----------------------------------------------------------- | ------------------------------------- |
| Control plane     | Resolve enabled tool and published content                  | Database with code fallback           |
| Runtime registry  | Load safe executable definition by stable key               | `tools/<definition-key>`              |
| Layout runtime    | Lifecycle, visibility, orchestration, workspace composition | Shared layout code                    |
| Execution adapter | Sync, client async, worker, or server execution             | Tool definition plus platform adapter |
| Renderer registry | Render typed results                                        | Shared registered renderers           |

### Server/client serialization boundary

The system must not pass React components, functions, Zod instances, browser
`File` objects, worker instances, or server actions through a Server Component
serialization boundary.

Use three distinct contracts:

1. **Resolved page model**
   - server-safe and serializable;
   - contains effective DB catalog/page content, app, public slug, tool ID, and
     definition key.
2. **UI definition**
   - loaded on the client from the trusted definition-key registry;
   - contains inputs, settings metadata, defaults, layout, renderer keys, and
     capability declarations.
3. **Execution binding**
   - loaded in its correct environment;
   - may be client sync/async logic, a worker operation, or a server executor
     key resolved by a server-only registry.

Server actions are injected through an explicit server-owned adapter. They are
never imported into a client definition. Worker constructors remain in the
media worker boundary so bundling and cross-origin behavior remain intact.

### Lifecycle and UI visibility

All five layouts implement the same high-level lifecycle:

- `idle`;
- `invalid`;
- `ready`;
- `running`;
- `completed`;
- `failed`;
- `cancelled`, when supported.

Capabilities and lifecycle determine visibility. Examples:

- the primary action is visible when the tool is manual and the normalized
  input is runnable;
- cancellation is visible only while a cancellable run is active;
- progress is visible only for a progress-capable execution;
- copy is visible only for compatible completed results;
- downloads are visible only when the completed typed result contains
  artifacts;
- recovery remains visible in failed states;
- stale completions never replace the newest run.

Tools declare capabilities and return typed results. They do not contain
per-tool `showDownload`, `showProgress`, or `showErrorPanel` flags.

### Strongly typed result model

Replace `details?: unknown` with a discriminated result union. The initial
result families must cover:

- plain text and code;
- structured JSON tree;
- table or key/value data;
- validation verdict and positional issues;
- structured diff hunks;
- image or visual preview;
- statistics and metrics;
- one downloadable artifact;
- multiple downloadable artifacts;
- structured multi-section output.

Each result family owns the fields its renderer requires. Shared fields such as
warnings, timing, or recovery information are explicit and typed. Adding a
future renderer means adding a result variant and its registered renderer, not
placing arbitrary data in an escape-hatch object.

### Settings and future field types

Settings remain schema-validated and declaratively rendered. The architecture
supports a closed registry of field kinds, including:

- text, number, select, checkbox, toggle, slider, preset;
- password, color, and date;
- conditional visibility;
- repeatable key/value groups;
- file-backed source input;
- collection-item controls.

Unknown field kinds fail definition validation. New reusable field kinds extend
the field registry once and become available to every layout.

---

## 5. Database-owned catalog and page content

### Current baseline

The existing `managed_tools` data currently controls only:

- public slug;
- display name;
- description;
- sort order;
- enabled and archived state.

Category, keywords, page SEO, how-to content, related tools, examples, FAQ,
featured/popular lists, and parts of global search remain static or bypass the
resolved control-plane record. Media SEO is currently static, and DevTools does
not have equivalent per-tool dynamic metadata.

The migration expands the DB boundary so all catalog and page consumers use one
resolved record.

### DB-owned fields

The database owns effective publication and content:

- public slug;
- display name;
- catalog description;
- category;
- search keywords;
- catalog sort order;
- enabled and archived state;
- featured or promoted placement;
- SEO title, description, and keywords;
- how-to-use steps;
- related tool references;
- examples;
- FAQ;
- optional page-level limitations, privacy, and supporting copy;
- draft/published state and content version where admin publishing requires it.

Related tools are stored by stable `toolId`, not public slug.

### Code-owned fields

The database must not configure executable or security-sensitive behavior:

- tool ID, app, and definition key;
- layout kind;
- input and settings schema;
- defaults that affect processing;
- renderer and result contracts;
- capabilities and interaction model;
- executable runner, worker operation, or server executor;
- file engine, accepted types, maximum sizes, and trust-boundary validation;
- media job-option mapping;
- React component or adapter selection.

These remain in the flat tool folder.

### Recommended storage boundary

Keep frequently filtered catalog data as typed columns:

- category reference;
- keywords;
- featured/promoted state;
- existing slug, order, visibility, archive, name, and description fields.

Store structured page content in a versioned, schema-validated document:

- SEO content;
- how-to steps;
- related tool IDs;
- examples;
- FAQ;
- limitations, privacy, and supporting copy.

If category names, descriptions, icons, and order must also be managed by admin,
use a small category table. Icon values remain constrained to code-known icon
keys.

### Resolution and fallback

The effective page model is resolved from:

1. the code registration and safe fallback content;
2. the matching managed-tool DB row;
3. the currently published, schema-valid page content;
4. category content and related tools.

An invalid optional content document does not make the tool executable with
unknown state. The control plane reports the validation problem, retains an
auditable failure, and uses the last valid published content or safe fallback.

Fallback content is retained for:

- database bootstrap and seed;
- local development;
- controlled recovery from missing optional rows;
- parity verification during migration.

The end state is that production catalog and page content come from the DB; the
fallback is not a competing editable source.

### Slug policy

The current safeguards remain:

- slug format and reserved-route validation;
- uniqueness within the app;
- enabled tools require a slug;
- archived tools cannot be enabled;
- archive disables the tool.

Initial public slugs remain DB-configured. If post-publication slug editing is
introduced later, it must atomically record the old slug as a permanent redirect
and preserve canonical and related-tool behavior. Folder names never change
because a public slug changes.

### Consumers that must use the resolved model

- DevTools catalog;
- Media catalog;
- both `[slug]` routes;
- both pages' metadata generation;
- global/authenticated discovery search;
- featured and popular sections;
- related-tools sections;
- admin preview;
- sitemap and any future discovery feeds.

No consumer may import the static manifest for user-visible name, description,
category, keywords, slug, or visibility after cutover.

### Caching and publishing

- Deduplicate page and metadata lookup within a request.
- Cache by app, tool ID, public slug, and publication version.
- Admin publication invalidates the affected tool route, both relevant catalog
  surfaces, global discovery, related-tool consumers, and sitemap metadata.
- Admin mutations remain permission-checked, transactional, and audited.
- Page content is validated before publication, not after a visitor requests it.

---

## 6. Full migration strategy

### Migration principle

We will validate vertically and migrate sequentially, but plan and track all 144
tools from the beginning.

The unit of cutover is one verified tool. The unit of delivery is a complete
tranche. The terminal condition is all 144 tools migrated, all legacy
dispatch/registries removed, and all shared consumers reading the resolved
control-plane model.

### Temporary compatibility mechanism

During migration, route resolution may select either the legacy implementation
or the new definition by a code-owned migration status. This status is not an
admin setting and does not live in page-content DB data.

Each tool moves through:

1. inventoried;
2. content backfilled;
3. definition mapped;
4. behavior parity proven;
5. new runtime enabled;
6. visual and end-user flow verified;
7. legacy path removed.

A generated migration ledger covers every non-Paperwork manifest entry and
prevents silently forgotten tools.

### Phase A — Architecture contracts

Finalize before changing a route:

- definition and folder conventions;
- five-layout discriminated union;
- typed settings and result families;
- custom UI tier contracts and approved list;
- execution-environment contracts;
- resolved DB page model;
- DB content schemas and publication policy;
- generated registry design;
- migration ledger and acceptance gates.

Exit criteria:

- every current tool can be represented on paper;
- no current tool requires an untyped escape hatch;
- no DB field can select executable code;
- server/client/worker boundaries are explicit.

### Phase B — Database and control-plane foundation

1. Add nullable catalog columns and versioned page content.
2. Add category management if category content is required in admin.
3. Backfill all 144 records from current catalog and page definitions.
4. Validate the backfill against the current visible catalog and routes.
5. Expand admin edit, preview, publication, permissions, and audit coverage.
6. Update cache invalidation.
7. Keep current merge fallbacks while consumers transition.

Exit criteria:

- all 144 tools have valid resolved catalog/page records;
- enabled/archived/slug invariants still hold;
- invalid page content cannot be published;
- no public UI has changed yet.

### Phase C — Runtime foundation

Build the shared contracts and lifecycle without switching all tools:

- definition validation;
- generated server and client registries;
- settings normalization;
- lifecycle state machine;
- execution adapters;
- typed result renderers;
- five layout dispatch entries;
- DB-to-definition resolution by stable definition key.

Exit criteria:

- architecture tests enforce five layouts and custom tier rules;
- registries cannot import by DB slug;
- server/client serialization tests pass;
- lifecycle tests cover cancellation, staleness, validation, failure, and retry.

### Phase D — Golden vertical slices

Migrate a deliberately difficult representative set:

- one normal source-result tool;
- one generator;
- one file processor;
- one collection tool;
- one visual editor;
- one server-action tool;
- one worker tool with progress and cancellation;
- one Tier 1 result renderer;
- one Tier 2 input surface;
- one Tier 3 interaction surface.

These are architecture validation gates, not the final migration scope. Findings
change shared contracts before bulk migration.

Exit criteria:

- all five layouts work end to end;
- all execution environments work;
- all three custom UI tiers work without taking ownership away from layouts;
- DB content drives route copy, SEO, catalog, and discovery;
- UI and end-user validators pass the changed flows.

### Phase E — DevTools migration

Migrate in category-sized tranches:

1. JSON and structured-data tools;
2. converters and encoding tools;
3. hashing, security, and validation tools;
4. text and comparison tools;
5. web, URL, time, and miscellaneous utilities;
6. generators;
7. remaining approved custom-surface tools.

For each tool:

- create its flat folder;
- move logic without changing behavior first;
- declare inputs, settings, trigger, result, and capabilities;
- add old-versus-new fixture parity tests;
- switch only after parity;
- run layout and page-content checks;
- remove its legacy switch branch after tranche verification.

Exit criteria:

- all 114 DevTools use the new registry and layouts;
- the monolithic tool switch and route if-chain are gone;
- DevTools catalog, route copy, SEO, search, and related tools use resolved DB
  content.

### Phase F — Media migration

First extract and verify shared worker, file-queue, object-URL, collection, and
preview behavior without changing visible flows. Then migrate:

1. ten file processors;
2. ten collection tools;
3. ten visual editors.

For each tool:

- create its flat folder;
- move its job-option mapping;
- retain existing validation and worker trust boundaries;
- prove output parity with fixtures or worker tests;
- verify upload, interaction, processing, cancellation, recovery, completion,
  and download;
- remove its old slug branch after tranche verification.

Exit criteria:

- all 30 Media tools use the three media layouts;
- the monolithic media workbench and central per-slug branches are gone;
- Media catalog, route copy, SEO, search, and related tools use resolved DB
  content.

### Phase G — Platform cutover and cleanup

- Require a valid flat-folder definition for every enabled non-Paperwork DB row.
- Switch every public consumer to the resolved control-plane model.
- Remove the compatibility selector and fallback dispatch.
- Remove duplicated static user-visible metadata from legacy registries.
- Keep only safe bootstrap fallback content in tool definitions.
- Remove dead workbenches, switches, and bridge adapters.
- Make DB fields non-null only after all environments are backfilled and verified.

Exit criteria:

- exactly 144 non-Paperwork tools are registered and resolved;
- every tool maps to one of five layouts;
- every public route, catalog, search result, and metadata response uses resolved
  DB content;
- no legacy tool path remains;
- Paperwork is unchanged.

### Phase H — Feature improvements

After migration parity, deliver remaining improvements from
`TOOL_FEATURE_SPECS.md` by priority. They use the established extension points:

- new setting kind;
- new typed result and renderer;
- new input or interaction surface;
- new capability;
- new executor adapter;
- tool-local logic change.

A sixth layout is considered only when none of these represents the new
operation model truthfully.

---

## 7. Future-proofing boundaries

Future compatibility comes from a small number of deliberate extension axes,
not arbitrary configuration:

- versioned tool-definition contract;
- versioned DB page-content contract;
- closed setting-field registry;
- closed typed-result and renderer registry;
- capability declarations;
- three governed custom-UI tiers;
- environment-specific execution adapters;
- stable tool IDs and definition keys separate from public slugs;
- generated registries and coverage tests.

The architecture deliberately does not include:

- arbitrary React components selected from the DB;
- arbitrary executable expressions in JSON configuration;
- a general-purpose page-builder schema;
- untyped result payloads;
- one mega-layout with per-tool conditionals;
- one central mega-runner switch;
- speculative layout families for future tools.

This allows future features without creating a second platform inside the first.

---

## 8. Verification and acceptance

### Architecture tests

- every non-Paperwork catalog registration has exactly one flat tool folder;
- every flat tool folder has one stable tool ID and definition key;
- every definition uses one of the five layouts;
- every definition's defaults pass its settings schema;
- every result variant has a registered renderer;
- every custom surface is in the approved tier registry;
- server-only definitions cannot enter client registries;
- DB public slugs cannot be used as dynamic import paths;
- no Paperwork registration is included.

### Database and consumer tests

- all 144 tools backfill successfully;
- DB category, keywords, name, description, order, and visibility affect both
  catalogs and search;
- DB page content affects headings, SEO, how-to, related tools, examples, and
  FAQ;
- related tools survive public-slug changes because they use stable IDs;
- invalid drafts cannot publish;
- admin publish invalidates all affected caches;
- missing optional DB content falls back safely;
- unknown DB definition keys fail closed.

### Per-tool parity

- representative fixtures produce equivalent old and new outputs;
- validation and option normalization remain equivalent;
- server and worker operations preserve security and file-size checks;
- live tools preserve intended debounce behavior;
- manual tools preserve action behavior;
- copy, download, print, and export actions remain complete.

### Flow validation

Every materially changed tool flow receives:

- problem-fit review;
- new-user feasibility review;
- five-second scanability review;
- feedback and recovery review;
- responsive and accessibility review;
- fresh screenshots;
- repo-required `ui_validator` and `end_user_validator` passes.

### Required implementation checks

Run the narrowest relevant checks during each tool migration, then the full
repository checks at each tranche boundary:

- repository tests;
- lint;
- affected media tests and Playwright coverage;
- build when runtime, routing, metadata, registry generation, or configuration
  changes;
- diff and working-tree hygiene checks.

No tranche is complete while substantive validator findings or parity failures
remain.

---

## 9. Final completion definition

This project is complete only when:

- all 144 non-Paperwork tools live under the flat `tools/<definition-key>/`
  hierarchy;
- all of them dispatch through one of the five layouts;
- approved custom UI is implemented only through the three governed tiers;
- layouts own lifecycle-driven UI visibility and final actions;
- tool folders own logic, settings, results, capabilities, and optional custom
  operation surfaces;
- catalog and page content are DB-managed through one resolved control-plane
  model;
- executable behavior remains code-owned;
- old route conditionals, mega-switches, duplicated public metadata, and
  compatibility bridges are removed;
- all architecture, parity, flow, accessibility, and repository checks pass;
- Paperwork remains untouched.
