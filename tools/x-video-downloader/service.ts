import {
  PlatformService,
  definePlatformDescriptor,
  type SourceParseResult,
} from "../../lib/downloaders/PlatformService.ts";

export class XService extends PlatformService {
  override readonly verifiesPostComposition = true;
  readonly descriptor = definePlatformDescriptor({
    platformId: "x",
    name: "X Video Downloader",
    description: "Download supported public X post videos.",
    hosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com", "t.co"],
    egressHosts: ["x.com", "*.x.com", "twitter.com", "*.twitter.com", "*.twimg.com"],
    contentForms: ["post"],
    ytDlpExtractors: ["Twitter"],
    singleVideoForms: [],
    candidateEngines: ["yt-dlp"],
  });

  parseUrl(url: URL): SourceParseResult {
    const invalid = this.validateUrl(url);
    if (invalid) return invalid;
    if (url.hostname === "t.co")
      return /^\/[A-Za-z0-9]{3,64}\/?$/.test(url.pathname) ? this.shortLink(url) : this.unsupported();
    const match = /^\/(?:[A-Za-z0-9_]{1,15}|i\/web)\/status\/(\d{6,32})\/?$/.exec(url.pathname);
    return match ? this.supported(new URL(`https://x.com/i/status/${match[1]}`), match[1], "post") : this.unsupported();
  }
}
