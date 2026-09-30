import { describe, expect, test } from "vitest";
import { PlatformService, definePlatformDescriptor } from "../lib/downloaders/PlatformService.ts";
import { matchesEgressHost } from "../lib/downloaders/config.ts";
import {
  createPlatformRegistry,
  getPlatformService,
  getPlatformServiceByDefinitionKey,
  parsePlatformUrl,
  platformServices,
} from "../lib/downloaders/platformRegistry.ts";

const canonicalCases = [
  ["youtube", "https://www.youtube.com/watch?v=BaW_jenozKc&si=tracking", "BaW_jenozKc", "video"],
  ["youtube", "https://youtu.be/BaW_jenozKc?t=2", "BaW_jenozKc", "video"],
  ["youtube", "https://www.youtube.com/shorts/BaW_jenozKc", "BaW_jenozKc", "short"],
  ["tiktok", "https://www.tiktok.com/@creator/video/7421234567890123456", "7421234567890123456", "video"],
  ["instagram", "https://www.instagram.com/reel/C_abc123-xy/?igsh=tracking", "C_abc123-xy", "reel"],
  ["instagram", "https://www.instagram.com/p/C_abc123-xy/", "C_abc123-xy", "post"],
  ["facebook", "https://www.facebook.com/reel/123456789012345", "123456789012345", "reel"],
  ["facebook", "https://www.facebook.com/watch/?v=123456789012345", "123456789012345", "video"],
  ["facebook", "https://www.facebook.com/creator/videos/123456789012345/", "123456789012345", "video"],
  ["x", "https://twitter.com/creator/status/1234567890123456789?s=20", "1234567890123456789", "post"],
  ["x", "https://x.com/i/web/status/1234567890123456789", "1234567890123456789", "post"],
  ["pinterest", "https://www.pinterest.com/pin/123456789012345/", "123456789012345", "video"],
  ["reddit", "https://www.reddit.com/r/videos/comments/1abc123/example_title/", "1abc123", "video"],
  ["vimeo", "https://vimeo.com/123456789/abc123def0", "123456789", "video"],
  ["vimeo", "https://player.vimeo.com/video/123456789?h=abc123def0", "123456789", "video"],
  ["twitch", "https://clips.twitch.tv/ExampleClip-abc123", "ExampleClip-abc123", "clip"],
  ["twitch", "https://www.twitch.tv/creator/clip/ExampleClip-abc123", "ExampleClip-abc123", "clip"],
  ["dailymotion", "https://www.dailymotion.com/video/x9abcde", "x9abcde", "video"],
  ["dailymotion", "https://dai.ly/x9abcde", "x9abcde", "video"],
  [
    "linkedin",
    "https://www.linkedin.com/posts/creator_some-post-activity-1234567890123456789-abCD/",
    "1234567890123456789",
    "video",
  ],
  [
    "linkedin",
    "https://www.linkedin.com/feed/update/urn:li:activity:1234567890123456789/",
    "1234567890123456789",
    "video",
  ],
  ["snapchat", "https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEn-example", "W7_EDlXWTBiXAEEn-example", "spotlight"],
];

describe("registered platform URL contracts", () => {
  test("ships exactly the twelve planned services with consistent executable identities", () => {
    expect(platformServices.map((service) => service.descriptor.platformId)).toEqual([
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
    ]);
    for (const service of platformServices) {
      const { platformId, definitionKey, toolId } = service.descriptor;
      expect(definitionKey).toBe(`${platformId}-video-downloader`);
      expect(toolId).toBe(`media.${definitionKey}`);
      expect(getPlatformService(platformId)).toBe(service);
      expect(getPlatformServiceByDefinitionKey(definitionKey)).toBe(service);
    }
    expect(getPlatformService("__proto__")).toBeUndefined();
    expect(getPlatformServiceByDefinitionKey("../youtube-video-downloader")).toBeUndefined();
  });

  test.each(canonicalCases)("%s recognizes %s", (platformId, input, id, contentForm) => {
    const result = parsePlatformUrl(platformId, input);
    expect(result.status).toBe("supported");
    expect(result.source).toMatchObject({ platformId, id, contentForm });
    expect(new URL(result.source.url).protocol).toBe("https:");
    expect(getPlatformService(platformId).parseUrl(new URL(result.source.url))).toEqual(result);
  });

  test.each([
    ["tiktok", "https://vm.tiktok.com/ZMabc123/"],
    ["tiktok", "https://www.tiktok.com/t/ZT123abc/"],
    ["instagram", "https://www.instagram.com/share/reel/BAabc123/"],
    ["facebook", "https://fb.watch/Abc_123-/"],
    ["facebook", "https://www.facebook.com/share/v/Abc123/"],
    ["x", "https://t.co/Abc123xyz"],
    ["pinterest", "https://pin.it/Abc123xyz"],
    ["reddit", "https://redd.it/1abc123"],
    ["reddit", "https://www.reddit.com/r/videos/s/Abc123xyz"],
    ["snapchat", "https://t.snapchat.com/Abc123xyz"],
  ])("%s returns a bounded resolver instruction for %s", (platformId, url) => {
    expect(parsePlatformUrl(platformId, url)).toMatchObject({ status: "short-link", url });
  });

  test("preserves Vimeo unlisted hashes while removing tracking", () => {
    const result = parsePlatformUrl(
      "vimeo",
      "https://player.vimeo.com/video/123456789?h=abc123def0&utm_source=example",
    );
    expect(result.source.url).toBe("https://vimeo.com/123456789/abc123def0");
  });

  test.each([
    "http://www.youtube.com/watch?v=BaW_jenozKc",
    "https://www.youtube.com:443/watch?v=BaW_jenozKc",
    "https://www.youtube.com:8443/watch?v=BaW_jenozKc",
    "https://name:secret@www.youtube.com/watch?v=BaW_jenozKc",
    "https://www.youtube.com.evil.example/watch?v=BaW_jenozKc",
    "https://www.youtube.com./watch?v=BaW_jenozKc",
    "https://127.0.0.1/watch?v=BaW_jenozKc",
    "https://[::1]/watch?v=BaW_jenozKc",
    "https://www.youtube.com\\@evil.example/watch?v=BaW_jenozKc",
    "https://www.youtube.com/watch?v=BaW_jenozKc\n",
    "https://www.youtube.com/%2e%2e/watch?v=BaW_jenozKc",
    "https://www.youtube.com/watch?v=BaW_jenozKc&v=abcdefghijk",
    "https://www.youtube.com/watch?v=BaW_jenozKc&access_token=secret",
    "https://www.youtube.com/watch?v=BaW_jenozKc#https://127.0.0.1",
    `https://www.youtube.com/watch?v=BaW_jenozKc&x=${"a".repeat(4096)}`,
  ])("rejects unsafe or ambiguous URL %s", (input) => {
    expect(parsePlatformUrl("youtube", input).status).toBe("unsupported");
  });

  test.each([
    ["youtube", "https://www.youtube.com/watch?v=BaW_jenozKc&list=PL123"],
    ["youtube", "https://www.youtube.com/live/BaW_jenozKc"],
    ["youtube", "https://www.youtube.com/@creator/videos"],
    ["tiktok", "https://www.tiktok.com/@creator/photo/7421234567890123456"],
    ["tiktok", "https://www.tiktok.com/@creator/live"],
    ["instagram", "https://www.instagram.com/stories/creator/123456789/"],
    ["facebook", "https://www.facebook.com/groups/123/videos/123456789012345"],
    ["x", "https://x.com/i/spaces/123abc"],
    ["pinterest", "https://www.pinterest.com/creator/board/"],
    ["reddit", "https://v.redd.it/abc123"],
    ["vimeo", "https://vimeo.com/123456789?password=secret"],
    ["twitch", "https://www.twitch.tv/videos/123456789"],
    ["dailymotion", "https://www.dailymotion.com/playlist/x123abc"],
    ["linkedin", "https://www.linkedin.com/learning/course/video"],
    ["snapchat", "https://www.snapchat.com/add/creator"],
    ["snapchat", "https://www.snapchat.com/stories/creator/123456"],
  ])("%s rejects excluded source %s", (platformId, input) => {
    expect(parsePlatformUrl(platformId, input).status).toBe("unsupported");
  });

  test("rejects cross-platform input and invalid runtime values without including the input in errors", () => {
    expect(parsePlatformUrl("instagram", canonicalCases[0][1]).status).toBe("unsupported");
    for (const value of [null, {}, 1, "not a URL", "https://user:secret@youtube.com/watch?v=BaW_jenozKc"]) {
      const result = parsePlatformUrl("youtube", value);
      expect(result.status).toBe("unsupported");
      expect(JSON.stringify(result)).not.toContain("secret");
    }
    expect(parsePlatformUrl("unknown", canonicalCases[0][1]).status).toBe("unsupported");
  });
});

describe("platform outbound host policies", () => {
  test.each(platformServices)("permits every accepted source host for $descriptor.platformId", (service) => {
    for (const host of service.descriptor.hosts) {
      expect(matchesEgressHost(host, service.descriptor.egressHosts)).toBe(true);
    }
    for (const host of ["unrelated.example", "127.0.0.1", "localhost", "169.254.169.254"]) {
      expect(matchesEgressHost(host, service.descriptor.egressHosts)).toBe(false);
    }
  });

  test.each([
    ["youtube", "rr1.googlevideo.com"],
    ["instagram", "scontent.cdninstagram.com"],
    ["tiktok", "v16.tiktokcdn.com"],
    ["facebook", "video.fbcdn.net"],
    ["x", "video.twimg.com"],
    ["pinterest", "v.pinimg.com"],
    ["reddit", "v.redd.it"],
    ["vimeo", "video.vimeocdn.com"],
    ["twitch", "d1ndex63qxojbr.cloudfront.net"],
    ["dailymotion", "video.dmcdn.net"],
    ["linkedin", "dms.licdn.com"],
    ["snapchat", "video.sc-cdn.net"],
  ])("%s allows its CDN host %s without allowing lookalikes", (platform, host) => {
    const { egressHosts } = getPlatformService(platform).descriptor;
    expect(matchesEgressHost(host, egressHosts)).toBe(true);
    expect(matchesEgressHost(`${host}.unrelated.example`, egressHosts)).toBe(false);
    expect(matchesEgressHost(host.replaceAll(".", "-"), egressHosts)).toBe(false);
  });

  test("wildcards allow subdomains without granting the bare domain or unrelated CDN tenants", () => {
    const youtube = getPlatformService("youtube").descriptor.egressHosts;
    expect(matchesEgressHost("googlevideo.com", youtube)).toBe(false);
    expect(matchesEgressHost("notgooglevideo.com", youtube)).toBe(false);
    expect(matchesEgressHost("one.two.googlevideo.com", youtube)).toBe(true);
    expect(matchesEgressHost("another.cloudfront.net", getPlatformService("twitch").descriptor.egressHosts)).toBe(
      false,
    );
  });

  test.each([
    [],
    ["*"],
    ["https://youtube.com"],
    ["youtube.com:443"],
    ["youtube.com/path"],
    ["youtube.*"],
    ["localhost"],
    ["127.0.0.1"],
    Array.from({ length: 41 }, (_, index) => `cdn${index}.example`),
  ])("rejects invalid or oversized outbound host policies %#", (...egressHosts) => {
    class InvalidEgressService extends PlatformService {
      descriptor = { ...getPlatformService("youtube").descriptor, egressHosts };
      parseUrl() {
        return this.unsupported();
      }
    }
    expect(() => createPlatformRegistry([new InvalidEgressService()])).toThrow();
  });
});

describe("restricted semantic engine requests", () => {
  test("supports exact inspected formats without exposing arbitrary yt-dlp selectors", () => {
    const service = getPlatformService("youtube");
    const source = parsePlatformUrl("youtube", canonicalCases[0][1]).source;
    const expectedFormat = {
      id: "137+140",
      container: "mp4",
      width: 1920,
      height: 1080,
      fps: 30,
      bytes: null,
      estimatedBytes: true,
      hasAudio: true,
      requiresMerge: true,
      videoCodec: "avc1",
    };
    expect(service.buildEngineRequest(source, "yt-dlp", { quality: "1080", inspect: true })).toMatchObject({
      inspect: true,
    });
    expect(
      service.buildEngineRequest(source, "yt-dlp", {
        quality: "1080",
        inspect: true,
        selectedFormat: "137+140",
        expectedFormat,
      }),
    ).toMatchObject({ selectedFormat: "137+140", expectedFormat });
    expect(() =>
      service.buildEngineRequest(source, "yt-dlp", { quality: "1080", selectedFormat: "137+140" }),
    ).toThrow();
    expect(() =>
      service.buildEngineRequest(source, "yt-dlp", { quality: "1080", selectedFormat: "136+140", expectedFormat }),
    ).toThrow();
    for (const selectedFormat of ["bestvideo/best", "18[height<720]", "137+140+139", "https://source.test"]) {
      expect(() => service.buildEngineRequest(source, "yt-dlp", { quality: "1080", selectedFormat })).toThrow();
    }
    expect(service.buildEngineRequest(source, "cobalt", { quality: "1080", inspect: true })).toMatchObject({
      engine: "cobalt",
      platformId: "youtube",
      inspect: true,
      quality: "1080",
    });
    expect(
      service.buildEngineRequest(source, "cobalt", { quality: "1080", selectedFormat: "137+140", expectedFormat }),
    ).toMatchObject({ selectedFormat: "137+140", expectedFormat });
  });
  test.each(canonicalCases)("%s emits only approved engine options for %s", (platformId, input) => {
    const service = getPlatformService(platformId);
    const { source } = parsePlatformUrl(platformId, input);
    if (!service.enginesFor(source).length) {
      for (const engine of service.descriptor.candidateEngines)
        expect(() => service.buildEngineRequest(source, engine, { quality: "720" })).toThrow();
      return;
    }
    expect(service.buildEngineRequest(source, "yt-dlp", { quality: "720" })).toEqual({
      engine: "yt-dlp",
      url: source.url,
      quality: "720",
      noPlaylist: true,
      sourceId: source.id,
      extractorKeys: service.descriptor.ytDlpExtractors,
      sourceComposition: service.descriptor.singleVideoForms.includes(source.contentForm)
        ? "single-video"
        : "verified-post",
    });
    if (service.descriptor.candidateEngines.includes("cobalt")) {
      expect(service.buildEngineRequest(source, "cobalt", { quality: "1080" })).toEqual({
        engine: "cobalt",
        platformId,
        sourceId: source.id,
        url: source.url,
        quality: "1080",
        sourceComposition: "single-video",
      });
    }
  });

  test("execution routing preserves Cobalt format ownership and source evidence gates", () => {
    const cobaltPlatforms = ["youtube", "tiktok", "instagram", "vimeo", "twitch", "dailymotion"];
    for (const [platform, url] of canonicalCases) {
      const service = getPlatformService(platform);
      const { source } = parsePlatformUrl(platform, url);
      const engines = service.enginesFor(source);
      const enabled =
        service.descriptor.singleVideoForms.includes(source.contentForm) ||
        ["x", "pinterest", "reddit", "linkedin"].includes(platform);
      expect(engines.includes("yt-dlp")).toBe(enabled);
      expect(engines.includes("cobalt")).toBe(enabled && cobaltPlatforms.includes(platform));
      expect(service.enginesFor(source, "cobalt.abc")).toEqual(
        enabled && cobaltPlatforms.includes(platform) ? ["cobalt"] : [],
      );
      if (!cobaltPlatforms.includes(platform))
        expect(() => service.buildEngineRequest(source, "cobalt", { quality: "720" })).toThrow();
      expect(service.enginesFor({ ...source, id: "forged" })).toEqual([]);
    }
  });

  test("Cobalt-owned formats cannot be dispatched to yt-dlp", () => {
    const service = getPlatformService("youtube");
    const { source } = parsePlatformUrl("youtube", canonicalCases[0][1]);
    const expectedFormat = {
      id: "cobalt.720",
      container: "mp4",
      width: 1280,
      height: 720,
      fps: 30,
      bytes: null,
      estimatedBytes: false,
      hasAudio: true,
      requiresMerge: false,
      videoCodec: "avc1",
    };
    const options = { quality: "720", selectedFormat: expectedFormat.id, expectedFormat };
    expect(service.buildEngineRequest(source, "cobalt", options).selectedFormat).toBe(expectedFormat.id);
    expect(() => service.buildEngineRequest(source, "yt-dlp", options)).toThrow();
  });

  test.each(["x", "pinterest", "reddit", "linkedin"])(
    "%s requires original post verification for both inspection and selected download",
    (platformId) => {
      const service = getPlatformService(platformId);
      const { source } = parsePlatformUrl(platformId, canonicalCases.find(([id]) => id === platformId)[1]);
      const expectedFormat = {
        id: "original-720",
        container: "mp4",
        width: 1280,
        height: 720,
        fps: 30,
        bytes: null,
        estimatedBytes: false,
        hasAudio: true,
        requiresMerge: false,
        videoCodec: "avc1",
      };
      expect(service.enginesFor(source)).toEqual(["yt-dlp"]);
      expect(service.enginesFor(source, expectedFormat.id)).toEqual(["yt-dlp"]);
      expect(service.enginesFor(source, "cobalt.abc")).toEqual([]);
      expect(service.buildEngineRequest(source, "yt-dlp", { quality: "720", inspect: true })).toMatchObject({
        inspect: true,
        sourceComposition: "verified-post",
        sourceId: source.id,
      });
      expect(
        service.buildEngineRequest(source, "yt-dlp", {
          quality: "720",
          selectedFormat: expectedFormat.id,
          expectedFormat,
        }),
      ).toMatchObject({ sourceComposition: "verified-post", selectedFormat: expectedFormat.id, expectedFormat });
      for (const unverified of [
        { ...evidence(source), originalComposition: "unknown" },
        { ...evidence(source), sourceId: "another-post" },
        evidence(source, [
          { id: "video", type: "video" },
          { id: "photo", type: "image" },
        ]),
      ])
        expect(service.classifySource(source, unverified).status).toBe("unsupported");
    },
  );

  test("refuses missing capabilities, forged sources and runtime option injection", () => {
    const youtube = getPlatformService("youtube");
    const source = parsePlatformUrl("youtube", canonicalCases[0][1]).source;
    for (const options of [{ quality: "4320" }, { quality: "720", flags: ["--exec"] }, null]) {
      expect(() => youtube.buildEngineRequest(source, "yt-dlp", options)).toThrow();
    }
    for (const forged of [
      { ...source, url: "https://127.0.0.1/" },
      { ...source, id: "different" },
      { ...source, platformId: "instagram" },
    ]) {
      expect(() => youtube.buildEngineRequest(forged, "yt-dlp", { quality: "720" })).toThrow();
    }
    const linkedIn = getPlatformService("linkedin");
    expect(() =>
      linkedIn.buildEngineRequest(parsePlatformUrl("linkedin", canonicalCases[19][1]).source, "cobalt", {
        quality: "720",
      }),
    ).toThrow();
  });
});

function evidence(source, items = [{ id: "media_1", type: "video" }]) {
  return { originalComposition: "complete", sourceId: source.id, items, isLive: false, requiresAuthentication: false };
}

describe("original media composition", () => {
  test.each(canonicalCases)("%s accepts verified finite video evidence for %s", (platformId, input) => {
    const { source } = parsePlatformUrl(platformId, input);
    expect(getPlatformService(platformId).classifySource(source, evidence(source))).toEqual({
      status: "supported",
      items: [{ id: "media_1", type: "video" }],
    });
  });

  test("preserves all five video items on explicitly supported posts", () => {
    for (const [platformId, url] of [
      ["instagram", canonicalCases[5][1]],
      ["x", canonicalCases[9][1]],
    ]) {
      const { source } = parsePlatformUrl(platformId, url);
      const items = Array.from({ length: 5 }, (_, index) => ({ id: `item_${index}`, type: "video" }));
      expect(getPlatformService(platformId).classifySource(source, evidence(source, items))).toEqual({
        status: "supported",
        items,
      });
    }
  });

  test("fails closed on unknown, mixed, restricted, duplicate or oversized composition", () => {
    const service = getPlatformService("instagram");
    const source = parsePlatformUrl("instagram", canonicalCases[5][1]).source;
    const cases = [
      { ...evidence(source), originalComposition: "unknown" },
      { ...evidence(source), sourceId: "different" },
      { ...evidence(source), isLive: true },
      { ...evidence(source), requiresAuthentication: true },
      { ...evidence(source), isLive: "false" },
      evidence(source, []),
      evidence(source, [
        { id: "one", type: "video" },
        { id: "two", type: "image" },
      ]),
      evidence(source, [
        { id: "one", type: "video" },
        { id: "one", type: "video" },
      ]),
      evidence(source, [{ id: "", type: "video" }]),
      evidence(
        source,
        Array.from({ length: 6 }, (_, i) => ({ id: `item_${i}`, type: "video" })),
      ),
      null,
      { items: [{ id: "one", type: "video" }] },
    ];
    for (const value of cases) expect(service.classifySource(source, value).status).toBe("unsupported");
  });

  test("single-video forms do not become playlists from engine output", () => {
    const source = parsePlatformUrl("youtube", canonicalCases[0][1]).source;
    expect(
      getPlatformService("youtube").classifySource(
        source,
        evidence(source, [
          { id: "one", type: "video" },
          { id: "two", type: "video" },
        ]),
      ).status,
    ).toBe("unsupported");
  });
});

test("registry rejects duplicate and mismatched executable identities", () => {
  const youtube = getPlatformService("youtube");
  expect(() => createPlatformRegistry([youtube, youtube])).toThrow();
  class InvalidService extends PlatformService {
    descriptor = { ...youtube.descriptor, definitionKey: "wrong-folder" };
    parseUrl() {
      return { status: "unsupported", code: "unsupported_url", message: "Unsupported." };
    }
  }
  expect(() => createPlatformRegistry([new InvalidService()])).toThrow();
  class DuplicateEngineService extends InvalidService {
    descriptor = { ...youtube.descriptor, candidateEngines: ["yt-dlp", "yt-dlp"] };
  }
  expect(() => createPlatformRegistry([new DuplicateEngineService()])).toThrow();
});

test("a fixture service reuses parsing safeguards, request construction and classification", () => {
  class FixtureService extends PlatformService {
    descriptor = definePlatformDescriptor({
      platformId: "fixture",
      name: "Fixture video",
      description: "Test-only service.",
      hosts: ["fixture.example"],
      egressHosts: ["*.cdn.fixture.example"],
      contentForms: ["video"],
      candidateEngines: ["yt-dlp"],
      ytDlpExtractors: ["Youtube"],
      singleVideoForms: ["video"],
    });
    parseUrl(url) {
      const invalid = this.validateUrl(url);
      if (invalid) return invalid;
      return /^\/video\/[a-z0-9]+$/.test(url.pathname)
        ? this.supported(url, url.pathname.split("/").at(-1), "video")
        : this.unsupported();
    }
  }
  const fixture = new FixtureService();
  const registry = createPlatformRegistry([fixture]);
  expect(registry.getById("fixture")).toBe(fixture);
  expect(matchesEgressHost("fixture.example", fixture.descriptor.egressHosts)).toBe(true);
  expect(matchesEgressHost("video.cdn.fixture.example", fixture.descriptor.egressHosts)).toBe(true);
  const { source } = fixture.parseUrl(new URL("https://fixture.example/video/abc123"));
  expect(fixture.buildEngineRequest(source, "yt-dlp", { quality: "720" }).url).toBe(source.url);
  expect(fixture.classifySource(source, evidence(source)).status).toBe("supported");
  expect(fixture.parseUrl(new URL("https://127.0.0.1/video/abc123")).status).toBe("unsupported");
  expect(getPlatformService("fixture")).toBeUndefined();
});

test("extractor media IDs may differ only when the resolved canonical source matches", () => {
  const service = getPlatformService("instagram");
  const { source } = parsePlatformUrl("instagram", "https://www.instagram.com/reel/ABCDEFG123/");
  expect(
    service.classifySource(source, { ...evidence(source), sourceId: "123456", resolvedSourceUrl: source.url }).status,
  ).toBe("supported");
  expect(
    service.classifySource(source, {
      ...evidence(source),
      resolvedSourceUrl: "https://www.instagram.com/reel/OTHER123/",
    }).status,
  ).toBe("unsupported");
});
