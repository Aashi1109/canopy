import {
  PlatformService,
  definePlatformDescriptor,
  type SourceParseResult,
} from "../../lib/downloaders/PlatformService.ts";

export class FacebookService extends PlatformService {
  readonly descriptor = definePlatformDescriptor({
    platformId: "facebook",
    name: "Facebook Video Downloader",
    description: "Download supported public Facebook videos and Reels.",
    hosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "mbasic.facebook.com", "fb.watch"],
    egressHosts: ["facebook.com", "*.facebook.com", "fb.watch", "*.fbcdn.net"],
    contentForms: ["video", "reel"],
    ytDlpExtractors: ["Facebook", "FacebookReel"],
    singleVideoForms: ["video", "reel"],
    candidateEngines: ["yt-dlp"],
  });

  parseUrl(url: URL): SourceParseResult {
    const invalid = this.validateUrl(url);
    if (invalid) return invalid;
    if (url.hostname === "fb.watch")
      return /^\/[A-Za-z0-9_-]{3,64}\/?$/.test(url.pathname) ? this.shortLink(url) : this.unsupported();
    if (/^\/share\/(?:v|r)\/[A-Za-z0-9_-]{3,64}\/?$/.test(url.pathname)) return this.shortLink(url);
    const reel = /^\/reel\/(\d{6,32})\/?$/.exec(url.pathname);
    if (reel) return this.supported(new URL(`https://www.facebook.com/reel/${reel[1]}`), reel[1], "reel");
    const video = /^\/[A-Za-z0-9._-]{1,100}\/videos\/(\d{6,32})\/?$/.exec(url.pathname);
    const id = video?.[1] ?? (/^\/(?:watch\/?|video\.php)$/.test(url.pathname) ? url.searchParams.get("v") : undefined);
    return id && /^\d{6,32}$/.test(id)
      ? this.supported(new URL(`https://www.facebook.com/watch/?v=${id}`), id, "video")
      : this.unsupported();
  }
}
