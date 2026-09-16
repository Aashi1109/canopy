import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.png-to-jpg",
  app: "media",
  category: "image-conversion",
  keywords: ["png", "jpg", "jpeg", "convert", "image", "compress", "background", "flatten"],
  name: "PNG to JPG",
  description: "Convert PNG images to JPG with a chosen background.",
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
        help: "JPG is lossy. 80 is a good default; above 90 the file grows fast for little visible gain.",
        default: 80,
        min: 30,
        max: 100,
        suffix: "%",
      },
      background: {
        kind: "color",
        label: "Background",
        help: "JPG has no transparency, so transparent pixels are flattened onto this colour.",
        default: "#ffffff",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Convert to JPG" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "PN2J", tone: "accent" },
  labels: {
    empty: "Drop up to 50 PNG files (.png, 25 MiB each) to convert them to JPG.",
    ready: "The PNG files and JPG settings are ready.",
    running: "Converting PNG files to JPG…",
  },
  content: {
    howToUse: [
      "Add one or more PNG files. Decoding and encoding both happen in your browser, so nothing is uploaded.",
      "Pick a quality. 80 suits photographs and screenshots; raise it for images with fine text or gradients, lower it when file size matters more than detail.",
      "Choose the background colour. Any transparent area in the PNG is composited onto it, because JPG cannot store an alpha channel.",
      "Run the conversion and download the JPGs. Original pixel dimensions are preserved.",
    ],
    limitations: [
      "Transparency is lost permanently. Pick the background colour to match wherever the image will sit, or keep the PNG if you still need alpha.",
      "JPG is lossy, so every conversion discards detail. Convert from the original PNG rather than re-converting a JPG.",
      "Flat graphics, logos, and screenshots with sharp edges pick up visible ringing in JPG. PNG or WebP is usually the better output for those.",
      "Each image must be 25 MiB or smaller, up to 50 files per run, and no more than 100 megapixels once decoded.",
    ],
    faq: [
      {
        q: "Why did my transparent PNG come out with a white box?",
        a: "That is the background colour being applied. JPG has no transparency, so the alpha channel has to be flattened onto something — change the background setting to match your page.",
      },
      {
        q: "What quality should I use?",
        a: "80 is the default for good reason. Use 90 or above for print or heavy retouching, and 60–70 only when the file has to be small and the image is a photograph.",
      },
      {
        q: "Is any metadata carried over?",
        a: "No. The image is decoded to raw pixels and re-encoded, which drops EXIF, GPS, and colour-profile data.",
      },
    ],
  },
} as const satisfies ToolSpec;
