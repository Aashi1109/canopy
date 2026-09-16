import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.jpg-to-webp",
  app: "media",
  category: "image-conversion",
  keywords: ["jpg", "jpeg", "webp", "convert", "image", "compress", "web", "batch"],
  name: "JPG to WebP",
  description: "Convert JPG images to WebP.",
  input: {
    kind: "files",
    label: "Add JPG images",
    dropzoneDescription: "JPG and JPEG · up to 50 files · 25 MB each · processed on this device",
    accept: "image/jpeg,image/jpg,.jpg,.jpeg",
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
        help: "WebP is encoded lossily here. 80 usually lands well below the source JPG at the same apparent detail.",
        default: 80,
        min: 30,
        max: 100,
        suffix: "%",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Convert to WebP" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "J2WP", tone: "accent" },
  labels: {
    empty: "Drop up to 50 JPG or JPEG images, 25 MiB each, to convert them to WebP.",
    ready: "JPG-to-WebP settings are ready.",
    running: "Converting JPG and JPEG images to WebP…",
  },
  content: {
    howToUse: [
      "Add one or more JPG files. Decoding and WebP encoding both run in a Web Worker in your browser, so nothing is uploaded.",
      "Pick a quality. 80 is the default and normally produces a WebP noticeably smaller than the source JPG at similar apparent detail.",
      "Run the conversion and download the WebP files. Pixel dimensions are unchanged and each output is named after its source.",
      "Use WebP for images you serve on the web: every current browser supports it, and it beats JPG at the same visual quality.",
    ],
    limitations: [
      "This is a lossy-to-lossy conversion. The JPG already discarded detail and WebP encoding discards a little more, so keep the original if you may re-encode later.",
      "At quality 95 and above the WebP can end up larger than the JPG it came from. Stay near 80 unless you can see a reason not to.",
      "Decoding and re-encoding drops EXIF, GPS, and colour-profile metadata. Rotation recorded in EXIF is baked into the pixels first.",
      "JPG has no alpha channel, so the WebP output is fully opaque even though the format supports transparency.",
      "Each image must be 25 MiB or smaller, up to 50 files per run, and no more than 100 megapixels once decoded.",
    ],
    faq: [
      {
        q: "How much smaller will the WebP be?",
        a: "Typically 25–35% smaller than the JPG at quality 80, though the gain shrinks on JPGs that were already heavily compressed.",
      },
      {
        q: "Does converting to WebP restore quality the JPG lost?",
        a: "No. Detail thrown away by the original JPG encoder cannot come back. WebP only stores what the decoder produced, more efficiently.",
      },
      {
        q: "Will WebP work everywhere?",
        a: "In browsers, yes — Chrome, Firefox, Safari, and Edge have supported it for years. Older desktop image editors and some email clients still do not.",
      },
    ],
  },
} as const satisfies ToolSpec;
