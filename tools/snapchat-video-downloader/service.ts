import {
  PlatformService,
  definePlatformDescriptor,
  type SourceParseResult,
} from "../../lib/downloaders/PlatformService.ts";

export class SnapchatService extends PlatformService {
  readonly descriptor = definePlatformDescriptor({
    platformId: "snapchat",
    name: "Snapchat Spotlight Downloader",
    description: "Download supported public Snapchat Spotlight videos.",
    hosts: ["snapchat.com", "www.snapchat.com", "t.snapchat.com"],
    egressHosts: ["snapchat.com", "*.snapchat.com", "*.sc-cdn.net", "*.snapcdn.com"],
    contentForms: ["spotlight"],
    ytDlpExtractors: ["SnapchatSpotlight"],
    singleVideoForms: ["spotlight"],
    candidateEngines: ["yt-dlp"],
  });

  parseUrl(url: URL): SourceParseResult {
    const invalid = this.validateUrl(url);
    if (invalid) return invalid;
    if (url.hostname === "t.snapchat.com")
      return /^\/[A-Za-z0-9_-]{3,128}\/?$/.test(url.pathname) ? this.shortLink(url) : this.unsupported();
    const match = /^\/spotlight\/([A-Za-z0-9_-]{3,256})\/?$/.exec(url.pathname);
    return match
      ? this.supported(new URL(`https://www.snapchat.com/spotlight/${match[1]}`), match[1], "spotlight")
      : this.unsupported();
  }
}
