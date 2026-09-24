import { expect, test, vi } from "vitest";
import nextTesting from "next/experimental/testing/server.js";

for (const environment of ["production", "development"]) {
  test(`Media ${environment} headers allow Cloudflare analytics without weakening isolation`, async () => {
    const original = process.env.NODE_ENV;
    let config;
    try {
      process.env.NODE_ENV = environment;
      vi.resetModules();
      config = (await import("../next.config.ts")).default;
    } finally {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    }

    for (const path of ["/media", "/media/extract-pdf-pages"]) {
      const response = await nextTesting.unstable_getResponseFromNextConfig({
        url: `https://smarttools.lol${path}`,
        nextConfig: config,
      });
      const directives = Object.fromEntries(
        response.headers
          .get("Content-Security-Policy")
          .split(";")
          .map((directive) => {
            const [name, ...values] = directive.trim().split(/\s+/);
            return [name, values];
          }),
      );
      expect(directives["script-src"].includes("https://static.cloudflareinsights.com")).toBeTruthy();
      expect(directives["connect-src"].includes("'self'"), "automatic beacons report to /cdn-cgi/rum").toBeTruthy();
      expect(directives["script-src"].includes("'unsafe-eval'")).toBe(environment === "development");
      expect(directives["worker-src"]).toEqual(["'self'", "blob:"]);
      expect(directives["object-src"]).toEqual(["'none'"]);
      expect(directives["frame-ancestors"]).toEqual(["'none'"]);
      expect(response.headers.get("Cross-Origin-Embedder-Policy")).toBe("require-corp");
      expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
      expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    }
  });
}
