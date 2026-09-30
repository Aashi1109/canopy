import {
  PlatformService,
  definePlatformDescriptor,
  type SourceParseResult,
} from "../../lib/downloaders/PlatformService.ts";

export class LinkedInService extends PlatformService {
  override readonly verifiesPostComposition = true;
  readonly descriptor = definePlatformDescriptor({
    platformId: "linkedin",
    name: "LinkedIn Video Downloader",
    description: "Download supported public LinkedIn feed videos.",
    hosts: ["linkedin.com", "www.linkedin.com"],
    egressHosts: ["linkedin.com", "*.linkedin.com", "*.licdn.com"],
    contentForms: ["video"],
    ytDlpExtractors: ["LinkedIn"],
    singleVideoForms: [],
    candidateEngines: ["yt-dlp"],
  });

  parseUrl(url: URL): SourceParseResult {
    const invalid = this.validateUrl(url);
    if (invalid) return invalid;
    const post = /^\/posts\/([A-Za-z0-9_-]+-(?:activity|ugcPost)-(\d{6,32})-[A-Za-z0-9_]{4})\/?$/.exec(url.pathname);
    if (post) return this.supported(new URL(`https://www.linkedin.com/posts/${post[1]}/`), post[2], "video");
    const activity = /^\/feed\/update\/urn(?::|%3A)li(?::|%3A)activity(?::|%3A)(\d{6,32})\/?$/i.exec(url.pathname);
    return activity
      ? this.supported(
          new URL(`https://www.linkedin.com/feed/update/urn:li:activity:${activity[1]}/`),
          activity[1],
          "video",
        )
      : this.unsupported();
  }
}
