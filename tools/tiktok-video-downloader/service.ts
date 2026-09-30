import {
  PlatformService,
  definePlatformDescriptor,
  type SourceParseResult,
} from "../../lib/downloaders/PlatformService.ts";

export class TikTokService extends PlatformService {
  readonly descriptor = definePlatformDescriptor({
    platformId: "tiktok",
    name: "TikTok Video Downloader",
    description: "Download supported public TikTok videos.",
    hosts: ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
    egressHosts: [
      "tiktok.com",
      "*.tiktok.com",
      "*.tiktokcdn.com",
      "*.tiktokcdn-us.com",
      "*.tiktokv.com",
      "*.byteoversea.com",
      "*.ibytedtos.com",
      "*.ibyteimg.com",
      "*.muscdn.com",
      "*.musical.ly",
    ],
    contentForms: ["video"],
    ytDlpExtractors: ["TikTok"],
    singleVideoForms: ["video"],
    candidateEngines: ["yt-dlp", "cobalt"],
  });

  parseUrl(url: URL): SourceParseResult {
    const invalid = this.validateUrl(url);
    if (invalid) return invalid;
    if (["vm.tiktok.com", "vt.tiktok.com"].includes(url.hostname)) {
      return /^\/[A-Za-z0-9_-]{3,64}\/?$/.test(url.pathname) ? this.shortLink(url) : this.unsupported();
    }
    if (/^\/t\/[A-Za-z0-9_-]{3,64}\/?$/.test(url.pathname)) return this.shortLink(url);
    const match = /^\/@([A-Za-z0-9_.]{1,64})\/video\/(\d{6,25})\/?$/.exec(url.pathname);
    return match
      ? this.supported(new URL(`https://www.tiktok.com/@${match[1]}/video/${match[2]}`), match[2], "video")
      : this.unsupported();
  }
}
