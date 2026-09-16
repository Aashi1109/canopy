import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.webp-to-png",
  app: "media",
  category: "image-conversion",
  keywords: ["webp", "png", "convert", "image", "lossless", "transparency", "compatibility", "batch"],
  name: "WebP to PNG",
  description: "Convert static WebP images to PNG.",
  input: {
    kind: "files",
    label: "Add WebP images",
    dropzoneDescription: "WebP · up to 50 files · 25 MB each · processed on this device",
    accept: "image/webp,.webp",
    multiple: true,
    engine: "image",
    maxFiles: 50,
    maxBytes: 26_214_400,
    maxTotalBytes: 104_857_600,
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Convert to PNG" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "W2PN" },
  labels: {
    empty: "Drop up to 50 static WebP images (25 MiB each) to convert to PNG.",
    ready: "The WebP images are ready to convert to PNG.",
    running: "Converting WebP images…",
  },
  content: {
    howToUse: [
      "Add one or more static WebP files. Everything is decoded and re-encoded in your browser, so nothing is uploaded.",
      "There is nothing to configure: PNG is lossless and the original pixel dimensions are kept, so the output matches the decoded WebP exactly.",
      "Run the conversion and download the PNGs. Transparency is preserved, because both formats carry a full alpha channel.",
      "Reach for this when something in your pipeline — an older editor, a print workflow, an upload form — will not accept WebP.",
    ],
    limitations: [
      "Animated WebP files are rejected. PNG holds a single frame, so only static images convert.",
      "The PNG will normally be several times larger than the WebP. Lossless storage of an image that was lossily compressed keeps the artefacts and adds bytes.",
      "Converting to PNG cannot undo the WebP encoder's losses; it only stops further quality being discarded.",
      "Decoding to raw pixels drops EXIF, GPS, and colour-profile metadata.",
      "Each image must be 25 MiB or smaller, up to 50 files per run, and no more than 100 megapixels once decoded.",
    ],
    faq: [
      {
        q: "Does transparency survive?",
        a: "Yes. Both WebP and PNG store per-pixel alpha, so transparent and semi-transparent areas come across unchanged.",
      },
      {
        q: "Why is the PNG so much larger?",
        a: "PNG is lossless: it records every pixel the WebP decoder produced, including its compression artefacts. Photographic content compresses poorly this way.",
      },
      {
        q: "Can I convert an animated WebP?",
        a: "Not here. The animation is detected and the file refused rather than silently exporting only the first frame.",
      },
    ],
  },
} as const satisfies ToolSpec;
