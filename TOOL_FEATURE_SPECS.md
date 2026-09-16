# Tool Feature Specs — All 144 Non-Paperwork Tools

Research of expected in-depth features per tool, benchmarked against best-in-class equivalents (jsonformatter.org, CyberChef, DevToys, jwt.io, regex101, crontab.guru, cssgradient.io, metatags.io, Squoosh, TinyPNG, iLovePDF, Smallpdf, Sejda, iLoveIMG, etc.). Each entry ends with a layout fit and explicit `GAP:` flags where the planned config-driven layout cannot express the behavior. Final section maps every gap to a runtime-plan accommodation.

Layout vocabulary: `source-result` | `generator` | `file-processor` | `collection` | `visual-editor` | `custom` (customWorkArea override).

---

## 1. JSON Tools (21)

### json-formatter

- Purpose: beautify/pretty-print JSON.
- Expected: indent 2/3/4/tab; minify toggle; sort keys; auto-repair (trailing commas, single quotes, unquoted keys); validate-on-type with error line/col + caret; collapse to depth N; upload file + download result; copy; sample data; large-file handling.
- I/O: single text (+ file, drag-drop) → highlighted text.
- Fit: custom (existing bespoke workbench). GAP: sort-keys, upload/download, error line/col in editor, collapse-depth.

### json-viewer

- Purpose: explore JSON as collapsible tree.
- Expected: expand/collapse all + per-node; type badges; tree search with highlight; click node → copy JSONPath/Pointer; copy subtree; node counts; tree ↔ raw toggle; virtualized rendering for 10k+ nodes.
- Fit: custom. GAP: interactive searchable tree with path-copy (current impl = flat table).

### json-validator

- Expected: valid/invalid verdict; error line + column + context snippet; root type + stats (depth, keys, size); "fix it" handoff to formatter.
- Fit: source-result. GAP: rich error panel with in-editor line/col highlight; verdict badge.

### json-to-typescript

- Expected: interface vs type alias; root name; optional-prop inference (nulls → `T|null`, missing keys → `?`); nested vs inline; unions for heterogeneous arrays; readonly/export toggles; download `.ts`.
- Fit: source-result. GAP: option richness only.

### json-minifier

- Expected: minify; size before/after + % saved; repair-then-minify; NDJSON mode.
- Fit: source-result. GAP: size-savings stat display next to output.

### yaml-to-json / json-to-yaml

- Expected: YAML 1.2 (anchors/aliases, multi-doc `---` → array option); indent; flow vs block; quote style; key sorting; error with YAML line number.
- Fit: source-result. No structural gap.

### json-diff

- Expected: semantic diff (key order ignored); added/removed/changed with paths; side-by-side aligned red/green view; ignore-array-order / ignore-paths options; summary counts; JSON Patch output.
- Fit: source-result (dual). GAP: side-by-side highlighted diff rendering exceeds plain text pane.

### json-schema-generator

- Expected: draft select (draft-07 default, 2020-12); infer required toggle; additionalProperties; enum/format inference; `$id`/title.
- Fit: source-result. Fine.

### json-editor

- Expected: code editor with highlight/folding/bracket match; live error squiggles; side-by-side tree with add/edit/delete node ops; undo/redo; upload/download.
- Fit: custom. GAP: code+tree dual editing with node ops.

### xml-to-json / json-to-xml

- Expected: attribute prefix option (`@`/`@_`/`$`/none); text-node key; force-arrays; type auto-detect; namespaces; root element name; CDATA; declaration toggle.
- Fit: source-result. GAP: option richness (currently zero options).

### json-path-tester

- Expected: RFC 9535-ish: wildcards, recursive `..`, slices, filters `?(@.x>1)`, unions; results with normalized path + value + type; match count; cheatsheet; highlight matches in tree.
- Fit: source-result. GAP: filter/descent support; match highlighting in tree view.

### json-schema-validator

- Expected: draft-07/2019-09/2020-12; full keywords incl. `$ref`, `if/then/else`, combinators, formats; ALL violations as `instancePath: message`; live.
- Fit: source-result (dual). GAP: full engine (bundle ajv); structured error list output.

### json-array-to-table

- Expected: union-of-keys columns; nested flatten (dot paths) or stringify; sortable columns; blank cells for non-uniform rows; row count.
- Fit: source-result (table output). GAP: interactive sort/pagination on rendered table.

### json-escape / json-unescape

- Expected: full escape set incl. `\uXXXX` non-ASCII option, surrogate pairs; tolerate quotes; malformed-escape error with position; repeat-decode for double-escaped.
- Fit: source-result. Fine.

### json-key-extractor

- Expected: dot paths vs plain keys vs JSON Pointer; unique-only; array indices toggle; occurrence counts; sort.
- Fit: source-result. Fine.

### json-sorter

- Expected: asc/desc; case-sensitivity; recursive toggle; sort-arrays-by-value option; indent.
- Fit: source-result. GAP: order/case options missing today.

### json-to-csv

- Expected: flatten nested to dot-path columns vs stringify-in-cell; delimiter; header toggle; quote-all vs minimal; null representation; NDJSON input; download .csv; RFC 4180 quoting.
- Fit: custom today (bespoke) → source-result capable. GAP: flatten option + download.

### csv-to-json

- Expected: delimiter auto-detect; headers toggle; type inference (numbers/booleans/null); trim; skip empties; dot-path headers → nested option; ragged-row warnings with row numbers; RFC 4180 quoted newlines; download .json.
- Fit: custom today → source-result capable. GAP: header/type-inference options.

## 2. CSV & Data Tools (12)

### csv-viewer

- Expected: delimiter auto-detect + override; header toggle; click-to-sort columns; live search/filter; pagination or virtual scroll; row/col counts; sticky header; upload; export filtered view; never freeze on big files.
- Fit: custom. GAP: sorting/search/pagination interactivity + big-file handling beyond static HTML table.

### csv-to-markdown-table

- Expected: alignment per-column/global; pretty-print (padded cells); escape pipes; header options; `<br>` for in-cell newlines; rendered preview.
- Fit: source-result. GAP: alignment/pretty options; rendered markdown preview pane.

### csv-to-tsv / tsv-to-csv

- Expected: RFC 4180-aware delimiter swap; re-quote as needed; embedded-newline safety.
- Fit: source-result. Fine.

### csv-formatter

- Expected: quote normalization (all/minimal); trim cells; pad/truncate ragged rows with report; remove empty rows; normalize line endings; delimiter select.
- Fit: source-result. GAP: "what was fixed" summary alongside output.

### csv-to-table

- Expected: semantic `<table>` with thead/tbody/scope; copy HTML source vs copy rendered; striped/bordered option; caption.
- Fit: source-result (html). GAP: copy-as-HTML-code view alongside rendered preview.

### csv-sorter

- Expected: column by name/number; asc/desc; numeric vs alphabetic vs auto sort; case-insensitive; multi-column secondary; header pinned; stable.
- Fit: source-result. GAP: numeric/natural sort mode.

### csv-validator

- Expected: RFC 4180 lint: unclosed/stray quotes, inconsistent column counts (row numbers + expected/actual), duplicate/empty headers, trailing delimiters, mixed line endings; stats; errors vs warnings; pass/fail badge.
- Fit: source-result. GAP: structured error list with row anchors + badge.

### csv-duplicate-remover

- Expected: full-row vs key-column(s) match; case-insensitive; trim-before-compare; keep first/last; removed count + which rows.
- Fit: source-result. GAP: key-column dedupe, keep-first/last.

### csv-filter

- Expected: contains/equals/starts-with/regex modes; keep vs exclude invert; case toggle; numeric comparisons; matched count.
- Fit: source-result. GAP: match modes beyond substring, invert.

### csv-delimiter-converter

- Expected: from/to presets + custom char; auto-detect source; re-quote for new delimiter.
- Fit: source-result. GAP: auto-detect + custom delimiter input.

### csv-column-extractor

- Expected: by header name or index; multiple columns + reorder; include header toggle; output as CSV/list/JSON; unique-only.
- Fit: source-result. GAP: multi-column selection + output-format option.

## 3. Text Tools (14)

### word-counter / character-counter

- Expected: words/chars(±spaces)/sentences/paragraphs/lines; UTF-8 bytes, UTF-16 units, grapheme clusters (emoji-correct via Intl.Segmenter); reading/speaking time; keyword density; social limits (280/160) with progress warnings; live.
- Fit: source-result. GAP: stat-tile dashboard with live counters + limit progress bars.

### text-case-converter

- Expected: 9 cases + dot.case, path/case, alternating/inverse; preserve-acronyms; smart title case; unicode-aware; live.
- Fit: source-result. GAP (minor): all-cases-at-once grid with per-case copy.

### slug-generator

- Expected: separator choice; diacritic transliteration (NFD strip); stop-word removal; max length; batch per line.
- Fit: source-result. Fine.

### duplicate-line-remover / duplicate-word-remover

- Expected: case-insensitive + trim toggles; keep first/last; removed count; ignore blanks; unicode word boundaries.
- Fit: source-result. Fine.

### find-and-replace

- Expected: regex + ignore-case + whole-word; capture-group `$1` substitution; replacement count; invalid-regex inline error; match highlight preview.
- Fit: source-result. GAP (minor): match highlighting in input pane.

### text-sorter

- Expected: asc/desc; case-insensitive; natural/numeric sort; by-length; shuffle; reverse; dedupe-while-sorting; locale compare.
- Fit: source-result. Fine.

### whitespace-remover

- Expected: extra/all/leading/trailing/blank modes; tabs→spaces; NBSP + zero-width char removal; removed-count report; unicode whitespace class.
- Fit: source-result. Fine.

### text-reverser

- Expected: char/word/line modes; grapheme-safe reversal (Intl.Segmenter, not code units).
- Fit: source-result. Fine.

### text-diff-checker

- Expected: line diff + word/char intra-line highlights; ignore case/whitespace; unified vs side-by-side; add/remove/change counts; export unified diff.
- Fit: custom. GAP: side-by-side colorized panes with intra-line highlights — flagship gap.

## 4. Encoding & Decoding (14)

### base64-encoder / base64-decoder

- Expected: URL-safe alphabet (auto-detect on decode); padding toggle; MIME line-wrap; whitespace tolerance; strict mode; `data:` URI strip; file → base64; binary payload → hex view or file download fallback; proper UTF-8 (TextEncoder, not raw btoa).
- Fit: source-result. GAP: file input; download-binary fallback.

### url-encoder / url-decoder

- Expected: component vs full-URL vs encode-all modes; `+`↔space (form mode); repeat-decode until stable; malformed `%` graceful error with position; live.
- Fit: source-result. Fine.

### html-encoder / html-decoder

- Expected: minimal (`&<>"'`) + full named-entity + numeric dec/hex modes; full HTML5 entity table on decode; never render decoded output as HTML.
- Fit: source-result. Fine.

### text-to-binary / binary-to-text / text-to-hex / hex-to-text

- Expected: delimiter options (space/none/`\x`/`0x`); auto-detect delimiters; uppercase toggle; byte counts; multi-byte UTF-8 reassembly; positional errors.
- Fit: source-result. Fine.

### unicode-encoder / unicode-decoder

- Expected: formats `\uXXXX` / `\u{...}` / `\xNN` / `&#x...;` / `U+` (auto-detect on decode); escape-all vs non-ASCII-only; surrogate-pair handling; invalid escape → keep literal + warn.
- Fit: source-result. Fine.

### jwt-decoder

- Expected (jwt.io parity): header/payload/signature split, both JSONs pretty-printed, color-coded; alg/typ/kid; exp/iat/nbf as human dates + expired/valid badge + relative time; claim tooltips; signature verify (HS secret w/ base64-secret toggle, RS/ES public key or JWKS); per-part copy; `alg:none` warning; live; per-part errors.
- Fit: custom. GAP: 3-section color-coded output + verify badge + countdown.

### qr-code-generator

- Expected: size, EC level, colors (color picker), margin/quiet zone; SVG + PNG download; payload presets (WiFi/vCard/URL); live preview; payload-size warnings.
- Fit: source-result (image). GAP: PNG/SVG format choice; color-typed options; preset sub-forms.

## 5. Hashing & Crypto (11)

### md5 / sha1 / sha256 / sha512-generator

- Expected: hex + Base64 output, uppercase toggle; live hash-as-you-type; copy; **file input with streaming hash** (table stakes on all references); MD5/SHA-1 "not for security" label.
- Fit: source-result. GAP: file input + drag-drop hashing.

### checksum-generator

- Expected: MD5/SHA-1/SHA-256/SHA-512 + CRC32/SHA-384 all at once; labeled rows w/ per-row copy; expected-checksum field highlighting the match; file input with progress (catalog says "file checksums" but impl is text-only — explicit mismatch).
- Fit: source-result. GAP: file input; multi-row labeled output with match highlight.

### bcrypt-generator

- Expected: cost rounds (raise default 4 → 10-12), salt display, timing indicator, 72-byte truncation note; spinner above cost 12.
- Fit: source-result. Fine (fix default).

### bcrypt-compare / hash-compare

- Expected: match/no-match verdict badge; hash metadata parse (version/cost/salt); normalize before compare (trim/case/strip `0x`); algorithm auto-identify by length; first-mismatch position; constant-time.
- Fit: source-result (dual). GAP: pass/fail status badge + mismatch highlighting.

### hmac-generator

- Expected: SHA-1/256/384/512 + MD5; hex/Base64 toggle; **key-encoding select (UTF-8/hex/Base64)** — critical for webhook debugging; masked secret field; uppercase.
- Fit: source-result. GAP: masked secret field kind.

### uuid-generator / nanoid-generator / random-string / api-key-generator / random-number (see Generators)

## 6. JWT & API Tools (9)

### jwt-expiration-checker

- Expected: iat/nbf/exp as UTC + local + relative ("expires in 2h 14m"); verdict valid/not-yet-valid/expired/no-exp; lifetimes; clock-skew option; live countdown.
- Fit: source-result. GAP: status badge + ticking countdown; share JWT core with jwt-decoder.

### bearer-token-parser

- Expected: strip `Bearer ` case-insensitively; bare token + copy; JWT vs opaque detect; if JWT → full decode display.
- Fit: source-result. GAP: inherits jwt-decoder multi-section display when JWT.

### basic-auth-generator

- Expected: header + bare token as separate copyables; UTF-8 credentials (RFC 7617); reverse decode mode; masked password.
- Fit: source-result (dual). GAP: masked input; mode toggle ok as option.

### http-status-codes

- Expected: full IANA registry incl. 418/425/451; per-code description + RFC link; category browse when query empty; fuzzy search; live.
- Fit: source-result. GAP (minor): browsable reference table.

### url-query-parser

- Expected: full URL anatomy (protocol/host/port/path/hash + params); repeated keys → arrays; `+`-as-space; bracket `a[b]=c` option; editable round-trip table (nice-to-have).
- Fit: source-result. GAP (minor): key/value table view.

### curl-to-fetch / curl-to-axios

- Expected: parse -X/-H/-d/--data-raw/--data-urlencode/-u/-b/-F/--json/--compressed; `\` continuations; both quote styles; JSON body → object literal; async/await toggle; unsupported-flag warnings; shared cURL parser.
- Fit: source-result. GAP (minor): syntax-highlighted code output.

### utm-builder / url-query-builder (see Generators)

## 7. Generators (18)

### password-generator

- Expected: random/passphrase(diceware)/PIN modes; exclude ambiguous; min-1-per-class guarantee; zxcvbn-style strength meter + crack time; regenerate; copy-per-row.
- Fit: generator. GAP: per-row strength meter/copy (decorated list output).

### lorem-ipsum-generator

- Expected: units words/sentences/paragraphs/list; "start with Lorem" toggle; plain/HTML/Markdown output.
- Fit: generator. Fine.

### random-string-generator

- Expected: custom charset; exclude-similar; base58/base32 presets; prefix/suffix; entropy bits; crypto.getRandomValues rejection sampling.
- Fit: generator. Fine.

### uuid-generator

- Expected: v4/v7 + v1/v3/v5 (namespace+name inputs) + NIL; braces/URN formats; bulk 500+; v7 timestamp decode.
- Fit: generator. GAP (minor): conditional fields for v3/v5.

### nanoid-generator

- Expected: custom alphabet + presets; collision-probability calculator readout.
- Fit: generator. Fine.

### random-number-generator

- Expected: unique/no-repeat; sort; decimals precision; dice/coin presets; sum/mean; unique-count ≤ range validation.
- Fit: generator. Fine.

### api-key-generator

- Expected: charset/format select (base64url/hex/base58/UUID-style); `sk_live_` separator style; checksum suffix; entropy readout; per-row copy.
- Fit: generator. Fine.

### utm-builder

- Expected: required-field validation; lowercase warnings; medium presets; URL-encode; preserve existing query params; copy.
- Fit: generator. Fine.

### url-query-builder

- Expected: key/value row editor (add/remove/reorder); parse existing URL back to rows; array param styles; encode toggle.
- Fit: generator. GAP: repeatable key/value row widget (textarea `k=v` lines is the compromise).

### gradient-generator

- Expected (cssgradient.io): linear/radial/conic; multi-stop w/ draggable position sliders; color pickers w/ alpha; angle dial; radial shape/position; large live preview; presets; CSS + fallback output.
- Fit: custom. GAP: visual preview pane, multi-stop track, angle dial — hardest generator gap.

### css-box-shadow

- Expected: sliders; alpha color picker; multiple shadow layers (add/remove/reorder); live preview box w/ light/dark toggle; material presets.
- Fit: custom. GAP: live preview box + layer list.

### border-radius-generator

- Expected: 4-corner linked sliders; px/%; 8-value blob syntax; live preview shape (draggable handles best-in-class).
- Fit: custom. GAP: visual preview + linked sliders.

### cron-builder

- Expected (crontab.guru): 5 symmetric field builders; plain-English description live; **next 5 execution times in local TZ**; per-field validation; presets.
- Fit: generator. GAP: next-run list panel; current minute/hour dual-textarea shape is a misfit.

### meta-tag-generator

- Expected: full set (viewport, robots, theme-color, twitter:_, og:_); char-count guidance (60/160) live counters; SERP preview snippet.
- Fit: generator. GAP (soft): SERP preview card; per-field counters.

### open-graph-preview

- Expected (opengraph.xyz): per-platform preview tabs (FB, X summary/large, LinkedIn, Discord, Slack) with authentic dims; 1200×630 validation; tags as separate copyable code block.
- Fit: custom. GAP: multi-platform card preview + code block = two outputs at once.

### robots-txt-generator

- Expected: multiple user-agent groups; AI-bot block presets (GPTBot etc.); Allow + Disallow; presets; syntax validation; download.
- Fit: generator. GAP (minor): repeatable user-agent group blocks.

### regex-generator

- Expected: larger preset library (phone/date/IPv6/semver…); per-preset explanation + sample matches; test input with live highlight; more language wrappers.
- Fit: generator. GAP (soft): inline match-highlight test area.

### sitemap-generator

- Expected: per-URL/global lastmod/changefreq/priority; 50k/50MB validation; sitemap-index for >50k; gzip option; dedupe.
- Fit: generator. Fine.

## 8. Converters, Web & Markup, Color, Date/Time, Testing, SEO (remaining DevTools)

### markdown-to-html

- Expected: GFM tables/tasks/strikethrough; sanitize toggle; raw HTML + rendered preview both.
- Fit: source-result. GAP: dual output (raw + rendered) from one run.

### markdown-previewer

- Expected: split editor/preview w/ synchronized scroll; GFM; export HTML/PDF; word count.
- Fit: source-result (live). GAP: sync-scroll split pane; export button.

### html-viewer

- Expected: sandboxed render; JS-enable toggle (security decision); viewport presets (mobile/desktop); refresh; open-in-tab.
- Fit: source-result. GAP: viewport controls on result pane.

### javascript/css/html-formatter

- Expected: real parser formatting (Prettier standalone, lazy import); indent options; wrap width; syntax errors with line numbers.
- Fit: source-result. Quality gap (naive regex formatter today), not layout.

### javascript/css-minifier

- Expected: real minification (terser/csso, lazy); before/after size + % saved; optional mangling; download .min.*.
- Fit: source-result. GAP: size stat badge (result metadata).

### hex-to-rgb / rgb-to-hex / hex-to-hsl

- Expected: 3/4/6/8-digit + named colors; all formats at once; color swatch preview.
- Fit: source-result. GAP: swatch next to result (no visual mini-output kind).

### color-picker

- Expected: visual picker canvas / native color input; EyeDropper API; shades/tints/complementary palettes; contrast checker; copy-per-format.
- Fit: custom. GAP: entire interaction is visual — biggest color-family mismatch.

### css-unit-converter

- Expected: px/rem/em/pt/% with configurable root size; all-units table.
- Fit: source-result. Fine.

### timestamp-converter / iso-date-converter

- Expected: auto-detect s/ms/µs; ISO/UTC/local/relative; timezone select; ticking "current epoch" with copy; batch.
- Fit: source-result. GAP: live-ticking widget.

### date-difference

- Expected: y/m/w/d/h/m/s breakdown; business days; include-end-date; add/subtract mode; date pickers.
- Fit: source-result. GAP (minor): native date-input field kind.

### cron-parser

- Expected (crontab.guru): plain-English description; **next 5-10 run times w/ timezone**; per-field validation errors; `@daily` macros; steps/ranges; live.
- Fit: source-result. Feature gap: next-run times (croner lib), no layout gap.

### regex-tester

- Expected (regex101): match highlighting in test string; numbered+named group table; substitution mode w/ preview (third input); flag chips; explanation; positions; worker + timeout for catastrophic backtracking.
- Fit: custom. GAP: in-textarea highlight overlay, group table, third input.

### diagram-generator (Mermaid)

- Expected (mermaid.live): all diagram types; pan/zoom; error w/ line pointer keeping last good render; export PNG + SVG; theme select; templates.
- Fit: custom. GAP: pan/zoom pane, PNG export, keep-last-good-render, theme.

### domain-rating-checker (server action, Ahrefs)

- Expected: DR 0-100 + linking domains; gauge viz; last-updated. Server-side only (API key).
- Fit: source-result. GAP (minor): gauge; only server-action tool.

### domain-age-checker (RDAP)

- Expected: computed age string; registrar; expiry countdown warning; raw WHOIS toggle; ccTLD 404 handling.
- Fit: source-result. GAP (minor): labeled table vs raw JSON.

### dns-checker (DoH)

- Expected (MXToolbox): per-type tables with TTL; MX priority sort; SPF/DKIM/DMARC detection with pass/warn verdicts; multi-resolver; copyable values.
- Fit: source-result. GAP (minor): grouped tables + verdict badges.

## 9. Media — PDF (14)

(Note: repo has 14 PDF tools, not 20 — remainder are image tools.)

### merge-pdf

- Expected: multi-file upload, drag reorder, per-file first-page thumbnails, remove/add files, A-Z sort; (paid-tier elsewhere: per-file page pick — defer).
- Fit: collection (file-level). GAP (deferred): per-file page-range pick.

### split-pdf

- Expected: every page / every N / custom ranges via visual range builder over thumbnails; merge-ranges-into-one toggle; zip delivery.
- Fit: collection (partition). GAP: merge-ranges toggle not in options; zip packaging of N outputs.

### extract-pdf-pages

- Expected: thumbnail multi-select; range text "1,3,5-9"; select all/odd/even; extract-as-separate-files vs one PDF.
- Fit: collection. GAP: one-file-per-page mode → multi-output + zip.

### reorder-pdf-pages

- Expected: thumbnail drag-drop, keyboard move, reverse sort. Options `{pages}` full permutation.
- Fit: collection (reorder). No GAP.

### rotate-pdf-pages

- Expected: per-page rotate buttons on thumbnails; rotate-all; **mixed per-page angles in one pass**.
- Fit: collection (rotate). GAP: per-page independent angles (single `degrees` today) — needs per-item state like image-to-pdf `items[]`.

### delete-pdf-pages

- Expected: multi-select with undo; range input; guard against deleting all; remaining count.
- Fit: collection (remove). No GAP.

### crop-pdf

- Expected (Sejda): draggable crop rect over rendered page; apply to all/selected; auto-trim-margins option; per-page preview.
- Fit: visual-editor. GAP: per-page distinct boxes (one shared box today); auto-trim needs worker-computed suggestion.

### resize-pdf-pages

- Expected: paper presets A4/Letter/Legal/A3; custom W×H; orientation; scale vs add-margins fit; page selection; before/after dims readout.
- Fit: visual-editor. Options already match. No material GAP.

### compress-pdf

- Expected: preset levels; input→output size + % saved; strong-mode rasterization warning (confirmed flag exists); grayscale option.
- Fit: file-processor. No GAP. Surface `inputBytes/outputBytes`.

### watermark-pdf

- Expected: text (font/style/color) or image; 9-position grid + mosaic/tile; opacity; rotation; above/below content layer; page range; **rendered-page live preview** (audit flag: shows settings recap today).
- Fit: visual-editor. GAP: mosaic/tile + behind-content layer + font/color not in worker options.

### add-page-numbers

- Expected: position 6-way; formats `{n}`/`Page {n}`/`{n} of {x}`; start-at; page range (skip cover); font size/color; margin; rendered preview.
- Fit: visual-editor. GAP: `pages` selection + margin + color missing from options.

### image-to-pdf

- Expected: drag reorder; per-image rotation; page size fit/A4/Letter; orientation; margins; quality. Options already complete incl. per-item rotation.
- Fit: collection. No GAP.

### pdf-to-jpg / pdf-to-png

- Expected: quality/DPI 150/300; page selection via thumbnails; all pages → **zip**; PNG transparent background (differentiator, already supported).
- Fit: collection. GAP: zip download for multi-page output.

## 10. Media — Image (16)

### compress-image

- Expected (Squoosh): quality slider with **live before/after split preview** + per-file size estimate ("-63%"); presets as anchors; **target-size mode** (≤200 KB via quality binary search); PNG effort note; never-inflate guard; batch rows + zip.
- Fit: file-processor + preview pane. GAP (audit-confirmed): before/after compare, size estimate, target-size mode.

### resize-image

- Expected: W/H with aspect-lock chain; percentage mode; no-enlarge; shortcuts (1920×1080…); fit contain/cover/stretch + background; per-file source→target dims shown BEFORE processing.
- Fit: file-processor. GAP (audit-confirmed): per-file dimension preview for mixed batches.

### crop-image

- Expected: draggable/resizable box on real preview; aspect presets (1:1, 4:3, 16:9, 4:5…); **pixel-exact X/Y/W/H inputs two-way-synced with box**; rule-of-thirds grid; zoom; keyboard nudge (1px/10px); clamped to bounds.
- Fit: visual-editor. No new GAP if layout supports canvas + synced numeric sidebar.

### rotate-image

- Expected: rotate L/R accumulating buttons; per-file thumbnail reflecting rotation; **per-image rotation in batch** (reuse image-to-pdf items[] pattern); lossless-for-png promise.
- Fit: collection. GAP: per-item rotation vs one global value.

### flip-image

- Expected: H/V toggles with live thumbnails; consider merging with rotate later.
- Fit: file-processor with thumbnails. No hard GAP.

### combine-images

- Expected: h/v/grid layout picker; columns; gap slider; background color **incl. transparent for png/webp** (safeColor forces hex today); corner rounding/border; drag reorder; **live composed-output preview** (client-side scaled canvas, not worker per tweak); size normalization option; final dims + est size.
- Fit: collection + preview pane (or visual-editor). GAP (audit-confirmed): composed preview; transparent background.

### social-media-image-resizer

- Expected: presets grouped by platform with exact px in label; additions (FB cover 820×312, X header 1500×500, LinkedIn 1584×396, Pinterest 1000×1500, TikTok 1080×1920); fit/fill/pad + background; **multi-preset fan-out (1 image → all selected sizes)**; framed per-preset preview showing crop landing.
- Fit: file-processor + preset gallery. GAP (audit-confirmed): per-preset framed preview; 1→N fan-out inexpressible in single-op config.

### remove-image-metadata

- Expected: **pre-strip inspection panel** (GPS found / camera / N fields — client-side EXIF read); re-encode disclosure + high default quality; before/after bytes.
- Fit: file-processor. GAP (soft): metadata inspection panel.

### Format conversions (jpg↔png↔webp, heic→jpg/png — 8 slugs)

- Expected: drop → convert → zip; per-slug: background color picker for transparency flatten (png/webp→jpg), quality slider (→jpg/webp), "lossless, may grow" note (→png), HEIC multi-image error (handled), EXIF-preserve toggle (future differentiator); old→new size per row.
- Fit: file-processor — home turf. No GAP beyond exposing existing worker options.

---

## Consolidated Gap Analysis → Plan Accommodations

### A. Result model must be structured, not a string

Recurring: verdict badges (valid/expired/match), size before/after stats, counts, multi-section outputs (JWT parts, checksum rows), positional errors (line/col, row), labeled tables (DNS records, URL anatomy).
**Accommodation:** `ToolRunResult` becomes structured: `{ renderer, primary, sections?, stats?: {label,value,tone}[], verdict?: {status, label}, issues?: {message, line?, col?, row?}[], downloads?: {name, mime, data}[] }`. Renderer registry grows: `text`, `code` (highlighted), `json-tree`, `table` (sortable), `key-value`, `html`, `image`, `diff` (structured hunks), `validation` (issue list + badge), `stat-tiles`, `download-list`. Layouts render stats/verdict/issues in dedicated slots so every tool gets them for free.

### B. Field kinds must grow

Needed: `password` (masked — HMAC key, basic-auth), `color` (QR colors, backgrounds, watermark), `date`, `slider`, `preset`, `charset`/custom-alphabet text, `rows` (repeatable key/value — url-query-builder, robots agent groups; textarea fallback acceptable v1), `visibleWhen` conditionals (UUID v3/v5 namespace).

### C. Source panels need file capability

Hash/checksum/base64 tools expect file input + drag-drop and binary-download fallback. **Accommodation:** `SourcePanelSpec.fileInput?: { accept, maxBytes }` on SourceResultWorkbench; result `downloads[]` covers binary output.

### D. Confirmed customWorkArea roster (~12 DevTools)

jwt-decoder, text-diff-checker, regex-tester, color-picker, diagram-generator, csv-viewer, json-viewer, json-editor, gradient-generator, css-box-shadow, border-radius-generator, open-graph-preview (+ existing json-formatter, json-to-csv, csv-to-json bespoke). The folder-per-tool `WorkArea.tsx` escape hatch is load-bearing, not an edge case — plan already supports it.

### E. Generator preview slot

Several generators need a visual preview beside code output (box-shadow, border-radius, meta SERP, QR). For simple ones a `preview` renderer slot in GeneratorWorkbench (renders CSS/HTML from current output) suffices; the four hardest (gradient, box-shadow, border-radius, OG) go customWorkArea per D.

### F. Media: shared zip packaging

split-pdf, extract-per-page, pdf-to-jpg/png, all batch image tools need zip delivery of `WorkerOutputFile[]`. One shared client-side zip util (fflate) consumed by all three media layouts.

### G. Collection layout needs per-item state

Per-page rotation (rotate-pdf-pages), per-image rotation (rotate-image), already-proven `items[{id, rotation}]` in image-to-pdf. **Accommodation:** collection config declares `itemOps: { rotate?, remove?, reorder? }` and layout emits per-item state into `jobOptions(settings, files, items)`. Worker options for rotate-pdf-pages extend to per-item angles.

### H. Visual-editor / file-processor preview layer

Audit-confirmed misses (compress/resize/social previews, watermark rendered page, combine composite) resolve with one client-side canvas preview layer: decode once, redraw on option change, never invoke worker for preview. Visual-editor gets navigator + before/after per config; file-processor gets optional preview pane config.

### I. Runtime specifics

- Regex execution in a worker with timeout (catastrophic backtracking).
- Heavy libs lazy-imported per tool folder (Prettier, terser, ajv, croner, mermaid — mermaid already lazy).
- Live-ticking widgets (epoch clock, JWT countdown) = small client components in the tool's folder, allowed without full WorkArea override via an optional `accessory` slot.
- Password-protected PDFs: friendly error now; password-retry input later (worker `loadPdf` change).
- Shared parsers as single sources of truth: RFC 4180 CSV parser, cURL parser (fetch+axios), JWT decode core (3 slugs), page-range parser ("1,3,5-9", odd/even).

### J. Quality/feature debts recorded (not layout work)

Naive JS/CSS/HTML formatter+minifier → Prettier/terser; JSONPath filters/descent; ajv-backed schema validation; cron next-run times; bcrypt default cost 4 → 10; HTTP status descriptions; checksum CRC32/SHA-384; option-depth expansion across ~40 tools where competitors ship 4-8 options vs our 0-2.
