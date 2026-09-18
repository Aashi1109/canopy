import config from "./lib/config/config.ts";
import publicConfig from "./lib/config/public.ts";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const browserEmptyModule = fileURLToPath(new URL("./lib/paperwork/browserEmptyModule.ts", import.meta.url));
const development = config.environment !== "production";
const sentryOrigin = publicConfig.sentryDsn ? new URL(publicConfig.sentryDsn).origin : "";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://www.googletagmanager.com https://static.cloudflareinsights.com${development ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://res.cloudinary.com https://*.google-analytics.com https://*.googletagmanager.com",
  "font-src 'self'",
  `connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com${sentryOrigin ? ` ${sentryOrigin}` : ""}${development ? " ws: http:" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const mediaSecurityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "camera=(), display-capture=(), geolocation=(), microphone=(), payment=(), usb=()",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
];

const workerIsolationHeaders = [{ key: "Cross-Origin-Embedder-Policy", value: "require-corp" }];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: appRoot,
  outputFileTracingExcludes: {
    "/*": ["./scripts/seed-assets/**/*"],
  },
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  turbopack: {
    resolveAlias: {
      "@": appRoot,
      // Browser shims for Node builtins pulled in transitively by the paperwork
      // PDF stack (@pdfme/*, @react-pdf/renderer, fontkit). No first-party code
      // imports these. Mirrors the webpack() aliases below so `next build` and
      // `next dev` resolve identically.
      module: { browser: "./lib/paperwork/browserEmptyModule.ts" },
      "fs/promises": { browser: "./lib/paperwork/browserEmptyModule.ts" },
      url: { browser: "./lib/paperwork/browserEmptyModule.ts" },
      zlib: { browser: "./lib/paperwork/browserEmptyModule.ts" },
    },
  },
  webpack(config, { isServer, webpack }) {
    config.resolve.alias["@"] = appRoot;
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
      Object.assign(config.resolve.alias, {
        "fs/promises": browserEmptyModule,
        module: browserEmptyModule,
        url: browserEmptyModule,
        zlib: browserEmptyModule,
      });
    }
    return config;
  },
  transpilePackages: [
    "@jsquash/jpeg",
    "@jsquash/oxipng",
    "@jsquash/png",
    "@jsquash/resize",
    "@jsquash/webp",
    "heic-to",
    "pdfjs-dist",
    "qpdf-wasm",
  ],
  async headers() {
    return [
      { source: "/media/:path*", headers: mediaSecurityHeaders },
      {
        source: "/_next/static/chunks/:path*",
        headers: workerIsolationHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: config.sentry.org,
  project: config.sentry.project,
  authToken: config.sentry.authToken,
  release: { name: config.environment ?? "development" },
  silent: !config.ci,
  telemetry: false,
  sourcemaps: {
    // Temporarily disabled to reduce Vercel build memory usage.
    disable: true,
    deleteSourcemapsAfterUpload: true,
  },
});
