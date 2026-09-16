import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.rotate-image",
  app: "media",
  category: "image-editing",
  keywords: ["rotate", "image", "turn", "orientation", "90", "180", "270", "batch"],
  name: "Rotate Image",
  description: "Rotate images by 90, 180, or 270 degrees.",
  optionsPanel: { collapsible: false },
  input: {
    kind: "files",
    label: "Add images to rotate",
    dropzoneDescription:
      "JPG, JPEG, PNG, WebP, HEIC, and HEIF · up to 50 files · 25 MB each · processed on this device",
    accept: "image/jpeg,image/jpg,.jpg,.jpeg,image/png,.png,image/webp,.webp,image/heic,image/heif,.heic,.heif",
    multiple: true,
    engine: "image",
    maxFiles: 50,
    maxBytes: 26_214_400,
    maxTotalBytes: 104_857_600,
  },
  settings: {
    fields: {
      degrees: {
        kind: "select",
        label: "Rotation",
        help: "Clockwise. Every image in the run is turned by the same amount.",
        default: "90",
        choices: [
          { label: "90° clockwise", value: "90" },
          { label: "180°", value: "180" },
          { label: "270° clockwise", value: "270" },
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
  trigger: { mode: "manual", actionLabel: "Rotate images" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "I90", tone: "accent" },
  labels: {
    empty: "Drop up to 50 JPG, PNG, WebP, HEIC, or HEIF images (25 MiB each) to rotate.",
    ready: "Your rotated images are ready to download.",
    running: "Rotating images…",
  },
  content: {
    howToUse: [
      "Add your images. They are decoded, turned, and re-encoded in your browser, so nothing is uploaded.",
      "Pick 90°, 180°, or 270° clockwise. Rotation is applied to every file in the run, so group images that need the same turn together.",
      "A 90° or 270° turn swaps width and height; 180° keeps the dimensions and simply puts the image the right way up.",
      "Choose an output format and quality, run the rotation, and download. Files are produced one-for-one and named after their source.",
    ],
    limitations: [
      "Only quarter turns are available. Straightening a photograph by a few degrees needs resampling and cropping, which this tool does not do.",
      "The rotation is baked into the pixels, not written as an EXIF orientation tag, so it survives everywhere — but it also cannot be undone by clearing a tag.",
      "The whole run shares one angle. Images that each need a different turn have to be done in separate runs.",
      "Re-encoding to JPG or WebP loses a little detail each time, and all embedded metadata is dropped.",
      "Each image must be 25 MiB or smaller, up to 50 files per run, and no more than 100 megapixels once decoded.",
    ],
    faq: [
      {
        q: "My photo already looked upright — why did rotating make it sideways?",
        a: "EXIF orientation is applied when the file is decoded, so the preview you saw was already corrected. The rotation you choose is then applied on top of that.",
      },
      {
        q: "Does rotating reduce quality?",
        a: "The turn itself is exact — pixels are moved, not resampled. Any loss comes only from re-encoding, so choose PNG or a high quality to keep it negligible.",
      },
      {
        q: "Why did the width and height swap?",
        a: "A 90° or 270° turn puts the long side where the short side was. Use 180° if the dimensions have to stay as they were.",
      },
    ],
  },
} as const satisfies ToolSpec;
