"""Private pinned-engine adapters; no retries, fallback, or source URL discovery."""
import http.client
import json
import math
import os
import re
import stat
import sys
import time
from urllib.parse import urlsplit

from executor import HERE, video_codec_matches, video_properties
from security import Rejected, closed, https_url, reject, validate_inspection
from ytdlp_runner import MAX_RECEIPT, YTDLP_FAILURES, engine_error_message


def engine_record(attempt, name, maximum=1024 * 1024, *, error_code="engine_contract"):
    """Read bounded JSON from a regular child-owned file without following links."""
    try:
        descriptor = os.open(attempt.directory / name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise ValueError()
            raw = stream.read(maximum + 1)
        if len(raw) > maximum:
            raise ValueError()
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (OSError, ValueError, TypeError):
        reject(error_code, "The engine returned an invalid completion record.")


def engine_command(attempt, command, failures):
    try:
        return attempt.command(command)
    except Rejected as error:
        if error.code == "engine_failed":
            try:
                record = engine_record(attempt, "engine-error.json", 8192)
                code, message = record.get("code"), record.get("message", "")
                if set(record) - {"code", "message"} or not isinstance(message, str):
                    code = None
            except Rejected:
                code = None
            if isinstance(code, str) and code in failures:
                message = engine_error_message(message)
                reject(code, message if message and message not in failures else failures[code])
        raise


def log_ytdlp_timings(attempt):
    # This sidecar is written by the unprivileged process, so accept bounded
    # numeric measurements only. Never forward child logs or receipt metadata.
    stages = ("yt_dlp_startup", "yt_dlp_import", "yt_dlp_setup", "source_metadata", "source_format_probe", "formats_normalization")
    try:
        timings = engine_record(attempt, "engine-timings.json", 2048)
        if not set(timings).issubset(stages) or any(
                type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= attempt.request["limits"]["workMs"] + 60_000
                for value in timings.values()):
            return
        for stage in stages:
            if stage in timings:
                attempt.timing(stage, timings[stage])
    except Rejected:
        pass


def start_youtube_token_provider(attempt):
    """Run the image-owned HTTP provider under this attempt's existing limits."""
    started = time.monotonic()
    try:
        process = attempt.spawn(["node", "/opt/bgutil/build/main.js", "--host", "127.0.0.1", "--port", "4416"])
        until = min(attempt.deadline, started + 5)
        while True:
            attempt.checkpoint()
            if process.poll() is not None:
                reject("engine_failed", "The YouTube token provider could not start.")
            remaining = until - time.monotonic()
            if remaining <= 0:
                reject("engine_failed", "The YouTube token provider did not become ready.")
            connection = None
            try:
                connection = http.client.HTTPConnection("127.0.0.1", 4416, timeout=min(.25, remaining))
                connection.request("GET", "/ping")
                response = connection.getresponse()
                raw = response.read(1025)
                value = json.loads(raw) if response.status == 200 and len(raw) <= 1024 else None
                if isinstance(value, dict) and value.get("version") == "2.0.0":
                    attempt.checkpoint()
                    if process.poll() is not None:
                        reject("engine_failed", "The YouTube token provider stopped during startup.")
                    return process
            except (OSError, ValueError, http.client.HTTPException):
                pass
            finally:
                if connection is not None:
                    connection.close()
            attempt.cancelled.wait(min(.05, remaining))
    except OSError:
        reject("engine_failed", "The YouTube token provider could not start.")
    finally:
        attempt.timing("youtube_token_provider_startup", (time.monotonic() - started) * 1000)


def run_ytdlp(attempt):
    request = attempt.request["request"]
    started = time.monotonic()
    try:
        if "Youtube" in request["extractorKeys"]:
            start_youtube_token_provider(attempt)
        config = {"request": request, "limits": attempt.request["limits"], "timingStartedAt": time.monotonic()}
        config_path = attempt.directory / "engine-request.json"
        config_path.write_text(json.dumps(config))
        os.chmod(config_path, 0o644)
        engine_command(attempt, [sys.executable, "-I", str(HERE / "ytdlp_runner.py"), str(config_path)], YTDLP_FAILURES)
    finally:
        log_ytdlp_timings(attempt)
        attempt.timing("yt_dlp_total", (time.monotonic() - started) * 1000)
    try:
        receipt = engine_record(attempt, "engine-result.json", MAX_RECEIPT, error_code="engine_failed")
        if receipt.get("complete") is not True:
            raise ValueError()
        names = receipt["files"]
        if request.get("inspect") is True and not request.get("selectedFormat"):
            if names != [] or receipt.get("expected") != []:
                raise ValueError()
            attempt.pending_inspection = validate_inspection(receipt["inspection"], request, attempt.request["limits"])
            return [], receipt["evidence"]
        if "inspection" in receipt:
            raise ValueError()
        if not isinstance(names, list) or not 1 <= len(names) <= attempt.request["limits"]["maxItems"] or len(set(names)) != len(names):
            raise ValueError()
        files = [attempt.directory / name for name in names]
        if request.get("selectedFormat") and len(files) != 1:
            raise ValueError()
        if any(not isinstance(name, str) or not re.fullmatch(r"media-[0-9]{1,5}\.(mp4|webm|mkv|mov)", name) for name in names):
            raise ValueError()
        expected = receipt["expected"]
        if len(expected) != len(names):
            raise ValueError()
        for name, facts in zip(names, expected):
            duration = facts.get("durationSeconds")
            if type(facts.get("hasAudio")) is not bool or (duration is not None and (type(duration) not in (int, float) or not math.isfinite(duration) or not 0 < duration <= attempt.request["limits"]["durationSeconds"])):
                raise ValueError()
            attempt.expected_media[name] = facts
            if request.get("expectedFormat"):
                # The control-plane selection is authoritative; a child receipt
                # cannot omit the selected dimensions/codec/container checks.
                attempt.expected_media[name] = {**facts, **{
                    key: request["expectedFormat"][key]
                    for key in ("width", "height", "container", "videoCodec", "fps", "hasAudio")}}
        # Upstream names/URLs/logs are never carried into the public receipt.
        evidence = receipt["evidence"]
    except (ValueError, TypeError, KeyError, json.JSONDecodeError, Rejected):
        reject("engine_failed", "The engine did not produce a valid completion record.")
    return files, evidence


COBALT_PUBLIC_FIELDS = {"id", "container", "width", "height", "fps", "bytes", "estimatedBytes", "hasAudio", "requiresMerge", "videoCodec"}
COBALT_ERRORS = {**YTDLP_FAILURES,
    "format_unavailable": "The selected source format is no longer available.",
    "composition_unverified": "The complete source composition could not be verified.",
    "source_mismatch": "The returned media does not match the requested source.",
    "live_content": "Only complete, finite videos are supported.",
    "protected_content": "Protected video streams are not supported.",
    "restricted_content": "Only accessible public videos are supported.",
    "network_denied": "A media transfer destination is not permitted.",
    "resource_limit": "The video exceeds the processing limits.",
    "incomplete_output": "The media transfer did not complete.",
    "engine_contract": "The engine returned unsupported source information."}


def cobalt_headers(value, platform):
    if not isinstance(value, dict) or len(value) > 6:
        reject("engine_contract", "The source returned invalid transfer headers.")
    permitted = {"user-agent", "referer", "origin", "accept", "accept-language"}
    if platform == "tiktok":
        permitted.add("cookie")
    if len({key.lower() for key in value if isinstance(key, str)}) != len(value):
        reject("engine_contract", "The source returned invalid transfer headers.")
    for key, field in value.items():
        if key.lower() not in permitted or not isinstance(field, str) or not 1 <= len(field) <= (8192 if key.lower() == "cookie" else 1024) or any(ord(char) < 32 or ord(char) > 126 for char in field):
            reject("engine_contract", "The source returned invalid transfer headers.")
        if key.lower() in ("referer", "origin"):
            https_url(field)
    return value


def cobalt_probe(attempt, candidate):
    """Read missing source facts in a confined child, without inventing formats."""
    streams, durations, sizes, containers = [], [], [], []
    for index, url in enumerate(candidate["urls"]):
        command = ["ffprobe", "-v", "error", "-protocol_whitelist", "https,tls,tcp",
                   "-tls_verify", "1", "-ca_file", os.environ.get("SSL_CERT_FILE", "/etc/ssl/certs/ca-certificates.crt"),
                   "-rw_timeout", "5000000", "-probesize", "8388608", "-analyzeduration", "5000000"]
        probe_headers = {key: value for key, value in candidate["headers"].items() if key.lower() not in ("cookie", "referer", "origin")}
        if probe_headers:
            command.extend(("-headers", "".join(f"{key}: {value}\r\n" for key, value in probe_headers.items())))
        cookie = next((value for key, value in candidate["headers"].items() if key.lower() == "cookie"), None)
        if cookie:
            cookies = []
            for pair in cookie.split(";"):
                if not re.fullmatch(r"[A-Za-z0-9_-]+=[^;\r\n]*", pair.strip()):
                    reject("engine_contract", "The source returned invalid transfer headers.")
                cookies.append(f"{pair.strip()}; domain={urlsplit(url).hostname}; path=/")
            command.extend(("-cookies", "\n".join(cookies) + "\n"))
        command.extend(("-show_streams", "-show_data", "-show_format", "-of", "json", url))
        try:
            result = json.loads(attempt.command(command, f"cobalt-probe-{index}.json"))
            current = result["streams"]
            if not isinstance(current, list):
                raise ValueError()
            streams.extend(current)
            duration = float(result["format"]["duration"])
            if not math.isfinite(duration) or not 0 < duration <= attempt.request["limits"]["durationSeconds"]:
                raise ValueError()
            durations.append(duration)
            raw_size = result["format"].get("size")
            sizes.append(int(raw_size) if isinstance(raw_size, str) and raw_size.isdecimal() else None)
            names = result["format"].get("format_name", "").split(",")
            containers.append("mp4" if "mp4" in names or "mov" in names else "webm" if "webm" in names else None)
        except (ValueError, TypeError, KeyError):
            reject("format_unavailable", "The complete source format could not be verified.")
    videos = [stream for stream in streams if stream.get("codec_type") == "video" and not stream.get("disposition", {}).get("attached_pic")]
    audios = [stream for stream in streams if stream.get("codec_type") == "audio"]
    if len(videos) != 1 or len(audios) > 1 or max(durations) - min(durations) > max(2, max(durations) * .01):
        reject("format_unavailable", "The complete source format could not be verified.")
    video = videos[0]
    try:
        width, height = int(video["width"]), int(video["height"])
        rotation = next((int(item["rotation"]) for item in video.get("side_data_list", []) if "rotation" in item), 0)
        if rotation % 180:
            width, height = height, width
        properties = video_properties(video)
    except (ValueError, TypeError, KeyError, ZeroDivisionError):
        reject("format_unavailable", "The source returned an unsupported video format.")
    observed = {"width": width, "height": height, **properties, "hasAudio": bool(audios)}
    if len(sizes) == 1 and sizes[0] is not None and sizes[0] > 0 and not candidate["isHLS"]:
        observed.update(bytes=sizes[0], estimatedBytes=False)
    if len(containers) == 1 and containers[0] is not None:
        observed["container"] = containers[0]
    return observed, max(durations)


def cobalt_source(attempt, receipt):
    request, limits = attempt.request["request"], attempt.request["limits"]
    closed(receipt, ("evidence", "title", "durationSeconds", "formats"))
    evidence = receipt["evidence"]
    if not isinstance(evidence, dict) or set(evidence) - {"originalComposition", "sourceId", "resolvedSourceUrl", "items", "isLive", "requiresAuthentication"}:
        reject("composition_unverified", "The complete source composition could not be verified.")
    if evidence.get("originalComposition") != "complete" or evidence.get("isLive") is not False or evidence.get("requiresAuthentication") is not False:
        reject("composition_unverified", "The complete public video could not be verified.")
    source_id = evidence.get("sourceId")
    if not isinstance(source_id, str) or not 1 <= len(source_id) <= 256 or any(ord(char) < 33 or ord(char) == 127 for char in source_id):
        reject("source_mismatch", "The source returned an invalid video identity.")
    resolved = evidence.get("resolvedSourceUrl")
    if resolved is not None:
        https_url(resolved)
        if resolved != request["url"]:
            reject("source_mismatch", "The returned media does not match the requested source.")
    if evidence.get("sourceId") != request["sourceId"] and resolved != request["url"]:
        reject("source_mismatch", "The returned media does not match the requested source.")
    items = evidence.get("items")
    if not isinstance(items, list) or len(items) != 1 or not isinstance(items[0], dict) or set(items[0]) != {"id", "type"} or items[0].get("type") != "video" or not isinstance(items[0].get("id"), str) or not 1 <= len(items[0]["id"]) <= 256:
        reject("composition_unverified", "The source must contain exactly one original video.")
    candidates = receipt["formats"]
    if not isinstance(candidates, list) or not 1 <= len(candidates) <= 80:
        reject("format_unavailable", "The source returned no supported video format.")
    duration = receipt["durationSeconds"]
    if duration is not None and (type(duration) not in (int, float) or not math.isfinite(duration) or not 0 < duration <= limits["durationSeconds"]):
        reject("source_duration_limit", "The source video exceeds the supported duration limit.")
    formats = []
    for candidate in candidates:
        if not isinstance(candidate, dict) or set(candidate) - COBALT_PUBLIC_FIELDS - {"urls", "headers", "isHLS"}:
            reject("engine_contract", "The source returned invalid format information.")
        urls = candidate.get("urls")
        if not isinstance(urls, list) or not 1 <= len(urls) <= 2 or any(not isinstance(url, str) for url in urls) or len(set(urls)) != len(urls) or type(candidate.get("isHLS")) is not bool:
            reject("engine_contract", "The source returned invalid media transfers.")
        for url in urls:
            https_url(url)
        candidate["headers"] = cobalt_headers(candidate.get("headers", {}), request["platformId"])
        public = {key: value for key, value in candidate.items() if key in COBALT_PUBLIC_FIELDS}
        if duration is None or not {"width", "height", "videoCodec", "hasAudio"} <= set(public):
            observed, observed_duration = cobalt_probe(attempt, candidate)
            for key in ("width", "height", "hasAudio", "container"):
                if key in public and key in observed and public[key] != observed[key]:
                    reject("format_unavailable", "The source format changed during inspection.")
            public = {**observed, **{key: value for key, value in public.items() if value is not None or key not in observed}}
            if candidate.get("bytes") is None and observed.get("bytes") is not None:
                public["estimatedBytes"] = False
            if duration is None:
                duration = observed_duration
            elif abs(duration - observed_duration) > max(2, duration * .01):
                reject("incomplete_output", "The video duration does not match the complete source.")
        public.setdefault("fps", None)
        public.setdefault("bytes", None)
        public.setdefault("estimatedBytes", False)
        if public.get("requiresMerge") is not (len(urls) == 2):
            reject("engine_contract", "The source returned inconsistent media transfers.")
        formats.append(public)
    inspection = validate_inspection({"title": receipt["title"], "durationSeconds": duration, "formats": formats}, request, limits)
    # Every published transfer needs a source duration to check truncation even
    # when the HTTP body legitimately has no Content-Length header.
    if inspection["durationSeconds"] is None:
        reject("completeness_unverified", "The complete source duration could not be verified.")
    return inspection, evidence, candidates


def cobalt_matches_selection(actual, expected):
    # A cross-engine fallback can use another stream only when every displayed
    # choice is preserved. Internal merge mechanics and extractor IDs are not
    # user choices; an advertised exact file size still is.
    if any(actual.get(key) != expected.get(key) for key in ("container", "width", "height", "hasAudio")):
        return False
    if not video_codec_matches(actual.get("videoCodec"), expected.get("videoCodec")):
        return False
    if expected.get("fps") is not None and actual.get("fps") != expected["fps"]:
        return False
    if expected.get("bytes") is not None and expected.get("estimatedBytes") is False:
        return actual.get("estimatedBytes") is False and actual.get("bytes") == expected["bytes"]
    return True


def run_cobalt(attempt):
    request, limits = attempt.request["request"], attempt.request["limits"]
    config = attempt.directory / "engine-request.json"
    config.write_text(json.dumps({"request": request, "limits": limits}))
    os.chmod(config, 0o644)
    started = time.monotonic()
    engine_command(attempt, ["node", str(HERE / "cobalt_resolver.mjs"), str(config)], COBALT_ERRORS)
    inspection, evidence, candidates = cobalt_source(attempt, engine_record(attempt, "cobalt-source.json"))
    attempt.timing("cobalt_metadata", (time.monotonic() - started) * 1000)
    if request.get("inspect") is True and not request.get("selectedFormat"):
        attempt.pending_inspection = inspection
        return [], evidence
    selected = request.get("selectedFormat")
    choices = [(public, private) for public, private in zip(inspection["formats"], candidates) if selected is None or public["id"] == selected]
    if not choices and selected and not selected.startswith("cobalt.") and request["platformId"] != "youtube":
        choices = list(zip(inspection["formats"], candidates))
    if not choices:
        reject("format_unavailable", "The selected source format is no longer available.")
    fmt, candidate = choices[0]
    if selected and not cobalt_matches_selection(fmt, request.get("expectedFormat", {})):
        reject("format_unavailable", "The selected source format has changed. Check formats again.")
    transfer_config = attempt.directory / "cobalt-transfer-request.json"
    transfer_config.write_text(json.dumps({"format": candidate, "limits": limits}))
    os.chmod(transfer_config, 0o644)
    engine_command(attempt, [sys.executable, "-I", str(HERE / "cobalt_transfer.py"), str(transfer_config)], COBALT_ERRORS)
    transfer = engine_record(attempt, "cobalt-transfer.json", 4096)
    closed(transfer, ("complete", "files", "sourceBytes"))
    expected_names = [f"cobalt-input-{index}.{'m3u8' if candidate['isHLS'] else 'bin'}" for index in range(len(candidate["urls"]))]
    if transfer["complete"] is not True or transfer["files"] != expected_names or type(transfer["sourceBytes"]) is not int or not 0 < transfer["sourceBytes"] <= limits["sourceBytes"]:
        reject("incomplete_output", "The media transfer did not complete.")
    attempt.add_bytes(transfer["sourceBytes"])
    inputs = [attempt.directory / name for name in expected_names]
    for path in inputs:
        if path.is_symlink() or not path.is_file():
            reject("unsafe_output", "The engine produced an unsafe file.")
    destination = attempt.directory / ("media-1." + fmt["container"])
    if len(inputs) == 1 and not candidate["isHLS"]:
        inputs[0].rename(destination)
    else:
        command = ["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-err_detect", "explode"]
        for path in inputs:
            if candidate["isHLS"]:
                command.extend(("-allowed_extensions", "ALL"))
            command.extend(("-protocol_whitelist", "file,pipe", "-i", str(path)))
        command.extend(("-map", "0:v:0", "-map", "1:a:0" if len(inputs) == 2 else "0:a?", "-c", "copy"))
        if fmt["container"] == "mp4":
            command.extend(("-movflags", "+faststart"))
        command.append(str(destination))
        attempt.command(command)
    attempt.expected_media[destination.name] = {"durationSeconds": inspection["durationSeconds"], "hasAudio": fmt["hasAudio"],
                                               "width": fmt["width"], "height": fmt["height"], "container": fmt["container"],
                                               "videoCodec": fmt["videoCodec"], "fps": fmt["fps"]}
    return [destination], evidence


def execute(attempt):
    return run_ytdlp(attempt) if attempt.request["request"]["engine"] == "yt-dlp" else run_cobalt(attempt)
