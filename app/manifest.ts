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
    screenshots: [
      {
        src: "/screenshots/desktop-devtools.png",
        sizes: "2560x1600",
        type: "image/png",
        form_factor: "wide",
        label: "Browse 150+ developer tools",
      },
      {
        src: "/screenshots/feature-invoice.png",
        sizes: "2560x1600",
        type: "image/png",
        form_factor: "wide",
        label: "Generate and preview PDF invoices",
      },
      {
        src: "/screenshots/feature-color-picker.png",
        sizes: "2560x1600",
        type: "image/png",
        form_factor: "wide",
        label: "Pick colors and copy HEX, RGB, or HSL",
      },
      {
        src: "/screenshots/feature-compress-image.png",
        sizes: "2560x1600",
        type: "image/png",
        form_factor: "wide",
        label: "Compress images privately on-device",
      },
      {
        src: "/screenshots/feature-json-formatter.png",
        sizes: "2560x1600",
        type: "image/png",
        form_factor: "wide",
        label: "Format, validate, and inspect JSON",
      },
      {
        src: "/screenshots/desktop-home.png",
        sizes: "2560x1600",
        type: "image/png",
        form_factor: "wide",
        label: "Paperwork, developer, and media utilities in one place",
      },
      {
        src: "/screenshots/mobile-home.png",
        sizes: "1500x2668",
        type: "image/png",
        form_factor: "narrow",
        label: "SmartTools on mobile",
      },
    ],
  };
}
