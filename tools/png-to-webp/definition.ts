import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.png-to-webp",
  app: "media",
  category: "image-conversion",
  keywords: ["png", "webp", "convert", "image", "compress", "transparency", "web", "batch"],
  name: "PNG to WebP",
  description: "Convert PNG images to WebP.",
  input: {
    kind: "files",
    label: "Add PNG images",
    dropzoneDescription: "PNG · up to 50 files · 25 MB each · processed on this device",
    accept: "image/png,.png",
    multiple: true,
    engine: "image",
    maxFiles: 50,
    maxBytes: 26_214_400,
    maxTotalBytes: 104_857_600,
  },
  settings: {
    fields: {
      quality: {
        kind: "slider",
        label: "Quality",
        help: "WebP is encoded lossily here. Raise it for flat graphics and sharp text, lower it for photographs.",
        default: 80,
        min: 30,
        max: 100,
        suffix: "%",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Convert to WebP" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "PN2W", tone: "accent" },
  labels: {
    empty: "Drop up to 50 PNG files (.png, 25 MiB each) to convert them to WebP.",
    ready: "The PNG files and WebP settings are ready.",
    running: "Converting PNG files to WebP…",
  },
  content: {
    howToUse: [
      "Add one or more PNG files. Everything is decoded and re-encoded in your browser, so the images never leave the device.",
      "Pick a quality. Screenshots, logos, and anything with sharp text hold up better at 90 or above; photographs saved as PNG are fine at 80.",
      "Run the conversion and download the WebP files. Transparency is carried across, so a PNG with an alpha channel stays transparent.",
      "Use this to shrink PNG assets for the web: a transparent WebP is usually a fraction of the size of the equivalent PNG.",
    ],
    limitations: [
      "The WebP is encoded lossily, so a PNG that was a pixel-exact master stops being one. Keep the PNG if you need a lossless source to edit.",
      "Flat colour and hard edges are where lossy encoding shows first. If a converted logo or screenshot looks smeared, raise the quality.",
      "Metadata is not carried over. Decoding to raw pixels drops EXIF, GPS, and colour-profile data.",
      "Each image must be 25 MiB or smaller, up to 50 files per run, and no more than 100 megapixels once decoded.",
    ],
    faq: [
      {
        q: "Is transparency preserved?",
        a: "Yes. WebP has an alpha channel, so transparent and semi-transparent pixels survive the conversion unchanged in position and coverage.",
      },
      {
        q: "Can I get a lossless WebP instead?",
        a: "Not from this tool — the encoder here always runs in lossy mode. Setting quality to 100 gets close but is not bit-exact with the source PNG.",
      },
      {
        q: "Why did my file get bigger?",
        a: "PNG already compresses tiny images and flat two-colour graphics extremely well. When the source is that small, WebP's container overhead can win.",
      },
    ],
  },
} as const satisfies ToolSpec;
