import type { MetadataRoute } from "next";

// Web app manifest so the tools install to the home screen and run standalone.
// Icons reuse the existing SVG logo; swap in dedicated 192/512 PNGs if iOS
// home-screen rendering needs raster fallbacks.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SmartTools",
    short_name: "SmartTools",
    description: "Focused utilities for everyday work — usable offline.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [{ src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
