import {
  PlatformService,
  definePlatformDescriptor,
  type SourceParseResult,
} from "../../lib/downloaders/PlatformService.ts";

export class VimeoService extends PlatformService {
  readonly descriptor = definePlatformDescriptor({
    platformId: "vimeo",
    name: "Vimeo Video Downloader",
    description: "Download supported public Vimeo videos.",
    hosts: ["vimeo.com", "www.vimeo.com", "player.vimeo.com"],
    egressHosts: ["vimeo.com", "*.vimeo.com", "*.vimeocdn.com", "*.akamaized.net"],
    contentForms: ["video"],
    ytDlpExtractors: ["Vimeo"],
    singleVideoForms: ["video"],
    candidateEngines: ["yt-dlp", "cobalt"],
  });

  parseUrl(url: URL): SourceParseResult {
    const invalid = this.validateUrl(url);
    if (invalid) return invalid;
    const match = (
      url.hostname === "player.vimeo.com" ? /^\/video\/(\d{1,12})\/?$/ : /^\/(\d{1,12})(?:\/([A-Za-z0-9]{6,64}))?\/?$/
    ).exec(url.pathname);
    if (!match) return this.unsupported();
    const hash = match[2] ?? url.searchParams.get("h");
    if (hash && !/^[A-Za-z0-9]{6,64}$/.test(hash)) return this.unsupported();
    if (match[2] && url.searchParams.has("h") && match[2] !== url.searchParams.get("h")) return this.unsupported();
    return this.supported(new URL(`https://vimeo.com/${match[1]}${hash ? `/${hash}` : ""}`), match[1], "video");
  }
}
