"""Deterministic local behavior tests. No upstream platform or cloud requests."""
import base64
import copy
import hashlib
import hmac
import http.client
import io
import json
import os
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from adapters import run_ytdlp
from executor import CHILD_GID, CHILD_UID, HERE, Attempt, Supervisor, child_environment, probe, upload_and_validate, verify_expected_media, video_properties, video_codec_matches
from security import MAX_LIMITS, Rejected, attempt_key, connect_https, validate_start, verify_token
from server import Server, configure_trust_store, execution_enabled, verify_local_interception
from ytdlp_runner import classify_failure, require_approved_extractor

SECRET = b"test-control-secret-at-least-32-bytes"


def request():
    return {"protocolVersion": 1, "jobId": "job-1", "attemptGeneration": 1, "slotGeneration": 1, "startOrdinal": 1,
        "deadline": (datetime.now(timezone.utc) + timedelta(seconds=90)).isoformat(),
        "limits": dict(MAX_LIMITS),
        "request": {"engine": "yt-dlp", "url": "https://www.youtube.com/watch?v=abcdefghijk", "quality": "720", "noPlaylist": True,
                    "sourceId": "abcdefghijk", "extractorKeys": ["Youtube"], "sourceComposition": "single-video"},
        "stagingArtifacts": [{"artifactId": "00000000-0000-4000-8000-000000000001", "storageKey": "staging/job-1/file-1",
            "putUrl": "https://storage.example/object?put=sensitive", "getUrl": "https://storage.example/object?get=sensitive"}]}


def token(operation, body, now=None):
    payload = {key: body[key] for key in ("jobId", "attemptGeneration", "slotGeneration", "startOrdinal")}
    payload.update(operation=operation, expiresAt=int(now or time.time()) + 60)
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).rstrip(b"=")
    signature = base64.urlsafe_b64encode(hmac.digest(SECRET, encoded, "sha256")).rstrip(b"=")
    return "Bearer " + (encoded + b"." + signature).decode()


class SecurityTests(unittest.TestCase):
    def test_codec_observation_preserves_proven_avc_profile_and_rational_frame_rate(self):
        stream = {"codec_name": "h264", "avg_frame_rate": "30000/1001",
                  "extradata": "\n00000000: 0164 0028 ffe1 0008 6764 0028 0000 0000  .d.(....gd.(....\n"}
        self.assertEqual(video_properties(stream), {"videoCodec": "avc1.640028", "fps": 30000 / 1001})
        stream["extradata"] = "\n00000000: 0000 0001 6764 0028 0000 0000 0000 0000  ....gd.(........\n"
        self.assertEqual(video_properties(stream)["videoCodec"], "avc1.640028")
        for codec in ("h264", "vp9", "av1"):
            self.assertEqual(video_properties({"codec_name": codec, "avg_frame_rate": "0/0"}), {"videoCodec": codec, "fps": None})
        self.assertTrue(video_codec_matches("avc1.64002A", "AVC1.64002a"))
        self.assertTrue(video_codec_matches("avc1.640028", "h264"))
        self.assertTrue(video_codec_matches("vp9", "vp09"))
        for actual, expected in (("h264", "avc1.640028"), ("avc1.4d401f", "avc1.640028"),
                                 ("vp9", "vp09.00.31.08"), ("av1", "av01.0.08M.08")):
            self.assertFalse(video_codec_matches(actual, expected))

    def test_python_runner_keeps_isolation_arguments_and_limits_without_another_interpreter(self):
        with tempfile.TemporaryDirectory() as directory:
            launcher = Path(directory) / "resource_exec.py"
            runner = Path(directory) / "ytdlp_runner.py"
            shutil.copyfile(HERE / "resource_exec.py", launcher)
            runner.write_text("import json,os,resource,sys\nprint(json.dumps({"
                "'args':sys.argv,'isolated':sys.flags.isolated,'cpu':resource.getrlimit(resource.RLIMIT_CPU),"
                "'file':resource.getrlimit(resource.RLIMIT_FSIZE),'uid':os.geteuid()}))\n")
            limits = {**MAX_LIMITS, "workMs": 2001}
            result = subprocess.run([sys.executable, "-I", str(launcher), json.dumps(limits),
                sys.executable, "-I", str(runner), "request.json"], check=True, capture_output=True, text=True)
            facts = json.loads(result.stdout)
            self.assertEqual(facts, {"args": [str(runner), "request.json"], "isolated": 1,
                "cpu": [3, 3], "file": [limits["fileBytes"], limits["fileBytes"]], "uid": os.geteuid()})

    def test_ten_minute_work_ceiling_and_matching_child_cpu_limit(self):
        body = request()
        body["limits"]["workMs"] = 600_000
        body["deadline"] = (datetime.now(timezone.utc) + timedelta(seconds=600)).isoformat()
        validate_start(body)
        invalid = copy.deepcopy(body)
        invalid["limits"]["workMs"] = 600_001
        with self.assertRaises(Rejected):
            validate_start(invalid)
        invalid = copy.deepcopy(body)
        invalid["deadline"] = (datetime.now(timezone.utc) + timedelta(seconds=610)).isoformat()
        with self.assertRaises(Rejected):
            validate_start(invalid)
        for work_ms, expected_seconds in ((1001, 2), (600_000, 600)):
            limits = {**MAX_LIMITS, "workMs": work_ms}
            result = subprocess.run([sys.executable, "-I", str(HERE / "resource_exec.py"), json.dumps(limits),
                sys.executable, "-c", "import json,resource;print(json.dumps(resource.getrlimit(resource.RLIMIT_CPU)))"],
                check=True, capture_output=True, text=True)
            self.assertEqual(json.loads(result.stdout), [expected_seconds, expected_seconds])

    def test_upstream_errors_become_fixed_codes_without_source_data(self):
        cases = (("Sign in to confirm you're not a bot https://secret.example/?token=private", "source_challenge"),
                 ("ERROR: HTTP Error 403: Forbidden", "source_denied"),
                 ("ERROR: Video unavailable", "source_unavailable"),
                 ("certificate verify failed: signed URL omitted", "tls_failed"),
                 ("unclassified arbitrary upstream text", "engine_failed"))
        for message, code in cases:
            self.assertEqual(classify_failure(message), code)
        with tempfile.TemporaryDirectory() as directory:
            for code in ("source_challenge", "arbitrary-private-upstream-text"):
                attempt = Attempt(request(), directory)
                def fail(*args):
                    (Path(directory) / "engine-error.json").write_text(json.dumps({"code": code}))
                    raise Rejected("engine_failed", "The source could not be processed.")
                attempt.command = fail
                with self.assertRaises(Rejected) as failure:
                    run_ytdlp(attempt)
                self.assertEqual(failure.exception.code, code if code == "source_challenge" else "engine_failed")
                self.assertNotIn("upstream-text", str(failure.exception))

    def test_operation_and_all_attempt_fences_bound(self):
        body = request()
        header = token("start", body)
        verify_token(header, SECRET, "start", attempt_key(body))
        for operation, key in (("cancel", attempt_key(body)), ("start", ("job-2", 1, 1, 1)), ("start", ("job-1", 2, 1, 1)), ("start", ("job-1", 1, 2, 1))):
            with self.assertRaises(Rejected):
                verify_token(header, SECRET, operation, key)
        with self.assertRaises(Rejected):
            verify_token(header, SECRET, "start", attempt_key(body), time.time() + 1000)

    def test_capabilities_reject_noncanonical_signature_aliases(self):
        body = request()
        header = token("start", body)
        encoded, signature = header[7:].split(".")
        alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
        for padding in (1, 2, 3):
            alias = signature[:-1] + alphabet[alphabet.index(signature[-1]) | padding]
            self.assertNotEqual(alias, signature)
            self.assertEqual(base64.urlsafe_b64decode(alias + "="), base64.urlsafe_b64decode(signature + "="))
            with self.assertRaises(Rejected):
                verify_token("Bearer " + encoded + "." + alias, SECRET, "start", attempt_key(body))

    def test_closed_inputs_and_caps(self):
        validate_start(request())
        for mutate in (lambda b: b.update(command="shell"), lambda b: b["limits"].update(maxItems=6),
                       lambda b: b["limits"].update(fileBytes=True), lambda b: b["request"].update(cookies="secret"),
                       lambda b: b["request"].update(sourceComposition="unverified"),
                       lambda b: b["request"].update(url="http://127.0.0.1/"),
                       lambda b: b["stagingArtifacts"][0].update(storageKey="final/other-owner")):
            body = request()
            mutate(body)
            with self.assertRaises(Rejected):
                validate_start(body)

    def test_cobalt_inspection_and_selection_use_closed_media_options(self):
        body = request()
        body["request"] = {"engine": "cobalt", "platformId": "youtube", "sourceId": "abcdefghijk",
                           "url": "https://www.youtube.com/watch?v=abcdefghijk", "quality": "720",
                           "sourceComposition": "single-video", "inspect": True}
        artifacts = body["stagingArtifacts"]
        body["stagingArtifacts"] = []
        validate_start(body)
        for ordinal in (1, 2, 3, 4):
            body["startOrdinal"] = ordinal
            validate_start(body)
        for ordinal in (0, 5, True):
            with self.assertRaises(Rejected):
                validate_start({**body, "startOrdinal": ordinal})
        body["startOrdinal"] = 3
        fmt = {"id": "136+140", "container": "mp4", "width": 1280, "height": 720,
               "fps": 30, "bytes": None, "estimatedBytes": True, "hasAudio": True,
               "requiresMerge": True, "videoCodec": "avc1"}
        body["request"].update(selectedFormat=fmt["id"], expectedFormat=fmt)
        body["stagingArtifacts"] = artifacts
        validate_start(body)
        for extra in ({"cookies": "secret"}, {"platformId": "unknown"}, {"sourceComposition": "unverified"},
                      {"selectedFormat": "bestvideo/best"}, {"inspect": "true"}):
            invalid = copy.deepcopy(body)
            invalid["request"].update(extra)
            with self.assertRaises(Rejected):
                validate_start(invalid)

    def test_cobalt_output_keeps_selected_dimensions_and_container(self):
        with tempfile.TemporaryDirectory() as directory:
            attempt = Attempt(request(), directory)
            path = Path(directory) / "media-1.mp4"
            facts = {"durationSeconds": 10, "hasAudio": True, "width": 1280, "height": 720, "mime": "video/mp4"}
            for expected in ({"width": 640}, {"height": 360}, {"container": "webm"}):
                attempt.expected_media[path.name] = expected
                with self.assertRaisesRegex(Rejected, "selected"):
                    verify_expected_media(attempt, path, facts)
            attempt.expected_media[path.name] = {"width": 1280, "height": 720, "container": "mp4"}
            verify_expected_media(attempt, path, facts)

    def test_private_and_mixed_dns_answers_denied_before_socket(self):
        for address in ("127.0.0.1", "169.254.169.254", "::1", "::ffff:127.0.0.1", "10.0.0.3", "224.0.0.1", "fec0::1", "2002:7f00:1::"):
            with patch("security.socket.getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443)),
                                                                       (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))]):
                with self.assertRaises(Rejected):
                    connect_https("https://storage.example/object")

    def test_local_storage_requires_exact_authority_explicit_mode_and_verified_tls(self):
        with patch.dict(os.environ, {"DOWNLOADERS_LOCAL": "true"}), patch("security.socket.getaddrinfo") as dns:
            connection, target = connect_https("https://download-storage.local/__download-storage/staging/job?capability=issued")
            self.assertIs(type(connection), http.client.HTTPSConnection)
            self.assertEqual(connection.host, "download-storage.local")
            self.assertEqual(connection._context.verify_mode, ssl.CERT_REQUIRED)
            self.assertTrue(connection._context.check_hostname)
            self.assertEqual(target, "/__download-storage/staging/job?capability=issued")
            dns.assert_not_called()
        private = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))]
        for mode, url in (("", "https://download-storage.local/object"),
                          ("1", "https://download-storage.local/object"),
                          ("true", "https://download-storage.local:443/object"),
                          ("true", "https://sub.download-storage.local/object"),
                          ("true", "https://storage.example/object")):
            with self.subTest(mode=mode, url=url), patch.dict(os.environ, {"DOWNLOADERS_LOCAL": mode}), patch("security.socket.getaddrinfo", return_value=private):
                with self.assertRaises(Rejected):
                    connect_https(url)

    def test_local_readiness_requires_real_intercepted_https_health(self):
        from unittest.mock import MagicMock
        connection = MagicMock()
        response = connection.getresponse.return_value
        response.status = 200
        response.read.return_value = b'{"storage":"canopy-local-r2","protocolVersion":1}'
        with patch("server.connect_https", return_value=(connection, "/__download-storage/health")) as connect:
            self.assertTrue(verify_local_interception())
            connect.assert_called_once_with("https://download-storage.local/__download-storage/health")
            connection.request.assert_called_once_with("GET", "/__download-storage/health")
            connection.close.assert_called_once()
            for status, body in ((403, response.read.return_value), (200, b'{}'), (200, b'not json'),
                                 (200, b'{"storage":"canopy-local-r2","protocolVersion":true}')):
                response.status, response.read.return_value = status, body
                self.assertFalse(verify_local_interception())
        with patch("server.connect_https", side_effect=ssl.SSLCertVerificationError("untrusted")):
            self.assertFalse(verify_local_interception())

    def test_missing_invalid_or_uninstallable_interception_ca_never_enables_trust(self):
        from unittest.mock import MagicMock
        certificate = MagicMock()
        certificate.is_file.return_value = True
        certificate.stat.return_value.st_size = 1024
        certificate.read_bytes.return_value = b"-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----\n"
        for failure in ("missing", "oversized", "invalid", "install"):
            with self.subTest(failure=failure), patch.dict(os.environ, {}, clear=True), patch("server.Path", return_value=certificate), patch("server.ssl.create_default_context") as context:
                certificate.is_file.return_value = failure != "missing"
                certificate.stat.return_value.st_size = 65537 if failure == "oversized" else 1024
                certificate.read_bytes.side_effect = [b"-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----\n", b"system-roots"]
                if failure == "invalid":
                    context.side_effect = ssl.SSLError("Invalid certificate")
                certificate.open.side_effect = PermissionError() if failure == "install" else None
                self.assertFalse(configure_trust_store())
                self.assertNotIn("SSL_CERT_FILE", os.environ)

    def test_runtime_ca_extends_shared_bundle_once_without_rehashing_all_roots(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            certificate, bundle = root / "runtime.crt", root / "system.crt"
            pem = b"-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----\n"
            certificate.write_bytes(pem)
            bundle.write_bytes(b"existing-system-roots\n")
            paths = {"/etc/cloudflare/certs/cloudflare-containers-ca.crt": certificate,
                     "/etc/ssl/certs/ca-certificates.crt": bundle}
            with patch.dict(os.environ, {}, clear=True), patch("server.Path", side_effect=lambda path: paths[path]), patch("server.ssl.create_default_context"):
                self.assertTrue(configure_trust_store())
                self.assertTrue(configure_trust_store())
                self.assertEqual(bundle.read_bytes(), b"existing-system-roots\n\n" + pem)
                for name in ("SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS", "REQUESTS_CA_BUNDLE"):
                    self.assertEqual(os.environ[name], str(bundle))

    def test_execution_requires_trust_and_local_mode_requires_interception(self):
        cases = (("", True, False, True),
                 ("", False, False, False),
                 ("true", True, True, True),
                 ("true", False, True, False),
                 ("true", True, False, False))
        for local, trust, intercepted, enabled in cases:
            with self.subTest(local=local, trust=trust, intercepted=intercepted), patch.dict(os.environ, {
                "DOWNLOADERS_LOCAL": local,
            }, clear=True), patch("server.sys.platform", "linux"), patch("server.os.geteuid", return_value=0), patch("server.configure_trust_store", return_value=trust), patch("server.verify_local_interception", return_value=intercepted) as probe:
                self.assertEqual(execution_enabled(), enabled)
                self.assertEqual(probe.call_count, int(local == "true" and trust))

    def test_execution_requires_linux_and_root_in_every_mode(self):
        for local in ("", "true"):
            for platform, uid in (("darwin", 0), ("linux", 10001)):
                with self.subTest(local=local, platform=platform, uid=uid), patch.dict(os.environ, {"DOWNLOADERS_LOCAL": local}, clear=True), patch("server.sys.platform", platform), patch("server.os.geteuid", return_value=uid), patch("server.configure_trust_store") as trust:
                    self.assertFalse(execution_enabled())
                    trust.assert_not_called()

    def test_no_parent_secrets_in_engine_environment(self):
        with patch.dict(os.environ, {"DOWNLOADERS_CONTROL_SECRET": "hidden", "AWS_SECRET_ACCESS_KEY": "hidden", "HTTPS_PROXY": "hidden", "NODE_OPTIONS": "--require unsafe", "DOWNLOADERS_LOCAL": "true"}):
            env = child_environment(Path("/tmp/fixture"))
        self.assertNotIn("hidden", env.values())
        self.assertNotIn("NODE_OPTIONS", env)
        self.assertNotIn("DOWNLOADERS_LOCAL", env)

    def test_descriptors_never_enable_generic_injection_or_unapproved_delegation(self):
        for keys in (["Generic"], ["Youtube;touch"], ["Youtube", "Youtube"], [], ["A", "B", "C", "D"]):
            body = request()
            body["request"]["extractorKeys"] = keys
            with self.assertRaises(Rejected):
                validate_start(body)
        require_approved_extractor("Youtube", {"Youtube"})
        for key in ("Generic", "YoutubeTab", "AnotherPlatform"):
            with self.assertRaises(RuntimeError):
                require_approved_extractor(key, {"Youtube"})
class LifecycleTests(unittest.TestCase):
    def test_only_classified_technical_failures_allow_retry_after_cleanup(self):
        cases = (
            ("Unable to extract shared data", "extraction_failed", True),
            ("HTTP Error 503: Service Unavailable", "upstream_failure", True),
            ("Video unavailable", "source_unavailable", False),
            ("certificate verify failed", "tls_failed", False),
            ("Requested format is not available", "format_unavailable", False),
            ("unclassified exception", "engine_failed", False),
        )
        for message, code, retryable in cases:
            with self.subTest(code=code), tempfile.TemporaryDirectory() as directory, patch("sys.stdout", new_callable=io.StringIO) as output:
                def adapter(attempt):
                    def fail(*args):
                        (attempt.directory / "engine-error.json").write_text(json.dumps({"code": classify_failure(message + " https://secret.example/?token=private")}))
                        raise Rejected("engine_failed", "The source could not be processed.")
                    attempt.command = fail
                    return run_ytdlp(attempt)
                supervisor = Supervisor(adapter, enabled=True, root=directory)
                body = request()
                supervisor.start(body)
                attempt = supervisor.get(attempt_key(body))
                self.assertTrue(attempt.done.wait(2))
                result = attempt.snapshot()
                self.assertEqual(result["state"], "failed")
                self.assertTrue(result["stopped"])
                self.assertEqual(result["error"]["code"], code)
                self.assertEqual(result["error"]["retryable"], retryable)
                self.assertEqual(result["artifacts"], [])
                self.assertIsNone(result["evidence"])
                self.assertFalse(attempt.directory.exists())
                self.assertNotIn("secret.example", json.dumps(result) + output.getvalue())
                self.assertNotIn("token=private", json.dumps(result) + output.getvalue())

    def test_technical_failure_cannot_retry_without_confirmed_cleanup(self):
        for cleanup in ("process", "files"):
            with self.subTest(cleanup=cleanup), tempfile.TemporaryDirectory() as directory:
                def adapter(attempt):
                    raise Rejected("upstream_failure", "The source is temporarily unavailable.")
                supervisor = Supervisor(adapter, enabled=True, root=directory)
                body = request()
                cleanup_patch = (patch.object(Attempt, "stop", return_value=False) if cleanup == "process"
                                 else patch("executor.shutil.rmtree", side_effect=OSError("cleanup failed")))
                with cleanup_patch:
                    supervisor.start(body)
                    attempt = supervisor.get(attempt_key(body))
                    self.assertTrue(attempt.done.wait(2))
                result = attempt.snapshot()
                self.assertFalse(result["stopped"])
                self.assertEqual(result["error"], {"code": "cleanup_unconfirmed", "message": "The execution slot requires recycling.", "retryable": False})
                self.assertTrue(supervisor.quarantined)

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temporary.cleanup()

    def test_disabled_by_default(self):
        with self.assertRaisesRegex(Rejected, "containment"):
            Supervisor(lambda attempt: None).start(request())

    def test_warm_slot_prunes_old_receipts_without_a_lifetime_job_cap(self):
        def adapter(attempt):
            raise Rejected("fixture_complete", "Fixture completed.")
        supervisor = Supervisor(adapter, enabled=True, root=self.temporary.name)
        first = None
        for generation in range(1, 258):
            body = request()
            body["slotGeneration"] = generation
            body["jobId"] = "job-" + str(generation)
            first = first or body
            supervisor.start(body)
            self.assertTrue(supervisor.get(attempt_key(body)).done.wait(2))
            self.assertLessEqual(len(supervisor.attempts), 2)
        with self.assertRaisesRegex(Rejected, "fresh execution slot"):
            supervisor.start(first)
        body["jobId"] = "another-job-same-generation"
        with self.assertRaisesRegex(Rejected, "fresh slot generation"):
            supervisor.start(body)

    def test_idempotency_concurrent_slot_and_cancel_without_false_stop_claim(self):
        began = threading.Event()
        calls = []
        def adapter(attempt):
            calls.append(1)
            process = attempt.spawn([sys.executable, "-c", "import time; time.sleep(60)"])
            began.set()
            attempt.wait(process)
        supervisor = Supervisor(adapter, enabled=True, root=self.temporary.name)
        body = request()
        supervisor.start(body)
        self.assertTrue(began.wait(2))
        supervisor.start(body)
        self.assertEqual(len(calls), 1)
        conflicting = copy.deepcopy(body)
        conflicting["request"]["quality"] = "1080"
        with self.assertRaisesRegex(Rejected, "different request"):
            supervisor.start(conflicting)
        other = request()
        other["jobId"] = "job-2"
        with self.assertRaisesRegex(Rejected, "unavailable"):
            supervisor.start(other)
        supervisor.cancel(attempt_key(body))
        attempt = supervisor.get(attempt_key(body))
        self.assertTrue(attempt.done.wait(5))
        self.assertEqual(attempt.snapshot()["state"], "cancelled")
        # macOS can deny a group probe after leader exit. This must quarantine,
        # never leave the worker thread wedged or claim unobserved cleanup.
        self.assertEqual(supervisor.quarantined, not attempt.snapshot()["stopped"])
        self.assertTrue(all(process.poll() is not None for process in attempt.processes))
        self.assertEqual(attempt.snapshot()["artifacts"], [])
        self.assertFalse(attempt.directory.exists())

    def test_timeout_and_disk_limit(self):
        for mode in ("time", "disk"):
            def adapter(attempt):
                if mode == "disk":
                    (attempt.directory / "oversize").write_bytes(b"x" * 100)
                    attempt.checkpoint()
                else:
                    attempt.wait(attempt.spawn([sys.executable, "-c", "import time; time.sleep(60)"]))
            body = request()
            body["limits"]["workMs"] = 100
            body["limits"]["scratchBytes"] = 10 if mode == "disk" else 100000
            supervisor = Supervisor(adapter, enabled=True, root=self.temporary.name)
            supervisor.start(body)
            attempt = supervisor.get(attempt_key(body))
            self.assertTrue(attempt.done.wait(5))
            self.assertEqual(attempt.state, "failed")
            self.assertTrue(attempt.stopped)
            self.assertEqual(attempt.error["code"], "resource_limit" if mode == "disk" else "deadline_exceeded")

    def test_process_group_descendant_and_noncooperative_leader_stop(self):
        began = threading.Event()
        def adapter(attempt):
            child = "import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(60)"
            # Parent cooperates by reaping its child, while the child requires
            # the supervisor's group SIGKILL escalation.
            script = "import subprocess,sys,signal,time; p=subprocess.Popen([sys.executable,'-c',sys.argv[1]]); signal.signal(signal.SIGTERM,lambda *a: None); p.wait()"
            process = attempt.spawn([sys.executable, "-c", script, child])
            began.set()
            attempt.wait(process)
        supervisor = Supervisor(adapter, enabled=True, root=self.temporary.name)
        body = request()
        supervisor.start(body)
        self.assertTrue(began.wait(2))
        time.sleep(0.1)
        supervisor.cancel(attempt_key(body))
        attempt = supervisor.get(attempt_key(body))
        self.assertTrue(attempt.done.wait(5))
        # A platform that leaves unreaped descendants must quarantine rather
        # than claim that a leader exit proves an empty group.
        self.assertEqual(attempt.state, "cancelled")
        self.assertEqual(supervisor.quarantined, not attempt.stopped)
        self.assertEqual(attempt.snapshot()["artifacts"], [])

    def test_http_auth_scope_and_safe_error_payload(self):
        supervisor = Supervisor(lambda attempt: None)
        try:
            server = Server(("127.0.0.1", 0), supervisor, SECRET)
        except PermissionError as error:
            self.skipTest("Local socket binding blocked: " + str(error))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        body = request()
        try:
            def call(header):
                connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=2)
                connection.request("POST", "/start", json.dumps(body), {"Content-Type": "application/json", "Authorization": header})
                response = connection.getresponse()
                result = response.status, response.read().decode()
                connection.close()
                return result
            self.assertEqual(call(token("cancel", body))[0], 401)
            status, result = call(token("start", body))
            self.assertEqual(status, 503)
            self.assertNotIn("sensitive", result)
            self.assertNotIn("youtube", result)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(2)

    def test_http_start_ack_does_not_wait_for_blocked_outbound_work(self):
        allow_outbound = threading.Event()
        entered = threading.Event()
        def adapter(attempt):
            entered.set()
            while not allow_outbound.wait(0.01):
                attempt.checkpoint()
            raise Rejected("fixture_complete", "Fixture completed.")
        supervisor = Supervisor(adapter, enabled=True, root=self.temporary.name)
        try:
            server = Server(("127.0.0.1", 0), supervisor, SECRET)
        except PermissionError as error:
            self.skipTest("Local socket binding blocked: " + str(error))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        body = request()
        connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=2)
        try:
            connection.request("POST", "/start", json.dumps(body), {"Content-Type": "application/json", "Authorization": token("start", body)})
            response = connection.getresponse()
            self.assertEqual(response.status, 202)
            self.assertEqual(json.loads(response.read())["state"], "running")
            self.assertTrue(entered.wait(1))
            self.assertFalse(allow_outbound.is_set())
            self.assertFalse(supervisor.get(attempt_key(body)).done.is_set())
        finally:
            allow_outbound.set()
            connection.close()
            if supervisor.active:
                supervisor.active.done.wait(3)
            server.shutdown()
            server.server_close()
            thread.join(2)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "Native FFmpeg and ffprobe are required")
class MediaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = tempfile.TemporaryDirectory()
        cls.media = Path(cls.fixture.name) / "fixture.mp4"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=size=96x160:rate=8:color=blue", "-t", "0.5", "-c:v", "mpeg4", str(cls.media)], check=True)
        cls.data = cls.media.read_bytes()

    @classmethod
    def tearDownClass(cls):
        cls.fixture.cleanup()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.attempt = Attempt(request(), self.temporary.name)
        if os.geteuid() == 0:
            # Match Supervisor.start: native children run under the engine UID.
            os.chown(self.temporary.name, CHILD_UID, CHILD_GID)
        self.path = Path(self.temporary.name) / "media-1.mp4"
        self.path.write_bytes(self.data)

    def tearDown(self):
        self.attempt.stop()
        self.temporary.cleanup()

    def test_actual_media_and_truncation(self):
        facts = probe(self.attempt, self.path, "720")
        self.assertEqual((facts["width"], facts["height"]), (96, 160))
        self.assertFalse(facts["hasAudio"])
        self.path.write_bytes(self.data[:len(self.data)//2])
        with self.assertRaises(Rejected):
            probe(self.attempt, self.path, "720")

    def test_real_h264_profile_and_fps_validate_local_and_stored_media_without_public_leakage(self):
        h264 = self.attempt.directory / "h264.mp4"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=size=96x160:rate=30000/1001:color=blue",
                        "-t", "0.5", "-c:v", "libx264", "-profile:v", "baseline", "-level:v", "3.0", str(h264)], check=True)
        self.path.write_bytes(h264.read_bytes())
        facts = probe(self.attempt, self.path, "720", decode=False)
        self.assertRegex(facts["_video"]["videoCodec"], r"^avc1\.42[0-9a-f]{2}1e$")
        self.assertEqual(facts["_video"]["fps"], 30000 / 1001)
        expected = {"videoCodec": facts["_video"]["videoCodec"].upper(), "fps": 30000 / 1001}
        self.attempt.expected_media[self.path.name] = expected
        verify_expected_media(self.attempt, self.path, facts)
        for override in ({"videoCodec": "avc1.640028"}, {"fps": 25}):
            self.attempt.expected_media[self.path.name] = {**expected, **override}
            with self.assertRaisesRegex(Rejected, "selected"):
                verify_expected_media(self.attempt, self.path, facts)
        self.attempt.expected_media[self.path.name] = expected
        data = self.path.read_bytes()
        class Response(io.BytesIO):
            status = 200
            def getheader(self, name): return '"uploaded-etag"'
        class Connection:
            def putrequest(self, *args): pass
            def putheader(self, *args): pass
            def endheaders(self): pass
            def send(self, *args): pass
            def request(self, *args, **kwargs): pass
            def getresponse(self): return Response(data)
            def close(self): pass
        receipt = upload_and_validate(self.attempt, self.path, request()["stagingArtifacts"][0], "720", lambda url: (Connection(), "/fixed"))
        self.assertNotIn("_video", receipt)
        self.assertNotIn("videoCodec", receipt)
        self.assertNotIn("fps", receipt)
        for index, override in enumerate(({"videoCodec": "avc1.640028"}, {"fps": 25})):
            self.attempt.expected_media[self.path.name] = {**expected, **override}
            authority = {**request()["stagingArtifacts"][0], "artifactId": f"mismatch-{index}"}
            with self.assertRaisesRegex(Rejected, "selected"):
                upload_and_validate(self.attempt, self.path, authority, "720", lambda url: (Connection(), "/fixed"))

    def test_supervisor_decodes_only_stored_bytes_and_never_publishes_a_failed_decode(self):
        for decode_fails in (False, True):
            with self.subTest(decode_fails=decode_fails):
                commands = []
                def adapter(attempt):
                    path = attempt.directory / "media-1.mp4"
                    path.write_bytes(self.data)
                    attempt.expected_media[path.name] = {"durationSeconds": 0.5, "hasAudio": False}
                    original = attempt.command
                    def command(args, output_name=None):
                        commands.append((args, attempt.phase))
                        if args[0] == "ffmpeg" and decode_fails:
                            raise Rejected("engine_failed", "The stored media could not be decoded.")
                        return original(args, output_name)
                    attempt.command = command
                    return [path], {"originalComposition": "complete"}
                class Response(io.BytesIO):
                    status = 200
                    def getheader(self, name): return '"uploaded-etag"'
                class Connection:
                    def putrequest(self, *args): pass
                    def putheader(self, *args): pass
                    def endheaders(self): pass
                    def send(self, *args): pass
                    def request(self, *args, **kwargs): pass
                    def getresponse(connection): return Response(self.data)
                    def close(self): pass
                def upload(attempt, path, authority, quality):
                    return upload_and_validate(attempt, path, authority, quality, lambda url: (Connection(), "/fixed"))
                supervisor = Supervisor(adapter, enabled=True, root=self.temporary.name, uploader=upload)
                body = request()
                supervisor.start(body)
                attempt = supervisor.get(attempt_key(body))
                self.assertTrue(attempt.done.wait(8))
                result = attempt.snapshot()
                self.assertTrue(result["stopped"])
                self.assertEqual(result["state"], "failed" if decode_fails else "succeeded")
                self.assertEqual(len(result["artifacts"]), 0 if decode_fails else 1)
                decodes = [(args, phase) for args, phase in commands if args[0] == "ffmpeg"]
                self.assertEqual(len(decodes), 1)
                args, phase = decodes[0]
                self.assertTrue(Path(args[args.index("-i") + 1]).name.startswith("stored-"))
                self.assertEqual(phase, "validating")
                self.assertEqual(commands[0][1], "validating")

    def test_playable_but_short_output_and_missing_audio_are_not_complete(self):
        facts = probe(self.attempt, self.path, "720")
        self.attempt.expected_media[self.path.name] = {"durationSeconds": 12, "hasAudio": False}
        with self.assertRaisesRegex(Rejected, "complete source"):
            verify_expected_media(self.attempt, self.path, facts)
        self.attempt.expected_media[self.path.name] = {"durationSeconds": None, "hasAudio": True}
        with self.assertRaisesRegex(Rejected, "source audio"):
            verify_expected_media(self.attempt, self.path, facts)

    def test_readback_conditional_etag_and_actual_stored_bytes(self):
        for mode in ("valid", "changed", "truncated", "invalid"):
            authority = copy.deepcopy(request()["stagingArtifacts"][0])
            authority["artifactId"] = mode
            seen = []
            data = self.data if mode in ("valid", "changed") else (self.data[:10] if mode == "truncated" else b"x" * len(self.data))
            class Response(io.BytesIO):
                status = 200
                def getheader(self, name):
                    return '"changed"' if mode == "changed" else '"uploaded-etag"'
            class Connection:
                def putrequest(self, *args): pass
                def putheader(self, *args): pass
                def endheaders(self): pass
                def send(self, *args): pass
                def request(self, method, path, headers): seen.append(headers)
                def getresponse(self): return Response(data)
                def close(self): pass
            # PUT always reports original ETag; only GET may race/change.
            class Put(Connection):
                def getresponse(self):
                    response = Response(b"")
                    response.getheader = lambda name: '"uploaded-etag"'
                    return response
            connections = iter((Put(), Connection()))
            connector = lambda url: (next(connections), "/fixed")
            if mode == "valid":
                receipt = upload_and_validate(self.attempt, self.path, authority, "720", connector)
                self.assertEqual(receipt["etag"], '"uploaded-etag"')
                self.assertEqual(receipt["bytes"], len(self.data))
            else:
                with self.assertRaises(Rejected):
                    upload_and_validate(self.attempt, self.path, authority, "720", connector)
            self.assertEqual(seen, [{"If-Match": '"uploaded-etag"'}])


if __name__ == "__main__":
    unittest.main()
