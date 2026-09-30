"""Closed control protocol and bounded, DNS-pinned supervisor HTTPS transfers.

This protects supervisor transfers only. Native engine traffic is controlled by
the Container outbound handler; URL validation is not an engine sandbox.
"""
import base64
import hashlib
import hmac
import http.client
import ipaddress
import json
import math
import os
import re
import socket
import ssl
import time
from datetime import datetime
from urllib.parse import urlsplit

MAX_BODY = 32 * 1024
ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
MAX_LIMITS = {"workMs": 600_000, "sourceBytes": 1024**3,
              "outputBytes": 500 * 1024**2, "fileBytes": 250 * 1024**2,
              "scratchBytes": 2 * 1024**3, "durationSeconds": 1800, "maxItems": 5}


class Rejected(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def reject(code="invalid_request", message="The execution request is invalid.", status=400):
    raise Rejected(code, message, status)


def closed(value, required):
    if not isinstance(value, dict) or set(value) != set(required):
        reject()


def integer(value, maximum):
    return type(value) is int and 0 < value <= maximum


def attempt_key(value):
    if not isinstance(value, dict) or not isinstance(value.get("jobId"), str) or not ID.fullmatch(value["jobId"]):
        reject()
    if not all(integer(value.get(k), 2**53 - 1) for k in ("attemptGeneration", "slotGeneration")):
        reject()
    if type(value.get("startOrdinal")) is not int or value["startOrdinal"] not in (1, 2, 3, 4):
        reject()
    return value["jobId"], value["attemptGeneration"], value["slotGeneration"], value["startOrdinal"]


def https_url(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 8192 or any(ord(c) < 33 or ord(c) == 127 for c in value):
        reject()
    try:
        p = urlsplit(value)
        if p.scheme != "https" or not p.hostname or p.username or p.password or p.port not in (None, 443) or p.fragment:
            reject()
        host = p.hostname.encode("idna").decode("ascii")
        if host != p.hostname or not re.fullmatch(r"[a-z0-9.-]+", host) or host.endswith("."):
            reject()
        try:
            ipaddress.ip_address(host)
        except ValueError:
            return p
    except (ValueError, UnicodeError):
        pass
    reject()


def validate_start(value):
    closed(value, ("protocolVersion", "jobId", "attemptGeneration", "slotGeneration", "startOrdinal", "deadline", "limits", "request", "stagingArtifacts"))
    attempt_key(value)
    if type(value["protocolVersion"]) is not int or value["protocolVersion"] != 1:
        reject()
    try:
        deadline = datetime.fromisoformat(value["deadline"].replace("Z", "+00:00"))
        if deadline.tzinfo is None or not time.time() < deadline.timestamp() <= time.time() + MAX_LIMITS["workMs"] / 1000 + 5:
            reject("deadline_exceeded", "The execution deadline has expired.")
    except (ValueError, TypeError, AttributeError):
        reject()
    closed(value["limits"], MAX_LIMITS)
    if not all(integer(value["limits"][k], cap) for k, cap in MAX_LIMITS.items()):
        reject()
    request = value["request"]
    if not isinstance(request, dict):
        reject()
    if request.get("engine") == "yt-dlp":
        required = {"engine", "url", "quality", "noPlaylist", "sourceId", "extractorKeys", "sourceComposition"}
        if request.get("noPlaylist") is not True:
            reject()
        keys = request.get("extractorKeys")
        if not isinstance(keys, list) or not 1 <= len(keys) <= 3 or any(not isinstance(key, str) or not re.fullmatch(r"[A-Z][A-Za-z0-9]{0,63}", key) or key == "Generic" for key in keys) or len(set(keys)) != len(keys):
            reject()
        if request.get("sourceComposition") not in ("single-video", "verified-post"):
            reject()
        if request["sourceComposition"] == "verified-post" and (len(keys) != 1 or keys[0] not in ("Twitter", "Pinterest", "Reddit", "LinkedIn")):
            reject()
    elif request.get("engine") == "cobalt":
        required = {"engine", "platformId", "url", "quality", "sourceId", "sourceComposition"}
        if request.get("platformId") not in ("youtube", "instagram", "tiktok", "dailymotion", "vimeo", "twitch") or request.get("sourceComposition") != "single-video":
            reject()
    else:
        reject()
    if not required <= set(request) or set(request) - required - {"inspect", "selectedFormat", "expectedFormat"}:
        reject()
    if request["quality"] not in ("720", "1080") or ("inspect" in request and type(request["inspect"]) is not bool):
        reject()
    if ("selectedFormat" in request) != ("expectedFormat" in request):
        reject()
    if "expectedFormat" in request:
        validate_format(request["expectedFormat"], request["quality"], value["limits"])
        if request["expectedFormat"]["id"] != request["selectedFormat"]:
            reject()
    if not isinstance(request["sourceId"], str) or not 1 <= len(request["sourceId"]) <= 256 or any(ord(c) < 33 or ord(c) == 127 for c in request["sourceId"]):
        reject()
    https_url(request["url"])
    artifacts = value["stagingArtifacts"]
    inspecting = request.get("inspect") is True and not request.get("selectedFormat")
    if not isinstance(artifacts, list) or (len(artifacts) != 0 if inspecting else not 1 <= len(artifacts) <= value["limits"]["maxItems"]):
        reject()
    ids, keys = set(), set()
    for item in artifacts:
        closed(item, ("artifactId", "storageKey", "putUrl", "getUrl"))
        if not isinstance(item["artifactId"], str) or not ID.fullmatch(item["artifactId"]) or item["artifactId"] in ids:
            reject()
        key = item["storageKey"]
        if not isinstance(key, str) or not key.startswith("staging/") or len(key) > 256 or ".." in key or key in keys or not re.fullmatch(r"[A-Za-z0-9_./-]+", key):
            reject()
        put, get = https_url(item["putUrl"]), https_url(item["getUrl"])
        if (put.hostname, put.path) != (get.hostname, get.path):
            reject()
        ids.add(item["artifactId"])
        keys.add(key)
    return value


def validate_format(fmt, quality, limits):
    closed(fmt, ("id", "container", "width", "height", "fps", "bytes", "estimatedBytes", "hasAudio", "requiresMerge", "videoCodec"))
    identity = fmt["id"]
    if not isinstance(identity, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,80}(?:\+[A-Za-z0-9._-]{1,80})?", identity):
        reject()
    if fmt["container"] not in ("mp4", "webm") or not all(integer(fmt[size], 16384) for size in ("width", "height")) or min(fmt["width"], fmt["height"]) > int(quality):
        reject()
    if fmt["fps"] is not None and (type(fmt["fps"]) not in (int, float) or not math.isfinite(fmt["fps"]) or not 0 < fmt["fps"] <= 240):
        reject()
    if fmt["bytes"] is not None and not integer(fmt["bytes"], min(limits["fileBytes"], limits["outputBytes"])):
        reject()
    if any(type(fmt[key]) is not bool for key in ("estimatedBytes", "hasAudio", "requiresMerge")) or fmt["requiresMerge"] != ("+" in identity) or (fmt["requiresMerge"] and not fmt["hasAudio"]):
        reject()
    if not isinstance(fmt["videoCodec"], str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", fmt["videoCodec"]):
        reject()
    return fmt


def validate_inspection(value, request, limits):
    """Treat the unprivileged child's metadata receipt as untrusted input."""
    closed(value, ("title", "durationSeconds", "formats"))
    if not isinstance(value["title"], str) or not 1 <= len(value["title"]) <= 300 or any(ord(c) < 32 or ord(c) == 127 for c in value["title"]):
        reject()
    duration = value["durationSeconds"]
    if duration is not None and (type(duration) not in (int, float) or not math.isfinite(duration) or not 0 < duration <= limits["durationSeconds"]):
        reject()
    formats = value["formats"]
    if not isinstance(formats, list) or not 1 <= len(formats) <= 80:
        reject()
    identities = set()
    for fmt in formats:
        validate_format(fmt, request["quality"], limits)
        identity = fmt["id"]
        if identity in identities:
            reject()
        identities.add(identity)
    return value


def verify_token(header, secret, operation, key, now=None):
    """Signature binds the operation and all three fences; no caller-selected algorithms."""
    now = time.time() if now is None else now
    try:
        if not isinstance(header, str) or len(header) > 2048 or not header.startswith("Bearer "):
            raise ValueError()
        encoded, signature = header[7:].split(".")
        if not re.fullmatch(r"[A-Za-z0-9_-]+", encoded) or not re.fullmatch(r"[A-Za-z0-9_-]+", signature):
            raise ValueError()
        supplied = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        decoded = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        if base64.urlsafe_b64encode(supplied).rstrip(b"=").decode() != signature or base64.urlsafe_b64encode(decoded).rstrip(b"=").decode() != encoded:
            raise ValueError()
        expected = hmac.digest(secret, encoded.encode("ascii"), "sha256")
        if not hmac.compare_digest(expected, supplied):
            raise ValueError()
        payload = json.loads(decoded)
        closed(payload, ("jobId", "attemptGeneration", "slotGeneration", "startOrdinal", "operation", "expiresAt"))
        if attempt_key(payload) != key or payload["operation"] != operation or type(payload["expiresAt"]) is not int or not now < payload["expiresAt"] <= now + 300:
            raise ValueError()
    except (ValueError, TypeError, KeyError, Rejected):
        reject("unauthorized", "Invalid execution capability.", 401)


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, address, timeout=5):
        super().__init__(host, timeout=timeout, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        raw = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except BaseException:
            raw.close()
            raise


def connect_https(url):
    parsed = https_url(url)
    target = parsed.path or "/"
    if parsed.query:
        target += "?" + parsed.query
    if os.environ.get("DOWNLOADERS_LOCAL") == "true" and parsed.netloc == "download-storage.local":
        # Wrangler resolves this one synthetic authority through ContainerProxy.
        # TLS still verifies the hostname against the mounted interception CA;
        # the Worker separately checks the exact issued storage capability.
        return http.client.HTTPSConnection(parsed.hostname, timeout=5, context=ssl.create_default_context()), target
    addresses = {result[4][0] for result in socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)}
    # Reject the entire answer if any address is private, including IPv4-mapped IPv6.
    def public_address(value):
        address = ipaddress.ip_address(value)
        return address.is_global and not (address.is_multicast or address.is_reserved or address.is_loopback or address.is_link_local or address.is_unspecified or getattr(address, "is_site_local", False) or getattr(address, "sixtofour", None) or getattr(address, "teredo", None))
    if not addresses or not all(public_address(ip) for ip in addresses):
        reject("network_denied", "A transfer destination is not permitted.")
    connection = PinnedHTTPS(parsed.hostname, sorted(addresses)[0])
    return connection, target


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
