import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.compress-image",
  app: "media",
  category: "image-editing",
  keywords: [
    "compress",
    "image",
    "optimise",
    "shrink",
    "file size",
    "quality",
    "jpeg",
    "png",
    "webp",
    "batch",
  ],
  name: "Compress Image",
  description: "Reduce image size while keeping its format and dimensions.",
  optionsPanel: { collapsible: false },
  input: {
    kind: "files",
    label: "Add images to compress",
    dropzoneDescription:
      "JPG, JPEG, PNG, WebP, HEIC, and HEIF · up to 50 files · 25 MB each · processed on this device",
    accept:
      "image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif",
    multiple: true,
    engine: "image",
    maxFiles: 50,
    maxBytes: 26_214_400,
    maxTotalBytes: 104_857_600,
  },
  settings: {
    fields: {
      preset: {
        kind: "select",
        label: "Preset",
        help: "Best keeps the most detail, smallest squeezes hardest. Fast and maximum change how long PNG re-packing is allowed to take.",
        default: "balanced",
        choices: [
          { label: "Best quality", value: "best" },
          { label: "Balanced", value: "balanced" },
          { label: "Smallest file", value: "smallest" },
          { label: "Fast", value: "fast" },
          { label: "Maximum compression", value: "maximum" },
        ],
      },
      advancedQuality: {
        kind: "toggle",
        label: "Set quality manually",
        help: "Overrides the preset's quality. The preset still decides how hard PNG files are re-packed.",
        default: false,
      },
      quality: {
        kind: "slider",
        label: "Quality",
        help: "Applies to JPEG and WebP output. 80 is the usual sweet spot; below 60 artefacts become visible.",
        default: 80,
        min: 30,
        max: 100,
        suffix: "%",
        visibleWhen: { key: "advancedQuality", equals: true },
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Compress images" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "IMG-" },
  labels: {
    empty: "Drop up to 50 JPG, PNG, WebP, HEIC, or HEIF files (25 MiB each) to compress them.",
    ready: "Your compressed images are ready to download.",
    running: "Compressing images…",
  },
  content: {
    howToUse: [
      "Add JPG, PNG, or WebP images. Each one is decoded and re-encoded in your browser, so nothing is uploaded.",
      "Pick a preset. Balanced suits most photographs; smallest is for when the byte count matters more than fine detail; fast and maximum trade PNG re-packing time against the final size.",
      "Turn on manual quality only when a preset misses — the slider then replaces the preset's quality for JPEG and WebP, while PNG still follows the preset's effort level.",
      "Run the compression and download. Pixel dimensions and the original format are both preserved, so the output is a drop-in replacement for the input.",
    ],
    limitations: [
      "The format never changes. A PNG photograph stays a PNG and will still be far larger than the same image as JPG — convert it instead if size is the goal.",
      "JPEG and WebP compression is lossy and cumulative. Re-compressing an already-compressed file loses detail again without saving much.",
      "PNG compression is lossless, so the savings come only from better packing. Flat graphics shrink well; photographs barely move.",
      "An already well-optimised file can come out slightly larger than it went in, because the encoder here does not know the settings the original used.",
      "Each image must be 25 MiB or smaller, up to 50 files per run, and no more than 100 megapixels once decoded.",
    ],
    faq: [
      {
        q: "Why did my file get bigger?",
        a: "The image was already compressed harder than the settings you chose. Lower the quality, pick the smallest preset, or keep the original.",
      },
      {
        q: "What is the difference between fast and maximum?",
        a: "Only for PNG: both are lossless, but maximum spends much more time searching for a tighter packing. On a large PNG that can be several seconds per file for a few percent.",
      },
      {
        q: "Are dimensions or metadata changed?",
        a: "Dimensions are untouched. Metadata is dropped, because the image is decoded to raw pixels and re-encoded — use Resize Image if you also need different dimensions.",
      },
    ],
  },
} as const satisfies ToolSpec;
