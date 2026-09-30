# Local downloader development

Run from the repository root:

```sh
pnpm dev
```

This starts a **local** Wrangler Worker on `http://localhost:8788`, waits for its authenticated health check, then starts Next.js on `http://localhost:3000` by default. Open `/downloaders` in the app. A running Docker daemon and the development database prerequisites below are required. Ctrl+C stops both process groups. The first container image build needs network access and can take several minutes. This command never deploys a Worker or provisions Cloudflare resources. `pnpm dev:downloaders` remains an alias for the same launcher.

For work that only needs Next.js, use `pnpm dev:app`. It preserves the previous lightweight development command on port 3000 and does not start or configure the downloader backend. Enabled downloader catalog pages can still render in this mode, but preparing a download requires restarting with `pnpm dev`. The combined launcher reports missing prerequisites instead of silently falling back to an app without its backend.

## Prerequisites

- Install the repository dependencies with pnpm and run a Docker-compatible daemon. `docker info` must work. `DOCKER_HOST` and `WRANGLER_DOCKER_BIN` are preserved; the launcher never changes the global Docker context. For Colima, point `DOCKER_HOST` at the socket belonging to the profile you already started.
- Provide the existing **development** PostgreSQL `DATABASE_URL`. The launcher reads `.env`, then `.env.local`, with shell variables taking precedence. The app and Worker use the same database. Local jobs and counters are real database records, so do not select a production database for local experimentation.
- Apply the downloader migration once to that development database if needed:

```sh
pnpm db:migrate 0009-media-downloaders
pnpm db:migrate 0010-download-format-inspection
pnpm db:migrate 0011-download-inspection-cache
```

The launcher checks the schema and default quota policy without mutating them. It reports missing prerequisites instead of migrating or seeding automatically. Downloader catalog entries must also be seeded and enabled in **Admin → Tools**. A seeded disabled row is still disabled. The launcher warns when no selected downloader is enabled; it leaves the app available so an administrator can enable one. It does not upload tool icons or change tool availability.

## Settings and local state

Absent or blank downloader settings receive local defaults: execution enabled, one container slot, all registered platforms selected, and bounded development capacity budgets. Explicit nonempty `DOWNLOADERS_*` settings win. In particular, an existing `DOWNLOADERS_ENABLED=false` stays false; set it to `true` and restart when you want local downloads. The local container configuration supports only `DOWNLOADERS_POOL_SIZE=1`.

`DOWNLOADERS_LOCAL=true` selects the local adapters and requires the intercepted local-storage startup probe. Both hosted and local startup check Linux, supervisor privileges and the interception CA trust store directly. Provider/CDN allowlists come from each platform service descriptor and are shared with hosted execution; no host-list environment variable is needed. Provider restrictions and unsupported source-composition/completeness checks still apply, and selecting a platform does not guarantee every URL works. Use videos you own or have permission to download.

Missing control, guest and network secrets are generated once into `/tmp/canopy-downloaders-dev/secrets.json` with mode `0600`; the directory is `0700`. Existing shell or dotenv secrets take precedence. The same values reach the app and Worker. Wrangler receives a private temporary environment file, without unrelated app integration or cloud account credentials. No secret values are printed by the launcher.

Local R2, Queue and Durable Object state lives under `/tmp/canopy-downloaders-dev/state`. The selected PostgreSQL database is separate and is not reset when this directory disappears. Local state and secrets survive launcher restarts but may be removed by the operating system's temporary-file cleanup. Do not delete them while a job is active. Removing guest secrets invalidates existing guest cookies; removing Worker state does not delete corresponding database jobs.

The launcher calls an authenticated local maintenance endpoint every 30 seconds for dispatch, recovery and expiration. This replaces scheduled-trigger delivery during local development. Local startup and synthetic tests do not prove production Cloudflare confinement, permissions or license readiness.

## Ports and Worker-only mode

Use `pnpm dev` on port 3000 for the normal local workflow. Stop an existing app-only process on that port before restarting through the launcher so Next.js receives the local bridge settings and matching secrets. Starting a Worker separately cannot change an already-running app's environment.

For an explicitly separate Worker process:

```sh
pnpm dev:downloaders --worker-only
```

`PORT` supplies the default app port; `--app-port <port>` takes precedence when a different port is explicitly needed. A custom `DOWNLOADERS_LOCAL_ORIGIN` may use HTTP `localhost` or `127.0.0.1` with a different Worker port. Remote hosts, credentials, paths and matching app/Worker ports are rejected. For authentication flows on a nondefault app port, keep the existing app's origin/auth settings consistent with that port.

Local downloader mode uses the sibling `.next-downloaders` directory, separate from the app-only command's `.next` development output. Keep those caches separate when switching between the commands.

Worker-only mode does not change an already-running app's environment. To use a separately started app, restart it with `NODE_ENV=development`, `DOWNLOADERS_LOCAL=true`, the same `DOWNLOADERS_LOCAL_ORIGIN`, and the same `DOWNLOADERS_CONTROL_SECRET`, `DOWNLOADERS_GUEST_SECRET` and `DOWNLOADERS_NETWORK_SECRET`. Prefer providing those secrets privately through your existing local environment files in both processes; do not paste them into shell history. The combined command handles this handoff automatically.

## Timing format inspection

Downloader diagnostics emit JSON with `event: "downloader_timing"`, a `stage`, and `durationMs`. Match `requestId` and `jobId` across API, Worker, dispatcher and native logs. No source URLs, titles, identities, cookies or capabilities are included.

- Browser development console: `browser.request` includes the response body; `browser.inspection_total` measures submission through receipt of the completed inspection, including polling delays, before React renders it.
- App terminal: `api` separates environment lookup, identity verification and the Worker response. Development responses also expose numeric `Server-Timing` headers. The Worker measurement ends at response headers.
- Worker terminal: `worker.*`, `dispatcher.*` and `container.*` separate admission, queue delay, database transactions, container startup, status checks and settlement. Repeated heartbeats/status calls are aggregated with a count.
- Container stdout: `native.*` separates Python/yt-dlp startup, imports/setup, source metadata extraction, format normalization and cleanup; `native.cobalt_metadata` measures the Cobalt resolver and required media probing. Fixed-code `downloader_failure` events identify the engine and phase without printing source URLs or credentials. When using Docker, read `docker logs <downloader-container-id>` and filter for `downloader_timing`.

Totals and nested stages overlap; do not add them together. Native extraction runs concurrently with dispatcher polling and heartbeat transactions. Compare the same source in cold and warm runs, and distinguish local development/database network latency from production performance. Python/container changes require a rebuilt image and a refreshed running container; hot-reloaded browser code alone is insufficient.

Healthy format inspections poll every second. Download observation and transient failures keep bounded backoff and respect `Retry-After`.

## Focused checks

```sh
node node_modules/vitest/vitest.mjs run tests/downloaders-local-launcher.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s lib/downloaders/container -p 'test_*.py' -v
```

The first checks environment precedence, local configuration, private secret persistence, authenticated maintenance payloads and read-only database prerequisites without launching services. Native tests use synthetic media; missing FFmpeg/socket tests are skips, not passing evidence. A live local download additionally requires a working Docker image, the local Worker adapters and an enabled source platform.

## Local verification recorded — 28 September 2026

The existing Colima profile `docker` was started with `--activate=false`; its socket was selected with `DOCKER_HOST=unix:///Users/ashishpal/.colima/docker/docker.sock`. This did not change the global Docker context. This developer-specific path is evidence of the tested environment, not a required path on another machine.

The historical verification below used a temporary downloader app on port 3001 while an app-only server occupied port 3000. That run ended; it is not the current startup instruction. Use `pnpm dev` on port 3000 as described above. During that earlier parallel run, nesting the downloader cache inside `.next` caused compiled routes to return HTML `404` responses; the separate `.next-downloaders` directory resolved the conflict.

| Check | Observed result | Boundary |
| --- | --- | --- |
| Linux amd64 image | Image built with the pinned engine dependencies; the latest run passed 22 native fixtures. A separate UID 10001 child check confirmed supervisor-secret isolation. | Local Docker evidence; not production Cloudflare confinement or a completed immutable-image release record. |
| Container startup and TLS | Actual Wrangler container health returned `ready:true` and recorded `startup_local_ready`. Local fixtures verified Python, Node and FFmpeg TLS, including FFmpeg `tls_verify=1`. | Confirms the tested local startup/trust path, not whole-graph production confinement. |
| Local Wrangler R2 | A 300,123-byte fixture passed PUT/ETag, conditional promotion copy, GET, Range `206`, wrong-method/tampered/expired capability rejection with `403`, and cleanup. | Actual local R2 adapter requests; not hosted R2 billing, CORS or production permissions evidence. |
| Next.js → local Worker → PostgreSQL | Guest establishment returned `200`, create returned `202`, and status returned `200` against the existing development database after correcting the local HTTP bridge. The Dailymotion browser flow reached “Retrieving the video”; its latest run was interrupted by development hot reload. | Confirms admission, lookup and execution progress. The interruption establishes neither a provider failure nor successful file delivery. |
| Real API end-to-end download | YouTube `jNQXAC9IVRw` completed through Next.js, Worker, PostgreSQL, Queue, Durable Object, Docker, yt-dlp and local R2 in 12.7 seconds of queue/execution time: queued → downloading → processing → succeeded. The artifact endpoint returned `303`, then the local R2 GET returned `200` with exactly 533,916 bytes. | One actual source workflow passes; this does not establish per-platform reliability. |
| Real browser end-to-end flow | Submitting that YouTube URL through the form reached “Your file is ready to download” with MP4, 521.4 KiB, 320 × 240 pixels, 19.064 seconds, audio included and 24-hour expiry. Clicking Download file produced artifact API `303` and a sealed local R2 GET `200` (16 ms in the server log). | The browser requested the file and the server delivered it; operating-system save completion was not independently confirmed. |
| Browser recovery | A transient status `500` recovered automatically to the successful result. Reloading the completed YouTube page restored the same guest job, all MP4 metadata and Download file action. Guest cookies persisted; reloading the earlier Dailymotion flow restored its same-owner failed job. | Covers the observed recovery cases, not every network or identity transition. |
| Focused regression suites | 200 distinct JavaScript tests passed across 12 suites: 163 across 11 suites plus 37 dispatcher tests. A later 25-test Durable Object rerun overlaps that total. Both app and dedicated Worker TypeScript checks exited successfully; formatting checks were corrected. | Do not add the overlapping rerun or earlier component counts to the distinct total. Deterministic tests complement the real workflow checks. |

The startup CA bug is resolved: appending the validated runtime CA measured 0.019 seconds, compared with 10.335 seconds for the full trust-store update that exceeded the startup window. Certificate verification remains enabled.

The successful artifact was `video.mp4` (`video/mp4`), 320 × 240 pixels, 19.064 seconds, with audio. Its SHA-256 was `028e566504aeea5200c5145f9e2e09eb54acbf3c5a00838dba0c85c3413c4dde`; the local verification copy is `/tmp/canopy-downloaders-result.mp4`. This checks the actual downloaded bytes, not merely a successful job status.

**At this earlier checkpoint, the local API and browser source-to-download-request flows passed for the tested YouTube source.** Actual positive platform coverage at that checkpoint was limited to YouTube. The older YouTube fixture reports `SOURCE_UNAVAILABLE` correctly. A stable Dailymotion sample failed extraction; optional `curl_cffi` is absent from the image, but an impersonation dependency is only an unproven possible cause. No provider-wide availability conclusion follows from that sample. That checkpoint preceded the completed Cobalt adapter and original-post integrations. Current platform routing, live Cobalt checks and the later X/Pinterest/Reddit/LinkedIn native checks are recorded in [downloaders-backend.md](./downloaders-backend.md#current-platform-and-engine-status).

Production confinement, cancellation/recovery, platform permission/composition, license, load/cost and deployment gates remain open; no Cloudflare deployment or resource provisioning was performed. Local success does not establish production readiness or successful downloads from all twelve platforms.
