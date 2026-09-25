import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test, vi } from "vitest";

vi.mock("../lib/config/config.ts", () => ({
  default: { environment: "production", appUrl: "https://canopy.example", sentry: {}, ci: false },
}));
vi.mock("../lib/config/public.ts", () => ({ default: { sentryDsn: "" } }));
vi.mock("@sentry/nextjs/config", () => ({ withSentryConfig: (config) => config }));

const { default: nextConfig } = await import("../next.config.ts");

test("public precaching excludes Cloudflare headers metadata and preserves browser assets", () => {
  const directory = mkdtempSync(join(tmpdir(), "canopy-precache-"));
  try {
    for (const asset of ["_headers", "favicon.ico", "media/vendor/qpdf/qpdf.wasm", "assets/_headers.txt"]) {
      const path = join(directory, "public", asset);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, "fixture");
    }
    const compilation = nextConfig.webpack(
      {
        resolve: { alias: {} },
        plugins: [],
        output: { path: join(directory, ".next"), publicPath: "/_next/" },
        entry: async () => ({}),
      },
      {
        dir: directory,
        config: {},
        dev: false,
        isServer: false,
        webpack: { DefinePlugin: class {}, NormalModuleReplacementPlugin: class {} },
      },
    );
    const entries = compilation.plugins.flatMap((plugin) => plugin.config?.additionalPrecacheEntries ?? []);
    expect(entries.map(({ url }) => url).sort()).toEqual([
      "/assets/_headers.txt",
      "/favicon.ico",
      "/media/vendor/qpdf/qpdf.wasm",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
