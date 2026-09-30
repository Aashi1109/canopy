import { expect, test } from "vitest";
import { createDownloaderDefinition } from "../lib/tool-framework/downloaderDefinition.ts";
import { platformServices } from "../lib/downloaders/platformRegistry.ts";
import { categoriesForApp } from "../lib/tool-framework/categories.ts";

test.each(platformServices.map((service) => [service.descriptor.platformId, service.descriptor]))(
  "%s produces the shared manual downloader capability without serializing engine policy",
  (platform, descriptor) => {
    const spec = createDownloaderDefinition(descriptor);
    expect(spec.toolId).toBe(descriptor.toolId);
    expect(spec.job).toEqual({
      kind: "download",
      platform,
      platformName: descriptor.name.replace(/\s+video downloader$/i, ""),
    });
    expect(spec.trigger).toEqual({ mode: "manual", actionLabel: "Download video" });
    expect(spec.capabilities).toEqual({ cancel: true, download: true, network: true });
    expect(spec.sharing).toBeUndefined();
    expect(categoriesForApp("downloaders")).toContain(spec.category);
    const serialized = JSON.parse(JSON.stringify(spec));
    expect(serialized).not.toHaveProperty("candidateEngines");
    expect(serialized).not.toHaveProperty("hosts");
    expect(serialized).not.toHaveProperty("parseUrl");
    expect(serialized.job).toEqual(spec.job);
  },
);

test("the definition factory projects a future registered platform without a platform-specific wrapper", () => {
  const descriptor = {
    ...platformServices[0].descriptor,
    name: "Example Video Downloader",
    description: "A supported public video service.",
  };
  const spec = createDownloaderDefinition(descriptor);
  expect(spec.job.platformName).toBe("Example");
  expect(spec.input.label).toBe("Public Example video link");
  expect(spec.description).toBe(descriptor.description);
});
