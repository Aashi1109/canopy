"""Expose private source facts and honor the quality ceiling in pinned Cobalt resolvers.

These exact anchors deliberately fail the image build when upstream changes. The
modified source is included beside the upstream AGPL source in the image notices.
"""
from pathlib import Path
import sys


def apply(root):
    services = Path(root) / "src/processing/services"
    changes = {
        "youtube.js": [
            ("    const fileMetadata = {\n", """    const canopy = {
        sourceId: basicInfo.id,
        title: basicInfo.title,
        durationSeconds: basicInfo.duration,
        isLive: basicInfo.is_live,
        isPrivate: basicInfo.is_private,
        isUnlisted: basicInfo.is_unlisted,
        video: video && { itag: video.itag, width: video.width, height: video.height,
            fps: video.fps, mime: video.mime_type, bytes: video.content_length,
            hasAudio: video.has_audio, hasVideo: video.has_video },
        audio: audio && { itag: audio.itag, mime: audio.mime_type,
            bytes: audio.content_length, hasAudio: audio.has_audio },
    };
    const fileMetadata = {
"""),
            ('            type: "merge",\n', '            type: "merge",\n            canopy,\n'),
        ],
        "instagram.js": [
            ('                urls: shortcodeMedia.video_url,\n', '                urls: shortcodeMedia.video_url,\n                canopy: { kind: "instagram-graphql", media: shortcodeMedia },\n'),
            ('const video = data.video_versions.reduce((a, b) => a.width * a.height < b.width * b.height ? b : a)\n            return {', 'const video = data.video_versions.reduce((a, b) => a.width * a.height < b.width * b.height ? b : a)\n            return {\n                canopy: { kind: "instagram-mobile", media: data },'),
        ],
        "tiktok.js": [
            ('            urls: video,\n', '            urls: video,\n            canopy: { kind: "tiktok", media: detail },\n'),
        ],
        "dailymotion.js": [
            ('import HLSParser from "hls-parser";', 'import HLSParser from "hls-parser";\nimport { selectDailymotionVariant } from "/opt/executor/cobalt_resolver.mjs";'),
            ('export default async function({ id }) {', 'export default async function({ id, quality }) {'),
            ("""const bestQuality = HLSParser.parse(manifest).variants
                        .filter(v => v.codecs.includes('avc1'))
                        .reduce((a, b) => a.bandwidth > b.bandwidth ? a : b);""", "const bestQuality = selectDailymotionVariant(HLSParser.parse(manifest).variants, quality);"),
            ('        urls: bestQuality.uri,\n', '        urls: bestQuality.uri,\n        canopy: { kind: "dailymotion", media, variant: bestQuality },\n'),
        ],
        "vimeo.js": [
            ('            fileMetadata,\n            filenameAttributes: {', '            fileMetadata,\n            canopy: { kind: "vimeo", media: info },\n            filenameAttributes: {'),
        ],
        "twitch.js": [
            ('                durationSeconds\n                id\n', '                durationSeconds\n                id\n                slug\n'),
            ('        type: "proxy",\n', '        type: "proxy",\n        canopy: { kind: "twitch", media: clipMetadata, variant: format },\n'),
        ],
    }
    for filename, replacements in changes.items():
        path = services / filename
        source = path.read_text()
        for before, after in replacements:
            if after in source:
                continue
            if source.count(before) != 1:
                raise RuntimeError(f"Cobalt patch anchor changed: {filename}")
            source = source.replace(before, after, 1)
        path.write_text(source)


if __name__ == "__main__":
    apply(sys.argv[1])
