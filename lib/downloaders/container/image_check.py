"""Build-time package/adapter compatibility, without making upstream requests."""
import importlib.metadata
import subprocess

import yt_dlp
from yt_dlp.extractor import get_info_extractor

assert yt_dlp.version.__version__ == "2026.08.19"
assert importlib.metadata.version("yt-dlp-ejs") == "0.8.0"
for name in ("Youtube", "TikTok", "Instagram", "Facebook", "FacebookReel", "Twitter", "Pinterest", "Reddit", "Vimeo", "TwitchClips", "Dailymotion", "LinkedIn", "SnapchatSpotlight"):
    get_info_extractor(name)
subprocess.run(["node", "--version"], check=True)
subprocess.run(["ffprobe", "-version"], stdout=subprocess.DEVNULL, check=True)
subprocess.run(["node", "--input-type=module", "-e", "import('/opt/cobalt/node_modules/isolated-vm/isolated-vm.js')"], check=True)
