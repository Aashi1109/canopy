# Downloader backend contract

The backend contract is implemented and locally tested; deployment and live-platform verification remain pending. Public types are in `lib/downloaders/contracts.ts`. The frontend agent owns components, tool-framework UI and the admin page; this backend task owns routes, server logic, data, platform service classes and execution infrastructure. See [the backend handoff](downloaders-backend.md) for available methods and release blockers.

All endpoints are same-origin, private/no-store. Mutations require an exact trusted Origin and `Content-Type: application/json`. Cookies are sent using normal same-origin credentials. Errors use `{error:{code,message,retryable}}` with the appropriate non-2xx status. Quota responses include `Retry-After` when known. No raw provider URLs, credentials or engine logs appear in responses.

| Method/path | Request | Response |
| --- | --- | --- |
| `POST /api/downloads/guest` | `{}`; establish identity before saving a submission ID | `{owner:{kind,id}}` with a signed HttpOnly cookie; `id` is an opaque storage-scope value, never an authorization credential |
| `POST /api/downloads/jobs` | `{platform,url,quality,requestId,inspect?:true}`; quality is `"720"` or `"1080"`; requestId is a client-generated UUID persisted before sending | `202 {job: DownloadJob}`; inspection checks metadata without downloading media; replay of the same owner/request returns its original job; changed input is 409 |
| `GET /api/downloads/submissions/:requestId` | none | `{job: DownloadJob}` or 404; use this after a lost create response |
| `GET /api/downloads/jobs/:id` | none | `{job: DownloadJob}` |
| `POST /api/downloads/jobs/:id/select` | `{formatId}` from the job's stored inspection | `202 {job: DownloadJob}`; continues that job without another daily debit; repeating the same choice is idempotent, changing an accepted choice is 409 |
| `POST /api/downloads/jobs/:id/cancel` | `{}` | `{job: DownloadJob}`; running jobs may remain cancelling until confirmed stopped |
| `GET /api/downloads/jobs/:id/artifacts/:artifactId/download` | none | short-lived authorized redirect to an attachment; use native browser navigation, not Blob buffering |
| `GET /api/admin/downloaders/policy` | admin session with `downloaders.view` | `{policy: DownloadPolicy}` |
| `PUT /api/admin/downloaders/policy` | `{expectedVersion,guest:{daily,active,queued},account:{daily,active,queued}}` with `downloaders.edit` | `{policy: DownloadPolicy}`; stale version is 409 |

Platform IDs: youtube, tiktok, instagram, facebook, x, pinterest, reddit, vimeo, twitch, dailymotion, linkedin, snapchat. The service class registry owns executable availability; a platform needs an enabled catalog row and a configured passed release gate before admission.

Job states: queued, running, ready, cancelling, succeeded, failed, cancelled, expired. With `inspect:true`, `ready` contains `inspection:{title,durationSeconds,formats}` and `expiresAt`. Each format has an opaque `id`, container, dimensions, FPS, exact/estimated size, audio presence, merge requirement and video codec. Format metadata contains no provider URLs or request headers. Choices expire after at most ten minutes and no later than the admission day's UTC midnight. Selection resumes the same queued/running job; it rechecks availability and capacity, keeping cumulative processing, bandwidth and engine-start budgets. Only the stored choice can be selected. Eligible engines recheck its known dimensions, codec, frame rate, audio and size; unavailable or changed choices fail. YouTube Cobalt fallback preserves adaptive itag pairs, while Cobalt-owned representation IDs stay bound to its resolver. Progressive files avoid merging; separate compatible streams are combined without re-encoding. Platforms share the inspection/admission contract. YouTube and Instagram may use their specialized metadata adapters; other fresh sources use native inspection. Eligible technical failures may fall back from yt-dlp to Cobalt after cleanup. Inspection and selected download each allow up to two native starts, while total work and bandwidth remain cumulative.

Job responses include `inspect`, the original request mode. An inspection job with no `selectedFormat` is still checking formats; after selection, the same job prepares the actual download. Use this distinction for loading feedback and refresh recovery, including while a job is queued.

Recent validated public format metadata can be reused for the same canonical URL and quality. Creation may therefore return `ready` immediately; do not wait for a queued or running state. Reuse creates a new owned job, still counts against daily admission limits, and does not expose the original job or owner. Reused choices expire within two minutes of the original inspection, never extend that deadline through reuse, and retain at least fifteen seconds for selection at lookup. Selecting a choice reserves execution capacity and verifies the original format again before downloading.

Fresh specialized metadata can also return `ready` directly, with a two-minute expiry. Metadata lists contain supported original choices, not every upstream transport variant. An ambiguous or unsupported source uses the ordinary queued inspection path. Rate-limited format requests return `429 RATE_LIMITED` with `Retry-After: 60`; daily admission limits continue to apply atomically across all platforms.

Poll with a bounded backoff; stop polling when formats are ready, then resume after selection. Observation stopping does not cancel a job. Unknown progress is a stage, not an invented percentage. Result artifacts contain IDs and safe file facts, not stored signed URLs. All item downloads use the job/artifact endpoint above. `SOURCE_TOO_LONG` identifies the current 30-minute video limit; `FORMAT_UNAVAILABLE` means the source no longer offers the chosen format and requires a fresh inspection.

Guest proof remains valid for its own previously created jobs after sign-in. New jobs then belong to the account. Store only opaque owner/tool/request/job references and an unconfirmed format ID for recovery, never raw source URLs or signed URLs. Daily limits count admitted jobs (including format checks) across all platforms and reset at 00:00 UTC; selecting a format on that job does not count again, and changing policy does not reset usage.

Execution defaults to enabled with bounded capacity; an explicit `DOWNLOADERS_ENABLED=false` pauses it. Deployment validates required settings before uploading. A disabled backend returns an unavailable error; it must not simulate completed downloads.

Failed jobs retain the extractor's original message in `error.message`, without stack traces or redaction, up to the existing 1,000-character API limit. Error codes and retry rules remain stable. The UI displays this message directly. Jobs created before this behavior was deployed retain their previously stored messages.
