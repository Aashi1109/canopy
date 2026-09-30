import {
  PlatformService,
  definePlatformDescriptor,
  type SourceParseResult,
} from "../../lib/downloaders/PlatformService.ts";

export class TwitchService extends PlatformService {
  readonly descriptor = definePlatformDescriptor({
    platformId: "twitch",
    name: "Twitch Clip Downloader",
    description: "Download supported finite Twitch clips.",
    hosts: ["twitch.tv", "www.twitch.tv", "m.twitch.tv", "clips.twitch.tv"],
    egressHosts: [
      "twitch.tv",
      "*.twitch.tv",
      "*.ttvnw.net",
      "*.twitchcdn.net",
      "*.jtvnw.net",
      "d1ndex63qxojbr.cloudfront.net",
    ],
    contentForms: ["clip"],
    ytDlpExtractors: ["TwitchClips"],
    singleVideoForms: ["clip"],
    candidateEngines: ["yt-dlp", "cobalt"],
  });

  parseUrl(url: URL): SourceParseResult {
    const invalid = this.validateUrl(url);
    if (invalid) return invalid;
    const match = (
      url.hostname === "clips.twitch.tv"
        ? /^\/([A-Za-z0-9_-]{3,128})\/?$/
        : /^\/[A-Za-z0-9_]{1,64}\/clip\/([A-Za-z0-9_-]{3,128})\/?$/
    ).exec(url.pathname);
    return match
      ? this.supported(new URL(`https://clips.twitch.tv/${match[1]}`), match[1], "clip")
      : this.unsupported();
  }
}
