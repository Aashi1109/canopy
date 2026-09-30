# Downloader competitor analysis

Research date: 30 September 2026. Scope: why comparable downloaders can feel fast, how they handle upstream access, and what applies to Canopy. Public documentation and open-source code establish mechanisms; commercial websites do not disclose their complete infrastructure. This is not a comparative latency or uptime benchmark.

The strongest finding is that an available download link and a completely prepared file are different milestones. Cobalt can return a link before transferring or merging the whole file. Canopy currently waits for a downloaded, stored and fully validated artifact. That difference affects time to the first downloaded byte even when both systems use equally fast extraction.

## What competitors actually document

| Product | Evidence | What remains unknown |
| --- | --- | --- |
| FastDL | Its Instagram API/MCP returns direct media links. Its paid plans explicitly include proxy access. | The free website's exact backend, proxy provider/IP type, session pool, cache policy and measured reliability. [Official offering](https://fastdl.app/mcp) |
| Snapinsta.to | Paste a link, receive media previews, then choose Download Video. | Extraction library, network routing and whether the final transfer is a redirect, relay or buffered file. [Official tutorial](https://snapinsta.to/en/how-to-download-instagram-photos-and-videos-on-pc) |
| SSSTik | The first submission obtains a TikTok download link; users then save MP4 or MP3. | Backend implementation and published latency percentiles. “Seconds” is a product claim, not a benchmark. [Official site](https://ssstik.io/) |
| Cobalt | Open-source API returns redirect, tunnel, local-processing or multi-item picker responses. | A public instance can use different settings and supported services from the repository defaults. [API contract](https://github.com/imputnet/cobalt/blob/main/docs/api.md#response) |
| Invidious Companion | Returns decrypted YouTube stream URLs; configuration supports session/token refresh, caching and outbound proxying. | Whether any particular deployment can access a particular source today. [API](https://github.com/iv-org/invidious-companion/wiki/How-to-communicate-with-Invidious-companion-with-any-client-%28HTTP-API%29), [configuration](https://github.com/iv-org/invidious-companion/blob/master/config/config.example.toml) |

One direct browser check used the reported Instagram Reel `Dd5l0GFuYc7` on FastDL. It returned “The download link not found” and no downloadable result. This establishes a failure for that one attempt, not FastDL's overall reliability or the reason our deployment failed. No extension was installed. SaveFrom's official homepage/FAQ could not be retrieved for this research; clone domains were excluded.

## Techniques we can verify

**Stream instead of preparing the whole file first.** Cobalt's proxy pipes the source response to the client. Its FFmpeg path can merge with codec copy and stream fragmented MP4 output into the HTTP response. This improves time to first byte; it does not eliminate source transfer or merging. A late source failure can leave an incomplete browser download. [Proxy](https://github.com/imputnet/cobalt/blob/main/api/src/stream/proxy.js), [FFmpeg](https://github.com/imputnet/cobalt/blob/main/api/src/stream/ffmpeg.js)

**Reuse working session and player state.** Cobalt retains its YouTube Innertube instance and periodically refreshes player state rather than recreating everything for each HTTP request. Canopy's per-attempt native processes do not retain those module caches. Our Worker already has a lightweight YouTube session cache and shared inspection caching, so recommending “add a cache” alone would miss the remaining process-lifecycle difference. [Cobalt implementation](https://github.com/imputnet/cobalt/blob/main/api/src/processing/services/youtube.js#L23-L103), [our metadata adapter](../lib/downloaders/youtubeInspection.ts)

**Reuse short-lived extraction results.** Cobalt's signed tunnel references cached stream information, with a default 90-second lifetime and optional Redis sharing across API instances. Reusing extraction can avoid another source lookup after selection. URLs still expire and can depend on the source session or outgoing IP. [Tunnel management](https://github.com/imputnet/cobalt/blob/main/api/src/stream/manage.js), [configuration](https://github.com/imputnet/cobalt/blob/main/docs/api-env-variables.md)

**Use platform-specific extraction.** Cobalt's Instagram adapter includes distinct public-page, mobile API and GraphQL paths and can use configured credentials. It selects from existing source versions rather than manufacturing every resolution. Sequential fallbacks can also increase latency. We should measure each route's success and duration before adding another. [Instagram source](https://github.com/imputnet/cobalt/blob/main/api/src/processing/services/instagram.js)

**Operate a working upstream connection.** FastDL documents proxy access; Cobalt exposes proxy/cookie/session-server settings. Invidious documents the same bot and IP failures we encountered, even with token support. These are concrete operational dependencies. They do not prove that every competitor uses residential proxies, or that buying one guarantees access. [FastDL](https://fastdl.app/mcp), [Cobalt settings](https://github.com/imputnet/cobalt/blob/main/docs/api-env-variables.md), [Invidious errors](https://docs.invidious.io/youtube-errors-explained/)

## Where Canopy spends extra work

The selected-download path currently extracts again, downloads the media, merges or converts when required, probes the local file, uploads staging bytes, reads those bytes back under the returned ETag, fully decodes them, checks expected media properties and publishes the artifact. That provides a strong prepared-file guarantee but adds storage transfer and validation before the user can start downloading. [Executor](../lib/downloaders/container/executor.py)

Format inspection does not need that storage pipeline. Existing specialized YouTube/Instagram inspection and shared metadata caching already avoid it when possible; native fallback, provider requests and queue/cold-start time remain relevant. The downloader container sleeps after ten idle minutes; two configured slots do not imply two continuously warm engines. [Container](../lib/downloaders/cloudflareContainer.ts), [existing measurements and limitations](downloaders-backend.md#format-latency-measured-locally--29-september-2026)

## Recommended direction and tradeoffs

These are evaluation conclusions; the delivery changes below are not implemented by adding bgutil.

| Change | Benefit | Constraint |
| --- | --- | --- |
| Stream an existing combined file when it matches the requested output | Starts transferring without R2 preparation or full decoding | Keep server-side authorization, destination checks, byte limits and cancellation; a late failure is possible. Direct external URLs are unsuitable when IP/session binding or our quota contract requires a relay. |
| Keep the prepared-file path for conversions and outputs requiring validation before delivery | Preserves current reliable artifact semantics | Merging, conversion and complete validation cannot be advertised as instant. Streaming merges are a separate future option. |
| Reuse short-lived private extraction/session data between inspection and selection | Fewer upstream requests and less repeated setup | Expiry, platform, client, format and outgoing-IP binding must remain correct; never trust a browser-supplied stream URL. |
| Keep small warm capacity only where measurements justify it | Reduces cold-start and repeated token/session setup | Has an idle cost and changes the present per-attempt cleanup/accounting model. |
| Diagnose access by platform and deployed region | Addresses bot/region failures independently of latency | YouTube tokens do not fix Instagram restrictions; another extractor can encounter the same rejected network. |

Apply delivery decisions to media capabilities across all twelve registered platforms: an eligible combined file can stream; separate tracks require merging; requested audio conversion needs processing; an upstream rejection needs an access diagnosis. Platform names alone should not decide the delivery path.

For a useful comparison, record three separate times: metadata/options ready, first downloaded byte, and complete playable file. Compare the same sources and selected outputs, distinguish cold/warm/cache-hit requests, include every platform, and report failures alongside p50/p95 latency. A sub-two-second cached lookup is not evidence of a sub-two-second uncached download.

The bgutil integration adds YouTube proof-of-origin token support without cookies or proxies. It is one access improvement; hosted success must be verified from Cloudflare. It does not by itself change this delivery architecture or establish competitor-level latency.

## Integration measurement from this change

A direct native-container check of YouTube Short `Q_4Lk4X_i5o` returned 26 formats in 29.37 seconds. Selecting format `18` downloaded a 5,543,717-byte video and passed full FFmpeg decoding in a further 34.56 seconds. A separate provider check generated a token successfully in 1.70 seconds after 3.52 seconds of server startup. These are single observations using linux/amd64 emulation on the local macOS machine; they bypass the app's lightweight metadata path and omit queues, database and R2. They are neither production estimates nor a competitor benchmark. The useful conclusion is that this cold native fallback remains expensive, including another metadata extraction after selection. Installing tokens alone does not solve that latency.
