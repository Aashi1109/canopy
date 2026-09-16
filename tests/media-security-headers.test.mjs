import assert from "node:assert/strict";
import test from "node:test";
import nextTesting from "next/experimental/testing/server.js";

for (const environment of ["production", "development"]) {
  test(`Media ${environment} headers allow Cloudflare analytics without weakening isolation`, async () => {
    const original = process.env.NODE_ENV;
    let config;
    try {
      process.env.NODE_ENV = environment;
      config = (await import(`../next.config.ts?environment=${environment}`)).default;
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
      assert.ok(directives["script-src"].includes("https://static.cloudflareinsights.com"));
      assert.ok(directives["connect-src"].includes("'self'"), "automatic beacons report to /cdn-cgi/rum");
      assert.equal(directives["script-src"].includes("'unsafe-eval'"), environment === "development");
      assert.deepEqual(directives["worker-src"], ["'self'", "blob:"]);
      assert.deepEqual(directives["object-src"], ["'none'"]);
      assert.deepEqual(directives["frame-ancestors"], ["'none'"]);
      assert.equal(response.headers.get("Cross-Origin-Embedder-Policy"), "require-corp");
      assert.equal(response.headers.get("Cross-Origin-Opener-Policy"), "same-origin");
      assert.equal(response.headers.get("Cross-Origin-Resource-Policy"), "same-origin");
    }
  });
}
