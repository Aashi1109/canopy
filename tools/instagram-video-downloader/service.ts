import {
  PlatformService,
  definePlatformDescriptor,
  type SourceParseResult,
} from "../../lib/downloaders/PlatformService.ts";

export class InstagramService extends PlatformService {
  override readonly inspectionEngine = "instagram";
  readonly descriptor = definePlatformDescriptor({
    platformId: "instagram",
    name: "Instagram Video Downloader",
    description: "Download supported public Instagram Reels and all-video posts.",
    hosts: ["instagram.com", "www.instagram.com", "m.instagram.com"],
    egressHosts: ["instagram.com", "*.instagram.com", "*.cdninstagram.com", "*.fbcdn.net"],
    contentForms: ["reel", "post", "video"],
    ytDlpExtractors: ["Instagram"],
    singleVideoForms: ["reel", "video"],
    candidateEngines: ["yt-dlp", "cobalt"],
  });

  parseUrl(url: URL): SourceParseResult {
    const invalid = this.validateUrl(url);
    if (invalid) return invalid;
    if (/^\/share\/(?:reel|p)\/[A-Za-z0-9_-]{3,64}\/?$/.test(url.pathname)) return this.shortLink(url);
    const match = /^\/(reels?|p|tv)\/([A-Za-z0-9_-]{3,64})\/?$/.exec(url.pathname);
    if (!match) return this.unsupported();
    const path = match[1] === "reels" ? "reel" : match[1];
    return this.supported(
      new URL(`https://www.instagram.com/${path}/${match[2]}/`),
      match[2],
      path === "p" ? "post" : path === "tv" ? "video" : "reel",
    );
  }
}
