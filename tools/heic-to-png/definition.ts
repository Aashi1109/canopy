import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.heic-to-png",
  app: "media",
  category: "image-conversion",
  keywords: ["heic", "heif", "png", "convert", "iphone", "photo", "lossless", "batch"],
  name: "HEIC to PNG",
  description: "Convert HEIC images to PNG.",
  input: {
    kind: "files",
    label: "Add HEIC images",
    dropzoneDescription: "HEIC and HEIF · up to 50 files · 25 MB each · processed on this device",
    accept: "image/heic,image/heif,.heic,.heif",
    multiple: true,
    engine: "image",
    maxFiles: 50,
    maxBytes: 26_214_400,
    maxTotalBytes: 104_857_600,
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Convert to PNG" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "H2PN", tone: "accent" },
  labels: {
    empty: "Drop up to 50 HEIC or HEIF images, 25 MiB each, to convert them to PNG.",
    ready: "HEIC images are ready to convert to PNG.",
    running: "Converting HEIC and HEIF images to PNG…",
  },
  content: {
    howToUse: [
      "Add the HEIC or HEIF photos your iPhone or iPad produced. Decoding and PNG encoding run in your browser, so nothing is uploaded.",
      "There is nothing to configure: PNG is lossless and the original pixel dimensions are kept, so the output matches the decoded HEIC exactly.",
      "Run the conversion and download the PNGs. Each is named after its source, so a batch stays easy to match up.",
      "Choose PNG over JPG here when the photo is going into further editing and you do not want a second round of lossy compression.",
    ],
    limitations: [
      "Multi-image HEIC files are rejected. Bursts and Live Photo containers hold several frames, and this tool converts single images only.",
      "PNG files from phone photos are large — often five to ten times the HEIC. PNG stores every pixel losslessly, and photographs do not compress that way.",
      "Converting to PNG cannot recover detail HEIC's lossy encoder discarded; it only prevents further loss from here on.",
      "Metadata is dropped. EXIF, GPS, and colour-profile data do not survive decoding, though recorded orientation is applied to the pixels.",
      "Each image must be 25 MiB or smaller, up to 50 files per run, and no more than 100 megapixels once decoded.",
    ],
    faq: [
      {
        q: "PNG or JPG for my iPhone photos?",
        a: "JPG for sharing and storage; PNG when the photo goes straight into an editor, or when a tool in your pipeline only reads PNG.",
      },
      {
        q: "Why was my photo rejected?",
        a: "Almost certainly a multi-image HEIC — a burst or Live Photo. Those brands are detected in the file header and refused rather than guessing which frame you wanted.",
      },
      {
        q: "Is my location data removed?",
        a: "Yes. The image is decoded to raw pixels and re-encoded, so GPS coordinates and every other EXIF field are gone from the PNG.",
      },
    ],
  },
} as const satisfies ToolSpec;
