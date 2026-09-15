import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.social-media-image-resizer",
  app: "media",
  category: "image-editing",
  keywords: [
    "social media",
    "resize",
    "instagram",
    "story",
    "reel",
    "youtube",
    "thumbnail",
    "linkedin",
    "facebook",
    "aspect ratio",
  ],
  name: "Social Media Image Resizer",
  description: "Resize images to common social media dimensions.",
  optionsPanel: { collapsible: false },
  input: {
    kind: "files",
    label: "Add images to resize",
    dropzoneDescription:
      "JPG, JPEG, PNG, WebP, HEIC, and HEIF · up to 50 files · 25 MB each · processed on this device",
    accept:
      "image/jpeg,image/jpg,.jpg,.jpeg,image/png,.png,image/webp,.webp,image/heic,image/heif,.heic,.heif",
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
        label: "Platform size",
        help: "Every image is fitted to this exact pixel size, whatever it started as.",
        default: "instagram-square",
        choices: [
          {
            label: "Instagram square · 1080 × 1080",
            value: "instagram-square",
            aspectRatio: 1,
          },
          {
            label: "Instagram portrait · 1080 × 1350",
            value: "instagram-portrait",
            aspectRatio: 1080 / 1350,
          },
          { label: "Story / Reel · 1080 × 1920", value: "story-reel", aspectRatio: 1080 / 1920 },
          {
            label: "YouTube thumbnail · 1280 × 720",
            value: "youtube-thumbnail",
            aspectRatio: 1280 / 720,
          },
          { label: "X landscape · 1600 × 900", value: "x-landscape", aspectRatio: 1600 / 900 },
          {
            label: "LinkedIn landscape · 1200 × 627",
            value: "linkedin-landscape",
            aspectRatio: 1200 / 627,
          },
          {
            label: "Facebook landscape · 1200 × 630",
            value: "facebook-landscape",
            aspectRatio: 1200 / 630,
          },
        ],
      },
      fit: {
        kind: "select",
        label: "Fit",
        help: "Cover fills the frame and crops whatever does not fit. Contain keeps the whole image and pads the gaps with the background colour.",
        default: "cover",
        choices: [
          { label: "Cover (crop to fill)", value: "cover" },
          { label: "Contain (pad to fit)", value: "contain" },
        ],
      },
      background: {
        kind: "color",
        label: "Background",
        help: "Fills the padding left by contain, and replaces transparency when the output is JPG.",
        default: "#ffffff",
      },
      outputFormat: {
        kind: "select",
        label: "Output format",
        help: "PNG is lossless and keeps flat colour crisp. JPG is smaller for photographs. WebP is smaller still where the platform accepts it.",
        default: "png",
        choices: [
          { label: "PNG", value: "png" },
          { label: "JPG", value: "jpeg" },
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
  trigger: { mode: "manual", actionLabel: "Resize images" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "1:1", tone: "accent" },
  labels: {
    empty:
      "Drop up to 50 JPG, PNG, WebP, HEIC, or HEIF images (25 MiB each) to resize for social media.",
    ready: "Your resized images are ready to download.",
    running: "Resizing social media images…",
  },
  content: {
    howToUse: [
      "Add your images. Everything is decoded, fitted, and re-encoded in your browser, so nothing is uploaded.",
      "Pick the platform size you are publishing to. Each output is produced at exactly those pixel dimensions regardless of what the source image measured.",
      "Choose cover when the subject is central and you can afford to lose the edges, or contain when nothing may be cropped — contain pads the leftover space with the background colour.",
      "Set the background, output format, and quality, then run and download. Each file is named after its source with the chosen preset appended, so a batch stays easy to sort.",
    ],
    limitations: [
      "Cover crops from the centre. There is no way to choose the crop point, so an off-centre subject may lose its head — use contain if the framing is tight.",
      "Small sources are enlarged to reach the target size and will look soft. Start from an image at least as large as the preset in both dimensions.",
      "Contain always pads with a solid colour; transparent padding is not offered even when the output is PNG.",
      "Platform requirements change. The presets cover the common sizes at the time of writing, not every placement each network supports.",
      "Each image must be 25 MiB or smaller, up to 50 files per run, and no more than 100 megapixels once decoded.",
    ],
    faq: [
      {
        q: "Which fit should I use?",
        a: "Cover for photographs, because the frame is filled edge to edge. Contain for logos, screenshots, and anything with text near the border, where losing an edge would ruin it.",
      },
      {
        q: "Can I make one image for several platforms at once?",
        a: "Not in a single run — each run uses one preset. Run the same files again with a different preset; the preset name in each filename keeps the outputs apart.",
      },
      {
        q: "Why does my image look stretched or soft?",
        a: "It is never stretched: the aspect ratio is always preserved. Softness means the source was smaller than the target and had to be enlarged, so supply a larger original.",
      },
    ],
  },
} as const satisfies ToolSpec;
