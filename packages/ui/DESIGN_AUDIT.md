# design.pen component parity audit

Source: `DAGXr` — MyOnlineReceipt / SmartTools Design System.

## Foundations

| Area      | Design specification                                                                                                               | Implementation                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Color     | `#F6F7F9`, `#FFFFFF`, `#111214`, `#1A1A1A`, `#666666`, `#A7ADB5`, `#0066FF`, `#E8F0FF`, `#12A150`, `#E6F6EC`, `#EAECEF`, `#D6D9DE` | Exact semantic variables in `src/theme.css`                                                       |
| Type      | Inter headings, Geist body, Funnel Sans labels, Caveat expressive endorsement                                                      | Loaded in `app/layout.tsx`; exposed as `font-heading`, `font-sans`, `font-caption`, `font-script` |
| Radius    | 4 / 8 / 12 / full                                                                                                                  | Exact theme radii                                                                                 |
| Elevation | 0 1px 2px; 0 2px 4px + 0 6px 16px; 0 2px 4px + 0 12px 32px                                                                         | Exact `shadow-sm`, `shadow-md`, `shadow-lg`                                                       |
| Grid      | 1200px content, 64px desktop edge, 24px gutter, 16px mobile edge                                                                   | `AppContainer` max 1328px including 64px desktop padding                                          |

## Reusable component mapping

| design.pen component                                 | Code component                                                     | Parity details                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Button/Primary                                       | `Button default`                                                   | 46px, 26px horizontal padding, 15px/600, full radius, exact hover and active blue             |
| Button/Secondary                                     | `Button secondary`                                                 | 44px, 25px horizontal padding, white, strong border, full radius                              |
| Button/Ghost                                         | `Button ghost`                                                     | 40px, 20px horizontal padding, transparent, 14px/600                                          |
| Button/Destructive                                   | `Button destructive`                                               | 46px, 24px horizontal padding, `#DC2626`, full radius                                         |
| Button/Icon                                          | `Button size="icon" variant="outline"`                             | 40px square, 8px radius, strong border                                                        |
| Button/Compact Action                                | `CompactAction`                                                    | 32px, 8px radius, 10px padding, 14px icon, 11px/600 label                                     |
| Badge/Available                                      | `StatusBadge success`                                              | Success-soft fill, 7px dot, 12px Funnel Sans, 5/10 padding                                    |
| Badge/Status                                         | `StatusBadge`                                                      | Neutral, info, success, warning, danger, archived with semantic dot and surface               |
| Tag                                                  | `Badge variant="tag"`                                              | Muted fill, subtle border, 11px horizontal padding, 12px/500                                  |
| IconTile                                             | `IconTile`                                                         | 44px, 8px radius, accent-soft, 22px icon                                                      |
| Avatar                                               | `Avatar`                                                           | 40px, circular, accent-soft, Inter 14px/600 primary initials                                  |
| Input/Text                                           | `Field` + `Input`                                                  | 7px field gap; 12px/500 muted label; 11px helper; 8px input radius and strong border          |
| Auth/Field                                           | `Field variant="auth"` + `Input`                                   | 13px/600 foreground label; 14px input padding; auth routes use the auth variant               |
| Input/Textarea                                       | `Textarea`                                                         | 88px minimum, 8px radius, 12/13 padding, 14px body                                            |
| Input/Select                                         | `NativeSelect`                                                     | Input geometry plus 16px muted chevron                                                        |
| Toggle                                               | `Switch`                                                           | 44×26 track, 3px inset, 20px white thumb                                                      |
| Checkbox                                             | `CheckboxControl`                                                  | 20px, 4px radius, primary checked state, check and mixed indicators                           |
| Radio                                                | `RadioGroupItem`                                                   | 20px circle, 2px selected border, 9px primary dot                                             |
| Alert                                                | `Alert` / `AlertBanner`                                            | 8px radius, 16px padding, 12px gap, 20px semantic icon, 14px title, 13px body                 |
| Toast                                                | `Toaster`                                                          | Ink surface, 8px radius, 13/16 padding, 10px gap, 20px icon, exact 8/24 shadow                |
| Metric                                               | `MetricCard`                                                       | 12px radius, subtle border, 20px padding, 30px/700 value, semantic delta                      |
| SectionHeading                                       | `SectionHeading`                                                   | 13px eyebrow, 30px/600 title, 15px body, exact line-height and tracking                       |
| SidebarNavItem                                       | `SidebarNavItem` / `ToolNav`                                       | 11/12 padding, 12px gap, accent-soft active state, 18px icon                                  |
| SegmentedControl/Input Result                        | `TabsList variant="segmented"`                                     | Muted 8px shell, 4px padding/gap, active white 4px segment and small shadow                   |
| Tabs                                                 | `Tabs`                                                             | Subtle bottom rule, 4px gap, 10/12 trigger padding, 2px primary active rule                   |
| EmptyState                                           | `Empty` / `EmptyState`                                             | 12px radius, 40px padding, 14px gap, 56px icon tile, 17px title                               |
| TableRow                                             | `TableRow` + `TableCell` + `Avatar` + `StatusBadge`                | 14px row padding, semantic cells, 36px small avatar support                                   |
| Card                                                 | `Card`                                                             | White, 12px radius, subtle border, 24px padding, 14px gap, exact large shadow                 |
| Component/Header                                     | `ProductHeader` / `BrandLockup`                                    | 18/40 desktop spacing, 30px brand mark, 17px/600 brand name                                   |
| Component/Footer                                     | `ProductFooter`                                                    | Ink surface, 56/150/32 spacing, 300px brand column, muted inverse links, legal divider        |
| Component/ToolCard                                   | `CatalogCard`                                                      | 360px pattern, 24px padding, 16px rhythm, 44px icon tile, status, 18px title, 14px action     |
| Component/Tool Page Intro                            | `ToolPageIntro`                                                    | 1200px max, 820px copy, 34px title, 15px description, privacy status                          |
| Component/File Upload Zone                           | `FileUploadZone`                                                   | Accent-soft surface, primary border, 12px radius, 24px padding, 28px upload icon              |
| Component/File Queue Item                            | `FileQueueItem`                                                    | Bottom divider, 12px vertical spacing, 40px icon tile, compact metadata and action            |
| Component/Processing Status                          | `ProcessingStatus`                                                 | Ink 12px surface, 16/18 padding, 20px loader, inverse type and optional progress              |
| Component/Download Result                            | `DownloadResult`                                                   | 12px surface, 18px padding, success icon tile, metadata and primary action                    |
| Component/Tool Options Panel                         | `ToolOptionsPanel`                                                 | 360px pattern, 12px radius, 22px padding, 16px gap and labeled action area                    |
| Component/Tool How It Works                          | `HowItWorks`                                                       | Three bordered columns, 20/22 padding, 28px step circles and exact type scale                 |
| Component/Toolbar Inline Guidance                    | `InlineGuidance`                                                   | 15px primary lightbulb, 7px gap, 12px muted text                                              |
| Component/Right Panel Processing Action              | `RightPanelProcessing`                                             | 316px-compatible stacked processing card and full-width cancel slot                           |
| Component/Right Panel Result Action                  | `RightPanelResult`                                                 | 34px success tile, compact title/metadata and full-width action slot                          |
| Component/Universal Product Header                   | `UniversalProductHeader`                                           | 48px mark, 20px title, category pill, product navigation/action slots, SmartTools endorsement |
| Component/Universal Product Header — Inline Friendly | `InlineProductHeader`                                              | 104px bordered surface, 54px mark, current-tool pill, 22px title, Caveat endorsement          |
| Component/Tool Page System Controls                  | `ToolOptionsPanel`, fields, selection controls, alerts and buttons | Composed from exact primitives rather than duplicated local styles                            |
| WorkbenchFamily/JSON Formatter Viewer                | `ToolWorkspace` and `JsonViewerWorkbench`                          | 680px workbench shell, 64px toolbar, bordered panes, 42px monospace status bar                |
| WorkbenchFamily/Data Conversion                      | `ToolWorkspace` and `DataConversionWorkbench`                      | Shared two-pane runtime, semantic toolbar/options/status and exact shell elevation            |
| Component/Generic Utility Workbench                  | `ToolWorkspace` and `UtilityToolWorkbench`                         | Shared workbench shell with input region, options/results region and compact actions          |

## Product usage corrected

- Media now uses the shared upload zone, tool options panel, processing status and download result patterns.
- Devtools uses the shared tool intro and the 680px / 64px / 42px workbench geometry.
- Paperwork uses the shared dark product footer and design-system toast treatment.
- Auth fields select the explicit auth field variant.
- `/admin/design-system` renders the primitives and page-level patterns for live review.

`tests/design-system-alignment.test.mjs` protects the core token values, control geometry and pattern coverage.
