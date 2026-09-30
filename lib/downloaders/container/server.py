"""Small internal execution protocol. The Worker is the public API and owner authority."""
import json
import os
import signal
import ssl
import sys
import threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from adapters import execute
from executor import Supervisor
from security import MAX_BODY, Rejected, attempt_key, closed, connect_https, reject, verify_token


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            reject()
        result[key] = value
    return result


def configure_trust_store():
    """Cloudflare mounts its interception CA at runtime, after image build."""
    cloudflare_ca = Path("/etc/cloudflare/certs/cloudflare-containers-ca.crt")
    system_ca = Path("/etc/ssl/certs/ca-certificates.crt")
    try:
        if not cloudflare_ca.is_file() or not system_ca.is_file() or cloudflare_ca.stat().st_size > 64 * 1024:
            return False
        certificate = cloudflare_ca.read_bytes().strip() + b"\n"
        if not certificate.startswith(b"-----BEGIN CERTIFICATE-----"):
            return False
        ssl.create_default_context(cafile=str(cloudflare_ca))
        # FFmpeg and other native clients use the distro store, not the Python
        # and Node environment variables. Debian's OpenSSL/GnuTLS clients use
        # this bundle. Append the validated runtime CA before launching children;
        # rehashing every system root can exceed a local cold-start deadline.
        if certificate not in system_ca.read_bytes():
            with system_ca.open("ab") as bundle:
                bundle.write(b"\n" + certificate)
    except OSError as error:
        print("downloader_startup_ca_install_failed:" + type(error).__name__, file=sys.stderr, flush=True)
        return False
    for name in ("SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS", "REQUESTS_CA_BUNDLE"):
        os.environ[name] = str(system_ca)
    return True


def verify_local_interception():
    connection = None
    try:
        connection, target = connect_https("https://download-storage.local/__download-storage/health")
        connection.request("GET", target)
        response = connection.getresponse()
        payload = json.loads(response.read(257))
        valid = response.status == 200 and payload == {"storage": "canopy-local-r2", "protocolVersion": 1} and type(payload["protocolVersion"]) is int
        if not valid:
            print("downloader_startup_local_health_rejected:" + str(response.status), file=sys.stderr, flush=True)
        return valid
    except (OSError, ValueError, Rejected) as error:
        print("downloader_startup_local_health_failed:" + type(error).__name__, file=sys.stderr, flush=True)
        return False
    finally:
        if connection:
            connection.close()


def execution_enabled():
    local = os.environ.get("DOWNLOADERS_LOCAL") == "true"
    if sys.platform != "linux" or os.geteuid() != 0:
        print("downloader_startup_execution_disabled", file=sys.stderr, flush=True)
        return False
    if not configure_trust_store():
        print("downloader_startup_trust_unavailable", file=sys.stderr, flush=True)
        return False
    if local and not verify_local_interception():
        print("downloader_startup_local_interception_unavailable", file=sys.stderr, flush=True)
        return False
    print("downloader_startup_local_ready" if local else "downloader_startup_hosted_ready", file=sys.stderr, flush=True)
    return True


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 16

    def __init__(self, address, supervisor, secret):
        self.supervisor, self.secret = supervisor, secret
        self.slots = threading.BoundedSemaphore(16)
        super().__init__(address, Handler)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()

    def handle_error(self, request, client_address):
        # Standard traceback/request logging can disclose bearer URLs.
        pass


class Handler(BaseHTTPRequestHandler):
    server_version = "CanopyExecutor/1"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def log_message(self, *args):
        pass

    def reply(self, status, body):
        raw = json.dumps(body, separators=(",", ":"), allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(raw)
        self.close_connection = True

    def do_GET(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def dispatch(self):
        try:
            parsed = urlsplit(self.path)
            if self.command == "GET" and parsed.path == "/health" and not parsed.query:
                return self.reply(200, {"protocolVersion": 1, "ready": self.server.supervisor.enabled and not self.server.supervisor.quarantined})
            operation = parsed.path.removeprefix("/")
            if operation not in ("start", "status", "cancel") or (self.command != "POST" and operation != "status"):
                reject("not_found", "Unknown execution operation.", 404)
            if self.command == "GET":
                query = parse_qs(parsed.query, strict_parsing=True)
                closed(query, ("jobId", "attemptGeneration", "slotGeneration", "startOrdinal"))
                if any(len(values) != 1 for values in query.values()):
                    reject()
                body = {key: values[0] for key, values in query.items()}
                body["attemptGeneration"] = int(body["attemptGeneration"])
                body["slotGeneration"] = int(body["slotGeneration"])
                body["startOrdinal"] = int(body["startOrdinal"])
            else:
                if parsed.query or self.headers.get("Transfer-Encoding") or len(self.headers.get_all("Content-Length", [])) != 1 or self.headers.get_content_type() != "application/json":
                    reject()
                length = int(self.headers["Content-Length"])
                if not 0 < length <= MAX_BODY:
                    reject()
                raw = self.rfile.read(length)
                if len(raw) != length:
                    reject()
                body = json.loads(raw, object_pairs_hook=unique_object)
            key = attempt_key(body)
            if len(self.headers.get_all("Authorization", [])) != 1:
                reject("unauthorized", "Invalid execution capability.", 401)
            verify_token(self.headers.get("Authorization"), self.server.secret, operation, key)
            if operation == "start":
                return self.reply(202, self.server.supervisor.start(body))
            closed(body, ("jobId", "attemptGeneration", "slotGeneration", "startOrdinal"))
            result = self.server.supervisor.cancel(key) if operation == "cancel" else self.server.supervisor.get(key).snapshot()
            self.reply(200, result)
        except Rejected as error:
            self.reply(error.status, {"error": {"code": error.code, "message": error.message, "retryable": False}})
        except (ValueError, TypeError, KeyError, OSError):
            self.reply(400, {"error": {"code": "invalid_request", "message": "The execution request is invalid.", "retryable": False}})


def main():
    secret = os.environ.pop("DOWNLOADERS_CONTROL_SECRET", "").encode()
    if len(secret) < 32:
        raise SystemExit("DOWNLOADERS_CONTROL_SECRET must contain at least 32 bytes")
    supervisor = Supervisor(execute, enabled=execution_enabled())
    server = Server(("0.0.0.0", 8080), supervisor, secret)

    def shutdown(*args):
        if supervisor.active:
            supervisor.active.cancelled.set()
            supervisor.active.done.wait(8)
            supervisor.active.stop()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    server.serve_forever(poll_interval=0.2)
    server.server_close()


if __name__ == "__main__":
    main()
