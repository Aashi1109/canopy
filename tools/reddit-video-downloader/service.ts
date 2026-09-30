import {
  PlatformService,
  definePlatformDescriptor,
  type SourceParseResult,
} from "../../lib/downloaders/PlatformService.ts";

export class RedditService extends PlatformService {
  override readonly verifiesPostComposition = true;
  readonly descriptor = definePlatformDescriptor({
    platformId: "reddit",
    name: "Reddit Video Downloader",
    description: "Download supported Reddit-hosted videos with their available audio.",
    hosts: ["reddit.com", "www.reddit.com", "old.reddit.com", "new.reddit.com", "m.reddit.com", "redd.it"],
    egressHosts: ["reddit.com", "*.reddit.com", "redd.it", "*.redd.it", "*.redditmedia.com"],
    contentForms: ["video"],
    ytDlpExtractors: ["Reddit"],
    singleVideoForms: [],
    candidateEngines: ["yt-dlp"],
  });

  parseUrl(url: URL): SourceParseResult {
    const invalid = this.validateUrl(url);
    if (invalid) return invalid;
    if (url.hostname === "redd.it")
      return /^\/[a-z0-9]{3,16}\/?$/.test(url.pathname) ? this.shortLink(url) : this.unsupported();
    if (/^\/r\/[A-Za-z0-9_]{1,64}\/s\/[A-Za-z0-9]{3,64}\/?$/.test(url.pathname)) return this.shortLink(url);
    const match = /^\/(?:(r|user)\/([A-Za-z0-9_-]{1,64})\/)?comments\/([a-z0-9]{3,16})(?:\/[^/]{0,300})?\/?$/.exec(
      url.pathname,
    );
    return match
      ? this.supported(
          new URL(`https://www.reddit.com/${match[1] ? `${match[1]}/${match[2]}/` : ""}comments/${match[3]}/`),
          match[3],
          "video",
        )
      : this.unsupported();
  }
}
