import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.flip-image",
  app: "media",
  category: "image-editing",
  keywords: [
    "flip",
    "image",
    "mirror",
    "horizontal",
    "vertical",
    "reverse",
    "batch",
  ],
  name: "Flip Image",
  description: "Flip images horizontally or vertically.",
  optionsPanel: { collapsible: false },
  input: {
    kind: "files",
    label: "Add images to flip",
    dropzoneDescription:
      "JPG, JPEG, PNG, WebP, HEIC, and HEIF · up to 50 files · 25 MB each · processed on this device",
    accept: "image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif",
    multiple: true,
    engine: "image",
    maxFiles: 50,
    maxBytes: 26_214_400,
    maxTotalBytes: 104_857_600,
  },
  settings: {
    fields: {
      axis: {
        kind: "select",
        label: "Direction",
        help: "Horizontal mirrors left to right, like a mirror. Vertical mirrors top to bottom, like a reflection in water.",
        default: "horizontal",
        choices: [
          { label: "Horizontal", value: "horizontal" },
          { label: "Vertical", value: "vertical" },
        ],
      },
      outputFormat: {
        kind: "select",
        label: "Output format",
        help: "Original keeps each file's own format (HEIC becomes JPG, since HEIC cannot be written here).",
        default: "original",
        choices: [
          { label: "Original", value: "original" },
          { label: "JPG", value: "jpeg" },
          { label: "PNG", value: "png" },
          { label: "WebP", value: "webp" },
        ],
      },
      quality: {
        kind: "slider",
        label: "Quality",
        help: "Applies to JPG and WebP output. PNG is lossless and ignores it.",
        default: 80,
        min: 30,
        max: 100,
        suffix: "%",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Flip images" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "FLIP" },
  labels: {
    empty: "Drop up to 50 JPG, PNG, WebP, HEIC, or HEIF files (25 MiB each) to flip them.",
    ready: "Your flipped images are ready to download.",
    running: "Flipping images…",
  },
  content: {
    howToUse: [
      "Add your images. They are decoded, mirrored, and re-encoded in your browser, so nothing is uploaded.",
      "Choose horizontal to mirror left-to-right — the usual fix for a selfie that came out reversed — or vertical to mirror top-to-bottom.",
      "The same direction is applied to every file in the run, and pixel dimensions are unchanged either way.",
      "Pick an output format and quality, run the flip, and download. Files come out one-for-one, named after their source.",
    ],
    limitations: [
      "Flipping reverses any text, logo, or watermark in the image. Check the result before publishing anything with writing in it.",
      "The whole run shares one direction. Doing both a horizontal and a vertical flip means two runs — or use Rotate Image at 180°, which is the same as flipping both ways.",
      "The mirror is baked into the pixels rather than recorded as a tag, so it cannot be reversed by editing metadata; flip again to get back.",
      "Re-encoding to JPG or WebP loses a little detail each time, and all embedded metadata is dropped.",
      "Each image must be 25 MiB or smaller, up to 50 files per run, and no more than 100 megapixels once decoded.",
    ],
    faq: [
      {
        q: "What is the difference between flipping and rotating?",
        a: "A flip mirrors the image, so it cannot be reproduced by turning the original — text ends up backwards. A rotation only changes which way is up.",
      },
      {
        q: "How do I flip both ways at once?",
        a: "That is exactly a 180° rotation, so use Rotate Image instead of running this tool twice.",
      },
      {
        q: "Does flipping lose quality?",
        a: "The mirror itself is exact — pixels are rearranged, not resampled. Any loss comes only from re-encoding, so pick PNG or a high quality to avoid it.",
      },
    ],
  },
} as const satisfies ToolSpec;
