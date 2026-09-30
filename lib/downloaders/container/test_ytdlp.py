"""Original-format selection and metadata-only execution, without network access."""
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import sys
import unittest
from unittest.mock import Mock, patch

from adapters import engine_command, log_ytdlp_timings, run_ytdlp, start_youtube_token_provider
from executor import Attempt, Supervisor
from security import Rejected, attempt_key, validate_start
from test_executor import request
from ytdlp_runner import YTDLP_FAILURES, candidate_formats, classify_failure, complete_format_facts, engine_error_message, inspection_result, main, record_failure, select_format


def video(identity="18", **changes):
    value = {"format_id": identity, "url": "https://cdn.example/video?secret=upstream",
             "protocol": "https", "ext": "mp4", "width": 640, "height": 360,
             "fps": 30, "filesize": 1000, "vcodec": "avc1.42001E", "acodec": "mp4a.40.2"}
    value.update(changes)
    return value


def source(formats=None, **changes):
    value = {"id": "abcdefghijk", "title": "Example video", "duration": 60,
             "webpage_url": "https://www.youtube.com/watch?v=abcdefghijk", "formats": formats or [video()]}
    value.update(changes)
    return value


def inspect_request():
    value = request()
    value["request"]["inspect"] = True
    value["stagingArtifacts"] = []
    return value


def inspection():
    body = inspect_request()
    return inspection_result(source(), body["request"], body["limits"])


class TokenProviderTests(unittest.TestCase):
    def test_ready_provider_is_a_tracked_child_bound_to_loopback(self):
        with tempfile.TemporaryDirectory() as directory:
            attempt = Attempt(request(), directory)
            process = Mock()
            process.poll.return_value = None
            response = Mock(status=200)
            response.read.return_value = b'{"version":"2.0.0","server_uptime":0.1}'
            with patch.object(attempt, "spawn", return_value=process) as spawn, patch("adapters.http.client.HTTPConnection") as connect, patch.object(attempt, "timing") as timing:
                connect.return_value.getresponse.return_value = response
                self.assertIs(start_youtube_token_provider(attempt), process)
                spawn.assert_called_once_with(["node", "/opt/bgutil/build/main.js", "--host", "127.0.0.1", "--port", "4416"])
                self.assertEqual(connect.call_args.args, ("127.0.0.1", 4416))
                self.assertLessEqual(connect.call_args.kwargs["timeout"], .25)
                connect.return_value.request.assert_called_once_with("GET", "/ping")
                connect.return_value.close.assert_called_once()
                self.assertEqual(timing.call_args.args[0], "youtube_token_provider_startup")

    def test_provider_exit_and_timeout_stop_before_extraction(self):
        for exited in (True, False):
            with self.subTest(exited=exited), tempfile.TemporaryDirectory() as directory:
                attempt = Attempt(inspect_request(), directory)
                process = Mock()
                process.poll.return_value = 1 if exited else None
                clock = [0]
                def now():
                    clock[0] += 1
                    return clock[0]
                with patch.object(attempt, "spawn", return_value=process), patch.object(attempt, "checkpoint"), patch.object(attempt, "command") as command, patch("adapters.http.client.HTTPConnection", side_effect=OSError("unreachable")), patch("adapters.time.monotonic", side_effect=now), patch.object(attempt, "timing"):
                    with self.assertRaises(Rejected) as failure:
                        run_ytdlp(attempt)
                    self.assertEqual(failure.exception.code, "engine_failed")
                    self.assertIn("YouTube token provider", failure.exception.message)
                    command.assert_not_called()

    def test_provider_wait_obeys_attempt_cancellation_and_deadline(self):
        for code in ("cancelled", "deadline_exceeded"):
            with self.subTest(code=code), tempfile.TemporaryDirectory() as directory:
                attempt = Attempt(request(), directory)
                process = Mock()
                process.poll.return_value = None
                if code == "cancelled":
                    attempt.cancelled.set()
                else:
                    attempt.deadline = 0
                with patch.object(attempt, "spawn", return_value=process), patch.object(attempt, "timing"):
                    with self.assertRaises(Rejected) as failure:
                        start_youtube_token_provider(attempt)
                    self.assertEqual(failure.exception.code, code)

    def test_invalid_ping_is_not_accepted_as_a_ready_provider(self):
        for status, raw in ((500, b'{"version":"2.0.0"}'), (200, b"not json"),
                            (200, b'{"version":"1.0.0"}'), (200, b'{}'), (200, b'[]'), (200, b" " * 1025)):
            with self.subTest(status=status, raw=raw), tempfile.TemporaryDirectory() as directory:
                attempt = Attempt(request(), directory)
                process = Mock()
                process.poll.return_value = None
                response = Mock(status=status)
                response.read.return_value = raw
                with patch.object(attempt, "spawn", return_value=process), patch.object(attempt, "checkpoint", side_effect=[None, Rejected("cancelled", "Cancelled")]), patch("adapters.http.client.HTTPConnection") as connect, patch.object(attempt, "timing"):
                    connect.return_value.getresponse.return_value = response
                    with self.assertRaises(Rejected) as failure:
                        start_youtube_token_provider(attempt)
                    self.assertEqual(failure.exception.code, "cancelled")
                    connect.return_value.close.assert_called_once()

    def test_supervisor_stops_token_child_after_an_extractor_failure(self):
        original_spawn = Attempt.spawn
        processes = []
        def spawn(attempt, command):
            process = original_spawn(attempt, [sys.executable, "-c", "import time; time.sleep(30)"])
            processes.append(process)
            return process
        response = Mock(status=200)
        response.read.return_value = b'{"version":"2.0.0"}'
        with tempfile.TemporaryDirectory() as directory, patch.object(Attempt, "spawn", spawn), patch("adapters.http.client.HTTPConnection") as connect, patch("adapters.engine_command", side_effect=Rejected("source_challenge", "Original YouTube reason")), patch("sys.stdout", new_callable=io.StringIO):
            connect.return_value.getresponse.return_value = response
            supervisor = Supervisor(run_ytdlp, enabled=True, root=directory)
            body = inspect_request()
            supervisor.start(body)
            attempt = supervisor.get(attempt_key(body))
            self.assertTrue(attempt.done.wait(3))
            self.assertEqual(len(processes), 1)
            self.assertIsNotNone(processes[0].poll())
            self.assertTrue(attempt.stopped)
            self.assertFalse(attempt.directory.exists())
            self.assertEqual(attempt.error["message"], "Original YouTube reason")

    def test_other_platforms_do_not_start_the_token_provider(self):
        with tempfile.TemporaryDirectory() as directory:
            body = inspect_request()
            body["request"].update(extractorKeys=["Instagram"], platformId="instagram")
            attempt = Attempt(body, directory)
            receipt = {"complete": True, "files": [], "expected": [], "inspection": inspection(), "evidence": {}}
            attempt.command = lambda *args: (Path(directory) / "engine-result.json").write_text(json.dumps(receipt))
            with patch("adapters.start_youtube_token_provider") as provider:
                self.assertEqual(run_ytdlp(attempt), ([], {}))
                provider.assert_not_called()


class FailureTests(unittest.TestCase):
    def setUp(self):
        provider = patch("adapters.start_youtube_token_provider")
        self.provider = provider.start()
        self.addCleanup(provider.stop)

    def test_invalid_error_records_cannot_replace_the_original_execution_failure(self):
        for kind in ("missing", "symlink", "fifo", "oversized", "array", "unknown", "invalid_message"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                attempt = Attempt(request(), directory)
                path = Path(directory) / "engine-error.json"
                target = Path(directory) / "target.json"
                target.write_text('{"code":"source_challenge"}')
                if kind == "symlink":
                    path.symlink_to(target)
                elif kind == "fifo":
                    os.mkfifo(path)
                elif kind != "missing":
                    path.write_text({"oversized": " " * 8193, "array": "[]", "unknown": '{"code":"private upstream data"}',
                                     "invalid_message": '{"code":"source_challenge","message":{"unexpected":"object"}}'}[kind])
                def fail(*args):
                    raise Rejected("engine_failed", "The source could not be processed.")
                attempt.command = fail
                with self.assertRaises(Rejected) as failure:
                    run_ytdlp(attempt)
                self.assertEqual(failure.exception.code, "engine_failed")
                self.assertEqual(failure.exception.message, "The source could not be processed.")

    def test_known_extraction_and_temporary_network_failures_have_fixed_codes(self):
        cases = (
            ("ERROR: [Instagram] Unable to extract shared data", "extraction_failed"),
            ("ERROR: Failed to extract initial player response", "extraction_failed"),
            ("ERROR: Unable to download webpage: HTTP Error 503: Service Unavailable", "upstream_failure"),
            ("HTTP Error 502: Bad Gateway", "upstream_failure"),
            ("HTTP Error 500: Internal Server Error", "upstream_failure"),
            ("ConnectionResetError: [Errno 104] Connection reset by peer", "upstream_failure"),
            ("Remote end closed connection without response", "upstream_failure"),
            ("[Errno -3] Temporary failure in name resolution", "upstream_failure"),
            ("The read operation timed out", "upstream_failure"),
        )
        for message, expected in cases:
            with self.subTest(message=message):
                self.assertEqual(classify_failure(message), expected)
                self.assertEqual(classify_failure(expected), expected)
                self.assertNotIn(message, YTDLP_FAILURES[expected])

    def test_restrictions_take_precedence_over_extraction_or_network_wrappers(self):
        cases = (
            ("Unable to extract: Sign in to confirm you're not a bot", "source_challenge"),
            ("Failed to extract: login required", "source_unavailable"),
            ("Unable to extract: This video is private", "source_unavailable"),
            ("Unable to extract: This video is only available for registered users", "source_unavailable"),
            ("Unable to extract: HTTP Error 403: Forbidden", "source_denied"),
            ("Unable to extract: HTTP Error 429: Too Many Requests", "source_denied"),
            ("Failed to extract: This video is DRM protected", "unsupported_source"),
            ("Unable to extract: This live event will begin shortly", "unsupported_source"),
            ("Unable to extract: Video duration exceeds the limit", "source_duration_limit"),
            ("Unable to extract: Requested format is not available", "format_unavailable"),
            ("Failed to extract: certificate verify failed", "tls_failed"),
            ("Failed to extract: TLS handshake failed", "tls_failed"),
            ("Failed to extract: [SSL: UNEXPECTED_EOF_WHILE_READING]", "tls_failed"),
            ("Unable to extract: No space left on device", "engine_failed"),
            ("Unable to extract: File too large", "engine_failed"),
            ("Unable to extract: MemoryError", "engine_failed"),
            ("HTTP Error 404: Not Found", "source_unavailable"),
            ("arbitrary upstream response", "engine_failed"),
        )
        for message, expected in cases:
            with self.subTest(message=message):
                self.assertEqual(classify_failure(message), expected)

    def test_original_error_survives_the_runner_and_adapter(self):
        message = "ERROR: [youtube] Q_4Lk4X_i5o: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication."
        with tempfile.TemporaryDirectory() as directory:
            previous = Path.cwd()
            try:
                os.chdir(directory)
                record_failure(message)
            finally:
                os.chdir(previous)
            self.assertEqual(json.loads((Path(directory) / "engine-error.json").read_text()),
                             {"code": "source_challenge", "message": message})
            attempt = Attempt(request(), directory)
            def fail(*args):
                raise Rejected("engine_failed", "The source could not be processed.")
            attempt.command = fail
            with self.assertRaises(Rejected) as failure:
                engine_command(attempt, ["engine"], YTDLP_FAILURES)
            self.assertEqual(failure.exception.code, "source_challenge")
            self.assertEqual(failure.exception.message, message)

    def test_error_message_removes_only_stack_trace_and_terminal_formatting(self):
        message = "ERROR: [youtube] Q_4Lk4X_i5o: Sign in to confirm you're not a bot. https://example.com/?token=original /tmp/original"
        raw = (f"\x1b[31m{message}\x1b[0m\nTraceback (most recent call last):\n"
               '  File "/app/runner.py", line 42, in main\n    raise failure\n    ^^^^^^^^^^^^^\n'
               "    at processVideo (/app/runner.js:12:4)\n")
        self.assertEqual(engine_error_message(raw), message)
        self.assertEqual(engine_error_message('Traceback (most recent call last):\n  File "/app/a.py", line 3, in run\n    download()\nValueError: Original reason'),
                         "ValueError: Original reason")
        self.assertEqual(engine_error_message("ERROR: Original reason\n    at async run (file:///app/a.js:3:4)\n    at /app/b.js:9:8"),
                         "ERROR: Original reason")
        self.assertEqual(engine_error_message("Wait until\nat least one format is available"),
                         "Wait until at least one format is available")
        self.assertEqual(engine_error_message("x" * 2000), "x" * 1000)
        self.assertEqual(engine_error_message("😀" * 1000), "😀" * 500)
        self.assertEqual(engine_error_message("x" * 999 + "😀"), "x" * 999)
        self.assertEqual(engine_error_message(None), "")

    def test_adapter_strips_stack_trace_from_child_record_and_keeps_fixed_code_fallback(self):
        for message, expected in (("Original upstream reason\n    at run (/app/main.js:1:2)", "Original upstream reason"),
                                  ("x" * 2000, "x" * 1000),
                                  ("source_challenge", YTDLP_FAILURES["source_challenge"]),
                                  ("", YTDLP_FAILURES["source_challenge"]),
                                  (None, YTDLP_FAILURES["source_challenge"])):
            with self.subTest(message=message), tempfile.TemporaryDirectory() as directory:
                record = {"code": "source_challenge"}
                if message is not None:
                    record["message"] = message
                (Path(directory) / "engine-error.json").write_text(json.dumps(record))
                attempt = Attempt(request(), directory)
                def fail(*args):
                    raise Rejected("engine_failed", "The source could not be processed.")
                attempt.command = fail
                with self.assertRaises(Rejected) as failure:
                    engine_command(attempt, ["engine"], YTDLP_FAILURES)
                self.assertEqual(failure.exception.code, "source_challenge")
                self.assertEqual(failure.exception.message, expected)

    def test_failure_sidecar_preserves_nonretryable_original_reason(self):
        with tempfile.TemporaryDirectory() as directory:
            previous = Path.cwd()
            try:
                os.chdir(directory)
                record_failure("Unable to extract data from https://secret.example?token=private")
                self.assertEqual(json.loads(Path("engine-error.json").read_text()),
                                 {"code": "extraction_failed", "message": "Unable to extract data from https://secret.example?token=private"})
                record_failure("Login required https://secret.example?token=private")
                record_failure("Failed to extract data")
                record_failure("HTTP Error 503: Service Unavailable")
                self.assertEqual(json.loads(Path("engine-error.json").read_text()),
                                 {"code": "source_unavailable", "message": "Login required https://secret.example?token=private"})
                Path("engine-error.json").unlink()
                record_failure("source_duration_limit")
                self.assertEqual(json.loads(Path("engine-error.json").read_text()),
                                 {"code": "source_duration_limit", "message": YTDLP_FAILURES["source_duration_limit"]})
            finally:
                os.chdir(previous)


class FormatTests(unittest.TestCase):
    def setUp(self):
        provider = patch("adapters.start_youtube_token_provider")
        self.provider = provider.start()
        self.addCleanup(provider.stop)

    def test_manifest_audio_with_unknown_codec_is_preserved_in_mp4_choices(self):
        body = request()
        info = source([video("hls-video", acodec="none", protocol="m3u8_native"),
                       video("hls-audio", vcodec="none", acodec=None, protocol="m3u8_native")])
        formats = candidate_formats(info, body["request"], body["limits"])
        self.assertEqual([fmt["id"] for fmt in formats], ["hls-video+hls-audio"])
        self.assertTrue(formats[0]["hasAudio"])
        self.assertTrue(formats[0]["requiresMerge"])

    def test_verified_post_requires_bound_original_evidence(self):
        body = request()
        body["request"]["sourceComposition"] = "verified-post"
        evidence = {"sourceId": "abcdefghijk", "originalComposition": "complete", "items": [{"id": "media123", "type": "video"}],
                    "isLive": False, "requiresAuthentication": False}
        info = source(id="media123", _canopy_source_evidence=evidence)
        self.assertEqual(len(candidate_formats(info, body["request"], body["limits"])), 1)
        for change in ({"items": None}, {"items": []}, {"items": [{"id": "other", "type": "video"}]},
                       {"sourceId": "other"}, {"originalComposition": "unknown"}, {"requiresAuthentication": True}, {"isLive": True}):
            with self.subTest(change=change), self.assertRaisesRegex(RuntimeError, "unsupported_source"):
                candidate_formats({**info, "_canopy_source_evidence": {**evidence, **change}}, body["request"], body["limits"])

    def test_missing_format_facts_probe_is_bounded_and_selection_scoped(self):
        body = request()
        body["request"]["sourceComposition"] = "verified-post"
        evidence = {"sourceId": "abcdefghijk", "originalComposition": "complete", "items": [{"id": "abcdefghijk", "type": "video"}],
                    "isLive": False, "requiresAuthentication": False}
        calls = []
        def probe(fmt):
            calls.append(fmt["format_id"])
            return {"width": 640, "height": 360, "vcodec": "h264", "acodec": "aac", "duration": 42}
        info = source([video(str(i), vcodec=None, acodec=None) for i in range(20)], duration=None, _canopy_source_evidence=evidence)
        complete_format_facts(info, body["request"], body["limits"], probe)
        self.assertEqual(set(calls), set(str(i) for i in range(8)))
        self.assertEqual(info["duration"], 42)
        calls.clear()
        body["request"]["selectedFormat"] = "12"
        complete_format_facts(info, body["request"], body["limits"], probe)
        self.assertEqual(calls, ["12"])
        complete_format_facts(info, body["request"], body["limits"], probe)
        self.assertEqual(calls, ["12"])

    def test_failed_probe_cannot_fabricate_a_format(self):
        body = request()
        body["request"]["sourceComposition"] = "verified-post"
        info = source([video("unknown", vcodec=None, width=None)], _canopy_source_evidence={
            "sourceId": "abcdefghijk", "originalComposition": "complete", "items": [{"id": "abcdefghijk", "type": "video"}],
            "isLive": False, "requiresAuthentication": False})
        def unavailable(fmt):
            raise ValueError("invalid upstream data")
        complete_format_facts(info, body["request"], body["limits"], unavailable)
        self.assertEqual(candidate_formats(info, body["request"], body["limits"]), [])

    def test_only_named_post_extractors_may_request_original_post_verification(self):
        for key in ("Twitter", "Pinterest", "Reddit", "LinkedIn"):
            body = inspect_request()
            body["request"].update(extractorKeys=[key], sourceComposition="verified-post")
            validate_start(body)
        for keys in (["Youtube"], ["Generic"], ["Twitter", "Pinterest"]):
            body = inspect_request()
            body["request"].update(extractorKeys=keys, sourceComposition="verified-post")
            with self.assertRaises(Rejected):
                validate_start(body)

    @unittest.skipUnless(importlib.util.find_spec("yt_dlp"), "Pinned yt-dlp is installed in the executor image")
    def test_audio_pairing_preserves_extractor_preference_over_bitrate_or_id(self):
        import yt_dlp
        body = request()
        for container, codec, audio_ext, audio_codec in (("mp4", "avc1.42001E", "m4a", "mp4a.40.2"),
                                                        ("webm", "vp9", "webm", "opus")):
            with self.subTest(container=container):
                info = source([
                    video("v", ext=container, vcodec=codec, acodec="none"),
                    video("original", ext=audio_ext, vcodec="none", acodec=audio_codec, abr=96, language_preference=10),
                    video("z-dub", ext=audio_ext, vcodec="none", acodec=audio_codec, abr=256, language_preference=-10),
                ])
                with yt_dlp.YoutubeDL({"quiet": True, "format_sort": ["ext:mp4:m4a", "res"]}) as downloader:
                    downloader.sort_formats(info)
                choices = candidate_formats(info, body["request"], body["limits"])
                self.assertEqual([fmt["id"] for fmt in choices], ["v+original"])

    @unittest.skipUnless(importlib.util.find_spec("yt_dlp") and Path("/opt/yt-dlp-plugins/bgutil").is_dir(), "Pinned yt-dlp and token provider are installed in the executor image")
    def test_pinned_engine_inspects_without_download_and_reuses_extraction_for_exact_selection(self):
        import yt_dlp
        from yt_dlp.extractor.common import InfoExtractor
        calls = {"extract": 0, "download": []}
        fixture = source([video(), video("137", width=1280, height=720, acodec="none"),
                          video("140", ext="m4a", vcodec="none", abr=128)])
        class YoutubeIE(InfoExtractor):
            _VALID_URL = r"https://www\.youtube\.com/watch\?v=(?P<id>[A-Za-z0-9_-]+)"
            def _real_extract(self, url):
                self_options = self._downloader.params
                if self_options["extractor_args"] != {
                    "youtube": {"player_client": ["mweb", "visionos"]},
                    "youtubepot-bgutilhttp": {"base_url": ["http://127.0.0.1:4416"]},
                }:
                    raise AssertionError("YouTube must request tokens using only the internal HTTP provider")
                calls["extract"] += 1
                return copy.deepcopy(fixture)
        def download(downloader, info):
            calls["download"].append(info["format_id"])
            streams = info.get("requested_formats")
            self.assertEqual([fmt["format_id"] for fmt in streams] if streams else [info["format_id"]], info["format_id"].split("+"))
            path = Path.cwd() / "media-1.mp4"
            path.write_bytes(b"fixture media; storage validation is separately exercised")
            info["filepath"] = str(path)
            downloader.run_all_pps("after_move", info)
        for selection in (None, "18", "137+140", "stale", "changed"):
            with self.subTest(selection=selection), tempfile.TemporaryDirectory() as directory:
                body = inspect_request()
                if selection:
                    identity = "18" if selection == "changed" else selection
                    body["request"]["selectedFormat"] = identity
                    body["request"]["expectedFormat"] = next((fmt for fmt in candidate_formats(fixture, body["request"], body["limits"]) if fmt["id"] == identity), {**inspection()["formats"][0], "id": identity})
                    if selection == "changed":
                        body["request"]["expectedFormat"]["height"] = 480
                config = Path(directory) / "config.json"
                config.write_text(json.dumps({"request": body["request"], "limits": body["limits"]}))
                previous = Path.cwd()
                calls["extract"], calls["download"] = 0, []
                try:
                    os.chdir(directory)
                    with patch.object(sys, "argv", ["runner", str(config)]), patch("yt_dlp.extractor.get_info_extractor", return_value=YoutubeIE), patch.object(yt_dlp.YoutubeDL, "process_info", download):
                        if selection in ("stale", "changed"):
                            with self.assertRaisesRegex(RuntimeError, "format_unavailable"):
                                main()
                            self.assertFalse(Path("engine-result.json").exists())
                        else:
                            main()
                            result = json.loads(Path("engine-result.json").read_bytes())
                            self.assertEqual(result["evidence"]["originalComposition"], "complete")
                            self.assertEqual("inspection" in result, selection is None)
                    self.assertEqual(calls["extract"], 1)
                    self.assertEqual(calls["download"], [selection] if selection and selection not in ("stale", "changed") else [])
                    timings = json.loads(Path("engine-timings.json").read_bytes())
                    self.assertEqual(set(timings), {"yt_dlp_startup", "yt_dlp_import", "yt_dlp_setup", "source_metadata", "formats_normalization"})
                    self.assertTrue(all(type(value) is int and value >= 0 for value in timings.values()))
                    self.assertNotIn("upstream", json.dumps(timings))
                finally:
                    os.chdir(previous)

    def test_timing_sidecar_survives_failure_without_persisting_exception_text(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "config.json"
            config.write_text(json.dumps({"request": inspect_request()["request"], "limits": request()["limits"]}))
            def fail(config, timings):
                timings["source_metadata"] = 4200
                raise RuntimeError("private-cookie-and-https://secret.example")
            previous = Path.cwd()
            try:
                os.chdir(directory)
                with patch.object(sys, "argv", ["runner", str(config)]), patch("ytdlp_runner.run", side_effect=fail):
                    with self.assertRaises(RuntimeError):
                        main()
                timings = json.loads(Path("engine-timings.json").read_bytes())
                self.assertEqual(set(timings), {"yt_dlp_startup", "source_metadata"})
                self.assertEqual(timings["source_metadata"], 4200)
                self.assertNotIn("secret", json.dumps(timings))
            finally:
                os.chdir(previous)

    def test_only_bounded_numeric_timing_stages_cross_the_unprivileged_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            attempt = Attempt(inspect_request(), directory)
            path = Path(directory) / "engine-timings.json"
            for value in ({"source_metadata": True}, {"source_metadata": -1}, {"source_metadata": float("nan")},
                          {"source_metadata": 660001}, {"source_metadata": "https://secret.example"},
                          {"source_metadata": 123, "title": "secret"}, ["source_metadata"]):
                with self.subTest(value=value), patch("sys.stdout", new_callable=io.StringIO) as output:
                    path.write_text(json.dumps(value))
                    log_ytdlp_timings(attempt)
                    self.assertEqual(output.getvalue(), "")
            with patch("sys.stdout", new_callable=io.StringIO) as output:
                path.write_bytes(b" " * 2049)
                log_ytdlp_timings(attempt)
                path.unlink()
                secret = Path(directory) / "secret"
                secret.write_text('{"source_metadata": 123}')
                path.symlink_to(secret)
                log_ytdlp_timings(attempt)
                path.unlink()
                os.mkfifo(path)
                log_ytdlp_timings(attempt)
                self.assertEqual(output.getvalue(), "")

    def test_original_progressive_and_compatible_split_options_no_private_fields(self):
        body = request()
        info = source([
            video(), video("137", height=720, width=1280, acodec="none"),
            video("248", ext="webm", width=1280, height=720, vcodec="vp9", acodec="none"),
            video("140", ext="m4a", vcodec="none", acodec="mp4a.40.2", abr=128),
            video("251", ext="webm", vcodec="none", acodec="opus", abr=160),
        ])
        result = inspection_result(info, body["request"], body["limits"])
        formats = result["formats"]
        self.assertEqual([f["id"] for f in formats], ["18", "137+140", "248+251"])
        self.assertTrue(all(f["hasAudio"] for f in formats))
        self.assertEqual([f["requiresMerge"] for f in formats], [False, True, True])
        self.assertEqual(formats[1]["bytes"], 2000)
        self.assertTrue(formats[1]["estimatedBytes"])
        self.assertNotIn("secret", json.dumps(result))
        self.assertNotIn("url", json.dumps(result))
        body["request"]["expectedFormat"] = formats[1]
        selected = select_format(info, body["request"], body["limits"], "137+140")
        self.assertEqual(selected["id"], "137+140")
        with self.assertRaisesRegex(RuntimeError, "format_unavailable"):
            select_format(info, body["request"], body["limits"], "137+251")

    def test_excludes_drm_oversize_nonvideo_protocol_and_audio_loss(self):
        body = request()
        formats = [video("18"), video("bad", has_drm=True),
                   video("large", width=3840, height=2160),
                   video("rtmp", protocol="rtmp"), video("http", url="http://cdn.example/video"),
                   video("audio", vcodec="none", ext="ogg"), video("silent", acodec="none"),
                   video("file", filesize=body["limits"]["fileBytes"] + 1),
                   video("format/selector"), video("height", height=None)]
        self.assertEqual([f["id"] for f in candidate_formats(source(formats), body["request"], body["limits"])], ["18"])
        silent = candidate_formats(source([video("silent", acodec="none")]), body["request"], body["limits"])
        self.assertEqual(len(silent), 1)
        self.assertFalse(silent[0]["hasAudio"])

    def test_portrait_dimensions_estimates_and_bounded_unique_formats(self):
        body = request()
        portrait = video("portrait", width=720, height=1280, filesize=None, filesize_approx=1200)
        result = candidate_formats(source([portrait]), body["request"], body["limits"])[0]
        self.assertEqual((result["width"], result["height"], result["bytes"], result["estimatedBytes"]), (720, 1280, 1200, True))
        formats = [video(str(i)) for i in range(90)]
        formats.append(video("18"))
        result = candidate_formats(source(formats), body["request"], body["limits"])
        self.assertEqual(len(result), 80)
        self.assertEqual(len({f["id"] for f in result}), 80)

    def test_source_restrictions_and_precise_duration_failure(self):
        body = request()
        for change, code in (({"duration": 1801}, "source_duration_limit"), ({"is_live": True}, "unsupported_source"),
                             ({"has_drm": True}, "unsupported_source"), ({"entries": []}, "unsupported_source"),
                             ({"availability": "private"}, "source_unavailable"), ({"id": ""}, "unsupported_source")):
            with self.subTest(change=change), self.assertRaisesRegex(RuntimeError, code):
                inspection_result(source(**change), body["request"], body["limits"])
        body["request"]["sourceComposition"] = "unverified"
        with self.assertRaisesRegex(RuntimeError, "unsupported_source"):
            inspection_result(source(), body["request"], body["limits"])
        self.assertEqual(classify_failure("Video duration exceeds the limit."), "source_duration_limit")

    def test_thirty_minute_duration_ceiling_allows_reported_video_and_respects_lower_job_limit(self):
        body = inspect_request()
        body["limits"]["durationSeconds"] = 1800
        validate_start(body)
        for duration in (874, 1800):
            result = inspection_result(source(duration=duration), body["request"], body["limits"])
            self.assertEqual(result["durationSeconds"], duration)
        with self.assertRaisesRegex(RuntimeError, "source_duration_limit"):
            inspection_result(source(duration=1800.1), body["request"], body["limits"])
        body["limits"]["durationSeconds"] = 1801
        with self.assertRaises(Rejected):
            validate_start(body)
        body["limits"]["durationSeconds"] = 600
        validate_start(body)
        with self.assertRaisesRegex(RuntimeError, "source_duration_limit"):
            inspection_result(source(duration=874), body["request"], body["limits"])

    def test_closed_control_only_inspection_may_omit_storage(self):
        body = inspect_request()
        validate_start(body)
        selected = request()
        selected["request"].update(inspect=True, selectedFormat="18", expectedFormat=inspection()["formats"][0])
        validate_start(selected)
        for mutate in (lambda b: b["request"].update(inspect=1),
                       lambda b: b["request"].update(selectedFormat="bestvideo+bestaudio/best"),
                       lambda b: b["request"].update(selectedFormat="18"),
                       lambda b: b["request"].update(inspect=False),
                       lambda b: b.update(stagingArtifacts=request()["stagingArtifacts"])):
            invalid = inspect_request()
            mutate(invalid)
            with self.assertRaises(Rejected):
                validate_start(invalid)

    def test_selection_requires_valid_stored_option_with_matching_id(self):
        body = request()
        body["request"].update(selectedFormat="18", expectedFormat=inspection()["formats"][0])
        validate_start(body)
        for mutate in (lambda b: b["request"].pop("expectedFormat"),
                       lambda b: b["request"].pop("selectedFormat"),
                       lambda b: b["request"]["expectedFormat"].update(id="other"),
                       lambda b: b["request"]["expectedFormat"].update(width=0),
                       lambda b: b["request"]["expectedFormat"].update(hasAudio=1),
                       lambda b: b["request"]["expectedFormat"].update(videoCodec="arbitrary/selector"),
                       lambda b: b["request"]["expectedFormat"].update(url="https://secret.example")):
            invalid = copy.deepcopy(body)
            mutate(invalid)
            with self.assertRaises(Rejected):
                validate_start(invalid)

    def test_refreshed_shape_must_match_but_estimated_size_may_drift(self):
        body = request()
        expected = inspection()["formats"][0]
        body["request"]["expectedFormat"] = expected
        for field, changed in (("container", "webm"), ("width", 1280), ("height", 480),
                               ("fps", 24), ("hasAudio", False), ("requiresMerge", True),
                               ("videoCodec", "av01"), ("id", "other")):
            changed_request = copy.deepcopy(body["request"])
            changed_request["expectedFormat"][field] = changed
            with self.subTest(field=field), self.assertRaisesRegex(RuntimeError, "format_unavailable"):
                select_format(source(), changed_request, body["limits"], "18")
        changed_size = source([video(filesize=None, filesize_approx=2000)])
        selected = select_format(changed_size, body["request"], body["limits"], "18")
        self.assertEqual((selected["bytes"], selected["estimatedBytes"]), (2000, True))
        with self.assertRaisesRegex(RuntimeError, "no_video_formats"):
            inspection_result(source([video(protocol="rtmp")]), body["request"], body["limits"])
        self.assertEqual(classify_failure("no_video_formats"), "no_video_formats")
        with self.assertRaisesRegex(RuntimeError, "format_unavailable"):
            select_format(source([video(protocol="rtmp")]), body["request"], body["limits"], "18")

    def test_metadata_success_has_no_media_probe_upload_or_staging(self):
        body = inspect_request()
        receipt = {"complete": True, "files": [], "expected": [], "inspection": inspection(),
                   "evidence": {"sourceId": "abcdefghijk", "originalComposition": "complete",
                                "items": [{"id": "abcdefghijk", "type": "video"}], "isLive": False,
                                "requiresAuthentication": False}}
        def adapter(attempt):
            def command(*args):
                (attempt.directory / "engine-result.json").write_text(json.dumps(receipt))
                (attempt.directory / "engine-timings.json").write_text(json.dumps({
                    "yt_dlp_startup": 12, "yt_dlp_import": 400, "yt_dlp_setup": 60,
                    "source_metadata": 4100, "formats_normalization": 2,
                }))
            attempt.command = command
            return run_ytdlp(attempt)
        with tempfile.TemporaryDirectory() as directory, patch("executor.probe") as probe, patch("executor.upload_and_validate") as upload, patch("sys.stdout", new_callable=io.StringIO) as output:
            supervisor = Supervisor(adapter, enabled=True, root=directory, uploader=upload)
            supervisor.start(body)
            attempt = supervisor.get(attempt_key(body))
            self.assertTrue(attempt.done.wait(2))
            result = attempt.snapshot()
            self.assertEqual(result["state"], "succeeded")
            self.assertTrue(result["stopped"])
            self.assertEqual(result["inspection"], inspection())
            self.assertEqual(result["artifacts"], [])
            self.assertFalse(attempt.directory.exists())
            probe.assert_not_called()
            upload.assert_not_called()
            records = [json.loads(line) for line in output.getvalue().splitlines()]
            self.assertEqual({record["stage"] for record in records}, {"native." + stage for stage in ("yt_dlp_startup", "yt_dlp_import", "yt_dlp_setup", "source_metadata", "formats_normalization", "yt_dlp_total", "native_execution", "native_cleanup", "native_total")})
            for record in records:
                self.assertEqual(set(record), {"event", "jobId", "attemptGeneration", "slotGeneration", "startOrdinal", "stage", "durationMs"})
                self.assertEqual(record["event"], "downloader_timing")
                self.assertEqual((record["jobId"], record["attemptGeneration"]), (body["jobId"], body["attemptGeneration"]))
                self.assertIs(type(record["durationMs"]), int)
                self.assertGreaterEqual(record["durationMs"], 0)
            self.assertEqual(next(record["durationMs"] for record in records if record["stage"] == "native.source_metadata"), 4100)
            self.assertNotIn("Example video", output.getvalue())
            self.assertNotIn("https:", output.getvalue())

    def test_failure_emits_correlated_timings_and_broken_logging_does_not_change_cleanup(self):
        def adapter(attempt):
            def fail(*args):
                (attempt.directory / "engine-timings.json").write_text('{"source_metadata":1234}')
                raise Rejected("engine_failed", "Safe fixed error.")
            attempt.command = fail
            return run_ytdlp(attempt)
        for broken in (False, True):
            with tempfile.TemporaryDirectory() as directory, patch("sys.stdout", new_callable=io.StringIO) as output:
                supervisor = Supervisor(adapter, enabled=True, root=directory)
                body = inspect_request()
                with patch("builtins.print", side_effect=OSError("closed log stream")) if broken else patch("builtins.print", wraps=print):
                    supervisor.start(body)
                    attempt = supervisor.get(attempt_key(body))
                    self.assertTrue(attempt.done.wait(2))
                self.assertEqual(attempt.state, "failed")
                self.assertTrue(attempt.stopped)
                self.assertFalse(attempt.directory.exists())
                if not broken:
                    records = [json.loads(line) for line in output.getvalue().splitlines()]
                    self.assertEqual({record["stage"] for record in records if record["event"] == "downloader_timing"}, {"native." + stage for stage in ("source_metadata", "yt_dlp_total", "native_execution", "native_cleanup", "native_total")})
                    failures = [record for record in records if record["event"] == "downloader_failure"]
                    self.assertEqual(failures, [{"event": "downloader_failure", "jobId": body["jobId"],
                                               "engine": "yt-dlp", "phase": "inspecting",
                                               "code": "engine_failed", "retryable": False}])
                    self.assertNotIn("Safe fixed error", output.getvalue())
                    self.assertNotIn("https:", output.getvalue())

    def test_malformed_or_overlarge_inspection_receipt_never_publishes(self):
        for mutate in (lambda r: r["inspection"].update(url="https://secret.example"),
                       lambda r: r["inspection"]["formats"][0].update(requiresMerge=True),
                       lambda r: r["inspection"]["formats"].extend([r["inspection"]["formats"][0]] * 80),
                       lambda r: r.update(files=["media-1.mp4"]),
                       lambda r: r["inspection"].update(durationSeconds=1801)):
            with tempfile.TemporaryDirectory() as directory:
                body = inspect_request()
                attempt = Attempt(body, directory)
                receipt = {"complete": True, "files": [], "expected": [], "inspection": inspection(), "evidence": {}}
                mutate(receipt)
                attempt.command = lambda *args: (Path(directory) / "engine-result.json").write_text(json.dumps(receipt))
                with self.assertRaises(Rejected):
                    run_ytdlp(attempt)

    def test_valid_eighty_format_receipt_uses_bounded_64k_completion_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            body = inspect_request()
            result = inspection()
            result["title"] = "🎞" * 300
            result["formats"] = [{**result["formats"][0],
                "id": f"{index:02d}" + "v" * 78 + "+" + "a" * 80,
                "requiresMerge": True, "videoCodec": "a" * 64} for index in range(80)]
            receipt = {"complete": True, "files": [], "expected": [], "inspection": result, "evidence": {}}
            encoded = json.dumps(receipt).encode()
            self.assertGreater(len(encoded), 32 * 1024)
            self.assertLessEqual(len(encoded), 65_536)
            attempt = Attempt(body, directory)
            attempt.command = lambda *args: (Path(directory) / "engine-result.json").write_bytes(encoded)
            self.assertEqual(run_ytdlp(attempt), ([], {}))
            self.assertEqual(len(attempt.pending_inspection["formats"]), 80)
            encoded = b" " * 65_536 + encoded
            with self.assertRaises(Rejected):
                run_ytdlp(attempt)


if __name__ == "__main__":
    unittest.main()
