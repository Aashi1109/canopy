import { expect, test } from "@playwright/test";
import { parse } from "node-html-parser";

for (const pathname of ["/", "/devtools", "/devtools/open-graph-preview", "/media/split-pdf"]) {
  test(`${pathname} publishes a fetchable social image for crawlers`, async ({ request, baseURL }) => {
    const response = await request.get(pathname, {
      headers: { "user-agent": "facebookexternalhit/1.1" },
    });
    expect(response.ok()).toBe(true);
    const head = parse(await response.text()).querySelector("head");
    const content = (attribute: string, name: string) =>
      head?.querySelector(`meta[${attribute}="${name}"]`)?.getAttribute("content");

    const imageUrl = content("property", "og:image");
    expect(imageUrl).toMatch(/^https?:\/\//);
    expect(content("property", "og:image:width")).toBe("1200");
    expect(content("property", "og:image:height")).toBe("630");
    expect(content("property", "og:image:alt")).toBeTruthy();
    expect(content("name", "twitter:image")).toBe(imageUrl);
    expect(content("name", "twitter:card")).toBe("summary_large_image");

    // Fetch from the server under test even when APP_URL points at the production origin.
    const imagePath = new URL(imageUrl!);
    const image = await request.get(new URL(imagePath.pathname + imagePath.search, baseURL).href);
    expect(image.ok()).toBe(true);
    expect(image.headers()["content-type"]).toContain("image/png");
    const png = await image.body();
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(png.length).toBeLessThan(5 * 1024 * 1024);
  });
}
