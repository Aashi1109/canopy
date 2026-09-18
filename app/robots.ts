import config from "@canopy/config";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = config.appUrl;

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }],
    sitemap: new URL("/sitemap.xml", base).toString(),
  };
}
