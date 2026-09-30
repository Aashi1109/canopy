"""One fenced attempt per slot. Engine children never receive storage or control authority."""
import copy
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime

from security import Rejected, attempt_key, connect_https, fingerprint, reject, validate_inspection, validate_start

HERE = Path(__file__).resolve().parent
CHILD_UID = 10001
CHILD_GID = 10001


def child_environment(directory):
    env = {"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
           "HOME": str(directory), "TMPDIR": str(directory), "LANG": "C.UTF-8",
           "PYTHONDONTWRITEBYTECODE": "1"}
    # These are deployment-selected trust stores, never browser inputs. Do not
    # pass the parent environment, cookies, proxy credentials or presigned URLs.
    for name in ("SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS", "REQUESTS_CA_BUNDLE"):
        if os.environ.get(name):
            env[name] = os.environ[name]
    return env


class Attempt:
    def __init__(self, request, directory):
        self.request, self.directory = request, Path(directory)
        self.key, self.fingerprint = attempt_key(request), fingerprint(request)
        self.started = time.monotonic()
        self.deadline = min(self.started + request["limits"]["workMs"] / 1000,
                            self.started + datetime.fromisoformat(request["deadline"].replace("Z", "+00:00")).timestamp() - time.time())
        self.cancelled = threading.Event()
        self.done = threading.Event()
        self.lock = threading.RLock()
        self.processes = []
        self.state, self.phase, self.stopped = "running", "starting", False
        self.error, self.evidence, self.artifacts = None, None, []
        self.inspection, self.pending_inspection = None, None
        self.source_bytes = 0
        self.finished = None
        self.expected_media = {}

    def snapshot(self):
        with self.lock:
            result = {"state": self.state, "stopped": self.stopped,
                "phase": self.phase, "usage": {"sourceBytes": self.source_bytes,
                "workMs": max(0, int(((self.finished or time.monotonic()) - self.started) * 1000))},
                "artifacts": self.artifacts, "evidence": self.evidence, "error": self.error}
            if self.inspection is not None:
                result["inspection"] = self.inspection
            return copy.deepcopy(result)

    def timing(self, stage, milliseconds):
        # Only fixed stage names and trusted attempt identifiers reach stdout.
        # Child stdout/stderr remain suppressed; these are diagnostics, not usage.
        record = {"event": "downloader_timing", "jobId": self.request["jobId"],
                  "attemptGeneration": self.request["attemptGeneration"],
                  "slotGeneration": self.request["slotGeneration"], "startOrdinal": self.request["startOrdinal"],
                  "stage": "native." + stage, "durationMs": max(0, round(milliseconds))}
        try:
            print(json.dumps(record, separators=(",", ":"), allow_nan=False), flush=True)
        except (OSError, ValueError):
            pass  # Observability must never change completion or stop proof.

    def checkpoint(self):
        if self.cancelled.is_set():
            reject("cancelled", "The download was cancelled.")
        if time.monotonic() >= self.deadline:
            reject("deadline_exceeded", "The download exceeded its time limit.")
        total = 0
        for path in self.directory.rglob("*"):
            mode = path.lstat().st_mode
            if stat.S_ISLNK(mode):
                reject("unsafe_output", "The engine produced an unsafe file.")
            if stat.S_ISREG(mode):
                total += path.stat().st_size
        if total > self.request["limits"]["scratchBytes"]:
            reject("resource_limit", "The download exceeded temporary storage limits.")

    def add_bytes(self, count):
        # This counts directly observed materialization traffic only. The Worker
        # whole-egress meter is authoritative for total source traffic.
        with self.lock:
            self.source_bytes += count
            if self.source_bytes > self.request["limits"]["sourceBytes"]:
                reject("resource_limit", "The download exceeded its transfer limit.")

    def spawn(self, command, *, stdout=subprocess.DEVNULL, env=None):
        self.checkpoint()
        kwargs = {}
        if os.geteuid() == 0:
            kwargs.update(user=CHILD_UID, group=CHILD_GID, extra_groups=[])
        # Popen's user/group support avoids unsafe preexec_fn in a threaded server.
        bounded = [sys.executable, "-I", str(HERE / "resource_exec.py"), json.dumps(self.request["limits"]), *command]
        process = subprocess.Popen(bounded, cwd=self.directory, env=env or child_environment(self.directory),
            stdin=subprocess.DEVNULL, stdout=stdout, stderr=subprocess.DEVNULL,
            start_new_session=True, close_fds=True, **kwargs)
        with self.lock:
            self.processes.append(process)
        return process

    def wait(self, process):
        while process.poll() is None:
            self.checkpoint()
            time.sleep(0.05)
        if process.returncode:
            reject("engine_failed", "The source could not be processed.")

    def command(self, command, output_name=None):
        output = self.directory / output_name if output_name else None
        if output:
            with output.open("wb") as stream:
                process = self.spawn(command, stdout=stream)
                self.wait(process)
            if output.stat().st_size > 1024 * 1024:
                reject("resource_limit", "The engine returned too much metadata.")
            return output.read_bytes()
        self.wait(self.spawn(command))

    def stop(self):
        """Terminate every engine/FFmpeg process group, including exited leaders."""
        with self.lock:
            processes = list(self.processes)
        uncertain = False
        for sig, budget in ((signal.SIGTERM, 0.5), (signal.SIGKILL, 2.0)):
            for process in processes:
                try:
                    os.killpg(process.pid, sig)
                except ProcessLookupError:
                    pass
                except PermissionError:
                    uncertain = True
            until = time.monotonic() + budget
            while time.monotonic() < until:
                remaining = False
                for process in processes:
                    process.poll()  # reap leaders before checking for surviving descendants
                    try:
                        os.killpg(process.pid, 0)
                        remaining = True
                    except ProcessLookupError:
                        pass
                    except PermissionError:
                        uncertain = True
                if not remaining:
                    return not uncertain
                time.sleep(0.02)
        return not processes


def video_properties(stream):
    """Private codec/frame facts shared by remote and stored-byte probes."""
    codec = stream.get("codec_name")
    if not isinstance(codec, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", codec):
        raise ValueError()
    codec = codec.lower()
    if codec == "h264":
        # FFprobe's first extradata line contains either the avcC header or
        # Annex B's initial SPS. Both carry the exact AVC profile/constraints/level.
        match = re.search(r"(?m)^00000000:\s+([0-9a-fA-F ]+?)  ", stream.get("extradata", ""))
        if match:
            header = bytes.fromhex(match[1])
            if len(header) >= 7 and header[0] == 1 and header[4] & 0xfc == 0xfc and header[5] & 0xe0 == 0xe0:
                codec = "avc1." + header[1:4].hex()
            else:
                prefix = 4 if header.startswith(b"\x00\x00\x00\x01") else 3 if header.startswith(b"\x00\x00\x01") else 0
                if prefix and len(header) >= prefix + 4 and header[prefix] & 0x1f == 7:
                    codec = "avc1." + header[prefix + 1:prefix + 4].hex()
    # A generic VP9/AV1 observation cannot prove a fully qualified codec profile.
    try:
        numerator, denominator = stream.get("avg_frame_rate", "0/0").split("/")
        fps = int(numerator) / int(denominator)
    except (ValueError, TypeError, AttributeError, ZeroDivisionError):
        fps = None
    if fps is not None and (not math.isfinite(fps) or not 0 < fps <= 240):
        fps = None
    return {"videoCodec": codec, "fps": fps}


def video_codec_matches(actual, expected):
    if not isinstance(actual, str) or not isinstance(expected, str):
        return False
    actual, expected = actual.lower(), expected.lower()
    aliases = {"h264": "h264", "avc1": "h264", "avc3": "h264", "vp9": "vp9", "vp09": "vp9", "av1": "av1", "av01": "av1",
               "hevc": "hevc", "h265": "hevc", "hvc1": "hevc", "hev1": "hevc"}
    if expected in aliases:
        return aliases.get(actual.split(".", 1)[0], actual) == aliases[expected]
    return actual == expected


def output_video_codec_matches(observed, expected):
    """Check decoded stream facts after the adapter verified the source selection.

    FFprobe does not reconstruct VP9/AV1/HEVC manifest codec strings. Their
    profile and sample depth are observable independently; level and optional
    signalling remain bound by the adapter's exact source-format comparison.
    This must not replace the stricter cross-engine/source codec comparison.
    """
    actual = observed.get("videoCodec")
    if video_codec_matches(actual, expected):
        return True
    if not isinstance(actual, str) or not isinstance(expected, str):
        return False
    actual, expected = actual.lower(), expected.lower()
    if re.fullmatch(r"avc[13]\.[0-9a-f]{6}", actual) and re.fullmatch(r"avc[13]\.[0-9a-f]{6}", expected):
        # MP4 remuxing can change the sample entry without changing AVC bytes.
        return actual.split(".", 1)[1] == expected.split(".", 1)[1]
    pixels = observed.get("pixelFormat")
    profile = observed.get("profile")
    if not isinstance(pixels, str) or not isinstance(profile, str):
        return False
    depth = re.fullmatch(r"(?:yuv[aj]?(?:420|422|444|440|411|410)p|gbrp|gray)(?:(8|9|10|12|14|16)(?:le|be)?)?", pixels)
    if not depth:
        return False
    bit_depth = int(depth[1] or "8")
    profile = profile.lower()
    if actual == "vp9":
        choice = re.fullmatch(r"vp09\.(0[0-3])\.\d{2}\.(08|10|12)(?:\.\d{2}\.\d{2}\.\d{2}\.\d{2}\.(?:00|01))?", expected)
        return bool(choice and profile == f"profile {int(choice[1])}" and bit_depth == int(choice[2]))
    if actual == "av1":
        choice = re.fullmatch(r"av01\.([0-2])\.\d{2}[mh]\.(08|10|12)(?:\.[01]\.\d{3}\.\d{2}\.\d{2}\.\d{2}\.[01])?", expected)
        profiles = {"main": 0, "high": 1, "professional": 2}
        return bool(choice and profiles.get(profile) == int(choice[1]) and bit_depth == int(choice[2]))
    if actual == "hevc":
        choice = re.fullmatch(r"(?:hvc1|hev1)\.([1-3])\.[0-9a-f]+\.[lh]\d{1,3}(?:\.[0-9a-f]{1,2}){0,6}", expected)
        profiles = {"main": 1, "main 10": 2, "main still picture": 3}
        # Main 10 permits either 8- or 10-bit samples; Main/Still require 8-bit.
        return bool(choice and profiles.get(profile) == int(choice[1]) and bit_depth in ((8, 10) if choice[1] == "2" else (8,)))
    return False


def probe(attempt, path, quality, *, decode=True):
    attempt.checkpoint()
    if path.is_symlink() or not path.is_file() or path.parent != attempt.directory:
        reject("unsafe_output", "The engine produced an unsafe file.")
    size = path.stat().st_size
    if not 0 < size <= attempt.request["limits"]["fileBytes"]:
        reject("resource_limit", "The video exceeds the file size limit.")
    data = attempt.command(["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_data", "-show_format", "-of", "json", str(path)], "probe.json")
    try:
        info = json.loads(data)
        streams = info["streams"]
        videos = [s for s in streams if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")]
        if len(videos) != 1:
            raise ValueError()
        video = videos[0]
        properties = video_properties(video)
        width, height = int(video["width"]), int(video["height"])
        rotation = next((int(s.get("rotation", 0)) for s in video.get("side_data_list", []) if "rotation" in s), int(video.get("tags", {}).get("rotate", 0)))
        if rotation % 180:
            width, height = height, width
        duration = float(info["format"]["duration"])
        if not math.isfinite(duration) or not 0 < duration <= attempt.request["limits"]["durationSeconds"] or min(width, height) > int(quality) or min(width, height) < 1:
            raise ValueError()
        names = info["format"]["format_name"].split(",")
        extension, mime = ("mp4", "video/mp4") if "mp4" in names or "mov" in names else (("webm", "video/webm") if "webm" in names else (None, None))
        if extension == "webm" and (video.get("codec_name") not in ("vp8", "vp9", "av1") or any(s.get("codec_name") not in ("opus", "vorbis") for s in streams if s.get("codec_type") == "audio")):
            raise ValueError()
        with path.open("rb") as source:
            header = source.read(12)
        if extension == "mp4" and header[4:8] == b"ftyp" and header[8:12] == b"qt  ":
            extension, mime = "mov", "video/quicktime"
        if not extension:
            raise ValueError()
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        reject("unsupported_output", "The video does not satisfy the requested output limits.")
    # A probe alone can accept playable truncation. Decode the entire bounded
    # stored file and fail on decode errors; original-transfer evidence is also
    # required from the adapter, because clean EOF alone cannot prove completeness.
    if decode:
        attempt.command(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-err_detect", "explode", "-protocol_whitelist", "file,pipe", "-i", str(path), "-map", "0:v:0", "-map", "0:a?", "-f", "null", "-"])
    return {"name": "video." + extension, "mime": mime, "bytes": size, "width": width,
            "height": height, "durationSeconds": duration, "hasAudio": any(s.get("codec_type") == "audio" for s in streams),
            "_video": {**properties, "profile": video.get("profile"), "pixelFormat": video.get("pix_fmt")}}


def verify_expected_media(attempt, path, metadata):
    expected = attempt.expected_media.get(path.name)
    if not expected:
        return
    duration = expected.get("durationSeconds")
    if duration is not None and abs(metadata["durationSeconds"] - duration) > max(2, duration * 0.01):
        reject("incomplete_output", "The video duration does not match the complete source.")
    if expected.get("hasAudio") is True and not metadata["hasAudio"]:
        reject("incomplete_output", "The video is missing its source audio.")
    if "container" in expected and "hasAudio" in expected and expected["hasAudio"] is not metadata["hasAudio"]:
        reject("format_unavailable", "The output does not match the selected audio option.")
    if any(key in expected and expected[key] != metadata[key] for key in ("width", "height")):
        reject("format_unavailable", "The output does not match the selected dimensions.")
    if expected.get("container") and metadata["mime"] != "video/" + expected["container"]:
        reject("format_unavailable", "The output does not match the selected file format.")
    observed = metadata.get("_video", {})
    if "videoCodec" in expected and not output_video_codec_matches(observed, expected["videoCodec"]):
        reject("format_unavailable", "The output does not match the selected video codec.")
    # Manifests commonly round 30000/1001 to 29.97 (or 30); this is the same rate.
    if expected.get("fps") is not None and (observed.get("fps") is None or not math.isclose(observed["fps"], expected["fps"], rel_tol=1e-3, abs_tol=0.01)):
        reject("format_unavailable", "The output does not match the selected frame rate.")


def upload_and_validate(attempt, path, authority, quality, connector=connect_https):
    """Validate actual stored bytes under the ETag returned by this PUT, not HEAD."""
    attempt.phase = "uploading"
    size = path.stat().st_size
    connection, target = connector(authority["putUrl"])
    try:
        connection.putrequest("PUT", target)
        connection.putheader("Content-Length", str(size))
        connection.putheader("Content-Type", "application/octet-stream")
        connection.endheaders()
        with path.open("rb") as source:
            while block := source.read(64 * 1024):
                attempt.checkpoint()
                connection.send(block)
        response = connection.getresponse()
        etag = response.getheader("ETag")
        if response.status not in (200, 201) or not etag or len(etag) > 128 or any(c in etag for c in "\r\n"):
            reject("storage_failed", "The video could not be stored.")
    finally:
        connection.close()
    # No redirects, credential forwarding or arbitrary response locations.
    attempt.phase = "validating"
    connection, target = connector(authority["getUrl"])
    readback = attempt.directory / ("stored-" + authority["artifactId"])
    try:
        connection.request("GET", target, headers={"If-Match": etag})
        response = connection.getresponse()
        if response.status != 200 or response.getheader("ETag") != etag:
            reject("storage_changed", "The stored video changed before validation.")
        transferred = 0
        with readback.open("xb") as output:
            while block := response.read(64 * 1024):
                attempt.checkpoint()
                transferred += len(block)
                if transferred > size or transferred > attempt.request["limits"]["fileBytes"]:
                    reject("resource_limit", "The stored video exceeds its expected size.")
                output.write(block)
        if transferred != size:
            reject("incomplete_output", "The stored video is incomplete.")
    finally:
        connection.close()
    os.chmod(readback, 0o644)
    metadata = probe(attempt, readback, quality)
    verify_expected_media(attempt, path, metadata)
    readback.unlink()
    metadata.pop("_video", None)  # Probe-only facts are not part of the public artifact contract.
    return {"id": authority["artifactId"], "storageKey": authority["storageKey"], "etag": etag, **metadata}


class Supervisor:
    def __init__(self, adapter, *, enabled=False, root=None, uploader=upload_and_validate):
        self.adapter, self.enabled, self.root, self.uploader = adapter, enabled, root, uploader
        self.lock = threading.RLock()
        self.attempts = {}
        self.active = None
        self.highest_slot = 0
        self.quarantined = False

    def start(self, body):
        validate_start(body)
        key = attempt_key(body)
        with self.lock:
            if key in self.attempts:
                previous = self.attempts[key]
                if previous.fingerprint != fingerprint(body):
                    reject("attempt_conflict", "This attempt already has a different request.", 409)
                return previous.snapshot()
            if not self.enabled:
                reject("confinement_unverified", "Native execution is disabled until its containment evidence passes.", 503)
            if self.quarantined or (self.active and not self.active.done.is_set()):
                reject("slot_busy", "The execution slot is unavailable.", 409)
            if key[2] < self.highest_slot:
                reject("stale_attempt", "A fresh execution slot is required.", 409)
            if self.active and key[2] == self.highest_slot and key[:3] != self.active.key[:3]:
                reject("stale_attempt", "A new execution requires a fresh slot generation.", 409)
            if key[2] > self.highest_slot:
                # Public history is durable in the Worker. Retain only the
                # current slot generation's ordinal receipts, never an unbounded
                # warm-container history or an artificial lifetime job cap.
                self.attempts.clear()
            directory = tempfile.mkdtemp(prefix="canopy-download-", dir=self.root)
            if os.geteuid() == 0:
                os.chown(directory, CHILD_UID, CHILD_GID)
            attempt = Attempt(body, directory)
            self.highest_slot = key[2]
            self.active = self.attempts[key] = attempt
            threading.Thread(target=self._execute, args=(attempt,), daemon=True).start()
            return attempt.snapshot()

    def get(self, key):
        with self.lock:
            if key not in self.attempts:
                reject("attempt_not_found", "The execution attempt was not found.", 404)
            return self.attempts[key]

    def cancel(self, key):
        attempt = self.get(key)
        with attempt.lock:
            if attempt.state == "running":
                attempt.cancelled.set()
                attempt.phase = "stopping"
        # A response is not a claim of stopped until the worker has finished I/O,
        # killed/reaped groups, and cleaned its files.
        attempt.done.wait(timeout=0.2)
        return attempt.snapshot()

    def _execute(self, attempt):
        try:
            request = attempt.request["request"]
            inspecting = request.get("inspect") is True and not request.get("selectedFormat")
            attempt.phase = "inspecting" if inspecting else "downloading"
            files, evidence = self.adapter(attempt)
            attempt.checkpoint()
            if not attempt.stop():
                reject("cleanup_unconfirmed", "The execution slot requires recycling.")
            if not isinstance(evidence, dict) or evidence.get("originalComposition") != "complete":
                reject("composition_unverified", "The complete media composition could not be verified.")
            if inspecting:
                if files or attempt.request["stagingArtifacts"]:
                    reject("unsupported_output", "Inspection must not transfer video files.")
                validate_inspection(attempt.pending_inspection, request, attempt.request["limits"])
                with attempt.lock:
                    attempt.evidence = evidence
                return  # finally still confirms process stop and removes scratch files.
            if not 1 <= len(files) <= min(attempt.request["limits"]["maxItems"], len(attempt.request["stagingArtifacts"])):
                reject("unsupported_output", "The source has an unsupported number of videos.")
            if sum(path.stat().st_size for path in files) > attempt.request["limits"]["outputBytes"]:
                reject("resource_limit", "The videos exceed the total output limit.")
            quality = attempt.request["request"]["quality"]
            artifacts = []
            # Every item passes before any receipt leaves the supervisor.
            for path, authority in zip(files, attempt.request["stagingArtifacts"]):
                attempt.phase = "validating"
                # Preflight metadata before upload; the one full decode runs on
                # the exact stored bytes read back under the upload's ETag.
                metadata = probe(attempt, path, quality, decode=False)
                verify_expected_media(attempt, path, metadata)
                artifacts.append(self.uploader(attempt, path, authority, quality))
            attempt.checkpoint()
            with attempt.lock:
                attempt.evidence, attempt.artifacts = evidence, artifacts
        except Rejected as error:
            attempt.error = {"code": error.code, "message": error.message, "retryable": False}
        except Exception:
            attempt.error = {"code": "engine_failed", "message": "The video could not be processed.", "retryable": False}
        finally:
            cleanup_started = time.monotonic()
            attempt.timing("native_execution", (cleanup_started - attempt.started) * 1000)
            stopped = attempt.stop()
            try:
                shutil.rmtree(attempt.directory)
            except OSError:
                stopped = False
            with attempt.lock:
                attempt.stopped = stopped
                if not stopped:
                    self.quarantined = True
                    attempt.error = {"code": "cleanup_unconfirmed", "message": "The execution slot requires recycling.", "retryable": False}
                if attempt.cancelled.is_set():
                    attempt.state = "cancelled"
                else:
                    attempt.state = "failed" if attempt.error else "succeeded"
                if attempt.error:
                    attempt.error["retryable"] = stopped and attempt.state == "failed" and attempt.error["code"] in ("extraction_failed", "upstream_failure")
                    try:
                        print(json.dumps({"event": "downloader_failure", "jobId": attempt.request["jobId"],
                                          "engine": attempt.request["request"]["engine"], "phase": attempt.phase,
                                          "code": attempt.error["code"], "retryable": attempt.error["retryable"]}), flush=True)
                    except OSError:
                        pass
                if attempt.state != "succeeded":
                    attempt.artifacts, attempt.evidence = [], None
                elif attempt.pending_inspection is not None:
                    attempt.inspection = attempt.pending_inspection
                attempt.pending_inspection = None
                attempt.phase = "complete" if stopped else "recycle_required"
                attempt.finished = time.monotonic()
                attempt.timing("native_cleanup", (attempt.finished - cleanup_started) * 1000)
                attempt.timing("native_total", (attempt.finished - attempt.started) * 1000)
                attempt.done.set()
