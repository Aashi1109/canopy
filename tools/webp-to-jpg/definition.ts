import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.webp-to-jpg",
  app: "media",
  category: "image-conversion",
  keywords: ["webp", "jpg", "jpeg", "convert", "image", "compatibility", "background", "flatten"],
  name: "WebP to JPG",
  description: "Convert static WebP images to JPG.",
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
        help: "JPG has no transparency, so any transparent pixel in the WebP is flattened onto this colour.",
        default: "#ffffff",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Convert to JPG" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "W2JP" },
  labels: {
    empty: "Drop up to 50 static WebP images (25 MiB each) to convert to JPG.",
    ready: "The WebP images and JPG settings are ready.",
    running: "Converting WebP images…",
  },
  content: {
    howToUse: [
      "Add one or more static WebP files. Decoding and JPG encoding both happen in your browser, so nothing is uploaded.",
      "Pick a quality. 80 suits photographs; raise it when the WebP holds fine text or gradients that JPG would smear.",
      "Choose the background colour. WebP supports transparency and JPG does not, so any transparent area is composited onto this colour.",
      "Run the conversion and download the JPGs — the format to reach for when an editor, printer, or upload form refuses WebP.",
    ],
    limitations: [
      "Animated WebP files are rejected. Only single-frame images convert; extract the frame you want elsewhere first.",
      "Transparency is lost permanently. Set the background to match wherever the image will sit, or keep the WebP if you still need alpha.",
      "Both formats are lossy, so this conversion compounds the loss. Convert from the most original file you have rather than a re-saved copy.",
      "Metadata is dropped: decoding to raw pixels discards EXIF, GPS, and colour-profile data.",
      "Each image must be 25 MiB or smaller, up to 50 files per run, and no more than 100 megapixels once decoded.",
    ],
    faq: [
      {
        q: "Why was my WebP rejected?",
        a: "It is almost certainly animated. Animated WebP is detected from the file's ANIM/ANMF chunks and refused, because a JPG can only hold one frame.",
      },
      {
        q: "Will the JPG be bigger than the WebP?",
        a: "Usually yes. WebP compresses more efficiently at equal quality, so expect the JPG to grow — that is the cost of the wider compatibility.",
      },
      {
        q: "Why is there a white box where my image was transparent?",
        a: "That is the background colour. JPG cannot store an alpha channel, so transparent pixels must be flattened onto something; change the setting to match your page.",
      },
    ],
  },
} as const satisfies ToolSpec;
