import type { PlatformDescriptor } from "@/lib/downloaders/PlatformService";
import { MAX_DOWNLOAD_DURATION_SECONDS } from "../downloaders/contracts.ts";
import { defineTool } from "./spec.ts";

/** Pure UI projection. Services, engines and accepted-host policy stay on the server. */
export function createDownloaderDefinition(descriptor: PlatformDescriptor) {
  const platformName = descriptor.name.replace(/\s+video downloader$/i, "");
  return defineTool({
    toolId: descriptor.toolId,
    app: "media",
    category: "video-downloaders",
    name: descriptor.name,
    description: descriptor.description,
    keywords: [platformName, "video", "download"],
    input: { kind: "text", label: `Public ${platformName} video link`, maxLength: 4096 },
    settings: { fields: {} },
    trigger: { mode: "manual", actionLabel: "Download video" },
    job: { kind: "download", platform: descriptor.platformId, platformName },
    capabilities: { cancel: true, download: true, network: true },
    labels: {
      empty: "Paste a public video link to begin",
      running: "Preparing your video",
      ready: "Your download is ready",
    },
    content: {
      howToUse: [
        `Copy a public ${platformName} video link.`,
        "Paste the link and choose Download. Select an available video format up to 1080p, then choose Download video.",
        "Download the prepared file before its access expires.",
      ],
      limitations: [
        "Download only videos you own or have permission to save.",
        "Private, login-only, live and protected videos are not supported.",
        `Videos must be no longer than ${MAX_DOWNLOAD_DURATION_SECONDS / 60} minutes, with a prepared file no larger than 250 MiB.`,
        "Quality depends on the source; videos are not upscaled or converted.",
      ],
    },
  });
}
