# Native downloader executor

This directory owns the internal native process boundary. The Worker owns public
authentication, admission, durable attempt budgets, whole-egress accounting and
publication. One slot runs one start at a time. This is implemented groundwork,
not evidence that public platform downloads are ready to release.

## Protocol

The wire contract is `lib/downloaders/execution.ts`. `POST /start`, `GET /status`
and `POST /cancel` require an operation-specific HMAC capability. Status may also
use a JSON POST. The four identity fields are `jobId`, `attemptGeneration`,
`slotGeneration` and `startOrdinal` (1 through 4). A capability is compact JSON encoded
as base64url without padding, followed by a period and the base64url HMAC-SHA256
of that encoded payload. Its payload includes the four identity fields,
`operation` and integer `expiresAt` (at most 300 seconds ahead).

`DOWNLOADERS_CONTROL_SECRET` must contain at least 32 bytes. The supervisor
accepts only fixed engine options, bounded bodies, and staging PUT/GET authority.
It never receives a bucket-wide key. Repeating an identical start returns the
existing attempt; changing its body conflicts. Unknown attempts cannot be read
or cancelled. A strictly newer slot generation drops ended native receipts;
older generations cannot restart. Same-generation starts belong to the same
job/attempt and retain that attempt's ordinal receipts. Durable public history stays in
the Worker, so a warm container has no lifetime job-count limit.

Platform classes supply the trusted source ID, named installed extractor keys,
and source-composition classification. Native code has no duplicate platform
URL registry. It requires an approved extractor to match the URL and blocks
delegation to any other extractor, including Generic. A new platform using an
installed extractor needs only the platform class/registry configuration. The
receipt reports the extractor's actual source ID and resolved webpage URL;
the platform service validates those against its own normalized source.

Engine failures cross the child-process boundary with stable codes and their
original error message, without stack traces or redaction, capped at 1,000 UTF-16
units to match the API. Operational logs retain only fixed codes. Only `extraction_failed` and
`upstream_failure` can permit one alternate engine, and only after confirmed
process and file cleanup. Authentication/challenges, TLS, source restrictions,
format mismatch, resource limits, cancellation and unknown failures stay terminal.
Startup diagnostics likewise emit fixed stage codes without secrets.

The container Durable Object serializes only cold startup plus the immediate
`/start` acknowledgement, and recovery destruction, under its bounded 25-second
abort guard. Metadata extraction, downloading, merging, upload and promotion
must never be awaited inside that guard. `/start` must remain a background
launch followed by an immediate 202, so outbound metering does not deadlock on
the same object. Status/cancel use the existing port without automatic startup;
metering transactions stay short. The blocked-outbound local fixture checks the
acknowledgement property, not the Cloudflare runtime boundary.

Existing pool slots stay alive for ten minutes without activity, matching the
[Cloudflare Container class default](https://developers.cloudflare.com/containers/api/container-class/#properties).
Nearby requests across supported platforms can reuse a started slot within the
configured pool limit. This adds no keepalive loop and does not guarantee that a
request avoids cold startup: idle expiry, recovery destruction and platform
restarts still stop instances. While a slot remains running, its provisioned
memory and disk continue to incur
[Container charges](https://developers.cloudflare.com/containers/platform/pricing/),
including during idle time.

The trusted supervisor runs as root; every media child drops to UID/GID 10001
with a minimal environment, no shell, a separate process group, and fixed CPU,
file, descriptor and process limits. Engine children cannot read the root
supervisor's environment or staging capabilities. Memory and aggregate process
limits also require the container resource boundary. Tini reaps orphaned
descendants. No terminal result claims `stopped:true` until tracked groups have
disappeared and local temporary data has been removed. Uncertain cleanup
quarantines the slot for Worker-driven destruction.

Engine output is checked for actual file size, finite duration, display
dimensions, container/codec compatibility, complete decoding and successful
engine completion. After scoped PUT, the supervisor sends `If-Match` on GET
using the upload's ETag and validates those actual stored bytes. The receipt
binds that ETag. Only the Worker can conditionally copy it into a new sealed key.
No HEAD-only or local-file-only validation substitutes for stored-file validation.

Format inspection extracts metadata only. Selection downloads the stored original
format choice and preserves yt-dlp's preferred audio language. Local preflight
checks file facts without decoding; the full decode runs once on the stored
readback. Jobs allow 30-minute videos and at most ten minutes of cumulative
inspection/download/validation work. Staging transfer capabilities last eleven
minutes; public sealed-file links retain their five-minute cap.

### YouTube proof-of-origin tokens

The image includes matching `bgutil-ytdlp-pot-provider` plugin and Node server
version `2.0.0`. Native YouTube inspection and downloading prefer yt-dlp's `mweb`
client with automatically generated proof-of-origin tokens, then include
`visionos` to preserve formats offered by the lightweight metadata adapter. Only the bundled
HTTP provider plugin is loaded from `/opt/yt-dlp-plugins`; operator plugins,
login cookies and external proxies remain disabled.

Each YouTube attempt starts the provider at `127.0.0.1:4416` through the existing
unprivileged process launcher. Its readiness check is bounded and failures are
reported before extraction. The provider shares the attempt's deadline,
cancellation and process-group cleanup. It is not exposed as a container port,
does not receive supervisor secrets, and does not run for other platforms.
Provider output is discarded because upstream diagnostics can contain tokens.
Tokens are kept in memory for the attempt and are not shared between jobs.

The YouTube service additionally allows the exact hosts `www.google.com` for
the current BotGuard interpreter and `jnn-pa.googleapis.com` for attestation.
Their requests use the existing outbound accounting and certificate checks.
No broader Google host wildcard or network bypass is added. The lightweight
Worker metadata path remains available; unsuccessful lookups fall back to
native inspection, which uses this provider.

No new environment variables or manually supplied tokens are required. Rebuild
the downloader image through the existing preview deployment command. The
provider's `/ping` checks installation, not YouTube access: a real hosted format
lookup and selected download must still pass. PO tokens do not guarantee that
YouTube accepts the deployment's outgoing IP.

Upstream: [provider release and setup](https://github.com/Brainicism/bgutil-ytdlp-pot-provider/tree/2.0.0)
and [yt-dlp PO-token guidance](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide).

X, Pinterest, Reddit and LinkedIn use `sourceComposition: "verified-post"`.
The native wrappers read the original post before the pinned extractor filters
its media, bind the source and media identities, and reject photos, mixed media,
gated content and external embeds. The current format picker accepts one video
per post; a multiple-video post returns an explicit unsupported response.
Single-video Pinterest stories may include ordinary text blocks. Reddit uses
only an anonymous session and does not opt into age-gated or quarantined posts.

If a progressive original lacks codec, audio or dimension facts, the engine
uses a bounded, certificate-verified ffprobe request under the same uid and
egress limits. Inspection probes at most eight originals with three concurrent
probes; selected downloads probe only their chosen original when necessary.
The selected format's properties are checked against the completed and stored
bytes, including audio in both directions. The wrappers add no second post-page
request. All four platforms passed live native selection and stored-byte decode
checks; the fixture IDs and timing limits are recorded in
`docs/downloaders-backend.md`.

## Explicit remaining release gates

Worker admission defaults on; `DOWNLOADERS_ENABLED=false` explicitly pauses it. Native startup
checks Linux, supervisor privileges and the interception CA trust store directly.
Deployment validation should cover the following enforced boundaries:

- Outbound enforcement covers Python, Node/undici, JS helpers and native
  FFmpeg, every redirect/manifest/fragment/key, IPv4/IPv6 and DNS changes. It
  blocks raw-socket and local-listener escapes. Cobalt runs as a child resolver;
  it does not need a local HTTP API listener.
- The Worker meters and limits the complete source graph, including retries
  and failed transfers. Container `usage.sourceBytes` counts only directly
  observed materialization and is replaced by the Worker's authoritative
  cumulative counter. It must never be treated as full-egress evidence.
- Runtime trust stores include the Cloudflare interception CA without disabling
  certificate verification. The supervisor forwards only deployment-owned
  `SSL_CERT_FILE`, `NODE_EXTRA_CA_CERTS` and `REQUESTS_CA_BUNDLE` paths to children.
- UID separation, process-group cancellation, forced slot destruction, readback
  ETag races and sealed-key immutability pass in the deployed Linux image.
- Each enabled platform passes permitted-source live tests and has its platform
  permission/rights and license records. Local synthetic tests are insufficient.

## Local Wrangler execution

`DOWNLOADERS_LOCAL=true` selects the local storage adapter. In addition to the
Linux, root supervisor and Cloudflare interception CA checks required in both
environments, local startup requires successful certificate-verified HTTPS to
`https://download-storage.local/__download-storage/health`. The intercepted
endpoint must return exactly the JSON object
`{"storage":"canopy-local-r2","protocolVersion":1}`. Missing CA trust or a failed
health check leaves execution disabled.

The supervisor validates the mounted PEM CA and appends it once to Debian's
existing CA bundle for native clients, then passes that bundle to Python and
Node. It preserves the system roots without rehashing the entire certificate
directory during cold startup. Certificate and hostname
verification remain enabled. Only the exact `download-storage.local` authority
uses ordinary HTTPS resolution in local mode; public storage retains DNS
pinning and public-address checks. There is no alternate HTTP or private-address
transport, and source URLs still require approved platform extractors.

Wrangler's `ContainerProxy` maps that synthetic host to the local R2 adapter.
Only the fixed health response avoids the active-job meter. Artifact operations
still require the exact issued, method-bound capability URL and attempt scope.
The native PUT/readback ETag checks and Worker sealed publication apply to local
artifacts too. Engine children receive neither the local switch nor storage
capabilities. This permits local integration tests without an R2 account key;
it does not make platform-specific extraction or production confinement tests
unnecessary.

Cloudflare documents the runtime CA and interception setup in its
[egress guide](https://github.com/cloudflare/containers/blob/main/docs/egress.md)
and Docker requirements in its
[local development guide](https://developers.cloudflare.com/containers/guides/local-dev/).

Cobalt uses pinned service resolvers with a small metadata patch, not the public
HTTP tunnel. Actual source identity, complete single-video composition, public
access and finite duration are required. It supports inspection and selected
output properties for the six opted-in platform classes. Other source shapes
remain rejected. YouTube adaptive formats retain numeric itag pairs; Cobalt-owned
formats use a private `cobalt.` ID and always return to the Cobalt resolver.

Unprivileged transfer children accept complete chunked or close-delimited HTTP,
check supplied lengths, and enforce actual byte limits. Static unencrypted HLS
requires ENDLIST and successful transfer of every segment before a local-only
FFmpeg merge. Failed segments, live manifests, encryption and incomplete framing
never produce artifacts. Missing format facts are probed under the same egress
and deadline bounds; uncertain or changed selections fail closed. Only fresh
anonymous TikTok cookies created by its public resolver are accepted privately;
user or operator login cookies are never loaded.

## Image and verification

The image pins cobalt API revision
`a636575b09de1fc55d9b8cd98cac88f5f2f16b42`, yt-dlp `2026.08.19` and its pinned
default dependency set (including EJS `0.8.0`). It contains Node 24, Python,
FFmpeg/ffprobe and Tini. `image_check.py` verifies package and extractor presence
without upstream requests. The default Node tag and Debian repositories are
development inputs, not immutable locks. Production promotion must supply
`NODE_IMAGE` by digest and record the built linux/amd64 image digest, package
inventory, FFmpeg build flags, corresponding source and notices.

The pins are published upstream:
[cobalt source and package manifest](https://github.com/imputnet/cobalt/blob/a636575b09de1fc55d9b8cd98cac88f5f2f16b42/api/package.json),
[yt-dlp release](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19), and
[yt-dlp dependency pins](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/pyproject.toml).

The cobalt API declares AGPL-3.0. Its pinned source and license are included in
`/opt/downloader-notices`, together with the metadata patch and resolver; these files do not by themselves finish distribution
or modified-network-service obligations. Record licenses of the actual FFmpeg
and Python/Node distributions. Do not assume HTTP isolation exempts a combined
derivative, or that it automatically licenses all of Canopy under AGPL.

Run focused native checks from the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s lib/downloaders/container -p 'test_*.py' -v
docker build --platform linux/amd64 -f Dockerfile.downloaders -t canopy-downloaders:local .
docker run --rm --user 10001:10001 canopy-downloaders:local python -m unittest discover -s /opt/executor -p 'test_*.py' -v
```

Tests create only synthetic local media. No source-platform downloads or cloud
resources are necessary. A skipped socket/FFmpeg test is not a passing check.
