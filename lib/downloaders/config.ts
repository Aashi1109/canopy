import { z } from "zod";
import { DownloadError, MAX_DOWNLOAD_WORK_MS } from "./contracts.ts";
import type { DownloadRuntimeLimits } from "./jobs";
import { getPlatformService, platformServices } from "./platformRegistry.ts";

export type DownloadSettingsEnv = {
  DOWNLOADERS_LOCAL?: string;
  DOWNLOADERS_ENABLED?: string;
  DOWNLOADERS_LIMITS?: string;
  DOWNLOADERS_PLATFORMS?: string;
  DOWNLOADERS_POOL_SIZE?: string;
  DOWNLOADERS_YOUTUBE_INSPECTION?: string;
  DOWNLOADERS_INSTAGRAM_INSPECTION?: string;
  DOWNLOADERS_CONTROL_SECRET?: string;
};
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const capacity = z
  .object({
    globalDailyJobs: positive,
    networkDailyJobs: positive,
    globalQueued: positive,
    platformActive: positive.max(250),
    platformStartsPerMinute: positive,
    globalDailyBytes: positive,
    globalMonthlyBytes: positive,
    globalDailyCostMicros: positive,
    jobCostMicros: positive,
  })
  .strict();
export function downloadConfiguration(env: DownloadSettingsEnv): { limits: DownloadRuntimeLimits; slotIds: string[] } {
  const enabledSetting = env.DOWNLOADERS_ENABLED?.trim();
  const enabled = enabledSetting !== "false";
  const platforms = env.DOWNLOADERS_PLATFORMS?.trim()
    ? env.DOWNLOADERS_PLATFORMS.split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : platformServices.map((service) => service.descriptor.platformId);
  const poolSize = Number(env.DOWNLOADERS_POOL_SIZE ?? "2");
  try {
    if (
      (enabledSetting && enabledSetting !== "true" && enabledSetting !== "false") ||
      [env.DOWNLOADERS_YOUTUBE_INSPECTION, env.DOWNLOADERS_INSTAGRAM_INSPECTION].some(
        (value) => value && value !== "true" && value !== "false",
      ) ||
      !Number.isInteger(poolSize) ||
      poolSize < 1 ||
      poolSize > 250 ||
      !platforms.length ||
      platforms.some((id) => !getPlatformService(id))
    )
      throw new Error();
    const caps = capacity.parse(
      env.DOWNLOADERS_LIMITS?.trim()
        ? JSON.parse(env.DOWNLOADERS_LIMITS)
        : {
            globalDailyJobs: 100,
            networkDailyJobs: 20,
            globalQueued: 50,
            platformActive: 2,
            platformStartsPerMinute: 10,
            globalDailyBytes: 100 * 1024 ** 3,
            globalMonthlyBytes: 1000 * 1024 ** 3,
            globalDailyCostMicros: 10_000_000,
            jobCostMicros: 100_000,
          },
    );
    if (enabled && (env.DOWNLOADERS_CONTROL_SECRET?.length ?? 0) < 32) throw new Error();
    return {
      slotIds: Array.from({ length: poolSize }, (_, i) => `download-${i + 1}`),
      limits: {
        ...caps,
        enabled,
        enabledPlatforms: platforms,
        jobSourceBytes: 1024 ** 3,
        maxWorkMs: MAX_DOWNLOAD_WORK_MS,
        maxEngineStarts: 2,
        maxQueueAgeMs: 600_000,
        retentionMs: 86_400_000,
        leaseMs: 30_000,
      },
    };
  } catch {
    throw new DownloadError("DOWNLOADS_NOT_CONFIGURED", "Download capacity is not configured.", 503, false);
  }
}
export function matchesEgressHost(host: string, allowed: readonly string[]): boolean {
  return allowed.some((value) =>
    value.startsWith("*.") ? host.endsWith(value.slice(1)) && host !== value.slice(2) : host === value,
  );
}
