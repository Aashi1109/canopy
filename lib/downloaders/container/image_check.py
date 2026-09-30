"""Build-time package/adapter compatibility, without making upstream requests."""
import importlib.metadata
import json
import subprocess
import time
import urllib.error
import urllib.request

import yt_dlp
import yt_dlp.globals as state
from yt_dlp.extractor import get_info_extractor

assert yt_dlp.version.__version__ == "2026.08.19"
assert importlib.metadata.version("yt-dlp-ejs") == "0.8.0"
# Match the runtime's fixed, image-owned plugin directory. Do not discover
# operator/user plugins or activate bgutil's alternative script provider.
state.plugin_dirs.value = ["/opt/yt-dlp-plugins"]
state.all_plugins_loaded.value = True
from yt_dlp_plugins.extractor.getpot_bgutil_http import BgUtilHTTPPTP

assert BgUtilHTTPPTP.PROVIDER_VERSION == "2.0.0"
for name in ("Youtube", "TikTok", "Instagram", "Facebook", "FacebookReel", "Twitter", "Pinterest", "Reddit", "Vimeo", "TwitchClips", "Dailymotion", "LinkedIn", "SnapchatSpotlight"):
    get_info_extractor(name)
subprocess.run(["node", "--version"], check=True)
subprocess.run(["ffprobe", "-version"], stdout=subprocess.DEVNULL, check=True)
subprocess.run(["node", "--input-type=module", "-e", "import('/opt/cobalt/node_modules/isolated-vm/isolated-vm.js')"], check=True)
subprocess.run([
    "node", "--input-type=module", "-e",
    "const {default: canvas} = await import('/opt/bgutil/node_modules/canvas/index.js'); canvas.createCanvas(1, 1).toBuffer()",
], check=True)

# Starting the HTTP server exercises its full module graph. /ping performs no
# YouTube requests or token generation.
provider = subprocess.Popen(
    ["node", "/opt/bgutil/build/main.js", "--host", "127.0.0.1", "--port", "4416"],
    stdout=subprocess.DEVNULL,
)
try:
    deadline = time.monotonic() + 15
    while True:
        if provider.poll() is not None:
            raise RuntimeError("Bundled bgutil server exited before becoming ready")
        try:
            with urllib.request.urlopen("http://127.0.0.1:4416/ping", timeout=1) as response:
                assert json.load(response)["version"] == BgUtilHTTPPTP.PROVIDER_VERSION
                break
        except urllib.error.URLError:
            if time.monotonic() >= deadline:
                raise RuntimeError("Bundled bgutil server did not become ready")
            time.sleep(0.1)
finally:
    provider.terminate()
    try:
        provider.wait(timeout=5)
    except subprocess.TimeoutExpired:
        provider.kill()
        provider.wait()
