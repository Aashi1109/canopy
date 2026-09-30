"""Cobalt resolver/transfer boundary tests; no platform or cloud requests."""
import http.client
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from adapters import cobalt_headers, cobalt_matches_selection, engine_record, cobalt_source, run_cobalt
from cobalt_transfer import Transfer, connect_source
from executor import Attempt, probe, verify_expected_media
from security import MAX_LIMITS, Rejected


def request():
    return {"protocolVersion": 1, "jobId": "job-1", "attemptGeneration": 1, "slotGeneration": 1, "startOrdinal": 1,
            "deadline": (datetime.now(timezone.utc) + timedelta(seconds=90)).isoformat(), "limits": dict(MAX_LIMITS),
            "request": {"engine": "cobalt", "platformId": "dailymotion", "url": "https://www.dailymotion.com/video/x12345",
                        "quality": "720", "sourceId": "x12345", "sourceComposition": "single-video"},
            "stagingArtifacts": []}


def source():
    return {"evidence": {"sourceId": "x12345", "originalComposition": "complete", "items": [{"id": "x12345", "type": "video"}],
                         "isLive": False, "requiresAuthentication": False}, "title": "Test video", "durationSeconds": 5,
            "formats": [{"id": "cobalt.12345", "container": "mp4", "width": 640, "height": 360,
                         "fps": 30, "bytes": None, "estimatedBytes": False, "hasAudio": True, "requiresMerge": False,
                         "videoCodec": "h264", "urls": ["https://cdn.example/media.mp4?token=private"], "isHLS": False}]}


class Socket:
    def __init__(self, value):
        self.value = value

    def makefile(self, *_args):
        return io.BytesIO(self.value)


def response(body, *, headers=None, status=200):
    fields = dict(headers or {})
    raw = f"HTTP/1.1 {status} Status\r\n".encode() + b"".join(f"{key}: {value}\r\n".encode() for key, value in fields.items()) + b"\r\n" + body
    result = http.client.HTTPResponse(Socket(raw))
    result.begin()
    return result


class Connection:
    def __init__(self, reply):
        self.reply, self.headers = reply, None

    def request(self, _method, _target, headers):
        self.headers = headers

    def getresponse(self):
        return self.reply

    def close(self):
        pass


class TransferTests(unittest.TestCase):
    def test_child_uses_proxy_hostname_routing_and_verified_tls_without_supervisor_dns_pinning(self):
        with patch("cobalt_transfer.http.client.HTTPSConnection") as connection, patch("socket.getaddrinfo", side_effect=AssertionError("the egress proxy resolves the destination")):
            result, path = connect_source("https://cdn.example/media?token=private")
            self.assertIs(result, connection.return_value)
            self.assertEqual(path, "/media?token=private")
            args, kwargs = connection.call_args
            self.assertEqual(args, ("cdn.example",))
            self.assertTrue(kwargs["context"].check_hostname)
            self.assertEqual(kwargs["context"].verify_mode, 2)
        for url in ("http://cdn.example/video", "https://127.0.0.1/video", "https://user:password@cdn.example/video"):
            with self.assertRaises(Rejected):
                connect_source(url)

    def test_accepts_complete_chunked_and_close_delimited_transfers(self):
        for reply in (response(b"5\r\nvideo\r\n0\r\n\r\n", headers={"Transfer-Encoding": "chunked"}), response(b"video")):
            with self.subTest(chunked=reply.chunked), tempfile.TemporaryDirectory() as directory:
                transfer = Transfer(directory, MAX_LIMITS, lambda _url: (Connection(reply), "/media"))
                path = transfer.fetch("https://cdn.example/media", "media.bin", {})
                self.assertEqual(path.read_bytes(), b"video")
                self.assertEqual(transfer.source_bytes, 5)

    def test_rejects_partial_framing_empty_and_oversized_bodies(self):
        cases = ((response(b"part", headers={"Content-Length": "5"}), "incomplete_output"),
                 (response(b"5\r\npart", headers={"Transfer-Encoding": "chunked"}), "incomplete_output"),
                 (response(b""), "incomplete_output"),
                 (response(b"123456"), "resource_limit"),
                 (response(b"12345", headers={"Content-Length": "5", "Transfer-Encoding": "chunked"}), "incomplete_output"))
        for reply, code in cases:
            with self.subTest(code=code), tempfile.TemporaryDirectory() as directory:
                limits = {**MAX_LIMITS, "fileBytes": 5}
                transfer = Transfer(directory, limits, lambda _url: (Connection(reply), "/media"))
                with self.assertRaises(Rejected) as failure:
                    transfer.fetch("https://cdn.example/media", "media.bin", {})
                self.assertEqual(failure.exception.code, code)

    def test_source_and_scratch_budgets_include_all_transfers(self):
        for budget in ("sourceBytes", "scratchBytes"):
            with self.subTest(budget=budget), tempfile.TemporaryDirectory() as directory:
                transfer = Transfer(directory, {**MAX_LIMITS, budget: 8}, lambda _url: (Connection(response(b"12345")), "/media"))
                transfer.fetch("https://cdn.example/first", "first.bin", {})
                with self.assertRaises(Rejected) as failure:
                    transfer.fetch("https://cdn.example/second", "second.bin", {})
                self.assertEqual(failure.exception.code, "resource_limit")

    def test_redirect_rejects_private_authorities_and_strips_anonymous_cookie_on_host_change(self):
        with tempfile.TemporaryDirectory() as directory:
            connections = [Connection(response(b"", headers={"Location": "https://other.example/media"}, status=302)), Connection(response(b"video"))]
            visited = []
            def connector(url):
                visited.append(url)
                return connections[len(visited) - 1], "/media"
            transfer = Transfer(directory, MAX_LIMITS, connector)
            transfer.fetch("https://cdn.example/media", "media.bin", {"Cookie": "anonymous=session", "Referer": "https://www.tiktok.com/", "User-Agent": "engine"})
            self.assertEqual(connections[1].headers, {"User-Agent": "engine", "Accept-Encoding": "identity"})
        for location in ("http://cdn.example/media", "https://127.0.0.1/", "file:///etc/passwd"):
            with self.subTest(location=location), tempfile.TemporaryDirectory() as directory:
                connection = Connection(response(b"", headers={"Location": location}, status=302))
                transfer = Transfer(directory, MAX_LIMITS, lambda _url: (connection, "/media"))
                with self.assertRaises(Rejected):
                    transfer.fetch("https://cdn.example/media", "media.bin", {})

    def test_static_hls_materializes_every_segment_and_rewrites_urls_locally(self):
        manifest = b'#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2.5,\npart1.ts\n#EXTINF:2.5,\npart2.ts\n#EXT-X-ENDLIST\n'
        bodies = {"https://cdn.example/media.m3u8": manifest, "https://cdn.example/init.mp4": b"init", "https://cdn.example/part1.ts": b"one", "https://cdn.example/part2.ts": b"two"}
        visited = []
        def connector(url):
            visited.append(url)
            return Connection(response(bodies[url])), "/media"
        with tempfile.TemporaryDirectory() as directory:
            transfer = Transfer(directory, MAX_LIMITS, connector)
            path = transfer.hls("https://cdn.example/media.m3u8", "cobalt-input-0", {})
            self.assertEqual(len(visited), 4)
            self.assertNotIn("https://", path.read_text())
            self.assertTrue(path.read_text().endswith("#EXT-X-ENDLIST\n"))
            self.assertEqual((Path(directory) / "cobalt-input-0-segment-1.ts").read_bytes(), b"two")
            self.assertEqual(transfer.source_bytes, sum(map(len, bodies.values())))

    def test_hls_rejects_live_encrypted_master_and_missing_segments(self):
        manifests = (b"#EXTM3U\n#EXTINF:5,\npart.ts\n",
                     b'#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:5,\npart.ts\n#EXT-X-ENDLIST\n',
                     b"#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvariant.m3u8\n#EXT-X-ENDLIST\n",
                     b"#EXTM3U\n#EXTINF:5,\n#EXT-X-ENDLIST\n")
        for manifest in manifests:
            with self.subTest(manifest=manifest), tempfile.TemporaryDirectory() as directory:
                transfer = Transfer(directory, MAX_LIMITS, lambda _url: (Connection(response(manifest)), "/manifest"))
                with self.assertRaises(Rejected):
                    transfer.hls("https://cdn.example/media.m3u8", "cobalt-input-0", {})
        with tempfile.TemporaryDirectory() as directory:
            manifest = b"#EXTM3U\n#EXTINF:5,\nmissing.ts\n#EXT-X-ENDLIST\n"
            def connector(url):
                return Connection(response(manifest) if url.endswith("m3u8") else response(b"", status=404)), "/media"
            with self.assertRaises(Rejected) as failure:
                Transfer(directory, MAX_LIMITS, connector).hls("https://cdn.example/media.m3u8", "cobalt-input-0", {})
            self.assertEqual(failure.exception.code, "source_denied")

    def test_hls_relative_segments_resolve_from_final_manifest_url(self):
        visited, connections = [], []
        manifest = b"#EXTM3U\n#EXTINF:5,\nsegment.ts\n#EXT-X-ENDLIST\n"
        def connector(url):
            visited.append(url)
            if url == "https://first.example/path/video.m3u8":
                reply = response(b"", headers={"Location": "https://second.example/actual/video.m3u8"}, status=302)
            elif url.endswith("m3u8"):
                reply = response(manifest)
            else:
                reply = response(b"segment")
            connection = Connection(reply)
            connections.append(connection)
            return connection, "/media"
        with tempfile.TemporaryDirectory() as directory:
            Transfer(directory, MAX_LIMITS, connector).hls("https://first.example/path/video.m3u8", "cobalt-input-0", {"cookie": "anonymous=value"})
        self.assertEqual(visited[-1], "https://second.example/actual/segment.ts")
        self.assertNotIn("cookie", connections[-1].headers)

    def test_hls_cross_host_init_and_segments_do_not_receive_source_credentials(self):
        manifest = b'#EXTM3U\n#EXT-X-MAP:URI="https://other.example/init.mp4"\n#EXTINF:5,\nhttps://other.example/segment.m4s\n#EXT-X-ENDLIST\n'
        connections = []
        def connector(url):
            connection = Connection(response(manifest if url.endswith("m3u8") else b"media"))
            connections.append(connection)
            return connection, "/media"
        headers = {"Cookie": "anonymous=value", "Referer": "https://cdn.example/", "User-Agent": "engine"}
        with tempfile.TemporaryDirectory() as directory:
            Transfer(directory, MAX_LIMITS, connector).hls("https://cdn.example/video.m3u8", "cobalt-input-0", headers)
        self.assertEqual(len(connections), 3)
        self.assertEqual(connections[0].headers["Cookie"], "anonymous=value")
        for connection in connections[1:]:
            self.assertEqual(connection.headers, {"User-Agent": "engine", "Accept-Encoding": "identity"})

    def test_hls_byte_ranges_require_exact_response_ranges(self):
        manifest = b"#EXTM3U\n#EXTINF:5,\n#EXT-X-BYTERANGE:3@10\nfile.ts\n#EXT-X-ENDLIST\n"
        for header, succeeds in (("bytes 10-12/20", True), ("bytes 0-2/20", False)):
            with self.subTest(header=header), tempfile.TemporaryDirectory() as directory:
                def connector(url):
                    reply = response(manifest) if url.endswith("m3u8") else response(b"abc", headers={"Content-Range": header}, status=206)
                    return Connection(reply), "/media"
                transfer = Transfer(directory, MAX_LIMITS, connector)
                if succeeds:
                    transfer.hls("https://cdn.example/media.m3u8", "cobalt-input-0", {})
                else:
                    with self.assertRaises(Rejected):
                        transfer.hls("https://cdn.example/media.m3u8", "cobalt-input-0", {})


class AdapterTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg is required for media validation")
    def test_finite_hls_completes_local_remux_and_full_decode_with_audio(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            upstream, workspace = root / "upstream", root / "attempt"
            upstream.mkdir()
            workspace.mkdir()
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=160x90:r=10",
                            "-f", "lavfi", "-i", "sine=frequency=500:sample_rate=44100", "-t", "1", "-c:v", "libx264",
                            "-c:a", "aac", "-f", "hls", "-hls_time", "0.5", "-hls_list_size", "0", "-hls_segment_filename",
                            str(upstream / "segment-%02d.ts"), str(upstream / "video.m3u8")], check=True, capture_output=True)
            receipt = source()
            receipt["durationSeconds"] = 1
            receipt["formats"][0].update(width=160, height=90, fps=10, isHLS=True, urls=["https://cdn.example/video.m3u8"])
            attempt = Attempt(request(), workspace)
            original_command = attempt.command
            def command(args, output_name=None):
                if args[0] == "node":
                    (workspace / "cobalt-source.json").write_text(json.dumps(receipt))
                elif any(str(arg).endswith("cobalt_transfer.py") for arg in args):
                    def connector(url):
                        path = upstream / url.rsplit("/", 1)[-1]
                        return Connection(response(path.read_bytes())), "/media"
                    transfer = Transfer(workspace, MAX_LIMITS, connector)
                    path = transfer.hls("https://cdn.example/video.m3u8", "cobalt-input-0", {})
                    (workspace / "cobalt-transfer.json").write_text(json.dumps({"complete": True, "files": [path.name], "sourceBytes": transfer.source_bytes}))
                    # Attempt normally owns its directory as the engine UID.
                    if os.geteuid() == 0:
                        os.chmod(root, 0o755)
                        os.chmod(workspace, 0o777)
                        for file in workspace.iterdir():
                            os.chmod(file, 0o644)
                else:
                    return original_command(args, output_name)
            attempt.command = command
            files, _ = run_cobalt(attempt)
            metadata = probe(attempt, files[0], "720")
            self.assertEqual((metadata["width"], metadata["height"], metadata["hasAudio"]), (160, 90, True))
            self.assertGreater(metadata["bytes"], 0)
            self.assertAlmostEqual(metadata["durationSeconds"], 1, delta=.1)
            verify_expected_media(attempt, files[0], metadata)
            attempt.stop()

    def test_inspection_returns_public_formats_and_no_media_transfer(self):
        with tempfile.TemporaryDirectory() as directory:
            body = request()
            body["request"]["inspect"] = True
            attempt = Attempt(body, directory)
            calls = []
            def command(args):
                calls.append(args)
                (Path(directory) / "cobalt-source.json").write_text(json.dumps(source()))
            attempt.command = command
            files, evidence = run_cobalt(attempt)
            self.assertEqual(files, [])
            self.assertEqual(len(calls), 1)
            self.assertEqual(evidence["sourceId"], "x12345")
            self.assertNotIn("private", json.dumps(attempt.pending_inspection))
            self.assertNotIn("urls", attempt.pending_inspection["formats"][0])

    def test_missing_media_facts_are_probed_in_bounded_child(self):
        with tempfile.TemporaryDirectory() as directory:
            attempt = Attempt(request(), directory)
            receipt = source()
            for field in ("hasAudio", "videoCodec", "width", "height"):
                receipt["formats"][0].pop(field)
            calls = []
            def command(args, output_name):
                calls.append(args)
                return json.dumps({"streams": [{"codec_type": "video", "codec_name": "h264", "width": 640, "height": 360, "avg_frame_rate": "30/1"}, {"codec_type": "audio"}], "format": {"duration": "5", "size": "1000", "format_name": "mov,mp4"}}).encode()
            attempt.command = command
            inspection, _, _ = cobalt_source(attempt, receipt)
            fmt = inspection["formats"][0]
            self.assertEqual((fmt["width"], fmt["hasAudio"], fmt["videoCodec"], fmt["bytes"]), (640, True, "h264", 1000))
            self.assertEqual(calls[0][calls[0].index("-protocol_whitelist") + 1], "https,tls,tcp")
            self.assertEqual(calls[0][calls[0].index("-tls_verify") + 1], "1")
            self.assertEqual(calls[0][calls[0].index("-ca_file") + 1], os.environ.get("SSL_CERT_FILE", "/etc/ssl/certs/ca-certificates.crt"))
            self.assertIn("-rw_timeout", calls[0])

    def test_invalid_identity_composition_duration_or_media_facts_are_rejected(self):
        mutations = (lambda data: data["evidence"].update(sourceId="another"),
                     lambda data: data["evidence"].update(isLive=True),
                     lambda data: data["evidence"].update(requiresAuthentication=True),
                     lambda data: data["evidence"]["items"].append({"id": "image", "type": "image"}),
                     lambda data: data.update(durationSeconds=1801),
                     lambda data: data["formats"][0].update(width=1920, height=1080),
                     lambda data: data["formats"][0].update(headers={"Authorization": "private"}),
                     lambda data: data["formats"][0].update(urls=["http://localhost/secret"]))
        for mutate in mutations:
            with self.subTest(mutate=mutate), tempfile.TemporaryDirectory() as directory:
                receipt = source()
                mutate(receipt)
                with self.assertRaises(Rejected):
                    cobalt_source(Attempt(request(), directory), receipt)

    def test_selected_properties_do_not_allow_silent_quality_audio_or_exact_size_changes(self):
        expected = {key: value for key, value in source()["formats"][0].items() if key not in ("urls", "isHLS")}
        self.assertTrue(cobalt_matches_selection({**expected, "id": "other-engine"}, expected))
        self.assertTrue(cobalt_matches_selection({**expected, "videoCodec": "avc1.4D400B"}, {**expected, "videoCodec": "avc1.4d400b"}))
        for change in ({"height": 240}, {"hasAudio": False}, {"videoCodec": "av1"}, {"fps": 25}, {"container": "webm"}):
            self.assertFalse(cobalt_matches_selection({**expected, **change}, expected))
        self.assertFalse(cobalt_matches_selection({**expected, "bytes": 200}, {**expected, "bytes": 100}))
        self.assertFalse(cobalt_matches_selection({**expected, "bytes": 100, "estimatedBytes": True}, {**expected, "bytes": 100}))

    def test_cobalt_id_selection_must_match_and_preserves_duration_audio_for_final_validation(self):
        for selected, succeeds in (("cobalt.12345", True), ("cobalt.other", False)):
            with self.subTest(selected=selected), tempfile.TemporaryDirectory() as directory:
                body = request()
                body["request"].update(selectedFormat=selected, expectedFormat={key: value for key, value in source()["formats"][0].items() if key not in ("urls", "isHLS")})
                attempt = Attempt(body, directory)
                def command(args):
                    if args[0] == "node":
                        (Path(directory) / "cobalt-source.json").write_text(json.dumps(source()))
                    else:
                        (Path(directory) / "cobalt-input-0.bin").write_bytes(b"video")
                        (Path(directory) / "cobalt-transfer.json").write_text(json.dumps({"complete": True, "files": ["cobalt-input-0.bin"], "sourceBytes": 5}))
                attempt.command = command
                if succeeds:
                    files, _ = run_cobalt(attempt)
                    self.assertEqual(files[0].read_bytes(), b"video")
                    self.assertEqual(attempt.expected_media[files[0].name]["durationSeconds"], 5)
                    with self.assertRaises(Rejected):
                        verify_expected_media(attempt, files[0], {"durationSeconds": 5, "hasAudio": False})
                    with self.assertRaises(Rejected):
                        verify_expected_media(attempt, files[0], {"durationSeconds": 1, "hasAudio": True})
                else:
                    with self.assertRaises(Rejected) as failure:
                        run_cobalt(attempt)
                    self.assertEqual(failure.exception.code, "format_unavailable")
                    self.assertFalse((Path(directory) / "cobalt-input-0.bin").exists())

    def test_completion_records_reject_symlinks_fifo_and_oversized_data(self):
        with tempfile.TemporaryDirectory() as directory:
            attempt = Attempt(request(), directory)
            target = Path(directory) / "target.json"
            target.write_text("{}")
            record = Path(directory) / "cobalt-source.json"
            record.symlink_to(target)
            with self.assertRaises(Rejected):
                engine_record(attempt, record.name)
            record.unlink()
            os.mkfifo(record)
            with self.assertRaises(Rejected):
                engine_record(attempt, record.name)
            record.unlink()
            record.write_bytes(b" " * 100)
            with self.assertRaises(Rejected):
                engine_record(attempt, record.name, 20)

    def test_anonymous_cookie_is_tiktok_only_and_headers_are_not_injectable(self):
        self.assertEqual(cobalt_headers({"cookie": "anonymous=value"}, "tiktok"), {"cookie": "anonymous=value"})
        for headers, platform in (({"cookie": "anonymous=value"}, "instagram"), ({"user-agent": "safe\r\nAuthorization: secret"}, "tiktok"), ({"Cookie": "a=b", "cookie": "c=d"}, "tiktok")):
            with self.assertRaises(Rejected):
                cobalt_headers(headers, platform)

    def test_source_failures_return_fixed_codes_without_private_messages(self):
        with tempfile.TemporaryDirectory() as directory:
            attempt = Attempt(request(), directory)
            def command(_args):
                (Path(directory) / "engine-error.json").write_text(json.dumps({"code": "source_denied"}))
                raise Rejected("engine_failed", "hidden upstream payload")
            attempt.command = command
            with self.assertRaises(Rejected) as failure:
                run_cobalt(attempt)
            self.assertEqual(failure.exception.code, "source_denied")
            self.assertNotIn("hidden", str(failure.exception))


if __name__ == "__main__":
    unittest.main()
