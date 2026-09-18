# SmartTools Design System

`SegmentedControl size="field"` is the full-width setting selector: equal-width segments, 4px track inset, and 37px minimum segment height (45px total). Labels may wrap at narrow widths. Use it for field-sized segmented choices; existing `inline` and `navigation` sizes are unchanged. Image conversion uses the shared Select labeled “Output format” as its last setting, with alphabetically ordered format options.

`@/components/ui/index.tsx` — the shared visual layer for every SmartTools surface in this repo.

### Crop PDF control and completion patterns

- `Input` accepts decorative `leadingIcon` and `suffix` slots. Keep a visible associated label; adornments are hidden from assistive technology. Compact workbench density preserves space for both slots.
- `DownloadResult variant="action"` is the flat, divided completion area below retained settings: success identity and metadata, then a full-width download action. The default `card` variant is unchanged.
- Crop PDF composes the shared PDF workspace/viewer, exact-point fields, review, generated PDF preview, and Edit crop / Crop another PDF recovery. Editing retains the source and settings; completing replaces the run action rather than adding another result panel.

**Status:** application-owned source under `components/ui`; no separate package or build step.
**Design source of truth:** `designs/design.pen` + `designs/SYSTEM.lib.pen` (Pencil).
**Code source of truth:** `components/ui`. Where the two disagree, `components/ui/design-system-manifest.ts` is the crosswalk that decides which design node maps to which component.

# Rules
- Design for normal desktop and laptop browser viewports first, not televisions, ultrawide monitors, or oversized presentation canvases. Unless the user explicitly requests another target, use **1366 × 768 CSS pixels** as the default desktop viewport for both `.pen` screen designs and implemented UI; also verify usability at **1280 × 720**. These are browser content dimensions, not physical display resolutions.

| Audience                    | Start here                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Building a feature          | [Consuming the system](#1-consuming-the-system) → [Component inventory](#4-component-inventory) |
| Styling anything            | [Foundations](#3-foundations) — never write a raw hex                                           |
| Adding/changing a component | [Contributing](#8-contributing) → [Component contract](#5-component-contract)                   |
| Reviewing a PR              | [Review checklist](#7-governance) → [Verification](#9-verification)                             |

---

## 1. Consuming the system

```ts
// components
import { Button, Field, Input, ToolPageShell } from "@/components/ui/index.tsx";
// deep import when you need one file only
import { Button } from "@/components/ui/components/button.tsx";
import { cn } from "@/components/ui/lib/utils.ts";
```

```css
/* app/globals.css — this order is asserted by tests/frontend-config.test.mjs */
@import "tailwindcss";
@import "../components/ui/theme.css";
```

**Module facts**

|                  |                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Name             | `components/ui` (application-owned UI)                                                                                                 |
| Module type      | ESM TypeScript, compiled with the application                                                                                                    |
| Entry point      | `components/ui/index.tsx`; individual components and helpers can be imported directly                                                               |
| Internal imports | Relative imports within `components/ui`                                    |
| React            | Declared in the root application manifest                                                                                                                              |
| Runtime deps     | `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `motion`, `sonner`, `react-resizable-panels`, `@dnd-kit/*` |
| shadcn config    | Root `components.json` — style `new-york`, `rsc: true`, baseColor `slate`, `cssVariables: true`, icons `lucide`                                   |

**Exactly one `@import "tailwindcss"` may exist repo-wide.** `theme.css` opens with `@source ".";` so Tailwind scans the UI sources for class usage.

**Live specimen page:** `/admin/design-system` (`app/admin/(protected)/design-system/page.tsx`) renders every primitive, all five control sizes, and the page-level compositions. Use it to review a change visually before shipping.

---

## 2. Principles

1. **Semantic over literal.** Consume `bg-card`, `text-muted-foreground`, `border-border`. A hex in a component file is a bug.
2. **One implementation per design node.** If `design.pen` has it, the manifest maps it to exactly one export. No lookalikes.
3. **Compose, don't fork.** New tool page = existing primitives arranged differently, not new styled markup.
4. **Extract at the third repetition** — not the first, not the tenth.
5. **Accessible by default.** Focus ring, label association, and keyboard operation live in the component, not in the caller.
6. **The system owns presentation only.** Copy, routes, status logic, and workflow behaviour stay in the consuming app.

---

## 3. Foundations

### 3.1 Token architecture

Tailwind v4, CSS-first. **There is no `tailwind.config.*` file** — do not create one.

`components/ui/theme.css` has two blocks:

- `@theme { … }` — static tokens (fonts, type scale, radius, shadow). Emitted as literal values.
- `@theme inline { … }` — maps the `--color-*` utility namespace onto bare `--*` variables declared in `:root`. Because it is `inline`, utilities emit `var(--background)` rather than a baked hex, so **any subtree can be re-themed by redeclaring the bare vars** (this is how `.platform-shell` and `.auth-shell` work).

```
:root { --primary: #0066ff }        ← the value
@theme inline { --color-primary: var(--primary) }   ← the utility namespace
→ class="bg-primary" emits background-color: var(--primary)
```

### 3.2 Color

35 semantic tokens. Every one has a matching `--color-*` utility. No orphans in either direction.

| Token                      | Value     | Use for                                          |
| -------------------------- | --------- | ------------------------------------------------ |
| `--background`             | `#f6f7f9` | Page ground                                      |
| `--foreground`             | `#1a1a1a` | Body text                                        |
| `--card`                   | `#ffffff` | Raised surface                                   |
| `--card-foreground`        | `#1a1a1a` | Text on a card                                   |
| `--popover`                | `#ffffff` | Overlay surface                                  |
| `--popover-foreground`     | `#1a1a1a` | Text on an overlay                               |
| `--primary`                | `#0066ff` | Primary action, active state                     |
| `--primary-foreground`     | `#ffffff` | Text on primary                                  |
| `--secondary`              | `#ffffff` | Secondary action fill                            |
| `--secondary-foreground`   | `#1a1a1a` | Text on secondary                                |
| `--muted`                  | `#f6f7f9` | Recessed fill, segmented shell                   |
| `--muted-foreground`       | `#666666` | Labels, helper text, metadata                    |
| `--accent`                 | `#e8f0ff` | Soft brand fill, hover, icon tiles               |
| `--accent-foreground`      | `#0066ff` | Text/icon on accent                              |
| `--destructive`            | `#dc2626` | Destructive action                               |
| `--destructive-foreground` | `#ffffff` | Text on destructive                              |
| `--destructive-soft`       | `#fde7e7` | Destructive background wash                      |
| `--success`                | `#12a150` | Success action/icon                              |
| `--success-foreground`     | `#ffffff` | Text on success                                  |
| `--success-soft`           | `#e6f6ec` | Success background wash                          |
| `--warning`                | `#b45309` | Warning action/icon                              |
| `--warning-foreground`     | `#ffffff` | Text on warning                                  |
| `--warning-soft`           | `#fbeedd` | Warning background wash                          |
| `--validation`             | `#e5484d` | Inline field error                               |
| `--status-warning`         | `#b7791f` | Status badge — warning                           |
| `--status-warning-soft`    | `#fef3e2` | Status badge — warning fill                      |
| `--status-danger`          | `#d64545` | Status badge — danger                            |
| `--status-danger-soft`     | `#fdecec` | Status badge — danger fill                       |
| `--surface-ink`            | `#111214` | Inverse surface: footer, toast, processing panel |
| `--on-ink`                 | `#ffffff` | Text on ink                                      |
| `--on-ink-muted`           | `#a7adb5` | Secondary text/links on ink                      |
| `--border`                 | `#eaecef` | Default hairline                                 |
| `--input`                  | `#d6d9de` | Control border (stronger than `--border`)        |
| `--ring`                   | `#0066ff` | Focus ring                                       |
| `--syntax-string`          | `#0a8040` | Code-editor string token                         |

**Semantic pairs.** `*` and `*-foreground` are a contract — use them together. `*-soft` is a background wash only; never put `*-foreground` text on a `*-soft` fill.

**Dark mode is deliberately off.** `:root` sets `color-scheme: only light`. There is no `.dark` block and no `@custom-variant dark`. Do not add `dark:` variants — they will never activate.

### 3.3 Typography

Five families, all loaded via `next/font/google` in `app/layout.tsx` (`display: "swap"`, `subsets: ["latin"]`) and exposed as CSS vars.

| Utility        | Token            | Stack       | Use for                            |
| -------------- | ---------------- | ----------- | ---------------------------------- |
| `font-sans`    | `--font-sans`    | Geist       | Body, controls (default on `body`) |
| `font-heading` | `--font-heading` | Inter       | `h1`–`h6` (applied automatically)  |
| `font-caption` | `--font-caption` | Funnel Sans | Labels, badges, metadata           |
| `font-script`  | `--font-script`  | Caveat      | Expressive endorsement only        |
| `font-mono`    | `--font-mono`    | Geist Mono  | Code, workbench status bar         |

**Named typography:** import `H1`–`H6`, `Display`, `P`, `Text`, `Lead`, `Large`, `Small`, `Muted`, `Caption`, `Overline`, `Metric`, `Strong`, `Blockquote`, `List`, `OrderedList`, `InlineCode`, `CodeBlock`, and `TextLink` from `@/components/ui/index.tsx`. Definitions live in `components/ui/components/typography.tsx`; every component has a fixed semantic element, native attributes/ref, and no `as` or `variant` prop.

| Components            | Size / line height             | Font / weight                 |
| --------------------- | ------------------------------ | ----------------------------- |
| Display               | 48px / 1.1                     | Inter / 700                   |
| H1                    | 32px / 1.2                     | Inter / 600                   |
| H2                    | 24px / 1.25                    | Inter / 600                   |
| H3                    | 20px / 1.3                     | Inter / 600                   |
| H4                    | 18px / 1.4                     | Inter / 600                   |
| H5                    | 16px / 1.5                     | Inter / 600                   |
| H6                    | 15px / 1.5                     | Inter / 600                   |
| P, Text               | 15px / 1.5                     | Geist / 400                   |
| Lead, Large           | 18px / 1.5                     | Geist / 400, 600              |
| Small, Caption        | 13px / 1.35                    | Funnel Sans / 500, 400        |
| Muted                 | 13px / 1.35                    | Geist / 400                   |
| Overline              | 11px / 16px                    | Funnel Sans / 600, uppercase  |
| Metric                | 32px / 1.2                     | Inter / 600, tabular numerals |
| Strong                | Inherited size and line height | Inherited family / 600        |
| InlineCode, CodeBlock | 12px / 1.55                    | Geist Mono                    |
| TextLink              | Inherited size and line height | Geist                         |

`Blockquote`, `List`, and `OrderedList` use the body recipe and native quote/list semantics. `CodeBlock` renders `pre > code`. No text component fixes its element height or adds page-level margins.

```tsx
<H1>Tool catalog</H1>
<Muted>Find, group, and publish tools.</Muted>
<H2>Documents</H2>
<H3>Tool settings</H3>
<Caption>6 tools</Caption>
```

Consumers use these components without font-size, font-family, font-weight, line-height, tracking or casing overrides. Layout, wrapping, alignment and contextual state colors remain with the owner. Do not change heading levels merely to obtain a smaller font. Keep phrasing content inside paragraphs (`Text`, `Caption`, `Strong`, `InlineCode`); `P`, `Lead`, `Muted`, and `Large` are block content.

Existing fields, buttons, inputs, selects, tables, navigation and state components own their typography internally. Use `Input code` or `Textarea code` for code content rather than caller font classes. `typographyStyles` is for component internals and imperative editor integrations; ordinary pages use the named components. Layered editors share the code recipe across source, gutter and syntax overlay. Document templates, printed previews and React-PDF use their existing configurable output typography, independently from app chrome.

The class-merging helper recognizes all semantic size tokens so adding a text color cannot silently remove a font size. `/admin/design-system` demonstrates the complete named set.

### 3.4 Radius

| Utility      | Value            |
| ------------ | ---------------- |
| `rounded-sm` | `0.25rem` (4px)  |
| `rounded-md` | `0.5rem` (8px)   |
| `rounded-lg` | `0.5rem` (8px)   |
| `rounded-xl` | `0.75rem` (12px) |

Convention: **4px** selection controls, **8px** inputs/buttons/alerts, **12px** cards and panels, `rounded-full` pills. `md` and `lg` are currently the same value — see [Known gaps](#10-known-gaps).

### 3.5 Elevation

| Utility     | Value                                        | Use for                                |
| ----------- | -------------------------------------------- | -------------------------------------- |
| `shadow-sm` | `0 1px 2px #0000000d`                        | Segmented active pill, media workbench |
| `shadow-md` | `0 2px 4px #00000008, 0 6px 16px #0000000f`  | Popovers, conversion workbench         |
| `shadow-lg` | `0 2px 4px #00000008, 0 12px 32px #0000000f` | Cards, workbench shell                 |

Three steps, no more. If a surface needs a fourth, it probably needs a border instead.

### 3.6 Base layer

`theme.css` `@layer base` sets, globally:

- `*` → `border-border outline-ring/50` (default border colour + focus outline)
- `body` → `bg-background font-sans text-foreground`
- `h1…h6` → `font-heading`

So headings and focus rings are correct without any class. Do not re-declare them.

### 3.7 Layout

- `AppContainer` is the page gutter: `max-w-[1328px]` (1200px content + 64px desktop edge).
- Card collections: 1 column small / 2 medium / 3 large, `gap-6` rhythm.
- **There are no spacing tokens.** Use Tailwind's default 4px-based scale.

---

## 4. Component inventory

60 design nodes are mapped to code in `components/ui/design-system-manifest.ts`. Grouped inventory below; variant lists are the authoritative option names.

### Shell & navigation

| Component                | Source         | Variants / key props                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppContainer`           | `index.tsx`    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `BrandLockup`            | `index.tsx`    | req `href`, `name`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ProductHeader`          | `index.tsx`    | `compact?: boolean` (72px vs 88px); main navbar uses `ScrollAwareHeader` to hide after 20px downward travel and reveal after 10px upward travel; stays visible within one header height of the top, during focus, and while a menu is expanded; 350ms gentle exit / 300ms entrance, immediate keyboard reveal and no animation with reduced motion; passive frame-batched scrolling updates only the header attribute, never rerendering children; nested tool scrolling and Admin chrome are unaffected |
| `AccountNavigation`      | `index.tsx`    | req `returnTo`, `user \| null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `UniversalProductHeader` | `patterns.tsx` | req `category`, `description`, `icon`, `title`                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `InlineProductHeader`    | `patterns.tsx` | req `description`, `icon`, `title`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ToolPageShell`          | `index.tsx`    | req `category`, `description`, `productHref`, `productName`, `title`; `showIntro`, `showCategoryInBreadcrumb`                                                                                                                                                                                                                                                                                                                                                                                            |
| `ToolNav`                | `index.tsx`    | req `items[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `SidebarNavItem`         | `patterns.tsx` | `active?: boolean`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ProductFooter`          | `patterns.tsx` | req `brand`, `columns[]`, `copyright`, `description`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Layout & headings

| Component                                  | Source            | Variants                                    |
| ------------------------------------------ | ----------------- | ------------------------------------------- |
| `PageHero`                                 | `index.tsx`       | `align: left \| center`, `compact: boolean` |
| `ToolPageHeader`                           | `index.tsx`       | `inlineEyebrow: boolean`                    |
| `SectionHeading`                           | `index.tsx`       | —                                           |
| `ToolPageIntro`                            | `patterns.tsx`    | —                                           |
| `Separator`                                | `separator.tsx`   | `orientation`                               |
| `ScrollArea` / `ScrollBar`                 | `scroll-area.tsx` | `viewportClassName`, `viewportProps`        |
| `ResizablePanelGroup` / `Panel` / `Handle` | `resizable.tsx`   | `withHandle?: boolean`                      |

### Actions

| Component          | Source             | Variants                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`           | `button.tsx`       | `variant: default \| strong \| destructive \| outline \| secondary \| ghost \| input-icon \| danger-subtle \| link`<br>`size: default \| xs \| sm \| md \| lg \| icon \| icon-xs \| icon-sm \| icon-md \| icon-lg`<br>`asChild`; `disabled` preserves colors at 50% opacity; `loading` disables activation and shows a circular spinner with `aria-busy` |
| `ButtonGroup`      | `button-group.tsx` | `orientation: horizontal \| vertical`                                                                                                                                                                                                                                                                                                                    |
| `CompactAction`    | `patterns.tsx`     | pre-bound `Button size="sm" variant="outline"` at 32px                                                                                                                                                                                                                                                                                                   |
| `RemoveFileAction` | `patterns.tsx`     | pre-bound icon button, `aria-label="Remove file"`                                                                                                                                                                                                                                                                                                        |

### Forms

| Component                       | Source                 | Variants                                                                                                                                                                                             |
| ------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Field` (composition)           | `index.tsx`            | `variant: default \| auth`; req `htmlFor`, `label`, single-element `children`                                                                                                                        |
| `AuthField`                     | `index.tsx`            | `Field` with `variant="auth"` pre-bound                                                                                                                                                              |
| `FieldRoot` + parts             | `field.tsx`            | `variant: default \| auth`, `orientation: vertical \| horizontal \| responsive`                                                                                                                      |
| `Input`                         | `input.tsx`            | `size: xs \| sm \| default \| md \| lg` (native `size` omitted); native range controls have no text-input padding or border, including inside workbenches, so the thumb reaches both track endpoints |
| `Textarea`                      | `textarea.tsx`         | — (`min-h-[88px]`, `field-sizing-content`)                                                                                                                                                           |
| `InlineTextEditor`              | `InlineTextEditor.tsx` | controlled `value`, `onChange`, accessible `label`; `multiline`, `required`, `maxLength`, `disabled`; inherits parent typography in display and editing states                                       |
| `Select` + parts                | `select.tsx`           | `SelectTrigger size: xs \| sm \| default \| md \| lg`; auto-bridges native `<option>` children                                                                                                       |
| `RadioGroup` / `RadioGroupItem` | `radio-group.tsx`      | `size: xs \| sm \| default \| md \| lg`                                                                                                                                                              |
| `Checkbox` (composition)        | `index.tsx`            | req `label`; wraps `CheckboxControl` in a `<label>`; optional `tooltip` uses shared Tooltip parts under a group-level `TooltipProvider`, with a focusable wrapper when disabled                      |
| `CheckboxControl`               | `checkbox.tsx`         | fixed `size-5`; checked / indeterminate                                                                                                                                                              |
| `Switch`                        | `switch.tsx`           | `size: xs \| sm \| default \| lg`                                                                                                                                                                    |
| `Label`                         | `label.tsx`            | —                                                                                                                                                                                                    |

`Field` clones its child to inject `id`, `aria-describedby`, `aria-errormessage`, `aria-invalid`. **Use `Field` rather than pairing `Label` + `Input` by hand** — that is where the a11y wiring lives.

Place `InlineTextEditor` inside the appropriate typography component, such as `H2` or `Muted`. Double-click the text, activate its edit button, or focus it and press Enter to edit. Enter finishes both single-line and multiline editing; Shift+Enter inserts a new line in multiline fields. Blur keeps the draft and Escape restores the value from before editing. The parent owns saving and toast feedback; finishing an edit does not persist it. The form controls showcase includes editable title, description, and disabled examples.

### Feedback

| Component                                   | Source             | Variants                                                                                           |
| ------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `Alert` / `AlertTitle` / `AlertDescription` | `alert.tsx`        | `variant: default \| destructive`                                                                  |
| `AlertBanner`                               | `index.tsx`        | `variant: info \| success \| warning \| error`; `error` → `role="alert"`, others → `role="status"` |
| `AlertDialog` + parts                       | `alert-dialog.tsx` | `AlertDialogContent size: default \| sm`; `AlertDialogMedia` 64px icon slot                        |
| `Toaster` / `toast`                         | `sonner.tsx`       | ink surface; presets success/info/warning/error/loading                                            |
| `Tooltip` + parts                           | `tooltip.tsx`      | `delayDuration` 300, `sideOffset` 6                                                                |
| `ProcessingStatus`                          | `patterns.tsx`     | optional `progress` (clamped 0–100), `aria-live="polite"`                                          |
| `RightPanelProcessing`                      | `patterns.tsx`     | `progress` **required** here                                                                       |
| `Empty` + parts                             | `empty.tsx`        | `EmptyMedia variant: default \| icon`                                                              |
| `EmptyState`                                | `index.tsx`        | `headingLevel: h1 \| h2 \| h3`                                                                     |
| `InlineGuidance`                            | `patterns.tsx`     | optional `icon` (default `Lightbulb`)                                                              |

### Surfaces & data

| Component                                                             | Source                         | Variants                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Card` + parts                                                        | `card.tsx`                     | —                                                                                                                                                                                                                                        |
| `Accordion` + `AccordionItem`, `AccordionTrigger`, `AccordionContent` | `accordion.tsx`                | shadcn/Radix pattern; `type: single \| multiple`; use `multiple` for independent settings groups. Keep form values controlled when collapsed content unmounts. Place account actions beside their description, never inside the trigger. |
| `SectionCard`                                                         | `index.tsx`                    | —                                                                                                                                                                                                                                        |
| `DangerZone`                                                          | `index.tsx`                    | —                                                                                                                                                                                                                                        |
| `CatalogCard` / `ToolCard`                                            | `index.tsx`                    | req `action`, `description`, `title`                                                                                                                                                                                                     |
| `Badge`                                                               | `badge.tsx`                    | `variant: default \| secondary \| destructive \| outline \| ghost \| tag \| link`, `asChild`                                                                                                                                             |
| `StatusBadge`                                                         | `index.tsx`                    | `variant: neutral \| info \| success \| warning \| danger \| archived`                                                                                                                                                                   |
| `Tag`                                                                 | `design-system-components.tsx` | `Badge` with `secondary` forced                                                                                                                                                                                                          |
| `Avatar` + `AvatarBadge` / `AvatarGroup` / `AvatarGroupCount`         | `avatar.tsx`                   | `size: default \| sm \| lg`                                                                                                                                                                                                              |
| `Table` + parts                                                       | `table.tsx`                    | `showColumnDividers?: boolean`; sticky `th`                                                                                                                                                                                              |
| `Tabs` + parts                                                        | `tabs.tsx`                     | `TabsList variant: default \| line \| segmented`                                                                                                                                                                                         |
| `SegmentedControl`                                                    | `design-system-components.tsx` | `size: inline \| navigation`; req `items[]`                                                                                                                                                                                              |
| `IconTile`                                                            | `patterns.tsx`                 | `size: sm \| default \| lg`, `tone: accent \| contrast \| success \| muted`                                                                                                                                                              |
| `MetricCard`                                                          | `patterns.tsx`                 | req `label`, `value`; optional `delta`                                                                                                                                                                                                   |

### Tool-page patterns

| Component                                                                 | Source                         | Variants                                                                                                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorkbenchShell`                                                          | `design-system-components.tsx` | `variant: json \| conversion \| media \| utility` (elevation only); req `toolbar`                                                                                         |
| `JsonFormatterWorkbench` / `DataConversionWorkbench` / `UtilityWorkbench` | same                           | pre-bound `WorkbenchShell` variants                                                                                                                                       |
| `ToolPageSystemControls`                                                  | same                           | all-optional slots: `children`, `preferences`, `actions`                                                                                                                  |
| `FileUploadZone`                                                          | `patterns.tsx`                 | req `title`; optional `description` for formats/limits and `hint` for browse/drop guidance; centered content, 240px minimum height (Pencil `oFvm5`); renders a `<button>` |
| `FileQueueItem`                                                           | `patterns.tsx`                 | req `metadata`, `name`                                                                                                                                                    |
| `DownloadResult` / `RightPanelResult`                                     | `patterns.tsx`                 | req `metadata`, `title`                                                                                                                                                   |
| `ToolOptionsPanel`                                                        | `patterns.tsx`                 | `variant: card \| plain`                                                                                                                                                  |
| `HowItWorks`                                                              | `patterns.tsx`                 | req `steps[]` → numbered 3-col `<ol>`                                                                                                                                     |
| `ToolSupportSections`                                                     | `patterns.tsx`                 | req string `action`, `result`, `source`                                                                                                                                   |

`WorkbenchShell` force-downsizes descendant `[data-slot=button|input|select-trigger]` to 32px. Do not fight it with per-call size props — pass content and let the shell size it.

### Feature widgets

Stateful, own external dependency. Treat as leaf components; do not clone.

| Component             | Source                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChapterScrubber`     | `ChapterScrubber.tsx` | `motion/react` dock-wave; `density: compact \| default`, `side: left \| right`; hover previews stay open across the gap and select the chapter on click or Enter/Space; Escape dismisses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `OrderableList<Item>` | `OrderableList.tsx`   | `@dnd-kit`; `layout: grid \| vertical`; `dragSurface: handle` (default) or `card` (mouse drag / 200ms touch hold preserving swipe scrolling); full drag announcements + keyboard sensor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `PdfViewer`           | `PdfViewer.tsx`       | composes `ChapterScrubber` + `Button`; outline starts collapsed, fits content up to 35% of viewer width, and uses a Morphicons hamburger-to-X toggle with a synchronized 280ms outline/PDF width transition with stable outline content (respects reduced motion); Show outline focuses search, Escape closes and restores toggle focus; 100% zoom fills available page width by default; `fit="page"` fits each complete page inside the viewport at 100%; zoom clamped 50–200, step 10; optional `pages` enables continuous scrolling with page/outline sync; `pageClassName` styles the clipping frame when a tool owns its page selection border; optional `onExpand` opens a caller-owned full-screen preview; `fileSize` adds size to page metadata and `rightChildren` places tool actions beside zoom controls |
| `MediaPreview`        | `MediaPreview.tsx`    | `Is1Pt`; controlled full-screen Radix dialog; media-agnostic `children`, optional header `actions` before Exit preview, `controls`, `status`, `hint` slots; Escape/exit, focus trap and return focus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### PDF file workspaces

`components/FileProcessorWorkspace.tsx` keeps the input full-width until a result
exists. `SplitStack.secondaryHidden` preserves the input while revealing the
resizable output pane from the right (without animation under reduced motion).
On mobile the output follows the input. Progress, cancellation, validation, and
errors remain visible in the input area before a result is available.
Single-PDF results use `GeneratedPdfPreview` in the output pane, with the file's
download action beneath it and a full-screen preview available from Expand.

`components/PdfFileWorkspace.tsx` supplies the shared Split PDF and Extract PDF
Pages shell: centered intake, source `PdfViewer`, right-side settings, and the
primary action above one plan/processing/download status slot. Tools supply the
plan and page overlays. `PdfPageSelectionOverlay` gives Extract and Watermark
the same whole-page selection button, primary outline, and small checkmark. A single
PDF uses `DownloadResult`; multiple PDFs keep individual downloads below the ZIP
download card. The card's download action stays inline with its metadata.
Page settings can opt into `presets` to use the shared `Select` for All pages,
Odd pages, Even pages, or Custom ranges, with a range input only for custom
selection. Watermark uses this pattern; preview selection updates the same value.

### Generated media output cards

`MediaOutputCard` matches the Nswh4/US7ym image cards: an inset, aspect-preserving
square preview, stacked filename/format/size, and always-visible top-right
Preview and Download (or Remove) icon buttons with shared accessible tooltips.
Its `children` supplies the preview; `onPreview`, `onDownload`, `onRemove`,
`disabled`, `downloading`, and `error` are caller-owned. Existing output callers
remain supported. Remove is disabled during processing; preview stays available.
Long filenames wrap rather than depending on native title attributes.

`components/MediaOutputGallery.tsx` exports `MediaOutputGallery({ files })` for
stored image artifacts and `MediaInputGallery({ files, onRemove, disabled? })`
for `readonly File[]`. Removal passes the original File object to its owner.
Both reuse the current full-screen preview dialog; source previews offer Remove,
not Download. HEIC/HEIF decoding is attempted natively; failures explain the
browser limitation without claiming the file cannot be converted. Failed previews
open the dialog for retry; failed downloads retain a retry action.
Only the grid scrolls; archive download and result facts remain outside it.
Thumbnails load near the viewport and retain URLs until unmount or file change;
all URLs are revoked on replacement, retry, or unmount, including dialog URLs. Per-file downloads use the actual generated bytes, not
thumbnail captures. Preview uses `MediaPreview` with a translucent blurred backdrop,
a scrollable square thumbnail rail, and view-only fit/zoom/pan controls. Rail labels
remain accessible without adding visible filenames or an Images toggle.

PDF-to-JPG retains individual generated artifacts alongside the archive using
`retainEntries` on its batch writer. Other batch users still return only their
archive by default. Output byte totals describe the primary downloadable archive,
not the extra browser storage occupied by individual preview/download artifacts.

### Full-screen preview usage

```tsx
import { MediaPreview } from "@/components/ui/index.tsx";

<MediaPreview
  open={previewOpen}
  onOpenChange={setPreviewOpen}
  title={file.name}
  description={fileDetails}
  controls={previewControls}
  status="Preview only"
>
  {previewContent}
</MediaPreview>;
```

`MediaPreview` is a viewport-filling modal, not the browser Fullscreen API and
not a media renderer. `children` may contain images, video, audio, a PDF viewer,
or another task surface. No MIME detection, source loading, zoom transforms,
playback controls, or file actions are inferred. The optional footer disappears
when `controls`, `status`, and `hint` are omitted. Supply only controls the child
actually implements; download actions remain in the underlying Media result panel.

The content area is scrollable. The caller controls child geometry (`m-auto` for
centered content with safe overflow, `w-full h-full min-h-0` for a full-size viewer,
or `max-w-full max-h-full object-contain` for an image). Lift any state that must
survive closing into the caller: dialog children unmount on exit. Caller-owned
loading/error states also belong in `children`.

Radix supplies modal focus containment, background scroll locking, and Escape.
Exit restores focus to the opening control when it still exists. Embedded
cross-origin frames and native PDF viewers may consume Escape inside their own
browsing context; the visible Exit preview button remains available. The wrapper
does not inspect their content or bypass their keyboard behavior.

Live example: `/admin/design-system`, Full-screen media preview specimen.

---

## 5. Component contract

Every shared UI component must:

1. **Merge classes with `cn()`** from `components/ui/lib/utils.ts` (`twMerge(clsx(...))`). Never `filter(Boolean).join(" ")` — asserted by `tests/ui-class-merging.test.mjs`.
2. **Accept and forward `className`** plus the native element props.
3. **Emit a `data-slot="<name>"`** so parents can target it structurally (`WorkbenchShell` relies on this).
4. **Express variants one of two ways, consistently:**
   - `cva()` when the variant changes many classes and callers need `VariantProps` — used by `button`, `badge`, `button-group`, `input`, `select`, `radio-group`, `tabs`, `alert`, `empty`, `field`.
   - plain prop → `data-*` attribute + `group-data-[…]` selectors — used by `switch`, `avatar`, `alert-dialog`, `IconTile`, `StatusBadge`, `AlertBanner`.
     Do not invent a third mechanism.
5. **Use only semantic tokens.** No hex, no `rgb()`, no arbitrary colour.
6. **Use relative imports within `components/ui`**; application consumers use the `@/components/ui` alias.
7. **Ship its accessibility**, per below.

### Accessibility baseline (WCAG 2.2 AA target)

- Interactive surfaces are real `<a>` / `<button>` — `CatalogCard` and `FileUploadZone` already are. A `div` with `onClick` is a defect.
- Focus is visible everywhere via the global `outline-ring/50`; never `outline: none` without a replacement.
- Labels are programmatic: use `Field` (it wires `id` / `aria-describedby` / `aria-errormessage` / `aria-invalid`).
- Live regions: errors `role="alert"`, progress/status `role="status"` + `aria-live="polite"` — `AlertBanner` and `ProcessingStatus` set these for you.
- Current page/state: `aria-current="page"` (`SidebarNavItem`, `ToolNav`).
- Drag-and-drop has a keyboard path (`OrderableList` ships a `KeyboardSensor` + announcements).
- Icon-only controls carry `aria-label` (`RemoveFileAction`).
- `ToolPageShell` renders a skip link (`Skip to tool workspace` → `#tool-workspace`).
- Respect `prefers-reduced-motion` — `app/globals.css` already collapses transitions; do not override it.

---

## 6. Composition patterns

Presentation rules only. Copy, routes, and status logic stay in the app.

**Cards.** `Card` for passive content, `SectionCard` for a grouped page section, `CatalogCard` when the whole surface is one destination. Shell is always `bg-card`, `border-border`, `rounded-xl`, `shadow-lg`, 24px padding. Structure: optional icon tile → title → short description → action. In equal-height grids use a column layout with `mt-auto` on the action; never fixed heights.

**Emphasized panels.** At most one per section. `bg-surface-ink` / `text-on-ink`, `rounded-3xl`, `p-8 md:p-10`, restrained shadow. Inner column narrower than the panel: optional eyebrow → headline → concise copy → scannable benefits → one primary action. Decorative shapes must be low contrast, behind content, `pointer-events-none`, `aria-hidden`.

**Footers.** `ProductFooter` only: `bg-surface-ink`, 56px top / 32px bottom, 300px brand column, labeled utility columns. `text-on-ink` for brand and headings, `text-on-ink-muted` for descriptions and links, 10% white divider above copyright. Stacks on narrow screens with real links and visible hover/focus.

**Tool pages.** `ToolPageShell` → `ToolPageIntro` → workbench card → `ToolSupportSections` / `HowItWorks` → related tools. The 4-part skeleton and per-family workbench specs are in `plans/tool-page-design-spec.md`.

---

## 7. Governance

### Ownership rule — what belongs here

A component belongs in `@/components/ui/index.tsx` when **the same presentation contract appears a third time** across product areas (paperwork / devtools / media / auth / admin). Below that bar it stays in the app's own component or route scope.

Currently app-local by decision:

- Paperwork editors, previews, editable financial rows, calculations, document workflows
- Devtools editor integrations and JSON workbench behaviour
- Auth account, session, and loading workflows
- Admin permissions, mutations, tables, and action groups

> The previous rule read "3 applications." The repo has one Next.js app (`app/`) using these shared components, so that bar could never be met. The threshold is **3 usages**, not 3 apps.

### Design ↔ code parity

`DESIGN_SYSTEM_COMPONENTS` in `components/ui/design-system-manifest.ts` is the canonical crosswalk: **60 reusable design nodes → 60 code implementations**, ids unique. Entry shape:

```ts
{ designId: "wm1rh", designName: "Button/Primary", implementation: "Button[default]" }
```

`implementation` uses three encodings: bare name (`IconTile`), `Component[variant]` (`Button[secondary]`), `Component[prop=value]` (`Input[size=lg]`).

Whenever a reusable design node is added, renamed, or replaced you must update the manifest **and** the hardcoded id list + count in `tests/design-system-alignment.test.mjs`. The parity detail table lives in `DESIGN_AUDIT.md`.

### Theming rule

App-specific content themes (e.g. invoice template colours) must not alter shared application chrome. Re-theme a subtree by redeclaring the bare `--*` vars on a scoped class — never by overriding `--color-*`.

### PR review checklist

- [ ] No hex / `rgb()` / arbitrary colour in the diff — semantic token used
- [ ] No new `tailwind.config.*`, no second `@import "tailwindcss"`
- [ ] Existing component reused rather than a lookalike rebuilt
- [ ] New shared component justified by 3 usages
- [ ] `cn()` used; `className` forwarded; `data-slot` set
- [ ] Variants via `cva` or `data-*`, matching the file's existing mechanism
- [ ] Interactive elements are real `<a>`/`<button>`, focus visible, labels wired via `Field`
- [ ] Manifest + alignment test updated if a design node changed
- [ ] `/admin/design-system` still renders the change correctly
- [ ] `pnpm test` and `pnpm lint` green

---

## 8. Contributing

### Add a component

1. Confirm it does not already exist — search `components/ui/index.tsx` exports and the manifest first.
2. Confirm the 3-usage bar. Below it, keep it app-local.
3. Create `components/ui/components/<name>.tsx`; follow the [component contract](#5-component-contract).
4. Export from `components/ui/index.tsx` (or import a rarely used component directly from its file).
5. Render it on `/admin/design-system` — every variant and every size.
6. If it maps to a `design.pen` node: add the manifest entry, bump the count and id list in `tests/design-system-alignment.test.mjs`, add the row to `DESIGN_AUDIT.md`.
7. `pnpm test` → `pnpm lint`.

### Add or change a token

1. Add the bare var to `:root` in `components/ui/theme.css`, **and** the matching `--color-*` alias in `@theme inline`. Both, always — the alignment test checks token declarations verbatim.
2. Name it by role (`--status-danger-soft`), never by appearance (`--light-red`).
3. Update the token table in this file.
4. Changing an existing value: grep for it in `tests/design-system-alignment.test.mjs` and update the assertion in the same commit.

### Change a design node

1. Edit in Pencil (`designs/design.pen` / `SYSTEM.lib.pen`) — never hand-edit `.pen` files.
2. Update the matching `implementation` string in the manifest.
3. Update `DESIGN_AUDIT.md` parity notes.
4. Re-run `pnpm test`, then eyeball `/admin/design-system`.

**Design frames are placeholders for styling, not a feature spec.** Restyle to match a frame; never delete working controls because a frame omits them.

### Deprecate

No published versions, so no semver dance: keep the old export re-exporting the new one for one migration pass, migrate call sites, then delete the alias and its manifest entry in a follow-up commit.

---

## 9. Verification

```bash
pnpm test       # node --test tests/*.test.mjs
pnpm lint       # tsc --noEmit  (type-check only — there is no ESLint)
pnpm test:e2e   # playwright; needs DATABASE_URL, boots pnpm dev
```

| Check                 | File                                       | Enforces                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token + geometry lock | `tests/design-system-alignment.test.mjs`   | 12 exact token declarations in `theme.css`; exact hover/active hexes and size classes in `button`, `checkbox`, `input`, `select`, `radio-group`, `switch`, `tabs`; all 5 control sizes present on the showcase page; 17 named exports in `patterns.tsx`; manifest = 60 unique ids incl. a hardcoded list; `ToolPageShell` composition rules |
| Theme wiring          | `tests/frontend-config.test.mjs`           | `exports["./theme.css"]`; `@source "."` + `@theme {` present; `globals.css` import order; exactly one `tailwindcss` import repo-wide                                                                                                                                                                                                        |
| Class merging         | `tests/ui-class-merging.test.mjs`          | `index.tsx` uses `cn`, not string joins                                                                                                                                                                                                                                                                                                     |
| Full-screen preview   | `tests/e2e/media-preview.spec.ts`          | Caller content, focus containment, Escape/exit, reopening and focus restoration on `/admin/design-system`                                                                                                                                                                                                                                   |
| Runtime behaviour     | `tests/e2e/design-system-scrubber.spec.ts` | `ChapterScrubber` Gaussian falloff maths, active tick colour `rgb(26,26,26)`, preview geometry, on `/admin/design-system`                                                                                                                                                                                                                   |

These are **source-text assertions**, not rendering tests. They pin token _definitions_; they cannot stop a hardcoded hex being written in an app file. That gap is covered by review, not tooling.

---

## 10. Known gaps

Documented so nobody rediscovers them. Fix opportunistically; none is a blocker.

| Gap                                         | Detail                                                                                                                                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No token-drift enforcement                  | No ESLint, no CI, no hardcoded-hex scanner. A raw hex in `app/` passes every check.                                                                                                                                                       |
| `app/auth/styles.css` is outside the system | ~490 lines of hand-written `.auth-*` CSS with untokenized shadows, `88px`/`72px` navbar heights, `140ms` transitions, and the only two keyframes in the repo (`auth-spin`, `auth-pulse`).                                                 |
| `.platform-shell` is redundant              | `app/globals.css` re-declares 15 colour vars with values identical to `:root`. Deleting it should be a no-op — verify before removing.                                                                                                    |
| `radius-md` == `radius-lg`                  | Both `0.5rem`, so the "8 vs 12" convention is carried by `rounded-xl` alone.                                                                                                                                                              |
| No spacing or motion tokens                 | Spacing rides Tailwind defaults; durations/easings are literals in component files.                                                                                                                                                       |
| No tier-1 primitives                        | Semantic tokens hold raw hex directly, so there is no palette layer to retheme from. A 3-tier split (primitive → semantic → component) is the standard upgrade path if a second brand or dark mode is ever needed.                        |
| No dark mode                                | `color-scheme: only light` by design. Revisit only alongside the tier-1 split above.                                                                                                                                                      |
| Manifest count is hand-maintained           | The 60-id list is duplicated between the manifest and the test; they drift independently.                                                                                                                                                 |
| Open design gaps                            | `plans/tool-page-design-spec.md` lists 13 confirmed parity gaps (`UniversalWorkbench`, `ToolPage`, `SettingsPanel`, `Surfaces.tsx`, `ResultView`, `SourceResultWorkspace`, `FileProcessorWorkspace.tsx`, 21 media `definition.ts` files). |

---

## Saved tools

`SavedToolsProvider` wraps the application once. `SavedToolsTrigger` opens a 400px anchored desktop popover or a modal mobile bottom sheet; opening Saved never changes the route. `SaveToolButton` accepts a tool `href` and supports an `iconOnly` catalog variant. Catalog cards keep the save button outside the destination link.

Rows show tool identity, then a **remove bookmark icon**, then an **open arrow**. Both actions use shared buttons and hover/focus tooltips. Escape/outside dismissal restores trigger focus; mobile traps focus. Removal offers Undo, and storage/network failures expose retry without claiming success.

Guests store identifiers under `canopy.saved-tools.v1`. At sign-in, pending guest IDs are staged locally for that account and unioned into `user_preferences` (`user_id`, `key = saved_tools`, JSONB `value`, `updated_at`). Confirmed imports are cleared locally; failed imports remain account-scoped for retry. Account lists are never copied into guest storage on sign-out. The authenticated API derives ownership from the server session and locks the preference row during read/modify/write.

Schema deployment: `db/migration/0001-baseline/0008_user_preferences.sql`, included in `pnpm db:migrate 0001-baseline`. No dedicated bookmarks table or Saved page is used.
