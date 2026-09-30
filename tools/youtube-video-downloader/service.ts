import {
  PlatformService,
  definePlatformDescriptor,
  type SourceParseResult,
} from "../../lib/downloaders/PlatformService.ts";

export class YouTubeService extends PlatformService {
  override readonly inspectionEngine = "youtubei";
  readonly descriptor = definePlatformDescriptor({
    platformId: "youtube",
    name: "YouTube Video Downloader",
    description: "Download supported public YouTube videos and Shorts.",
    hosts: ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"],
    egressHosts: [
      "youtube.com",
      "*.youtube.com",
      "youtu.be",
      "youtubei.googleapis.com",
      "jnn-pa.googleapis.com",
      "www.google.com",
      "*.googlevideo.com",
      "*.ytimg.com",
    ],
    contentForms: ["video", "short"],
    ytDlpExtractors: ["Youtube"],
    singleVideoForms: ["video", "short"],
    candidateEngines: ["yt-dlp", "cobalt"],
  });

  parseUrl(url: URL): SourceParseResult {
    const invalid = this.validateUrl(url);
    if (invalid) return invalid;
    const path = url.pathname.replace(/\/$/, "");
    const short = /^\/shorts\/([A-Za-z0-9_-]{11})$/.exec(path);
    const embed = /^\/embed\/([A-Za-z0-9_-]{11})$/.exec(path);
    const id =
      url.hostname === "youtu.be"
        ? /^\/([A-Za-z0-9_-]{11})$/.exec(path)?.[1]
        : path === "/watch"
          ? url.searchParams.get("v")
          : (short?.[1] ?? embed?.[1]);
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return this.unsupported();
    const canonical = new URL(short ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`);
    return this.supported(canonical, id, short ? "short" : "video");
  }
}
