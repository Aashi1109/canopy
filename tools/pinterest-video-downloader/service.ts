import {
  PlatformService,
  definePlatformDescriptor,
  type SourceParseResult,
} from "../../lib/downloaders/PlatformService.ts";

export class PinterestService extends PlatformService {
  override readonly verifiesPostComposition = true;
  readonly descriptor = definePlatformDescriptor({
    platformId: "pinterest",
    name: "Pinterest Video Downloader",
    description: "Download supported public Pinterest video pins.",
    hosts: ["pinterest.com", "www.pinterest.com", "pin.it"],
    egressHosts: ["pinterest.com", "*.pinterest.com", "pin.it", "*.pinimg.com"],
    contentForms: ["video"],
    ytDlpExtractors: ["Pinterest"],
    singleVideoForms: [],
    candidateEngines: ["yt-dlp"],
  });

  parseUrl(url: URL): SourceParseResult {
    const invalid = this.validateUrl(url);
    if (invalid) return invalid;
    if (url.hostname === "pin.it")
      return /^\/[A-Za-z0-9_-]{3,64}\/?$/.test(url.pathname) ? this.shortLink(url) : this.unsupported();
    const match = /^\/pin\/(?:[A-Za-z0-9-]+--)?(\d{6,32})\/?$/.exec(url.pathname);
    return match
      ? this.supported(new URL(`https://www.pinterest.com/pin/${match[1]}/`), match[1], "video")
      : this.unsupported();
  }
}
