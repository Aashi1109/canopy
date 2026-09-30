"""Unprivileged, bounded Cobalt media transfers; never receives storage authority."""
import http.client
import json
from pathlib import Path
import re
import ssl
import sys
from urllib.parse import urljoin, urlsplit

# -I excludes even the script directory. This image-owned sibling is not
# caller-selected code and contains the shared strict HTTPS URL validation.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from security import Rejected, https_url, reject

MAX_MANIFEST = 1024 * 1024
MAX_SEGMENTS = 2048


def destination_headers(headers, source_url, destination_url):
    if urlsplit(source_url).hostname == urlsplit(destination_url).hostname:
        return headers
    return {key: value for key, value in headers.items() if key.lower() not in ("cookie", "authorization", "origin", "referer")}


def connect_source(url):
    # This child has the same enforced egress proxy as yt-dlp and FFmpeg. The
    # proxy validates destinations and owns DNS resolution; local interception
    # can return synthetic private IPv6 answers. Supervisor storage transfers
    # retain their separate DNS-pinned connector and storage capabilities.
    parsed = https_url(url)
    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    return http.client.HTTPSConnection(parsed.hostname, timeout=5, context=ssl.create_default_context()), path


class Transfer:
    def __init__(self, directory, limits, connector=connect_source):
        self.directory, self.limits, self.connector = Path(directory), limits, connector
        self.source_bytes = 0
        self.scratch_bytes = 0

    def fetch(self, url, name, headers, *, maximum=None, byte_range=None, return_url=False):
        """Require complete HTTP framing, accepting chunked and close-delimited bodies."""
        maximum = min(maximum or self.limits["fileBytes"], self.limits["fileBytes"])
        target = self.directory / name
        if target.parent != self.directory or not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
            reject("unsafe_output", "The engine produced an unsafe file.")
        for redirect in range(4):
            https_url(url)
            connection, path = self.connector(url)
            try:
                sent_headers = {**headers, "Accept-Encoding": "identity"}
                if byte_range:
                    offset, length = byte_range
                    sent_headers["Range"] = f"bytes={offset}-{offset + length - 1}"
                connection.request("GET", path, headers=sent_headers)
                response = connection.getresponse()
                if response.status in (301, 302, 303, 307, 308):
                    location = response.getheader("Location")
                    if not location or redirect == 3:
                        reject("source_denied", "The media transfer could not be resolved.")
                    redirected = urljoin(url, location)
                    https_url(redirected)
                    headers = destination_headers(headers, url, redirected)
                    url = redirected
                    continue
                if response.status != (206 if byte_range else 200):
                    reject("source_denied", "The source denied the media transfer.")
                if response.getheader("Content-Encoding", "identity").lower() != "identity":
                    reject("incomplete_output", "The source returned an unsupported transfer encoding.")
                lengths = response.headers.get_all("Content-Length", [])
                if len(lengths) > 1 or (lengths and not re.fullmatch(r"[0-9]+", lengths[0])):
                    reject("incomplete_output", "The source returned inconsistent transfer lengths.")
                declared = int(lengths[0]) if lengths else None
                transfer_encoding = response.getheader("Transfer-Encoding")
                if transfer_encoding and transfer_encoding.lower() != "chunked":
                    reject("incomplete_output", "The source returned an unsupported transfer encoding.")
                if transfer_encoding and declared is not None:
                    reject("incomplete_output", "The source returned ambiguous transfer framing.")
                if declared is not None and not 0 < declared <= maximum:
                    reject("resource_limit", "The video exceeds the transfer limit.")
                if byte_range:
                    offset, length = byte_range
                    content_range = response.getheader("Content-Range", "")
                    match = re.fullmatch(r"bytes ([0-9]+)-([0-9]+)/([0-9]+|\*)", content_range)
                    if not match or (int(match[1]), int(match[2])) != (offset, offset + length - 1) or declared not in (None, length):
                        reject("incomplete_output", "The source returned an inconsistent byte range.")
                count = 0
                with target.open("xb") as output:
                    while block := response.read(64 * 1024):
                        count += len(block)
                        self.source_bytes += len(block)
                        self.scratch_bytes += len(block)
                        if count > maximum or self.source_bytes > self.limits["sourceBytes"] or self.scratch_bytes > self.limits["scratchBytes"]:
                            reject("resource_limit", "The download exceeded its transfer limit.")
                        output.write(block)
                if not count or (declared is not None and count != declared) or (byte_range and count != byte_range[1]):
                    reject("incomplete_output", "The media transfer was incomplete.")
                return (target, url) if return_url else target
            except (OSError, http.client.HTTPException):
                reject("incomplete_output", "The media transfer did not complete.")
            finally:
                connection.close()
        reject("source_denied", "The media transfer could not be resolved.")

    def hls(self, url, prefix, headers):
        """Materialize every segment of a finite, unencrypted media playlist.

        FFmpeg receives a local-only playlist, so its successful exit cannot hide
        upstream segment failures or an unbounded/live source.
        """
        original_url = url
        playlist, url = self.fetch(url, prefix + "-source.m3u8", headers, maximum=MAX_MANIFEST, return_url=True)
        headers = destination_headers(headers, original_url, url)
        try:
            lines = [line.strip() for line in playlist.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
        except (OSError, UnicodeError):
            reject("format_unavailable", "The source returned an unsupported video playlist.")
        if not lines or lines[0] != "#EXTM3U" or lines[-1] != "#EXT-X-ENDLIST" or lines.count("#EXT-X-ENDLIST") != 1:
            reject("live_content", "Only complete, finite videos are supported.")
        if any(line.startswith(("#EXT-X-STREAM-INF", "#EXT-X-MEDIA:", "#EXT-X-I-FRAME", "#EXT-X-SESSION-KEY", "#EXT-X-PART", "#EXT-X-PRELOAD-HINT", "#EXT-X-GAP")) for line in lines):
            reject("format_unavailable", "This playlist does not identify one complete video format.")
        local = ["#EXTM3U", "#EXT-X-VERSION:7", "#EXT-X-PLAYLIST-TYPE:VOD", "#EXT-X-TARGETDURATION:1800"]
        count, pending_duration, pending_range, duration = 0, None, None, 0
        fragment_extension = "ts"
        for line in lines[1:]:
            if line.startswith("#EXT-X-KEY:"):
                if line != "#EXT-X-KEY:METHOD=NONE":
                    reject("protected_content", "Protected video streams are not supported.")
            elif line.startswith("#EXT-X-MAP:"):
                match = re.fullmatch(r'#EXT-X-MAP:URI="([^"\r\n]+)"(?:,BYTERANGE="([0-9]+)@([0-9]+)")?', line)
                if not match:
                    reject("format_unavailable", "The source returned an unsupported initialization segment.")
                name = f"{prefix}-map-{count}.mp4"
                byte_range = (int(match[3]), int(match[2])) if match[2] else None
                destination = urljoin(url, match[1])
                self.fetch(destination, name, destination_headers(headers, url, destination), byte_range=byte_range)
                local.append(f'#EXT-X-MAP:URI="{name}"')
                fragment_extension = "m4s"
            elif line.startswith("#EXTINF:"):
                if pending_duration is not None or not re.fullmatch(r"#EXTINF:([0-9]+(?:\.[0-9]+)?),[^\r\n]*", line):
                    reject("format_unavailable", "The source returned an invalid video playlist.")
                pending_duration = line.split(":", 1)[1].split(",", 1)[0]
                if not 0 < float(pending_duration) <= self.limits["durationSeconds"]:
                    reject("resource_limit", "The video exceeds the duration limit.")
                duration += float(pending_duration)
                if duration > self.limits["durationSeconds"]:
                    reject("resource_limit", "The video exceeds the duration limit.")
            elif line.startswith("#EXT-X-BYTERANGE:"):
                match = re.fullmatch(r"#EXT-X-BYTERANGE:([0-9]+)@([0-9]+)", line)
                if not match or int(match[1]) < 1:
                    reject("format_unavailable", "The source returned an unsupported byte range.")
                pending_range = (int(match[2]), int(match[1]))
            elif line == "#EXT-X-DISCONTINUITY":
                local.append(line)
            elif not line.startswith("#"):
                if pending_duration is None or count >= MAX_SEGMENTS:
                    reject("format_unavailable", "The source returned an invalid video playlist.")
                extension = Path(urlsplit(line).path).suffix.removeprefix(".").lower()
                if extension not in ("ts", "m4s", "mp4", "aac", "mp3", "m4a"):
                    extension = fragment_extension
                name = f"{prefix}-segment-{count}.{extension}"
                destination = urljoin(url, line)
                self.fetch(destination, name, destination_headers(headers, url, destination), byte_range=pending_range)
                local.extend((f"#EXTINF:{pending_duration},", name))
                count += 1
                pending_duration, pending_range = None, None
        if not count or pending_duration is not None or pending_range is not None:
            reject("incomplete_output", "The source playlist was incomplete.")
        local.append("#EXT-X-ENDLIST")
        path = self.directory / (prefix + ".m3u8")
        path.write_text("\n".join(local) + "\n")
        return path


def main():
    config = json.loads(Path(sys.argv[1]).read_bytes())
    directory = Path(sys.argv[1]).parent
    transfer = Transfer(directory, config["limits"])
    fmt = config["format"]
    files = []
    try:
        for index, url in enumerate(fmt["urls"]):
            prefix = f"cobalt-input-{index}"
            path = transfer.hls(url, prefix, fmt.get("headers", {})) if fmt["isHLS"] else transfer.fetch(url, prefix + ".bin", fmt.get("headers", {}))
            files.append(path.name)
        result = {"complete": True, "files": files, "sourceBytes": transfer.source_bytes}
        (directory / "cobalt-transfer.json").write_text(json.dumps(result))
    except Rejected as error:
        (directory / "engine-error.json").write_text(json.dumps({"code": error.code}))
        sys.exit(1)


if __name__ == "__main__":
    main()
