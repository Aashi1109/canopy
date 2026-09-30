# Downloader frontend integration

Downloaders is a separate public family at `/downloaders` with tool pages at `/downloaders/[slug]`, its own navigation group, catalog, search classification and breadcrumbs. Media lists only image/PDF tools. Legacy Media downloader URLs redirect to the standalone family. Existing immutable `media.<platform>-video-downloader` IDs and backend catalog records are retained for job ownership and compatibility; public catalog projection supplies the `downloaders` family without changing those IDs.

The frontend consumes `lib/downloaders/contracts.ts` and the endpoints in `docs/downloaders-api.md`. Backend service implementations must remain outside browser bundles.

The shared ToolPage recognizes one serializable family capability on ToolSpec:

```ts
job?: { kind: "download"; platform: PlatformId; platformName: string }
```

`lib/tool-framework/downloaderDefinition.ts` projects this property from the backend's registered descriptor. `catalog.loadSpec` has one family-level lookup; existing database catalog resolution remains authoritative. The frontend does not enumerate or publish platform tools. All ordinary tool host resolution remains unchanged.

Frontend owns `components/ToolPage.tsx`, the optional capability in `lib/tool-framework/spec.ts`, `app/downloaders/components/DownloaderWorkspace.tsx`, `app/downloaders/components/downloader/*`, `lib/tool-runtime/downloadJobClient.ts`, `lib/tool-runtime/useDownloadJob.ts`, and the admin downloader limits UI. Frontend also owns the pure UI-definition projection and the corresponding `catalog.loadSpec` lookup. Backend owns service registration, catalog seeding/activation, routes, contracts, permissions, schema and execution infrastructure.

The catalog hero artwork in `public/downloaders/hero.webp` is exported at 2× from approved canvas node `t35yL`. It is decorative, served locally, and displayed beside the headline on desktop and below the search on mobile.

The guide illustration in `public/downloaders/guide.webp` is exported from the approved canvas node `z7EL0o` (Unsplash photo `1602557089158-f91c696af5fd`). It is decorative, labelled as an illustration and served locally, not a source-video preview or a third-party tracking request.

The initial workspace's “Download” action starts a metadata inspection with a 1080p ceiling. When it reaches `ready`, the workspace displays the source's actual video choices with resolution, container, codec, size estimate and audio presence. The user selects one, and “Download video” resumes the same job without another daily debit. A ready-made original avoids merging; compatible separate video/audio streams are combined without re-encoding. Expired choices must be checked again, and unavailable selections fail explicitly without substituting a different format. The legacy direct-download API remains supported for existing callers. Available artifacts use the native attachment endpoint, without Blob buffering or fabricated progress/file facts. Preview requires an authorized preview route; attachment routes are not preview sources.

Healthy format inspections poll every 500 ms for their first five seconds of observation, then every second. Requests never overlap, owner verification stays in place, and failures retain the existing retry budget, backoff and `Retry-After` handling. Loading formats changes only the action button; actual downloads use the full processing state.

Recovery stores only opaque owner/platform/request/job references and an unconfirmed format ID in session storage, never source URLs, file facts or signed URLs. An uncertain selection must resolve or retry the same choice before another format can be chosen. Source URLs needed for a new attempt are retained only in memory. Account changes reauthorize resources and clear private in-memory results. Navigation stops observation, not durable processing. Cancellation uses the explicit endpoint.

## Integrated behavior

- The public Media route resolves an enabled database row through the registered service and renders the shared downloader workspace. The seed scanner now recognizes service-only folders without requiring a per-platform `definition.ts`. New downloader rows are disabled; rerunning the seed preserves saved names, descriptions, enabled state and custom downloader slugs. Registry imports and the projection also work in the plain Node seed command.
- Guest jobs can resume after sign-in using the retained guest cookie and an authorized lookup. A lost POST response followed by a submission 404 keeps the original request ID for same-owner retries, including form resets. A pending guest submission is never silently resubmitted as an account job.
- Cancel remains available while status polling is delayed; it stops that observation and calls the explicit cancellation endpoint. Late poll responses cannot overwrite cancellation.
- Expired files, missing result files and disabled services have recovery states. Download eligibility is checked again on click, including after background-tab timer delays. Attachment navigation requests a download without claiming the browser saved the file.
- `/admin/downloaders` now uses the existing protected admin layout. The form reads and saves the policy API, refreshes pristine/read-only fields, retains actual unsaved drafts through conflicts, and recovers after an unconfirmed save without inventing success.
- Media discovery labels downloader cards as server processing and preserves browser-only labels for existing image/PDF tools. The hero, counts, search copy and metadata no longer imply every Media operation is local.

## Verification and activation

259 focused tests passed across scoped client, lifecycle, workspace, admin, catalog/seed, platform, authorization, API and existing artifact-action checks. Application and dedicated Worker TypeScript checks, scoped formatting, OpenSpec strict validation and diff checks passed. Plain Node scanned all 160 tool folders, including the twelve service-only downloaders. Integration testing also reproduced and fixed noncanonical guest-token encodings without changing valid signatures or the HTTP fixtures.

Real-component browser fixtures cover entry, quality selection, queued/running/results, cancellation, expiry, failure, recovery and admin edits at 1366×768, 1280×720 and mobile widths. Those workflow checks use mocked API responses; they do not establish Cloudflare extraction or R2 delivery. The running application's Media catalog and downloader category were also checked in Chrome at desktop, laptop and mobile widths without page exceptions or horizontal overflow.

The frontend does not activate an execution method. Run the existing database migration and seed workflow against the intended environment before enabling catalog rows; apply the remaining [backend release gates](downloaders-backend.md) before enabling real downloads. No application database migration, seeding or cloud deployment was performed during this integration.
