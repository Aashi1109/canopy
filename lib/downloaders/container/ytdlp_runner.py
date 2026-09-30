"""Unprivileged yt-dlp entry point. Reads no control/storage credentials."""
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

# -I excludes the script directory. Only image-owned sibling modules are loaded.
sys.path.insert(0, str(Path(__file__).resolve().parent))

MAX_RECEIPT = 65_536

YTDLP_FAILURES = {
    "source_challenge": "The source requires browser verification before it can be downloaded.",
    "source_unavailable": "The source video is unavailable or requires an account.",
    "source_denied": "The source refused the video request.",
    "tls_failed": "The source connection could not be verified.",
    "source_duration_limit": "The source video exceeds the supported duration limit.",
    "format_unavailable": "The selected original format is no longer available. Inspect the source again.",
    "no_video_formats": "The source has no supported original video formats within the current limits.",
    "unsupported_source": "This source does not provide a supported complete video.",
    "multiple_videos_unsupported": "Only posts containing one video are supported. Choose a different post.",
    "extraction_failed": "The engine could not read the source video metadata.",
    "upstream_failure": "The source connection failed temporarily.",
    "engine_failed": "The source could not be processed.",
}


def classify_failure(message):
    message = str(message).lower()
    for code in YTDLP_FAILURES:
        if message == code:
            return code
    if "video duration exceeds the limit" in message:
        return "source_duration_limit"
    if any(value in message for value in ("not a bot", "captcha", "challenge", "confirm your age")):
        return "source_challenge"
    if re.search(r"\b(?:ssl|tls|sslerror|sslcertverificationerror)\b", message) or "certificate verify failed" in message or "certificate_verify_failed" in message:
        return "tls_failed"
    if any(value in message for value in ("video unavailable", "video is unavailable", "private video", "video is private", "video has been removed",
                                         "authentication", "login", "log in", "sign in", "logged in", "registered users",
                                         "not available in your country", "geo restricted")) or re.search(r"\bhttp error 404\b", message):
        return "source_unavailable"
    if re.search(r"\bhttp error (?:401|403|429)\b", message) or "403 forbidden" in message or "too many requests" in message:
        return "source_denied"
    if re.search(r"\b(?:drm|live|livestream|upcoming|premiere)\b", message):
        return "unsupported_source"
    if "requested format is not available" in message:
        return "format_unavailable"
    if "no video formats found" in message:
        return "no_video_formats"
    # Known local/resource failures and other HTTP client failures must never
    # become eligible just because an extractor wraps them in a parsing error.
    if any(value in message for value in ("no space left on device", "file too large", "permission denied", "cannot allocate memory", "memoryerror", "disk quota exceeded", "cpu time limit exceeded",
                                         "resource_limit", "deadline_exceeded")) or re.search(r"\bhttp error 4\d\d\b", message):
        return "engine_failed"
    if re.search(r"\bhttp error 5\d\d\b", message) or any(value in message for value in ("connection reset", "remote end closed connection without response",
                                                                                       "temporary failure in name resolution", "read timed out", "read operation timed out", "connection timed out")):
        return "upstream_failure"
    if "unable to extract" in message or "failed to extract" in message:
        return "extraction_failed"
    return "engine_failed"


def engine_error_message(value):
    """Keep the original error text, without terminal formatting or stack frames."""
    if not isinstance(value, str):
        return ""
    value = re.sub(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))", "", value)
    value = re.sub(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]", "", value)
    lines, in_trace = [], False
    for line in value.splitlines():
        text = line.strip()
        if (text.startswith(("Traceback (", "During handling of the above exception", "The above exception was the direct cause"))
                or re.match(r'File ".+", line \d+', text)
                or re.match(r"at .*(?::\d+(?::\d+)?\)?|<anonymous>\)?|\(index \d+\))$", text)):
            in_trace = True
            continue
        if in_trace and line[:1].isspace():
            continue
        if not text or re.fullmatch(r"[~^]+", text):
            continue
        in_trace = False
        lines.append(text)
    # The API/browser length bound counts UTF-16 units, not Python code points.
    return " ".join(lines).encode("utf-16-le", errors="surrogatepass")[:2000].decode("utf-16-le", errors="ignore")


def record_failure(message):
    code = classify_failure(message)
    text = engine_error_message(str(message))
    if not text or text in YTDLP_FAILURES:
        text = YTDLP_FAILURES[code]
    path = Path("engine-error.json")
    try:
        if code in ("extraction_failed", "upstream_failure") and path.exists():
            previous = json.loads(path.read_text()).get("code")
            if isinstance(previous, str) and previous in YTDLP_FAILURES and previous not in ("extraction_failed", "upstream_failure"):
                return
        if code != "engine_failed" or not path.exists():
            path.write_text(json.dumps({"code": code, "message": text}))
    except (OSError, ValueError, AttributeError):
        pass


def require_approved_extractor(key, allowed):
    if key == "Generic" or key not in allowed:
        raise RuntimeError("Delegated extractor is not allowed")


def number(value, maximum=2**53 - 1):
    return type(value) in (int, float) and math.isfinite(value) and 0 < value <= maximum


def source_failure(info, request, limits, *, final=False):
    if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming", "post_live") or info.get("has_drm"):
        return "unsupported_source"
    if info.get("availability") in ("private", "premium_only", "subscriber_only", "needs_auth", "unlisted"):
        return "source_unavailable"
    if number(info.get("duration")) and info["duration"] > limits["durationSeconds"]:
        return "source_duration_limit"
    if final and request["sourceComposition"] == "verified-post":
        evidence = info.get("_canopy_source_evidence")
        if (not isinstance(evidence, dict) or evidence.get("originalComposition") != "complete"
                or evidence.get("sourceId") != request["sourceId"]
                or evidence.get("isLive") is not False or evidence.get("requiresAuthentication") is not False):
            return "unsupported_source"
        if not isinstance(evidence.get("items"), list) or not evidence["items"]:
            return "unsupported_source"
        if len(evidence["items"]) != 1:
            return "multiple_videos_unsupported"
        if evidence["items"] != [{"id": info.get("id"), "type": "video"}]:
            return "unsupported_source"
    if final and (request["sourceComposition"] not in ("single-video", "verified-post") or info.get("entries") is not None
                  or info.get("_type", "video") != "video" or not isinstance(info.get("id"), str)
                  or not 1 <= len(info["id"]) <= 256):
        return "unsupported_source"
    return None


def probe_format(fmt):
    """Fill facts omitted by a public extractor from the actual original media.

    Runs under the engine's uid, deadline and metered egress; no user-provided
    ffprobe options or source credentials cross this boundary.
    """
    from executor import video_properties
    from security import https_url
    https_url(fmt["url"])
    command = ["ffprobe", "-v", "error", "-protocol_whitelist", "https,tls,tcp",
               "-tls_verify", "1", "-ca_file", os.environ.get("SSL_CERT_FILE", "/etc/ssl/certs/ca-certificates.crt"),
               "-rw_timeout", "5000000", "-probesize", "1048576", "-analyzeduration", "2000000",
               "-show_entries", "stream=codec_type,codec_name,width,height,avg_frame_rate,extradata:stream_disposition=attached_pic:stream_side_data=rotation:format=duration,size,format_name",
               "-show_data", "-of", "json", fmt["url"]]
    with tempfile.TemporaryFile() as output:
        subprocess.run(command, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.DEVNULL, check=True, timeout=8)
        output.seek(0)
        raw = output.read(131073)
    if len(raw) > 131072:
        raise ValueError("Invalid media facts")
    result = json.loads(raw)
    videos = [stream for stream in result["streams"] if stream.get("codec_type") == "video" and not stream.get("disposition", {}).get("attached_pic")]
    audios = [stream for stream in result["streams"] if stream.get("codec_type") == "audio"]
    if len(videos) != 1 or len(audios) > 1:
        raise ValueError("Unsupported streams")
    stream = videos[0]
    width, height = int(stream["width"]), int(stream["height"])
    rotation = next((int(side["rotation"]) for side in stream.get("side_data_list", []) if "rotation" in side), 0)
    if rotation % 180:
        width, height = height, width
    properties = video_properties(stream)
    duration = float(result["format"]["duration"])
    if not number(duration) or not all(number(size, 16384) for size in (width, height)):
        raise ValueError("Invalid media facts")
    names = result["format"]["format_name"].split(",")
    container = "mp4" if "mp4" in names or "mov" in names else "webm" if "webm" in names else None
    if not container:
        raise ValueError("Unsupported container")
    raw_size = result["format"].get("size")
    size = int(raw_size) if isinstance(raw_size, str) and raw_size.isdecimal() else None
    return {"width": width, "height": height, "vcodec": properties["videoCodec"], "fps": properties["fps"],
            "acodec": audios[0]["codec_name"] if audios else "none", "ext": container,
            "duration": duration, "filesize": size}


def complete_format_facts(info, request, limits, probe=probe_format):
    if request["sourceComposition"] != "verified-post":
        return
    failure = source_failure(info, request, limits, final=True)
    if failure:
        raise RuntimeError(failure)
    # Manifest formats already carry their stream facts. Probe only incomplete
    # progressive originals, bounded independently of the source's format count.
    candidates = [fmt for fmt in info.get("formats", []) if isinstance(fmt, dict)
                  and fmt.get("protocol") == "https" and fmt.get("vcodec") != "none"
                  and not fmt.get("has_drm")
                  and (any(not fmt.get(field) for field in ("width", "height", "vcodec", "acodec")))]
    if request.get("selectedFormat"):
        selected = request["selectedFormat"].split("+")
        candidates = [fmt for fmt in candidates if fmt.get("format_id") in selected]
    def inspect(fmt):
        try:
            return probe(fmt)
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
            return None
    with ThreadPoolExecutor(max_workers=3) as pool:
        facts = list(pool.map(inspect, candidates[:8]))
    for fmt, observed in zip(candidates, facts):
        if observed:
            fmt.update(observed)
            if not number(info.get("duration")):
                info["duration"] = observed["duration"]


def candidate_formats(info, request, limits):
    """Public original-format choices; no source URLs, headers or arbitrary selectors."""
    failure = source_failure(info, request, limits, final=True)
    if failure:
        raise RuntimeError(failure)
    formats = info.get("formats") or []
    if not isinstance(formats, list):
        raise RuntimeError("unsupported_source")
    supported = []
    identities = set()
    for fmt in formats:
        if not isinstance(fmt, dict):
            continue
        identity = fmt.get("format_id")
        if not isinstance(identity, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,80}", identity) or identity in identities:
            continue
        identities.add(identity)
        try:
            url = urlsplit(fmt.get("url") or "")
            safe_url = url.scheme == "https" and bool(url.hostname) and not url.username and not url.password and url.port in (None, 443)
        except (ValueError, TypeError):
            safe_url = False
        if not safe_url or fmt.get("has_drm") or fmt.get("protocol") not in ("https", "m3u8_native", "http_dash_segments"):
            continue
        if number(fmt.get("filesize")) and fmt["filesize"] > limits["fileBytes"]:
            continue
        supported.append(fmt)
    source_has_audio = any(isinstance(fmt, dict) and (fmt.get("acodec") not in (None, "none")
                           or (fmt.get("vcodec") == "none" and fmt.get("acodec") != "none")) for fmt in formats)
    audio = [fmt for fmt in supported if fmt.get("vcodec") == "none" and fmt.get("acodec") != "none"]
    result = []
    for fmt in supported:
        codec, container = fmt.get("vcodec"), fmt.get("ext")
        width, height = fmt.get("width"), fmt.get("height")
        if not isinstance(codec, str) or codec == "none" or not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", codec) or container not in ("mp4", "webm"):
            continue
        if any(type(size) is not int or not 1 <= size <= 16384 for size in (width, height)) or min(width, height) > int(request["quality"]):
            continue
        if container == "webm" and not codec.startswith(("vp8", "vp9", "vp09", "av1", "av01")):
            continue
        has_audio = fmt.get("acodec") not in (None, "none")
        if container == "webm" and has_audio and fmt.get("acodec") not in ("opus", "vorbis"):
            continue
        streams = [fmt]
        if not has_audio and source_has_audio:
            compatible = [entry for entry in audio if (container == "mp4" and entry.get("ext") in ("m4a", "mp4") and (entry.get("acodec") is None or str(entry["acodec"]).startswith(("mp4a", "aac"))))
                          or (container == "webm" and entry.get("ext") == "webm" and entry.get("acodec") in ("opus", "vorbis"))]
            if not compatible:
                continue  # Never present a silent derivative of an audible source.
            # extract_info has sorted worst-to-best using the extractor's full
            # preference model, including original/default audio language.
            streams.append(compatible[-1])
            has_audio = True
        sizes = [entry.get("filesize") if number(entry.get("filesize")) else entry.get("filesize_approx") for entry in streams]
        size = int(sum(sizes)) if all(number(value) for value in sizes) else None
        if size is not None and size > min(limits["fileBytes"], limits["outputBytes"]):
            continue
        result.append({"id": "+".join(entry["format_id"] for entry in streams), "container": container,
                       "width": width, "height": height, "fps": fmt.get("fps") if number(fmt.get("fps"), 240) else None,
                       "bytes": size, "estimatedBytes": len(streams) > 1 or any(not number(entry.get("filesize")) for entry in streams),
                       "hasAudio": has_audio, "requiresMerge": len(streams) > 1, "videoCodec": codec})
    # Prefer a ready-to-save original for picker defaults, then descending quality.
    result.sort(key=lambda fmt: (fmt["requiresMerge"], -min(fmt["width"], fmt["height"]), fmt["container"] != "mp4", -(fmt["fps"] or 0), fmt["id"]))
    return result[:80]


def inspection_result(info, request, limits):
    formats = candidate_formats(info, request, limits)
    if not formats:
        raise RuntimeError("no_video_formats")
    title = info.get("title")
    title = re.sub(r"[\x00-\x1f\x7f]", " ", title).strip()[:300] if isinstance(title, str) else ""
    return {"title": title or "Video", "durationSeconds": info.get("duration") if number(info.get("duration")) else None,
            "formats": formats}


def select_format(info, request, limits, identity):
    expected = request.get("expectedFormat")
    if not isinstance(expected, dict) or expected.get("id") != identity:
        raise RuntimeError("format_unavailable")
    for fmt in candidate_formats(info, request, limits):
        if fmt["id"] == identity:
            if any(fmt[field] != expected.get(field) for field in ("container", "width", "height", "fps", "hasAudio", "requiresMerge", "videoCodec")):
                raise RuntimeError("format_unavailable")
            return fmt
    raise RuntimeError("format_unavailable")


def run(config, timings):
    started = time.monotonic()
    try:
        import yt_dlp
        from yt_dlp import globals as state
        from yt_dlp.extractor import get_info_extractor
        from yt_dlp.postprocessor.common import PostProcessor
    finally:
        timings["yt_dlp_import"] = max(0, round((time.monotonic() - started) * 1000))
    setup_started = time.monotonic()
    request, limits = config["request"], config["limits"]
    # Generic plugin discovery stays disabled. YouTube loads only the shipped
    # HTTP provider from an image-owned directory; never the script fallback.
    youtube = "Youtube" in request["extractorKeys"]
    state.plugin_dirs.value = ["/opt/yt-dlp-plugins"] if youtube else []
    state.all_plugins_loaded.value = True
    if youtube:
        import yt_dlp_plugins.extractor.getpot_bgutil_http  # noqa: F401
    quality = request["quality"]
    cap = f"[height<={quality}]/bv*[width<={quality}]"
    files, item_ids, expected = [], [], []

    class Quiet:
        def debug(self, *args, **kwargs):
            pass
        warning = debug
        def error(self, message):
            record_failure(message)

    def match(info, *, incomplete=False):
        failure = source_failure(info, request, limits)
        if failure:
            record_failure(failure)
        return failure

    def after_move(info):
        # A post-hook runs only after successful download and postprocessing.
        path = Path(info["filepath"])
        if path.parent.resolve() != Path.cwd() or not path.is_file():
            raise RuntimeError("Invalid output")
        files.append(path.name)
        identity = str(info.get("id", ""))
        if not identity or len(identity) > 256 or identity in item_ids:
            raise RuntimeError("Invalid item identity")
        item_ids.append(identity)
        duration = info.get("duration")
        expected.append({"durationSeconds": duration if number(duration) else None,
                         "hasAudio": any(f.get("acodec") not in (None, "none") or (f.get("vcodec") == "none" and f.get("acodec") != "none") for f in info.get("formats", []))})

    allowed = set(request["extractorKeys"])
    extractor_classes = [get_info_extractor(name) for name in request["extractorKeys"]]
    if request["sourceComposition"] == "verified-post":
        from post_sources import wrap_post_extractor
        from public_post_sources import wrap_extractor
        extractor_classes = [wrap_extractor(wrap_post_extractor(extractor, request, limits), request) for extractor in extractor_classes]
    if not any(extractor.suitable(request["url"]) for extractor in extractor_classes):
        raise RuntimeError("No approved extractor handles this source")

    class RestrictedDownloader(yt_dlp.YoutubeDL):
        def get_info_extractor(self, ie_key):
            require_approved_extractor(ie_key, allowed)
            return super().get_info_extractor(ie_key)

    class RecordOutput(PostProcessor):
        def run(self, info):
            after_move(info)
            return [], info

    options = {
        "quiet": True, "no_warnings": True, "logger": Quiet(), "cachedir": False,
        "noplaylist": True, "ignoreerrors": False, "abort_on_unavailable_fragments": True,
        "skip_unavailable_fragments": False, "retries": 0, "fragment_retries": 0,
        "extractor_retries": 0, "file_access_retries": 0, "socket_timeout": 5,
        "concurrent_fragment_downloads": 1, "hls_prefer_native": True,
        "max_filesize": limits["fileBytes"], "max_downloads": limits["maxItems"],
        "playlistend": limits["maxItems"] + 1, "match_filter": match,
        "break_on_reject": True, "overwrites": False, "continuedl": False,
        "outtmpl": str(Path.cwd() / "media-%(autonumber)d.%(ext)s"), "autonumber_size": 1,
        # Cap either dimension so portrait source videos remain eligible. The
        # actual stored display dimensions are checked again by the supervisor.
        "format": f"(bv*{cap})+ba/b[height<={quality}]/b[width<={quality}]/bv[height<={quality}]/bv[width<={quality}]",
        "format_sort": ["ext:mp4:m4a", "res"], "merge_output_format": "mp4/webm",
        "js_runtimes": {"node": {}}, "remote_components": [],
        # Use the supervisor's combined system+Cloudflare trust store, with TLS
        # verification enabled. The default certifi bundle omits the runtime CA.
        "compat_opts": {"no-certifi"},
        "postprocessor_args": {"ffmpeg_i": ["-protocol_whitelist", "file,pipe"]},
        "writethumbnail": False, "writesubtitles": False,
        "writeautomaticsub": False, "writeinfojson": False,
    }
    if youtube:
        # Prefer token-backed streams while retaining the fast picker's VISIONOS formats.
        options["extractor_args"] = {
            "youtube": {"player_client": ["mweb", "visionos"]},
            "youtubepot-bgutilhttp": {"base_url": ["http://127.0.0.1:4416"]},
        }
    if request["sourceComposition"] == "verified-post":
        # Metadata-only extraction must tolerate missing dimensions/codecs.
        # Facts and limits are verified before selecting any actual download.
        options["format"] = "bv*+ba/b"
    with RestrictedDownloader(options, auto_init=False) as downloader:
        for extractor in extractor_classes:
            downloader.add_info_extractor(extractor())
        downloader.add_post_processor(RecordOutput(), when="after_move")
        inspecting = request.get("inspect") is True and not request.get("selectedFormat")
        timings["yt_dlp_setup"] = max(0, round((time.monotonic() - setup_started) * 1000))
        if inspecting or request.get("selectedFormat") or request["sourceComposition"] == "verified-post":
            started = time.monotonic()
            try:
                info = downloader.extract_info(request["url"], download=False)
            finally:
                timings["source_metadata"] = max(0, round((time.monotonic() - started) * 1000))
            if not info or downloader._download_retcode:
                raise RuntimeError("Extraction failed")
            started = time.monotonic()
            complete_format_facts(info, request, limits)
            if request["sourceComposition"] == "verified-post":
                timings["source_format_probe"] = max(0, round((time.monotonic() - started) * 1000))
            started = time.monotonic()
            try:
                if inspecting:
                    inspection = inspection_result(info, request, limits)
                elif request.get("selectedFormat"):
                    selected = select_format(info, request, limits, request["selectedFormat"])
                else:
                    selected = inspection_result(info, request, limits)["formats"][0]
            finally:
                timings["formats_normalization"] = max(0, round((time.monotonic() - started) * 1000))
            if not inspecting:
                downloader.params["format"] = selected["id"]
                downloader.format_selector = downloader.build_format_selector(selected["id"])
                # Metadata processing overlays its automatic choice onto info.
                # In particular, stale requested_formats would make a progressive
                # selection still download the previous split stream pair.
                for field in downloader._format_fields | {"requested_formats", "requested_downloads"}:
                    info.pop(field, None)
                # Reuse the freshly extracted metadata; do not reextract, retry,
                # transcode, or substitute a different stream for this selection.
                info = downloader.process_ie_result(info, download=True)
        else:
            # Preserve the legacy automatic best-quality request behavior.
            info = downloader.extract_info(request["url"], download=True)
        if downloader._download_retcode or not info or (not inspecting and not files):
            raise RuntimeError("Extraction failed")
        if inspecting:
            item_ids = [info["id"]]
        entries = info.get("entries")
        if entries is not None:
            entries = list(entries)
            if len(entries) != len(files) or len(entries) > limits["maxItems"] or any(not entry for entry in entries):
                raise RuntimeError("Incomplete collection")
        # Extractors can filter image items before returning a playlist. These
        # classes need stronger original-composition evidence before publication.
        composition = "complete" if request["sourceComposition"] == "single-video" and entries is None and len(item_ids) == 1 else "unknown"
        result = {"complete": True, "files": files, "expected": expected, "evidence": {
            "sourceId": str(info.get("id") or ""), "originalComposition": composition,
            "items": [{"id": identity, "type": "video"} for identity in item_ids],
            "isLive": False, "requiresAuthentication": False}}
        if request["sourceComposition"] == "verified-post":
            failure = source_failure(info, request, limits, final=True)
            if failure:
                raise RuntimeError(failure)
            result["evidence"] = info["_canopy_source_evidence"]
            if result["evidence"]["items"] != [{"id": identity, "type": "video"} for identity in item_ids]:
                raise RuntimeError("unsupported_source")
        resolved = info.get("webpage_url")
        if isinstance(resolved, str) and len(resolved) <= 4096:
            result["evidence"]["resolvedSourceUrl"] = resolved
        if not 1 <= len(result["evidence"]["sourceId"]) <= 256:
            raise RuntimeError("Source identity missing")
        if inspecting:
            result["inspection"] = inspection
        encoded = json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode()
        if len(encoded) > MAX_RECEIPT:
            raise RuntimeError("unsupported_source")
        Path("engine-result.json").write_bytes(encoded)


def main():
    config = json.loads(Path(sys.argv[1]).read_bytes())
    now = time.monotonic()
    launched = config.get("timingStartedAt", now)
    if not number(launched) or launched > now:
        launched = now
    timings = {"yt_dlp_startup": max(0, round((now - launched) * 1000))}
    try:
        run(config, timings)
    finally:
        try:
            Path("engine-timings.json").write_text(json.dumps(timings, separators=(",", ":"), allow_nan=False))
        except OSError:
            pass


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        record_failure(error)
        sys.exit(1)
