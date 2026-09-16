# Tool page design spec — read from `product-design.pen`

Source of truth: `product-design.pen`, exported 2026-08-02 via the Pencil MCP.
Node ids come from `packages/ui/src/design-system-manifest.ts`.

Exported captures (read these images before implementing):

| Node              | Design name                     | PNG                                        |
| ----------------- | ------------------------------- | ------------------------------------------ |
| `x9bDiO`          | Generic Utility Workbench       | `<design>/x9bDiO.png`                      |
| `b55XX`           | JSON Formatter Viewer           | `<design>/b55XX.png`                       |
| `xWzlR`           | Data Conversion workbench       | `<design>/xWzlR.png`                       |
| `QQ11z`           | Tool Options Panel              | `<design>/QQ11z.png`                       |
| `vMbTZ`           | File Upload Zone                | `<design>/vMbTZ.png`                       |
| `A3D8lv`          | File Queue Item                 | `<design>/A3D8lv.png`                      |
| `kfEw4`           | Processing Status               | `<design>/kfEw4.png`                       |
| `wFMb0`           | Download Result                 | `<design>/wFMb0.png`                       |
| `hGI6k` / `bWOKG` | Right Panel Processing / Result | `<design>/hGI6k.png`, `<design>/bWOKG.png` |
| `NnxxQ`           | Tool Page Intro                 | `<design>/NnxxQ.png`                       |
| `g9TdB`           | Tool Page System Controls       | `<design>/g9TdB.png`                       |
| `e8vqr`           | Toolbar Inline Guidance         | `<design>/e8vqr.png`                       |
| `eAeak`           | Tool How It Works               | `<design>/eAeak.png`                       |
| `hZUnl`           | SegmentedControl / Input Result | `<design>/hZUnl.png`                       |

`<design>` = `/private/tmp/claude-503/-Users-ashishpal-Desktop-coding-projects-canopy/7d95a886-c596-4572-a191-fdd177066169/scratchpad/design`

---

## The shared page skeleton

Every tool page, all three families:

1. **Intro** (above the card): blue uppercase eyebrow (`UTILITY TOOL`, `JSON TOOL`,
   `DATA CONVERTER`), large bold title, one grey description line. Top-right: two
   pale-blue pill badges (`QUICK TASK`, `PRIVATE IN BROWSER`).
2. **The workbench card**: white, rounded, 1px border.
   - **Header row** — icon tile on the left; actions on the right.
   - **Body** — two or three columns (per family, below).
   - **Status bar** — inside the card, at the bottom.
3. **`BEFORE YOU CONTINUE`** — blue uppercase eyebrow, then three cards on a muted
   fill: `LIMITATIONS` / "Know the boundaries", `PRIVACY` / "Your data stays local",
   `HOW TO USE` / "Complete the task safely". Each: small icon + uppercase
   micro-label + bold heading + grey description.
4. **`RELATED TOOLS`** — blue uppercase eyebrow, bold heading, grey subtitle on the
   left; outlined buttons with a ↗ glyph on the right.

### Header row — MISSING ENTIRELY IN THE IMPLEMENTATION

Left: a rounded-square icon tile (~44px). `b55XX` and `xWzlR` use a black tile with
a white `{ }` glyph; `x9bDiO` uses a pale-amber tile with a dark glyph.

Right, in this order:

- a **blue text link** — `Example` (x9bDiO), `Load sample` (b55XX)
- an **outlined button** — `Reset` (x9bDiO), `Clear` (b55XX)
- a **solid blue primary** — `Format JSON` (b55XX)

`xWzlR` shows the header with the icon tile only; its actions live in the settings
column instead.

### Status bar — MISSING ENTIRELY

Inside the card, below the columns, separated by a top border.

- Left: green check glyph + green text. `Valid JSON · parsed in 4 ms` (b55XX),
  `Converted 3 records · 0 skipped` (xWzlR).
- Right: grey monospace meta. `Spaces: 2   UTF-8   Ln 1, Col 1` (b55XX),
  `Local runtime · 6 ms` (xWzlR).

### Pane headers

`UPPERCASE MICRO-LABEL` on the left, optionally followed by a coloured status chip
(`3 rows` in green, a green check glyph). On the right, either a meta readout in
grey monospace (`97 bytes`, `284 bytes`, `128 characters`) or inline actions.

**Inline actions are BLUE TEXT LINKS, not outlined buttons**: `Copy`, `Download`,
`Expand all`, `Download .json`. Exceptions seen: `Paste` and `Collapse all` render
as an outlined button and grey text respectively, and `x9bDiO`'s `Copy` is an
outlined button with a copy glyph beside a green `READY` chip.

### Panes

- Input pane: **muted `#F6F7F9` fill** (`bg-background`), monospace, with a
  **line-number gutter** whenever the content is code.
- Output pane: **white fill**, monospace, line numbers where it is code.
- Tree output: rows with disclosure chevrons, a light-blue highlight on the active
  row, type glyphs (`#` number, eye boolean, `[]` array), and syntax colour —
  green strings, blue booleans, orange numbers.

---

## Family 1 — Generic Utility Workbench (`x9bDiO`)

The layout for the ~94 source-result tools. **Two columns.**

**Left column (~66%)** — input over output, stacked:

- `Text to test` (sentence-case label, grey) + right-aligned `128 characters`
- input textarea, muted fill, monospace
- `OUTPUT` uppercase micro-label + right: green `READY` chip + outlined `Copy` button
- output area, muted fill, monospace placeholder

**Right column (~34%)**:

- `OPTIONS` uppercase micro-label
- option rows: **bold name, grey description underneath, toggle right-aligned**
  (`Global search` / "Find every match")
- **full-width solid blue `Run utility`**
- divider
- `RESULT` uppercase micro-label + green `READY` on the right
- a `RESULT SUMMARY` card on muted fill: green `3 matches` top-right, then numbered
  rows — grey monospace ordinal `01`, `02`, `03` on the left, value right-aligned

## Family 2 — JSON Formatter Viewer (`b55XX`)

**Two columns, side by side. Input LEFT, tree RIGHT.** Not stacked.

- Left: `INPUT` + right-aligned `284 bytes`; muted fill; line numbers 1–11.
- Right: **tabs** `Tree` | `Formatted` (underline on active) and, right-aligned:
  a search glyph, blue `Expand all`, grey `Collapse all`, a copy glyph, blue
  `Download .json`. Below: the syntax-coloured tree.
- Header actions: `Load sample` link, `Clear` outlined, `Format JSON` solid blue.
- Status bar: `Valid JSON · parsed in 4 ms` / `Spaces: 2  UTF-8  Ln 1, Col 1`.

## Family 3 — Data Converter (`xWzlR`)

**Three columns.**

1. `CSV INPUT` + green `3 rows` + right `97 bytes` + outlined `Paste` button.
   Muted fill, line numbers.
2. `JSON OUTPUT` + green check + right: blue `Copy`, blue `Download`. White fill,
   line numbers.
3. Settings column (~30%), centred uppercase `SETTINGS & OUTPUT`:
   `FROM` label + select, `TO` label + select, blue checkboxes
   (`First row as headers`, `Parse numbers`, `Trim whitespace`), a
   `Delimiter ,` monospace readout, then **full-width outlined `Clear`** and
   **full-width solid blue `Convert →`**.

## Tool Options Panel (`QQ11z`)

- Card title **`Tool options` — large and bold (~24px), NOT an uppercase micro-label**.
- Field label: grey, sentence case, above its control.
- Selects: full width, rounded, bordered, chevron on the right.
- Toggle row: bold name + grey description on the left, toggle right-aligned.
- Divider, then `ACTION AREA` uppercase micro-label, then a **full-width solid blue
  primary** (`Run tool`).

## File Upload Zone (`vMbTZ`)

Pale-blue fill, blue 1px border, generous radius, centred:

- blue upload glyph
- **short bold title** — `Add or upload images`
- one grey description line of **dot-separated meta** —
  `Supported formats · size limit · processed on this device`

The formats and limits belong in the description, dot-separated. They must NOT be
crammed into the title.

---

## Confirmed gaps against the current implementation

| #   | Gap                                                                                                                                             | Where                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | No header row at all — no icon tile, no `Example`/`Load sample` link, no `Reset`/`Clear`, no solid blue primary                                 | `UniversalWorkbench` toolbar slot    |
| 2   | Primary action is a small `size="sm"` button in the toolbar; design puts a **full-width solid blue** button at the bottom of the options column | `ToolPage` toolbar / `SettingsPanel` |
| 3   | Pane headers carry no meta readout (`97 bytes`, `128 characters`, `3 rows`) and no green status chip                                            | `Surfaces.tsx`                       |
| 4   | Inline actions are outlined buttons in a separate strip; design uses **blue text links** in the pane header row                                 | `ResultView` `RenderFrame`           |
| 5   | No bottom status bar — `WorkbenchShell` has a `status` slot and it is fed the page footer instead                                               | `UniversalWorkbench`                 |
| 6   | Input is a white bordered textarea; design is a **muted `#F6F7F9` fill with a line-number gutter**                                              | `SourceResultWorkspace`              |
| 7   | Option rows are label-above-control; design is **bold name + grey description + right-aligned toggle**                                          | `SettingsPanel`                      |
| 8   | Conversion tools render two columns; design is **three**                                                                                        | `SourceResultWorkspace`              |
| 9   | Upload zone title carries the format/limit string; design keeps the title short and puts meta in the description                                | 21 media `definition.ts`             |

---

## Media components — read from the frames

### File Queue Item (`A3D8lv`)

One row, bottom-bordered:

- LEFT: a pale-blue rounded icon tile with a blue file glyph.
- Bold black filename — `source-file.png`.
- Grey metadata line, dot-separated — `2400 × 1600 px · 3.8 MB`. Image DIMENSIONS
  and a HUMAN-READABLE size. Not a MIME type, not a raw byte count.
- RIGHT: an OUTLINED square remove button with an `×` glyph. Not a ghost trash icon.

### Processing Status (`kfEw4`)

A **BLACK card** (the `--surface-ink` token, `#111214`), generous radius:

- LEFT: a white spinner glyph.
- Bold WHITE title with the percentage inline — `Processing · 68%`.
- Grey sub-line — `Working on item 2 of 3 · about 4 seconds left`. Item counter and
  a time estimate, dot-separated.
- RIGHT: a white `Cancel` button.

### Download Result (`wFMb0`)

A white bordered card:

- LEFT: a pale-green rounded tile with a green check glyph.
- Bold black title — `Your file is ready`.
- Grey metadata — `output-file.png · 1.2 MB`. Filename and human-readable size.
- RIGHT: a SOLID BLUE `Download file` button.

### Additional gaps

| #   | Gap                                                                                                                                                                | Where                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 10  | File queue metadata shows MIME type and a raw byte count (`image/png · 3801234 bytes`); design shows image dimensions and a human size (`2400 × 1600 px · 3.8 MB`) | `Surfaces.tsx` / `FileProcessorWorkspace.tsx` |
| 11  | Remove control is a ghost trash icon; design is an outlined square `×`                                                                                             | `FileProcessorWorkspace.tsx`                  |
| 12  | Progress has no black `ProcessingStatus` card, no percentage, no item counter, no time estimate, no Cancel                                                         | `FileProcessorWorkspace.tsx`                  |
| 13  | Finished files render as plain cards; design is `DownloadResult` — green check tile, human size, solid blue `Download file`                                        | `FileProcessorWorkspace.tsx`                  |
