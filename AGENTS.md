# Repository Guidelines

## Scope and Working Rules

This file is the repository-wide baseline. Read the nearest `AGENTS.md` before editing. Add a nested `AGENTS.md` only when an app or package has genuinely different commands or constraints, and put only those differences in it.

Before changing code:

1. Inspect `git status --short` and preserve unrelated work.
2. Search the target app and `packages/*` for an existing component, helper, type, schema, or pattern.
3. Trace the callers and consumers of code being changed.
4. Make the smallest change that solves the current task; do not add scaffolding for possible future work.

Do not reorganize unrelated existing files during feature or bug work. New code must follow the structure below. When moving code, update every import, remove the old file, and avoid compatibility re-exports unless the old path is a real public API.

## Monorepo Boundaries

This is a pnpm monorepo with one Next.js application:

- `app`, `lib`, `db`, and `public` — the root SmartTools application, including `/paperwork`, `/devtools`, `/media`, `/auth`, and `/admin` route scopes (port 3000).
- `tools/*` — flat, application-owned tool definitions, execution adapters, and optional tool-owned workspaces keyed by stable definition key.
- `packages/*` — code genuinely shared by multiple workspaces or a named standalone capability.
- `services/*` — independently running backend services only, not shared helpers.
- `tests/*` — repository-level regression and architecture tests.

Do not create a root-level `src`, a top-level `components` folder for one route scope, or a vague `shared` directory. Do not create empty directories.

The application does not use Next.js's optional `src` directory. Keep runtime code in the root-owned directories above. Packages must not import from the application. Cross-workspace dependencies flow from the application or services into packages and must not form cycles.

## Mandatory File Placement

Place code at the narrowest scope that owns it. Promote code only when a real second consumer needs it.

| Code ownership | Location |
| --- | --- |
| Small helper, type, or constant used by one file | Keep it in that file |
| Used only by one route scope | `app/<route>/components`, `app/<route>/lib`, or `app/<route>/hooks` |
| UI reused across unrelated route scopes | `components/<domain>` |
| Domain logic or an integration reused across routes | `lib/<domain>` |
| Small pure, domain-neutral helper reused across routes | `utils/<capability>.ts` |
| Database client, schema, or bootstrap code | `db` and server-only modules |
| Static browser-served asset | `public` |
| Used by the application and a service or multiple packages | Existing `packages/<capability>` package; create one only when no package fits |
| One tool's definition, execution adapter, result contract, or complete left workspace | `tools/<definition-key>` |
| Repository regression test | `tests/*.test.mjs` |

`app` owns Next.js routing: `page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`, and colocated implementation folders. Route handlers and pages should be thin adapters; reusable logic belongs at the ownership level above. Use `(group)` only to organize routes without changing URLs. A folder without a `page.tsx` does not create a public route.

`utils` is not a dumping ground. Business rules, storage, API clients, database access, and feature-specific transformations belong in `lib/<domain>` or the route's `_lib`. Prefer descriptive names such as `currency.ts` or `invoiceTotals.ts`; do not add vague `helpers.ts`, `common.ts`, `misc.ts`, or a second catch-all `utils.ts`.

Do not create a standalone file for a one-use wrapper, interface, constant, or trivial function. Do not add app-internal barrel files merely to shorten imports. A package entry point may re-export its intentional public API.

## Shared Code and Dependencies

- Reuse an existing helper when it has the same responsibility; do not force unrelated behavior into it merely to avoid a new file.
- Do not create vague packages such as `packages/shared`, `packages/common`, or `packages/utils`. Name a package after a stable capability.
- Consumers must declare workspace packages in their own `package.json` with `"workspace:*"` and import the package name. Never deep-import another workspace's source or use TypeScript `paths` to imitate a package dependency.
- The root application and every package declare the runtime and development dependencies they import.
- Use pnpm only. Add a dependency to its owning workspace with `pnpm --filter <workspace> add <package>`; do not hand-edit `pnpm-lock.yaml`.
- Before adding a production dependency, prefer the standard library, the web/Next.js platform, or an already-installed dependency. Record the reason when a new dependency is necessary.

## Next.js and TypeScript Rules

- Default to Server Components. Add `"use client"` only at the smallest interactive boundary.
- Keep secrets, database access, and server-only dependencies out of Client Components.
- Validate request params, headers, and bodies at route-handler boundaries before calling domain logic.
- Use TypeScript and ESM imports. Avoid `any`; when legacy code already uses it, do not spread it into new boundaries.
- Use the root application's existing `@/*` alias for application-owned modules.
- Component and type names use PascalCase; functions and variables use camelCase; constants use `UPPER_SNAKE_CASE`; route directories use kebab-case.
- Component files use `PascalCase.tsx`; non-component TypeScript files follow the nearby convention and use descriptive names.

## UI and Design-System Rules

- Use shared design-system tooltips for hover and keyboard-focus help, never native HTML `title` attributes. Prefer a shared control's `tooltip` prop over repeating tooltip wrappers; scope `TooltipProvider` around a group. Keep disabled-control help keyboard-accessible and show essential descriptions inline. Semantic component props such as a page heading's `title` are unaffected.
- Design page layouts around content relationships and available space. Keep related headings, filters, actions, and supporting content inline or in responsive grids when that improves scanning and space use; stack them into full-width rows only when the content or viewport requires it. Do not default to a repetitive row-after-row layout.
- Before creating or redesigning UI, inspect the existing reusable components and design tokens in the relevant codebase or `.pen` document.
- Reuse existing design-system components through real component instances or references. Do not create hand-built visual lookalikes for an available header, footer, button, input, select, textarea, toggle, checkbox, alert, badge, card, table row, navigation item, workbench, or other reusable component.
- When the same meaningful UI pattern appears three or more times, extract or extend a reusable design-system component before creating more copies. Document it in the component library and build subsequent uses as instances with page-specific overrides.
- A shared workbench or component-family overview does not replace page coverage. When the task requires every implemented route or tool page, create and clearly label a separate complete page design for each route, while instancing the shared family component inside each page.
- Preserve all previously created designs. Do not delete an existing page, screen, state, workbench, component, or design section unless the user explicitly requests deletion. Refactor in place or add new coverage instead.
- Page-specific content, controls, states, and results must remain tailored to the implemented feature even when pages share the same reusable shell.
- Every tool type must pass an operation-model gate before visual polish is accepted. State the tool's primary verb, manipulated object, natural direct interaction, expected content geometry and density, workspace ownership, recovery, and final action. A coherent generic shell, navigator, metadata recap, or placeholder does not pass when the job requires direct manipulation, selection, editing, comparison, generation, or a real preview.
- Treat the main workspace as the task surface: it must show the real input, object, editor, selection surface, preview, or result content required by the tool. Persistent configuration belongs in the settings panel. Completion facts and artifact actions must follow the project convention for that output and must never replace the required task surface.
- Validate space economy against the operation, not against the current layout. Repeated objects must use a structure and orientation suited to their geometry, count, and scanning task. Distinguish the visible size of an affordance from its interactive hit target; accessibility sizing must not make a small-card control visually dominate its content.
- When a shared workspace or component is replaced, explicitly re-check dividers, panel boundaries, status bars, feedback, recovery controls, and action placement. Do not accept regressions merely because the replacement node renders without clipping.
- Before finalizing a new or materially changed tool flow, run both repo-local
  design validators: `ui_validator` for visual consistency and accessibility
  risks, and `end_user_validator` for problem fit, novice feasibility,
  scanability, feedback, recovery, and complete handoff. These validators are
  read-only. Resolve their substantive findings in the design, then capture
  fresh screenshots and re-run both validators until the flow passes.
- For developer-handoff tool flows, arrange materially different stages horizontally in user order: initial state, interaction/transition states, then final output. A stage may span multiple screens only when the workspace or available actions genuinely change.
- Every flow screen must show what action produced it, what controls are now available, and the next valid action. A developer should not need to infer missing click behavior or ask how one screen reaches the next.
- Do not duplicate generic empty, validation, processing, or completed screens when the shared state pattern already communicates them and the primary workspace is unchanged.
- For Media tools, keep the reusable shell structural and make the main workspace operation-specific. The normal file-processing handoff is upload, uploaded-file interaction/preview, and final output with result facts, generated-file metadata or lists, completion feedback, and download actions together in the right panel. The left side may retain source context or a materially useful visual preview, but must not duplicate the result panel.
- Before finalizing any tool screen or flow, inspect the current screenshots as an end user and require four explicit passes: problem fit, new-user feasibility, five-second scanability, and feedback/recovery. The user must be able to locate the purpose, input, primary action, settings, current state, result, and next action without outside explanation.
- Do not finalize a flow with a dead end, an unexplained control, a generic placeholder where the operation requires a real preview, unclear validation or processing status, an error without recovery guidance, or a completed result without its expected copy/download/print/export action. Record the pain point, revise the design, and re-check the full flow.

## Change and Artifact Hygiene

- [IMP] Scratch scripts, screenshots, logs, profiling output, and diagnostics go in `/tmp`, not in the repository.
- Never commit `.next`, `dist`, `build`, coverage output, `*.tsbuildinfo`, logs, populated environment files, or editor/agent state. Add repeatable generated output to `.gitignore`.
- Do not edit generated files such as `next-env.d.ts` or lockfiles by hand.
- Do not mix broad renames, formatting, dependency upgrades, or directory migrations into an unrelated task.
- Preserve public behavior unless the task explicitly changes it. A file move alone must not change runtime behavior.

## Testing and Verification

Tests use `node:test` and `node:assert`; name repository tests `tests/*.test.mjs`.
Add tests for logical changes: business rules, validation, data
transformations, state transitions, execution behaviour, API or database
boundaries, and regression-prone logic. Tests must verify externally observable
outcomes rather than implementation details.

Use TDD only for logical or behavioural changes where a test adds real value.
For basic UI changes, use the relevant typecheck or lint command and inspect the
rendered interface.

Do not add tests that read source files and assert imports, component names, JSX
text, utility classes, or other implementation structure. Do not add regression
tests for component placement, styling, spacing, copy, or other visual-only
changes. Verify those changes with the relevant typecheck or lint command and
rendered UI inspection.
Enforce architecture boundaries with typechecking, linting, or dependency
tooling instead of source-text assertions.

For code changes:

1. Run the smallest relevant test while iterating.
2. Run `pnpm test`.
3. Run `pnpm lint`.
4. Never run `pnpm build` unless asked or something type error or issue come in project which may affect build.
5. Run the affected package's own checks when shared packages changed.
6. Finish with `git diff --check` and `git status --short`; inspect all changed and untracked files.

For documentation-only changes, review the diff and verify that documented paths and commands exist; code builds are unnecessary. Never claim a check passed unless it was run, and report any failure or environment blocker exactly.

## Security and Configuration

- Never hardcode credentials or commit populated `.env` files. Document new variables with empty or non-sensitive values in the root `.env.example`.
- Treat browser input, route input, headers, stored JSON, and third-party responses as untrusted.
- Enforce authentication and authorization on the server; a hidden UI control is not an access boundary.
- Do not log secrets, tokens, full financial records, or unnecessary personal data.

## Commit and Pull Request Guidelines

Use short imperative commit subjects; `feat:`, `fix:`, and `chore:` prefixes are preferred but not required. Pull requests should name affected route scopes and packages, link relevant issues, list verification commands, include screenshots for visible UI changes, and call out environment or database changes.

## Reference Basis

- [OpenAI Codex `AGENTS.md` guidance](https://developers.openai.com/codex/guides/agents-md)
- [Next.js project structure and colocation](https://nextjs.org/docs/app/getting-started/project-structure)
- [pnpm workspaces and the `workspace:` protocol](https://pnpm.io/workspaces)
- [TypeScript guidance for monorepo package imports](https://www.typescriptlang.org/docs/handbook/modules/reference#paths-should-not-point-to-monorepo-packages-or-node_modules-packages)
- [Git rules for generated and temporary files](https://git-scm.com/docs/gitignore)
