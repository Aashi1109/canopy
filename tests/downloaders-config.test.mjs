import { expect, test } from "vitest";
import { downloadConfiguration } from "../lib/downloaders/config.ts";

const env = {
  DOWNLOADERS_ENABLED: "true",
  DOWNLOADERS_PLATFORMS: "youtube",
  DOWNLOADERS_POOL_SIZE: "1",
  DOWNLOADERS_CONTROL_SECRET: "configuration-fixture-".repeat(3),
  DOWNLOADERS_LIMITS: JSON.stringify({
    globalDailyJobs: 10,
    networkDailyJobs: 10,
    globalQueued: 2,
    platformActive: 1,
    platformStartsPerMinute: 10,
    globalDailyBytes: 1024 ** 3,
    globalMonthlyBytes: 10 * 1024 ** 3,
    globalDailyCostMicros: 10000,
    jobCostMicros: 100,
  }),
};

test.each([undefined, "false", "true"])("configured execution works with local mode %s", (local) => {
  const configuration = downloadConfiguration({ ...env, DOWNLOADERS_LOCAL: local });
  expect(configuration.slotIds).toEqual(["download-1"]);
  expect(configuration.limits.enabled).toBe(true);
  expect(configuration.limits.jobSourceBytes).toBe(1024 ** 3);
  expect(configuration.limits.maxWorkMs).toBe(600_000);
  for (const override of [{ DOWNLOADERS_CONTROL_SECRET: "" }, { DOWNLOADERS_PLATFORMS: "unknown" }]) {
    expect(() => downloadConfiguration({ ...env, DOWNLOADERS_LOCAL: local, ...override })).toThrow();
  }
});

test.each([undefined, "", "   ", "true"])("execution defaults enabled with enabled setting %s", (enabled) => {
  const configuration = downloadConfiguration({
    DOWNLOADERS_CONTROL_SECRET: env.DOWNLOADERS_CONTROL_SECRET,
    DOWNLOADERS_ENABLED: enabled,
  });
  expect(configuration.slotIds).toEqual(["download-1", "download-2"]);
  expect(configuration.limits).toMatchObject({
    enabled: true,
    enabledPlatforms: [
      "youtube",
      "tiktok",
      "instagram",
      "facebook",
      "x",
      "pinterest",
      "reddit",
      "vimeo",
      "twitch",
      "dailymotion",
      "linkedin",
      "snapchat",
    ],
    globalDailyJobs: 100,
    networkDailyJobs: 20,
    globalQueued: 50,
    platformActive: 2,
    platformStartsPerMinute: 10,
    globalDailyBytes: 100 * 1024 ** 3,
    globalMonthlyBytes: 1000 * 1024 ** 3,
    globalDailyCostMicros: 10_000_000,
    jobCostMicros: 100_000,
  });
});

test("execution can be explicitly disabled without a control secret", () => {
  const configuration = downloadConfiguration({ DOWNLOADERS_ENABLED: "false" });
  expect(configuration.limits.enabled).toBe(false);
});

test("explicit platform, capacity and pool settings override the defaults", () => {
  const configuration = downloadConfiguration({ ...env, DOWNLOADERS_PLATFORMS: "instagram, youtube" });
  expect(configuration.slotIds).toEqual(["download-1"]);
  expect(configuration.limits.enabledPlatforms).toEqual(["instagram", "youtube"]);
  expect(configuration.limits).toMatchObject(JSON.parse(env.DOWNLOADERS_LIMITS));
});

test.each(["", "   "])("blank optional settings use the defaults: %j", (blank) => {
  const configuration = downloadConfiguration({
    DOWNLOADERS_CONTROL_SECRET: env.DOWNLOADERS_CONTROL_SECRET,
    DOWNLOADERS_LIMITS: blank,
    DOWNLOADERS_PLATFORMS: blank,
  });
  expect(configuration.limits.enabledPlatforms).toHaveLength(12);
  expect(configuration.limits.globalDailyJobs).toBe(100);
});

test.each([undefined, "", "true", "false"])("inspection flags accept optional boolean setting %j", (value) => {
  expect(
    downloadConfiguration({
      ...env,
      DOWNLOADERS_YOUTUBE_INSPECTION: value,
      DOWNLOADERS_INSTAGRAM_INSPECTION: value,
    }).limits.enabled,
  ).toBe(true);
});

test.each([
  { DOWNLOADERS_CONTROL_SECRET: undefined },
  { DOWNLOADERS_CONTROL_SECRET: "" },
  { DOWNLOADERS_CONTROL_SECRET: "x".repeat(31) },
  { DOWNLOADERS_ENABLED: "yes" },
  { DOWNLOADERS_ENABLED: "TRUE" },
  { DOWNLOADERS_ENABLED: "0" },
  { DOWNLOADERS_YOUTUBE_INSPECTION: "yes" },
  { DOWNLOADERS_INSTAGRAM_INSPECTION: "yes" },
  { DOWNLOADERS_YOUTUBE_INSPECTION: "TRUE" },
  { DOWNLOADERS_INSTAGRAM_INSPECTION: " false " },
  { DOWNLOADERS_PLATFORMS: "youtube,unknown" },
  { DOWNLOADERS_PLATFORMS: ", ," },
  { DOWNLOADERS_POOL_SIZE: "0" },
  { DOWNLOADERS_POOL_SIZE: "251" },
  { DOWNLOADERS_POOL_SIZE: "1.5" },
  { DOWNLOADERS_LIMITS: "not json" },
  { DOWNLOADERS_LIMITS: JSON.stringify({ globalDailyJobs: 10 }) },
  { DOWNLOADERS_LIMITS: JSON.stringify({ ...JSON.parse(env.DOWNLOADERS_LIMITS), globalQueued: 0 }) },
  { DOWNLOADERS_LIMITS: JSON.stringify({ ...JSON.parse(env.DOWNLOADERS_LIMITS), platformActive: 251 }) },
  { DOWNLOADERS_LIMITS: JSON.stringify({ ...JSON.parse(env.DOWNLOADERS_LIMITS), unknownLimit: 10 }) },
])("invalid configuration returns a nonretryable setup error: %j", (override) => {
  expect(() => downloadConfiguration({ ...env, ...override })).toThrowError(
    expect.objectContaining({
      code: "DOWNLOADS_NOT_CONFIGURED",
      status: 503,
      retryable: false,
    }),
  );
});

test("default-enabled execution requires the control secret too", () => {
  expect(() => downloadConfiguration({})).toThrowError(
    expect.objectContaining({
      code: "DOWNLOADS_NOT_CONFIGURED",
      retryable: false,
    }),
  );
});
