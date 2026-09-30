import { YouTubeService } from "../../tools/youtube-video-downloader/service.ts";
import { TikTokService } from "../../tools/tiktok-video-downloader/service.ts";
import { InstagramService } from "../../tools/instagram-video-downloader/service.ts";
import { FacebookService } from "../../tools/facebook-video-downloader/service.ts";
import { XService } from "../../tools/x-video-downloader/service.ts";
import { PinterestService } from "../../tools/pinterest-video-downloader/service.ts";
import { RedditService } from "../../tools/reddit-video-downloader/service.ts";
import { VimeoService } from "../../tools/vimeo-video-downloader/service.ts";
import { TwitchService } from "../../tools/twitch-video-downloader/service.ts";
import { DailymotionService } from "../../tools/dailymotion-video-downloader/service.ts";
import { LinkedInService } from "../../tools/linkedin-video-downloader/service.ts";
import { SnapchatService } from "../../tools/snapchat-video-downloader/service.ts";
import { PlatformService, type SourceParseResult } from "./PlatformService.ts";

export function createPlatformRegistry(services: readonly PlatformService[]) {
  const byId = new Map<string, PlatformService>();
  const byDefinitionKey = new Map<string, PlatformService>();
  for (const service of services) {
    const descriptor = service.descriptor;
    if (
      !/^[a-z][a-z0-9-]{0,63}$/.test(descriptor.platformId) ||
      descriptor.definitionKey !== `${descriptor.platformId}-video-downloader` ||
      descriptor.toolId !== `media.${descriptor.definitionKey}` ||
      byId.has(descriptor.platformId) ||
      byDefinitionKey.has(descriptor.definitionKey) ||
      !descriptor.name.trim() ||
      !descriptor.description.trim() ||
      !descriptor.hosts.length ||
      descriptor.hosts.some((host) => !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(host)) ||
      !descriptor.egressHosts.length ||
      descriptor.egressHosts.length > 40 ||
      descriptor.egressHosts.some((host) => !/^(?:\*\.)?[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(host)) ||
      !descriptor.contentForms.length ||
      descriptor.contentForms.some((form) => !["video", "short", "reel", "post", "clip", "spotlight"].includes(form)) ||
      !descriptor.ytDlpExtractors.length ||
      descriptor.ytDlpExtractors.length > 3 ||
      descriptor.ytDlpExtractors.some(
        (key) => !/^[A-Za-z][A-Za-z0-9]{0,80}$/.test(key) || key.toLowerCase() === "generic",
      ) ||
      descriptor.singleVideoForms.some((form) => !descriptor.contentForms.includes(form)) ||
      !descriptor.candidateEngines.length ||
      new Set(descriptor.candidateEngines).size !== descriptor.candidateEngines.length ||
      descriptor.candidateEngines.some((engine) => engine !== "yt-dlp" && engine !== "cobalt")
    )
      throw new TypeError("Invalid or duplicate platform service descriptor.");
    byId.set(descriptor.platformId, service);
    byDefinitionKey.set(descriptor.definitionKey, service);
  }
  return Object.freeze({
    services: Object.freeze([...services]),
    getById: (id: string) => byId.get(id),
    getByDefinitionKey: (definitionKey: string) => byDefinitionKey.get(definitionKey),
  });
}

const registry = createPlatformRegistry([
  new YouTubeService(),
  new TikTokService(),
  new InstagramService(),
  new FacebookService(),
  new XService(),
  new PinterestService(),
  new RedditService(),
  new VimeoService(),
  new TwitchService(),
  new DailymotionService(),
  new LinkedInService(),
  new SnapchatService(),
]);

export const platformServices = registry.services;
export const getPlatformService = registry.getById;
export const getPlatformServiceByDefinitionKey = registry.getByDefinitionKey;

/** Validate raw syntax before URL parsing can erase explicit ports, whitespace or dot segments. */
export function parsePlatformUrl(platformId: string, input: unknown): SourceParseResult {
  const service = getPlatformService(platformId);
  if (!service)
    return { status: "unsupported", code: "unsupported_platform", message: "This platform is not supported." };
  const authority = typeof input === "string" ? /^https:\/\/([^/?#]+)/.exec(input)?.[1] : undefined;
  if (
    typeof input !== "string" ||
    input.length > 4096 ||
    !authority ||
    /[:@\\\s]/.test(authority) ||
    /[\\\s]/.test(input) ||
    /%(?:00|2e|2f|5c)/i.test(input.split("?")[0])
  )
    return {
      status: "unsupported",
      code: "invalid_url",
      message: "Use a supported HTTPS video link without credentials, ports or fragments.",
    };
  try {
    return service.parseUrl(new URL(input));
  } catch {
    return { status: "unsupported", code: "invalid_url", message: "Enter a valid supported HTTPS video link." };
  }
}
