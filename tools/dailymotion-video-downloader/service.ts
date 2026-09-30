import {
  PlatformService,
  definePlatformDescriptor,
  type SourceParseResult,
} from "../../lib/downloaders/PlatformService.ts";

export class DailymotionService extends PlatformService {
  readonly descriptor = definePlatformDescriptor({
    platformId: "dailymotion",
    name: "Dailymotion Video Downloader",
    description: "Download supported public Dailymotion videos.",
    hosts: ["dailymotion.com", "www.dailymotion.com", "dai.ly"],
    egressHosts: ["dailymotion.com", "*.dailymotion.com", "dai.ly", "*.dmcdn.net"],
    contentForms: ["video"],
    ytDlpExtractors: ["Dailymotion"],
    singleVideoForms: ["video"],
    candidateEngines: ["yt-dlp", "cobalt"],
  });

  parseUrl(url: URL): SourceParseResult {
    const invalid = this.validateUrl(url);
    if (invalid) return invalid;
    const match = (
      url.hostname === "dai.ly"
        ? /^\/(x[a-z0-9]{2,19})\/?$/
        : /^\/video\/(x[a-z0-9]{2,19})(?:_[A-Za-z0-9_-]{1,200})?\/?$/
    ).exec(url.pathname);
    return match
      ? this.supported(new URL(`https://www.dailymotion.com/video/${match[1]}`), match[1], "video")
      : this.unsupported();
  }
}
