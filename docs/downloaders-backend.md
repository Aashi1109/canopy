# Downloader backend

Implementation date: 27 September 2026. This is the backend handoff; the subsequent [frontend integration](downloaders-frontend.md) uses the same API contract. Execution defaults to enabled with bounded capacity; required credentials are checked before preview deployment. Code and deterministic tests are not evidence that a platform works from Cloudflare.

## Structure and API

The Next.js routes authenticate the account or signed guest, enforce Origin/JSON boundaries, and call the private `DOWNLOADERS` service binding. In explicit development-only local mode, the same routes use a signed loopback bridge to the local Worker. The dedicated Worker owns durable admission, queue delivery, native execution and artifact access. [The frontend contract](downloaders-api.md) defines the eight public endpoints and error shapes. The [local workflow](downloaders-local.md) starts the app and Worker together without provisioning cloud resources.

`PlatformService` supplies a descriptor and `parseUrl`, `buildEngineRequest`, and `classifySource`. Its `inspectionEngine` defaults to yt-dlp; a service can select an installed specialized metadata adapter. Twelve classes live in their `tools/<platform>-video-downloader/service.ts` folders. The single service registry is executable policy; `managed_tools` remains the public catalog. New platform IDs are looked up in that registry, not repeated in route enums.

The descriptor selects installed yt-dlp extractor classes and content forms whose URL identifies one video. Its `egressHosts` declares provider/CDN domains alongside the platform service; exact accepted URL hosts are included automatically. Local and hosted execution use this same allowlist without an environment override. Wildcards such as `*.example.com` match subdomains only. New redirects, manifests or CDN domains require an explicit service change and verification; unlisted hosts remain blocked. The native process cannot select Generic, accept arbitrary flags, load plugins, or delegate to an unapproved extractor. Original post composition must be proved before a multi-item result can be published. A filtered engine playlist is insufficient.

PostgreSQL owns policy versions, guest/account daily and queued counts, active permits, platform starts, slot generations, attempt starts and artifact ownership. A queue message contains only job ID and dispatch version. Admission and dispatch are idempotent; a leased outbox recovers sends lost between database and Queue. Each database phase closes its pool before native or storage work starts.

After durable admission, queue publication runs in `waitUntil`, so the HTTP response does not wait for outbox claim/send/mark round trips. The native dispatcher still runs in the Queue consumer with its full execution lifetime. This applies to every platform and to format selection as well as creation.

Quota rows are inserted and locked in two ordered bulk queries. Slot registration also uses one ordered bulk insert regardless of configured capacity. Daily and monthly execution reservations are updated together; cost applies only to the daily bucket. Heartbeats and engine-start debits lock only job, slot and attempt rows because they do not change quota counters or use the current admin policy. Cancellation, expiry and recovery can release existing ownership even if that policy is unavailable; new admissions and claims still require it. Starting an engine records usage, checks cancellation, renews its lease and debits the start in one transaction. Running attempts renew at most every five seconds (or one third of the lease, if shorter); local budget and deadline checks still run on every status cycle. A confirmed stopped result goes directly to fenced settlement. Format inspections check native status every 250 ms; downloads retain one-second checks and forced renewals during artifact promotion.

For canonical supported URLs, admission can reuse validated metadata from a recent ready inspection of the same URL, platform and quality. Migration `0011-download-inspection-cache` adds the partial lookup index. A hit creates a new owner-bound ready job and still charges daily admission limits, but skips queue permits, native execution and execution-budget reservations. Its expiry is capped at two minutes after the original inspection and inherited through subsequent reuse; candidates with fifteen seconds or less remaining are ignored. Selection reserves the remaining execution budget and revalidates the selected format properties through its eligible engine. Cobalt-owned representation IDs remain bound to Cobalt. This accelerates repeated sources; it does not reduce fresh-source extraction time.

The shared inspection preflight checks policy, existing submissions and recent metadata in one read-only query before an enabled inline metadata adapter performs external work. Native inspections go directly through atomic admission, which already checks these conditions and reuses cached formats. Atomic admission remains authoritative if policy or usage changes after a preflight read. Every registered platform uses the same cache, ownership and quota path. YouTube additionally uses a bounded YouTube.js adapter: the watch-page public/live/restriction evidence and VISIONOS format metadata are checked together; only unambiguous original video/audio pairs within the current limits are offered. The adapter does not download media, execute player JavaScript or fetch arbitrary URLs. It caches only completed plain session data for ten minutes, creating new request-bound clients for each lookup. Unknown or unsupported evidence falls back to the normal yt-dlp inspector. Instagram now has a single-request public-page adapter. It reads the matching logged-out video payload and static DASH manifest, preserves native format IDs, and automatically pairs a single unambiguous audio track. The page payload must identify the requested shortcode and numeric media ID, belong to a public account, contain one bounded video period, and satisfy the existing duration/quality/size limits. Missing, restricted, conflicting or ambiguous metadata retains native extraction. Other platforms retain their registered native extractor; upstream response times still differ.

YouTube HTTP metadata attempts are bounded to a 2.5-second deadline, four MiB per response and eight MiB total. Instagram makes one request with a 1.8-second deadline and a two-MiB response limit. Both count the final observed chunk before abort, capped at the job budget; exhausting that budget rejects admission. The rate-limit binding allows twenty checks per minute per owner and network **per Cloudflare location**; it is burst protection, not an atomic global counter. Accepted jobs include measured lookup work/bytes in their remaining native budget; ready jobs charge those bytes to daily/monthly counters. A duplicate or quota-rejected HTTP lookup can already have transferred bounded metadata before admission, so that overhead is outside the admitted-job ledger. All admitted jobs and actual downloads still obey the PostgreSQL counters. This distinction matters when sizing infrastructure budgets.

One named Durable Object maps to one container slot. Its byte meter intercepts approved HTTPS traffic and batches accounting in bounded 256 KiB chunks, including already-read residual bytes on cancellation or failure. It holds short storage transactions for usage updates. Container **lifecycle** start/stop operations additionally serialize behind a bounded guard: a late auto-start must not resurrect work after recovery has certified a stop. The supervisor's start response does not wait for extraction. Extraction, polling intervals, media transfer and promotion never run inside a database transaction. The lifecycle guard is a deliberate exception to the original plan's blanket prohibition on network operations inside a DO guard; it still requires deployment testing for re-entrant proxy behavior.

Idle native slots remain available for ten minutes, matching the Container class default, instead of sleeping after one minute. Reuse serves every platform without a keepalive loop or extra slots. Idle provisioned memory and disk are billable, and platform restarts can still cause cold starts; see the [native runtime notes](../lib/downloaders/container/README.md).

The trusted supervisor runs as root solely to isolate its control/storage capabilities and drop native children to UID 10001. Native children cannot read the supervisor's environment. Cloudflare installs the interception CA at runtime; the supervisor assembles a verified trust store rather than disabling TLS checks. Native startup checks Linux, supervisor privileges and the interception CA trust store directly. The Container class enforces network access restrictions, and explicit local mode also probes the intercepted storage endpoint. Hosted execution uses the existing DOWNLOADERS_ENABLED switch and requires the configured limits, platforms and control secret.

## Current platform and engine status

All twelve platform service classes and URL fixtures are implemented. The table separates supported source forms from outstanding production verification; local evidence is recorded below.

| Platform | Native candidate scope | Remaining method gate |
| --- | --- | --- |
| YouTube | Public videos and Shorts, yt-dlp with Node/EJS | Cloudflare extraction/network/quality fixtures; no PO-token provider installed |
| TikTok | Public video posts | Cloudflare fixtures |
| Instagram | Reels and individual videos | Cloudflare fixtures; `/p/` composition remains unverified |
| Facebook | Public individual video/Reel URLs | Cloudflare fixtures |
| X | Public single-video status URLs, including unified video cards | Cloudflare fixtures; photos, mixed/multiple videos, quoted media and external embeds excluded |
| Pinterest | Native video pins and single-video stories with text | Cloudflare fixtures; image/mixed/multiple-video stories and external embeds excluded |
| Reddit | Public Reddit-hosted videos, including same-video crossposts; audio merged automatically | Cloudflare fixtures; galleries, gated posts and external embeds excluded |
| Vimeo | Public individual videos | Cloudflare fixtures; protected/restricted content excluded |
| Twitch | Clips | Cloudflare fixtures; VOD/live excluded |
| Dailymotion | Public individual videos | Cloudflare fixtures |
| LinkedIn | Public activity/ugcPost video posts | Cloudflare fixtures; Learning, private, mixed and multiple-video posts excluded |
| Snapchat | Spotlight | Cloudflare fixtures; Stories/private content excluded |

Known forms without a completion path are rejected before admission, so they do not consume a daily allowance. Short links are rechecked after bounded resolution.

Cobalt is an active alternate for YouTube, Instagram, TikTok, Dailymotion, Vimeo and Twitch single-video sources. Each platform declares its ordered engines once in `candidateEngines`; admission, dispatch and request construction use the same source and format eligibility rules. Unsupported source forms still fail admission. The adapter calls pinned Cobalt service resolvers directly, using a small build-time patch to expose actual source metadata before Cobalt's public API discards it. Missing source identity, public/composition evidence, or finite duration is rejected. Facebook and Snapchat retain yt-dlp only. X, Pinterest, Reddit and LinkedIn now use yt-dlp with original-post verification; Cobalt is not enabled for these four.

The four post adapters validate the original upstream post before yt-dlp can discard images or choose an external embed. The source post ID and actual media ID are bound separately. Only complete public single-video posts enter the current format picker; mixed/photo posts and multi-video posts fail explicitly. Native wrappers reuse the extractor response without an extra post request. Unknown progressive dimensions/codecs/audio are read by a bounded, certificate-verified media probe; up to three probes run concurrently, at most eight during inspection, and selection re-probes only its selected original. X manifest audio is retained even when the manifest omits the audio codec. Selected output dimensions, container, codec, frame rate and audio are verified against actual bytes as well as against refreshed metadata.

Local native verification (29 September 2026): all four completed actual inspection, exact selection, download, storage PUT/readback and full FFmpeg decode in disposable Linux containers. X `1575560063510810624` produced a 315,715-byte MP4 with audio; Pinterest `1084663891475263837` produced an 847,653-byte MP4 with audio; Reddit `6rrwyj` produced a 1,091,835-byte MP4 with automatically merged audio; LinkedIn `7151241570371948544` produced a 3,305,080-byte MP4 with audio. X unified-card and regular Pinterest pin metadata were also verified, and a real mixed X post was rejected before format listing. These tests used an in-memory storage connector, not deployed Cloudflare/R2. The app and Worker stayed stopped. Focused database tests cover admission, ready metadata, cache reuse, selection and claim for all four.

Fresh native inspection samples were 2.30–5.21 seconds during concurrent disposable-container testing; these are not an under-two-second guarantee or an app latency benchmark. The existing two-minute metadata cache also covers verified post URLs. Upstream response time and missing-format probes still affect fresh checks.

Only classified extraction/network failures can trigger one alternate engine, after confirmed cleanup. Authentication, challenges, private/live/protected content, format mismatch, cancellation and limits never trigger fallback. Cobalt can inspect a source and return a real supported representation; it does not invent a full format catalog. YouTube adaptive selections bind actual video/audio itags. Other engines may provide a different representation only if all known selected properties match, including exact advertised size when available; otherwise selection fails. Cobalt-owned IDs cannot be sent to yt-dlp.

Transfers run in confined children under the existing egress meter. Complete HTTP framing is required, but Content-Length is optional. Static, unencrypted HLS playlists are materialized segment by segment before local FFmpeg merging; live, encrypted or incomplete playlists are rejected. The supervisor verifies duration, selected output properties, successful merging, and a full decode of the stored readback before publication. The upstream Cobalt HTTP tunnel is not used.

Local Cobalt verification (29 September 2026): actual source inspection, selected download, child transfer/merge, storage PUT/readback and full decode passed for YouTube `jNQXAC9IVRw` (744,413-byte MP4), Dailymotion `x84sh87` (20,494,439-byte 1080p MP4) and Twitch `FaintLightGullWholeWheat` (16,299,328-byte 1080p MP4). These native checks used a disposable container and an in-memory storage connector, not deployed Cloudflare/R2. The normal app API path also passed after restart (YouTube MP4, 506,018 bytes, authenticated Range 206). A real Cobalt Twitch inspection was then admitted as an owned test job through the normal quota function; selecting its Cobalt-owned format through Next.js exercised Worker dispatch, the confined native adapter, local R2 publication and authenticated Range 206 delivery. That selected download completed in 18.06 seconds with the same 16,299,328-byte MP4 and audio. This verifies the Cobalt app/storage path in addition to isolated materialization; it does not claim a naturally occurring yt-dlp failure was reproduced. Classified failure-to-Cobalt routing is covered by dispatcher tests. Twitch clips currently use the verified CDN host `d1ndex63qxojbr.cloudfront.net`; the Twitch service includes this exact host rather than allowing all CloudFront tenants. Verify the service allowlist against the provider hosts used in the target deployment. Native fallback inspection is not an under-two-second guarantee: observed YouTube took 2.56s and Dailymotion 6.33s.

The other three Cobalt adapters are implemented but not live-validated: the tested Instagram sources returned image results and were rejected; Vimeo's pinned OAuth call returned HTTP 400 before source lookup; TikTok's public HTML lacked the metadata expected by its pinned resolver. They remain opportunistic alternates, not claims of working platform-wide coverage. YouTube progressive IDs and fully specified VP9/AV1 profiles without sufficient output evidence are rejected rather than silently replaced. These limitations do not remove the existing yt-dlp or specialized metadata paths.

No credentials, cookies, DRM bypass or challenge-solving service is accepted from users. Upstream throttling, login requirements and IP blocking remain external availability limits. Increasing worker/container capacity does not remove them.

## Format latency measured locally — 29 September 2026

These are individual end-to-end API observations through Next.js, the local Worker and the development database, including guest identity creation. They are not production percentiles or a platform-wide speed guarantee. An uncached source below means no reusable inspection row; the app itself was running.

| Request | Time to ready formats | Result |
| --- | ---: | --- |
| YouTube `F_OtN7l0BKc`, uncached | 1.350 s | 18 selectable formats |
| YouTube `aqz-KE-bpKQ`, uncached | 1.357 s | 17 selectable formats |
| YouTube `jNQXAC9IVRw`, uncached | 1.150 s | 6 selectable formats |
| Instagram public Reel, previous native path, uncached with cold slot | 7.006 s | 6 selectable formats |
| Same Instagram Reel, previous shared metadata cache measurement | 0.671 s | Same 6 selectable formats, no native dispatch |
| Instagram previous native path, uncached, reused slot during local verification load | 9.735 s | 6 selectable formats; container-start RPC 0.193 s |
| Instagram `CDUMkliABpa`, uncached public-page adapter | 1.751 s | 5 selectable video/audio pairs |
| Instagram `Chunk8-jurw`, uncached public-page adapter | 1.777 s | 6 selectable video formats; source has no audio |
| Instagram `CDUMkliABpa`, repeated after cache expiry | 1.397 s | 5 selectable video/audio pairs |

The short YouTube fixture also passed actual selection of `160+140`, automatic merging, final publication, and authorized MP4 Range delivery with audio. Native format selection accepted all 41 specialized choices from the three YouTube samples. This does not prove that every source or every future format will remain available; selection still revalidates the exact format.

The three Instagram page lookups took 1.232, 1.329 and 1.045 seconds inside the Worker; the totals above include guest creation and database admission. Native format selection accepted all eleven choices from the captured public payloads. The audible fixture also completed exact selection, download, automatic merging, artifact publication and authenticated MP4 Range delivery (206, 619,424-byte file with audio). These are local samples with Next.js routes compiled beforehand, not a guarantee for every source or Cloudflare egress location. A page without usable metadata takes the native fallback path and can exceed two seconds.

The shared routing/cache, quota, dispatch, polling and container changes cover all twelve registered services. Only YouTube and Instagram currently have separately verified lightweight metadata adapters. Instagram uses the public-page route accessed by Cobalt, with an application-owned DASH parser; this is not the stock Cobalt API or a Cobalt fork. Cobalt's normal API collapses video versions and its picker represents multiple media items, so it cannot supply this format catalog directly. Live anonymous probes of the mobile and Cobalt GraphQL routes returned 403 and 401; these rejected routes were not added to the fast path. See the [Cobalt Instagram source](https://github.com/imputnet/cobalt/blob/a636575b09de1fc55d9b8cd98cac88f5f2f16b42/api/src/processing/services/instagram.js), [Cobalt API contract](https://github.com/imputnet/cobalt/blob/main/docs/api.md), and [yt-dlp extractor options](https://github.com/yt-dlp/yt-dlp#extractor-arguments).

## Configuration

App Worker secrets, independent random values of at least 32 characters:

- `DOWNLOADERS_GUEST_SECRET`; optional `DOWNLOADERS_GUEST_PREVIOUS_SECRET` during 30-day cookie rotation.
- `DOWNLOADERS_NETWORK_SECRET`, stable while the current network quota window is active.

Dedicated Worker secrets/settings:

- `DOWNLOADERS_CONTROL_SECRET`: internal operation capabilities, never passed to native child environments.
- `DOWNLOADERS_R2_ACCOUNT_ID`, `DOWNLOADERS_R2_BUCKET`, `DOWNLOADERS_R2_ACCESS_KEY_ID`, `DOWNLOADERS_R2_SECRET_ACCESS_KEY`: private bucket only, no public bucket domain.
- `DOWNLOADERS_ENABLED=true`: enabled by default. Set `false` to pause admission/claim deliberately; recovery, cancellation and deletion continue while disabled.
- `DOWNLOADERS_POOL_SIZE=2`: stable slots `download-1` through K, maximum 250. Shrinking K drains active/uncertain work before permitting replacement work. Cloudflare account limits may require an increase before raising K.
- `DOWNLOADERS_YOUTUBE_INSPECTION=true`: use the bounded specialized YouTube metadata adapter; `false` retains native inspection. Requires the shared `DOWNLOAD_INSPECTION_RATE_LIMITER` binding and the approved YouTube egress host. Its dependency is needed for fetched session context and actual provider formats; it does not replace yt-dlp downloads. Rate-limit namespace IDs in each Wrangler environment must remain distinct from unrelated account namespaces.
- `DOWNLOADERS_INSTAGRAM_INSPECTION=true`: use the bounded public Instagram page/DASH adapter; `false` retains native inspection. Requires the shared rate-limit binding and approved `www.instagram.com` egress. This does not enable the separate Cobalt download engine. Local development enables it by default.
- `DOWNLOADERS_PLATFORMS`: optional comma-separated subset; defaults to every registered platform. Each still requires an enabled, unarchived catalog row.
- `DOWNLOADERS_LIMITS`: optional complete JSON capacity override. All values must be positive integers. These are infrastructure controls, separate from the six admin-managed user limits.

Default hosted capacity (adjust for measured traffic and cost):

```json
{
  "globalDailyJobs": 100,
  "networkDailyJobs": 20,
  "globalQueued": 50,
  "platformActive": 2,
  "platformStartsPerMinute": 10,
  "globalDailyBytes": 107374182400,
  "globalMonthlyBytes": 1073741824000,
  "globalDailyCostMicros": 10000000,
  "jobCostMicros": 100000
}
```

`jobCostMicros` must cover the measured worst allowed execution, idle, storage, copy and request cost, in millionths of a USD. The database reserves it at admission; absent trusted actual cost data it conservatively retains it. These admission budgets are **not a Cloudflare invoice hard limit**: shared account spend, retained storage, signed-link replays and external billing changes need account-level monitoring.

Fixed product ceilings: 720/1080 shorter display edge, 30 minutes/video, five video files, 250 MiB/file, 500 MiB combined output, 1 GiB source/request bytes per job, 2,000 outbound requests per attempt, 2 GiB scratch, ten minutes total processing (inspection and download combined), two durable starts per phase (inspection and selected download), at most four per job across fallback/recovery, ten-minute queue age. Request bytes are also counted conservatively. The meter includes retry bodies and metadata. A returned file's size is not used as a substitute for source bandwidth.

The admin endpoint updates positive daily/active/queued limits for guests and accounts using an expected policy version. Saves require `downloaders.edit`, reads require `downloaders.view`, both require Admin access. The audit record is in the same transaction. Policy changes preserve current usage; UTC daily admissions are not refunded for admitted failures or cancellation.

## Provision and deploy

Cloudflare provisioning remains manual. Local integration has applied the additive downloader migrations to the approved development database; deployment databases must be migrated separately. Provision the dedicated private R2 bucket and Queue first. Intended production names are `canopy-downloads`; development names add `-dev`. Confirm that the selected environment's producer, consumer and bucket bindings target the intended resources before deployment. Configure a two-day object lifecycle backstop for both `staging/` and `sealed/`, and keep public access disabled. Normal application access expires at 24 hours, independent of eventual physical deletion.

Renaming Wrangler configuration does not rename existing remote resources. Provision or reference the intended queue and bucket, configure secrets on the new `canopy-downloaders` or `canopy-downloaders-dev` Worker, and update the app's service binding before cutover. See the [app deployment notes](../README.md#configure-once) for its Worker name and dev OAuth callback changes.

For development, configure both app and downloader settings in the root `.env`,
start Docker, then run one command from the repository root:

```sh
pnpm deploy:preview
```

It deploys `canopy-downloaders-dev` and its container image first, then freshly
builds and deploys `canopy-dev`. Only the backend's downloader settings are
forwarded to the downloader Worker; unrelated app credentials, guest/network
secrets and local downloader overrides are excluded. Each stage must succeed
before the next starts. An app build/deploy failure leaves the completed backend
deployment in place. It validates runtime settings, the control/guest/network
secrets (at least 32 characters each), and R2 settings before uploading anything.
Keep these required credentials in `.env`; missing local credentials fail even if
an older deployment has remote secrets. Secret values are never printed by this
validation. Downloads default to enabled; `DOWNLOADERS_ENABLED=false` is an explicit
pause. The command does not provision resources, migrate the database or change
saved catalog settings. The standalone Wrangler
command deploys only the backend; it does not update the app. Production app
deployment and the local preview command retain their existing behavior.

1. Review and apply `0009-media-downloaders`, `0010-download-format-inspection`, then `0011-download-inspection-cache` using `pnpm db:migrate <migration-name>` against the intended database. The cache index migration uses `CREATE INDEX CONCURRENTLY` and must run outside a transaction. Policy defaults seed once and preserve saved values when rerun. The existing `pnpm db:seed` workflow now discovers downloader service classes and inserts missing catalog rows disabled, preserving existing downloader slugs and admin edits. Restart running app instances after seeding to refresh the process-local catalog. Enable individual catalog entries only after the corresponding release gates pass.
2. Configure app secrets and the downloader Worker settings. Production and development credentials/resources must be distinct.
3. Build the Linux amd64 image with an immutable `NODE_IMAGE` digest, record the built image digest and dependency/license inventory, and run the image checks. The checked-in Node tag is a development base, not an immutable production pin. Engine pins/source notices are in `Dockerfile.downloaders` and the native README.
4. Development uses `pnpm deploy:preview` as above with execution enabled by default. For production, deploy the downloader Worker from `wrangler.downloaders.jsonc` before deploying the app's new service binding; `pnpm deploy` remains an app-only deployment. Set `DOWNLOADERS_ENABLED=false` only when deliberately staging a paused service.
5. Run target-image and Cloudflare fixtures: outbound/private/loopback/rebinding denial, permitted HTTPS and certificate trust, start/cancel/recovery, lost responses, warm/cold reuse, stored-byte validation, ETag overwrite race, final-key write denial, Range/download and expiry, and log sentinel redaction.
6. Record per-platform retrieval, format/audio/composition and operational permission evidence; measure K=8 then K=16 synthetic capacity and actual charges. Set budgets and verified platform IDs from those results; update service hostname allowlists if the verified provider paths require it. Enable only passed methods.

Useful local checks:

```sh
pnpm exec tsc --noEmit --incremental false
pnpm exec tsc -p tsconfig.downloaders.json
pnpm test tests/downloaders-platforms.test.mjs tests/downloaders-dispatcher.test.mjs tests/downloaders-security.test.mjs tests/downloaders-storage.test.mjs tests/downloaders-http.test.mjs tests/downloaders-cloudflare-container.test.mjs tests/downloaders-policy.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s lib/downloaders/container -p 'test_*.py'
pnpm exec wrangler deploy --dry-run --containers-rollout=none --config wrangler.downloaders.jsonc --env=''
```

The last command checks the Worker bundle only. It does not build or verify the container. PostgreSQL tests require an explicitly supplied disposable `DOWNLOADERS_TEST_DATABASE_URL`; they create and drop an isolated schema and never read the application's DATABASE_URL. Do not point this test at production.

## Recovery, cleanup and updates

The scheduled handler independently expires old queued jobs, leases and republishes due outbox rows, fences stale attempts in PostgreSQL before touching the container, confirms stop before releasing permits, and retains quarantine when stop is uncertain. Renewed leases or published jobs cannot be destroyed from a stale recovery snapshot. Never manually reset a busy/quarantined slot to idle while a process may still run.

Staging capabilities expire within five minutes. Final publication conditionally copies the exact validated stored ETag into a fresh `sealed/` key that the container cannot write. Files are owner-authorized on every new link request; links last at most five minutes and never exceed the job expiry. Cancellation or a lost database response cannot publish a partial file set. Orphan cleanup revisits staging after the capability lifetime and final objects after the access window. Bucket lifecycle is a backstop, not the access boundary.

Source URLs are cleared at terminal settlement. Safe job/idempotency metadata is retained for 30 days; artifact/attempt metadata is pruned only after stop and deletion. Counters are pruned only when their windows and referencing live jobs permit it. Structured logs contain fixed event names, not source URLs, engine diagnostics, identity cookies, capabilities or secrets. Deployed trace redaction still needs a sentinel test.

For engine/image updates: disable admission, drain active work, build and verify the pinned replacement with fixtures, deploy a compatible Worker/image protocol, and restore only passed platform gates. Do not update dependencies inside an active container. Roll back image and Worker together when protocol compatibility is uncertain; the migration is additive and should not be rolled back by dropping live job tables.

To add a platform: write its service descriptor/parser and optional stricter classifier, register it once, add positive/negative URL and evidence fixtures, seed its catalog row, and verify its installed extractor, egress hosts and release gates. Existing supported engine behavior reuses the shared routes, queue, limits and storage. A new engine or an upstream format needing new completeness evidence necessarily requires adapter work; a service class cannot make an unsupported upstream capability exist.

## Verification recorded for this backend change

- 248 focused JavaScript tests passed across platform policy, dispatcher, Durable Object fixtures, HTTP/Worker routes, storage, authorization, policy, real PostgreSQL races, and existing database lifecycle/query-context/tracing. The final 24 Durable Object tests include bounded streaming, exact accounting and cancellation during an in-flight debit.
- The initial host run passed 15 native Python fixtures, including isolated localhost HTTP, immediate start acknowledgement while work is blocked, more than 256 warm slot generations, process descendants, synthetic truncated media, missing audio and conditional stored-byte readback. The later built-image run below supersedes the initial Docker blocker.
- Application and dedicated Worker TypeScript checks passed. The production Worker bundle passed Wrangler dry-run with container rollout skipped. OpenSpec strict validation passed.
- On 28 September 2026, the existing Colima `docker` profile was started with `--activate=false`, using its explicit Docker socket without switching the global context. The actual linux/amd64 image built with pinned engine dependencies. The latest run passed 22 native fixtures; a separate UID 10001 child check confirmed supervisor-secret isolation.
- Actual local Wrangler container health returned `ready:true` with `startup_local_ready`. Appending the validated runtime CA took 0.019 seconds, replacing a 10.335-second full trust-store update that exceeded the startup window. Local Python, Node and FFmpeg TLS fixtures passed with certificate verification enabled, including FFmpeg `tls_verify=1`. This is local startup/trust evidence, not production whole-egress proof.
- Actual local Wrangler R2 requests passed a 300,123-byte PUT/ETag/conditional-copy/GET fixture, Range `206`, wrong-method/tampered/expired capability rejection with `403`, and cleanup. This verifies the local adapter, not hosted R2 behavior, billing or production bucket permissions.
- The corrected local Next.js bridge passed guest `200`, create `202` and status `200` against the development database. Parallel Next.js runs now use sibling `.next` and `.next-downloaders` caches after a nested cache produced HTML `404` responses for compiled routes.
- The actual API end-to-end YouTube `jNQXAC9IVRw` job completed through Next.js, Worker, PostgreSQL, Queue, Durable Object, Docker, yt-dlp and local R2 in 12.7 seconds of queue/execution time. It produced `video.mp4`, 533,916 bytes, 320 × 240 pixels, 19.064 seconds, with audio. Authorized artifact access returned `303` followed by local R2 GET `200` and exactly the expected bytes, with SHA-256 `028e566504aeea5200c5145f9e2e09eb54acbf3c5a00838dba0c85c3413c4dde`.
- The real browser YouTube form submission reached “Your file is ready to download” with MP4, 521.4 KiB, 320 × 240 pixels, 19.064 seconds, audio included and 24-hour expiry. Clicking Download file produced an authorized artifact `303` and sealed local R2 GET `200` (16 ms in the server log). This confirms the request and server delivery, not operating-system save completion. Reloading the completed page restored the same guest job, all metadata and the download action. A transient status `500` recovered automatically; guest cookies persisted and reloading the earlier Dailymotion flow restored its same-owner failed job.
- The older unavailable YouTube fixture now reports `SOURCE_UNAVAILABLE`. Dailymotion's earlier browser run was interrupted by hot reload; a subsequent stable sample failed extraction. Optional `curl_cffi` is absent from the image, but an impersonation dependency is an unproven possible cause, not a diagnosed explanation. Actual positive platform coverage remains limited to the tested YouTube source. Cobalt publication is still gated.
- 200 distinct JavaScript tests passed across 12 suites: 163 across 11 suites plus 37 dispatcher tests, including four new safe-error cases. The later 25-test Durable Object rerun overlaps this total. Both app and Worker TypeScript checks exited successfully; earlier component counts must not be added again. See [the local evidence record](downloaders-local.md#local-verification-recorded--28-september-2026).
- The local API and browser source-to-download-request flows pass for the tested YouTube source. This single source result does not establish platform reliability. Cloudflare deployment, whole-graph containment, production R2/Range/CORS, representative multi-platform delivery, load/cost and license-release gates remain open. No Cloudflare resources were provisioned or deployed.
