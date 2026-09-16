import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.heic-to-jpg",
  app: "media",
  category: "image-conversion",
  keywords: ["heic", "heif", "jpg", "jpeg", "convert", "iphone", "photo", "batch"],
  name: "HEIC to JPG",
  description: "Convert HEIC images to JPG.",
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
  settings: {
    fields: {
      quality: {
        kind: "slider",
        label: "Quality",
        help: "JPG is lossy. 80 is a good default for phone photos; above 90 the file grows fast for little visible gain.",
        default: 80,
        min: 30,
        max: 100,
        suffix: "%",
      },
      background: {
        kind: "color",
        label: "Background",
        help: "JPG has no transparency, so any transparent pixel is flattened onto this colour.",
        default: "#ffffff",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Convert to JPG" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "H2JP", tone: "accent" },
  labels: {
    empty: "Drop up to 50 HEIC or HEIF images, 25 MiB each, to convert them to JPG.",
    ready: "HEIC-to-JPG settings are ready.",
    running: "Converting HEIC and HEIF images to JPG…",
  },
  content: {
    howToUse: [
      "Add the HEIC or HEIF photos your iPhone or iPad produced. They are decoded and re-encoded in your browser, so the photos are never uploaded.",
      "Pick a quality. 80 is a sensible default for phone photos; go to 90 or above if you plan to print or retouch the result.",
      "Choose the background colour. It only matters for the rare HEIC that carries transparency, since JPG cannot store an alpha channel.",
      "Run the conversion and download the JPGs — the format that every editor, website, and messaging app will accept without complaint.",
    ],
    limitations: [
      "Multi-image HEIC files are rejected. Burst sequences and Live Photo containers hold several frames, and this tool converts single images only.",
      "HEIC and JPG are both lossy, so the conversion compounds the loss. Keep the HEIC as your master if storage allows.",
      "Expect the JPG to be roughly twice the size of the HEIC at comparable quality; HEIC's codec is simply more efficient.",
      "Metadata is not carried over. EXIF, GPS, and colour-profile data are dropped, though orientation is applied to the pixels first.",
      "Each image must be 25 MiB or smaller, up to 50 files per run, and no more than 100 megapixels once decoded.",
    ],
    faq: [
      {
        q: "Why was my photo rejected?",
        a: "Most likely it is a multi-image HEIC — a burst or Live Photo. Those brands are detected in the file header and refused rather than guessing which frame you meant.",
      },
      {
        q: "Are location and camera details kept?",
        a: "No. Decoding to raw pixels discards all EXIF, including GPS coordinates. That is a privacy win when sharing, but export from Photos instead if you need the metadata.",
      },
      {
        q: "Does my photo get uploaded to convert it?",
        a: "No. HEIC decoding runs in a WebAssembly decoder inside a Web Worker on your device; nothing is sent to a server.",
      },
    ],
  },
} as const satisfies ToolSpec;
