"""Exercise verified posts through the pinned yt-dlp picker/download pipeline."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from adapters import run_ytdlp
from executor import Attempt, verify_expected_media
from security import Rejected
from test_executor import request
from test_post_sources import MEDIA_ID, PIN_ID, SOURCE_ID, pin, status, tweet_video
from test_ytdlp import video
from ytdlp_runner import complete_format_facts, run, source_failure


def config(platform="Twitter"):
    body = request()
    body["request"].update({"sourceComposition": "verified-post", "extractorKeys": [platform], "inspect": True,
                            "sourceId": SOURCE_ID if platform == "Twitter" else PIN_ID,
                            "url": f"https://x.com/i/status/{SOURCE_ID}" if platform == "Twitter" else f"https://www.pinterest.com/pin/{PIN_ID}/"})
    return body


@unittest.skipUnless(importlib.util.find_spec("yt_dlp"), "Pinned yt-dlp is installed in the executor image")
class PostRunnerTests(unittest.TestCase):
    def test_real_lazy_registry_extractor_runs_inside_restricted_downloader(self):
        from yt_dlp.extractor.twitter import TwitterIE
        body = config()
        with tempfile.TemporaryDirectory() as directory:
            previous = Path.cwd()
            try:
                os.chdir(directory)
                # Keep the actual get_info_extractor registry, wrapper and
                # YoutubeDL processing. Only the upstream network is replaced.
                with patch.object(TwitterIE, "_real_initialize"), patch.object(TwitterIE, "_extract_status", return_value=status()), patch.object(TwitterIE, "_extract_variant_formats", return_value=([video("direct")], {})):
                    run(body, {})
                result = json.loads(Path("engine-result.json").read_text())
                self.assertEqual(result["evidence"]["sourceId"], SOURCE_ID)
                self.assertEqual(result["evidence"]["items"], [{"id": MEDIA_ID, "type": "video"}])
                self.assertEqual(result["inspection"]["formats"][0]["id"], "direct")
            finally:
                os.chdir(previous)

    def execute(self, body, *, raw=None, duration=12, emitted_id=None, formats=None, download_id=None, observed=None):
        import yt_dlp
        from yt_dlp.extractor.common import InfoExtractor

        counts = {"metadata": 0, "downloads": [], "formats": 0}
        platform = body["request"]["extractorKeys"][0]
        fixture = copy.deepcopy(raw if raw is not None else status() if platform == "Twitter" else pin())
        choices = formats if formats is not None else [video("direct"), video("hd", width=1280, height=720)]

        def info(identity):
            counts["formats"] += 1
            return {"id": emitted_id or identity, "display_id": body["request"]["sourceId"], "title": "Public post video",
                    "duration": duration, "webpage_url": body["request"]["url"], "formats": copy.deepcopy(choices)}

        class TwitterIE(InfoExtractor):
            _VALID_URL = r"https://x\.com/i/status/(?P<id>\d+)"

            def _extract_status(self, source_id):
                counts["metadata"] += 1
                return fixture

            def _real_extract(self, url):
                original = self._extract_status(self._match_id(url))
                return info(original["extended_entities"]["media"][0]["id_str"])

        class PinterestIE(InfoExtractor):
            _VALID_URL = r"https://www\.pinterest\.com/pin/(?P<id>\d+)/"

            def _extract_video(self, data, extract_formats=True):
                return info(data["id"])

            def _real_extract(self, url):
                counts["metadata"] += 1
                return self._extract_video(fixture)

        def download(downloader, value):
            counts["downloads"].append(value["format_id"])
            path = Path.cwd() / "media-1.mp4"
            path.write_bytes(b"test media; supervisor decode has separate coverage")
            value["filepath"] = str(path)
            if download_id is not None:
                value["id"] = download_id
            downloader.run_all_pps("after_move", value)

        def probe(fmt):
            if observed is None:
                raise AssertionError("Unexpected media probe in an offline test")
            counts.setdefault("probes", []).append(fmt["format_id"])
            return copy.deepcopy(observed)

        def fill_facts(value, source_request, limits):
            return complete_format_facts(value, source_request, limits, probe=probe)

        extractor = TwitterIE if platform == "Twitter" else PinterestIE
        with tempfile.TemporaryDirectory() as directory:
            previous = Path.cwd()
            try:
                os.chdir(directory)
                timings = {}
                with patch("yt_dlp.extractor.get_info_extractor", return_value=extractor), patch.object(yt_dlp.YoutubeDL, "process_info", download), patch("ytdlp_runner.complete_format_facts", side_effect=fill_facts):
                    try:
                        run(body, timings)
                    except Exception as error:
                        self.assertFalse(Path("engine-result.json").exists())
                        return None, counts, error
                return json.loads(Path("engine-result.json").read_text()), counts, None
            finally:
                os.chdir(previous)

    def test_original_formats_inspect_then_exact_selection_for_both_platforms(self):
        for platform in ("Twitter", "Pinterest"):
            with self.subTest(platform=platform):
                body = config(platform)
                inspected, calls, error = self.execute(body)
                self.assertIsNone(error)
                self.assertEqual(calls, {"metadata": 1, "downloads": [], "formats": 1})
                self.assertEqual(inspected["files"], [])
                self.assertEqual(inspected["evidence"]["sourceId"], body["request"]["sourceId"])
                item_id = MEDIA_ID if platform == "Twitter" else PIN_ID
                self.assertEqual(inspected["evidence"]["items"], [{"id": item_id, "type": "video"}])
                self.assertEqual(inspected["inspection"]["durationSeconds"], 12)
                self.assertNotIn("cdn.example", json.dumps(inspected))
                for choice in inspected["inspection"]["formats"]:
                    body["request"].update(selectedFormat=choice["id"], expectedFormat=choice)
                    downloaded, calls, error = self.execute(body)
                    self.assertIsNone(error)
                    self.assertEqual(calls, {"metadata": 1, "downloads": [choice["id"]], "formats": 1})
                    self.assertEqual(downloaded["files"], ["media-1.mp4"])
                    self.assertEqual(downloaded["evidence"], inspected["evidence"])
                    self.assertEqual(downloaded["expected"], [{"durationSeconds": 12, "hasAudio": True}])

    def test_single_video_direct_download_uses_verified_original(self):
        body = config()
        body["request"].pop("inspect")
        result, calls, error = self.execute(body)
        self.assertIsNone(error)
        self.assertEqual(calls["downloads"], ["hd"])
        self.assertEqual(result["evidence"]["sourceId"], SOURCE_ID)
        self.assertEqual(result["evidence"]["items"], [{"id": MEDIA_ID, "type": "video"}])

    def test_raw_mixed_private_or_different_source_is_rejected_before_formats(self):
        cases = [status([tweet_video(), {"type": "photo", "id_str": "1"}]),
                 status(user={"protected": True}), status(id_str="12345")]
        for fixture in cases:
            with self.subTest(fixture=fixture):
                result, calls, error = self.execute(config(), raw=fixture)
                self.assertIsNone(result)
                self.assertIsNotNone(error)
                self.assertEqual(calls["formats"], 0)
                self.assertEqual(calls["downloads"], [])

    def test_extractor_output_must_match_original_media_identity(self):
        result, calls, error = self.execute(config(), emitted_id="different")
        self.assertIsNone(result)
        self.assertEqual(str(error), "unsupported_source")
        self.assertEqual(calls["downloads"], [])

    def test_selected_format_must_still_match_original_observable_properties(self):
        initial, _, error = self.execute(config())
        self.assertIsNone(error)
        selected = initial["inspection"]["formats"][0]
        for changed in ({"id": "missing"}, {"height": 360}, {"hasAudio": False}, {"requiresMerge": True}):
            with self.subTest(changed=changed):
                body = config()
                expected = {**selected, **changed}
                body["request"].update(selectedFormat=expected["id"], expectedFormat=expected)
                result, calls, error = self.execute(body)
                self.assertIsNone(result)
                self.assertEqual(str(error), "format_unavailable")
                self.assertEqual(calls["downloads"], [])

    def test_duration_limit_is_applied_before_inspection_and_download(self):
        for inspect in (True, False):
            body = config()
            body["request"]["inspect"] = inspect
            body["limits"]["durationSeconds"] = 10
            result, calls, error = self.execute(body, duration=11)
            self.assertIsNone(result)
            self.assertIsNotNone(error)
            self.assertEqual(calls["downloads"], [])

    def test_actual_output_identity_must_equal_original_selected_media(self):
        initial, _, error = self.execute(config())
        self.assertIsNone(error)
        selected = initial["inspection"]["formats"][0]
        body = config()
        body["request"].update(selectedFormat=selected["id"], expectedFormat=selected)
        result, calls, error = self.execute(body, download_id="different")
        self.assertIsNone(result)
        self.assertEqual(str(error), "unsupported_source")
        self.assertEqual(calls["downloads"], [selected["id"]])

    def test_missing_original_dimensions_and_codecs_are_probed_before_picker_filtering(self):
        body = config()
        formats = [video("original", width=None, height=None, vcodec=None, acodec=None),
                   video("alternate", width=None, height=None, vcodec=None, acodec=None)]
        observed = {"width": 640, "height": 360, "vcodec": "avc1.42001E", "acodec": "aac", "fps": 30,
                    "ext": "mp4", "duration": 12, "filesize": 1000}
        result, calls, error = self.execute(body, duration=None, formats=formats, observed=observed)
        self.assertIsNone(error)
        self.assertEqual(calls["downloads"], [])
        self.assertCountEqual(calls["probes"], ["original", "alternate"])
        self.assertEqual(result["inspection"]["durationSeconds"], 12)
        selected = next(fmt for fmt in result["inspection"]["formats"] if fmt["id"] == "original")
        self.assertEqual((selected["width"], selected["height"], selected["videoCodec"], selected["hasAudio"]),
                         (640, 360, "avc1.42001E", True))
        body["request"].update(selectedFormat=selected["id"], expectedFormat=selected)
        result, calls, error = self.execute(body, duration=None, formats=formats, observed=observed)
        self.assertIsNone(error)
        self.assertEqual(calls["downloads"], ["original"])
        self.assertEqual(calls["probes"], ["original"])
        self.assertEqual(result["expected"], [{"durationSeconds": 12, "hasAudio": True}])

    def test_probed_original_still_must_obey_duration_and_resolution_limits(self):
        formats = [video("original", width=None, height=None, vcodec=None, acodec=None)]
        observed = {"width": 640, "height": 360, "vcodec": "avc1.42001E", "acodec": "aac", "fps": 30,
                    "ext": "mp4", "duration": 12, "filesize": 1000}
        for change, code in (({"width": 1920, "height": 1080}, "no_video_formats"),
                             ({"duration": 1801}, "source_duration_limit")):
            with self.subTest(change=change):
                result, calls, error = self.execute(config(), duration=None, formats=formats, observed={**observed, **change})
                self.assertIsNone(result)
                self.assertEqual(str(error), code)
                self.assertEqual(calls["downloads"], [])


class EvidenceBoundaryTests(unittest.TestCase):
    def test_selected_request_properties_override_omitted_or_forged_child_receipt_facts(self):
        selected = {"id": "direct", "container": "mp4", "width": 640, "height": 360, "fps": 30,
                    "bytes": 1000, "estimatedBytes": False, "hasAudio": True,
                    "requiresMerge": False, "videoCodec": "avc1.42001E"}
        body = config()
        body["request"].update(selectedFormat=selected["id"], expectedFormat=selected)
        source = {"sourceId": SOURCE_ID, "originalComposition": "complete", "items": [{"id": MEDIA_ID, "type": "video"}],
                  "isLive": False, "requiresAuthentication": False}
        forged = {"width": 1280, "height": 720, "container": "webm", "fps": None, "videoCodec": "h264"}
        cases = ((True, {"durationSeconds": 12, "hasAudio": False}),
                 (True, {"durationSeconds": 12, "hasAudio": False, **forged}),
                 (False, {"durationSeconds": 12, "hasAudio": True, **forged}))
        for requested_audio, child_facts in cases:
            with self.subTest(child_facts=child_facts), tempfile.TemporaryDirectory() as directory:
                body["request"]["expectedFormat"] = {**selected, "hasAudio": requested_audio}
                attempt = Attempt(copy.deepcopy(body), directory)
                path = Path(directory) / "media-1.mp4"
                path.write_bytes(b"fixture; verification consumes observed metadata below")
                def complete_child(*args, **kwargs):
                    (Path(directory) / "engine-result.json").write_text(json.dumps({"complete": True, "files": [path.name],
                        "expected": [child_facts], "evidence": source}))
                    return b""
                with patch.object(attempt, "command", side_effect=complete_child), patch.object(attempt, "timing"):
                    files, evidence = run_ytdlp(attempt)
                self.assertEqual(files, [path])
                self.assertEqual(evidence, source)
                self.assertEqual(attempt.expected_media[path.name], {"durationSeconds": 12,
                    **{key: selected[key] for key in ("width", "height", "container", "videoCodec", "fps")}, "hasAudio": requested_audio})
                actual = {"durationSeconds": 12, "hasAudio": requested_audio, "width": 640, "height": 360,
                          "mime": "video/mp4", "_video": {"videoCodec": "avc1.42001E", "fps": 30}}
                verify_expected_media(attempt, path, actual)
                for changed in ({"width": 1280}, {"height": 720}, {"mime": "video/webm"}, {"hasAudio": not requested_audio},
                                {"_video": {"videoCodec": "avc1.640028", "fps": 30}},
                                {"_video": {"videoCodec": "avc1.42001E", "fps": 60}}):
                    with self.subTest(changed=changed), self.assertRaises(Rejected):
                        verify_expected_media(attempt, path, {**actual, **changed})

    def test_selected_frame_rate_accepts_decimal_rounding_but_not_another_rate(self):
        with tempfile.TemporaryDirectory() as directory:
            attempt = Attempt(config(), directory)
            path = Path(directory) / "media-1.mp4"
            attempt.expected_media[path.name] = {"container": "mp4", "fps": 29.97}
            actual = {"durationSeconds": 12, "hasAudio": True, "width": 640, "height": 360,
                      "mime": "video/mp4", "_video": {"videoCodec": "avc1.42001E", "fps": 30000 / 1001}}
            verify_expected_media(attempt, path, actual)
            for fps in (24, 60, None):
                with self.subTest(fps=fps), self.assertRaises(Rejected):
                    verify_expected_media(attempt, path, {**actual, "_video": {**actual["_video"], "fps": fps}})

    def test_public_evidence_flags_are_literal_booleans(self):
        body = config()
        evidence = {"sourceId": SOURCE_ID, "originalComposition": "complete", "items": [{"id": MEDIA_ID, "type": "video"}],
                    "isLive": False, "requiresAuthentication": False}
        info = {"id": MEDIA_ID, "duration": 12, "_canopy_source_evidence": evidence}
        self.assertIsNone(source_failure(info, body["request"], body["limits"], final=True))
        for field in ("isLive", "requiresAuthentication"):
            for value in (None, 0, "false", True):
                with self.subTest(field=field, value=value):
                    info["_canopy_source_evidence"] = {**evidence, field: value}
                    self.assertEqual(source_failure(info, body["request"], body["limits"], final=True), "unsupported_source")


if __name__ == "__main__":
    unittest.main()
