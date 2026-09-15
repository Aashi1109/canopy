import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.remove-image-metadata",
  app: "media",
  category: "image-editing",
  keywords: [
    "metadata",
    "exif",
    "gps",
    "privacy",
    "strip",
    "orientation",
    "image",
    "batch",
  ],
  name: "Remove Image Metadata",
  description: "Apply image orientation and strip embedded metadata.",
  optionsPanel: { collapsible: false },
  input: {
    kind: "files",
    label: "Add images to remove metadata",
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
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Remove metadata" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "EXIF", tone: "accent" },
  labels: {
    empty:
      "Drop up to 50 JPG, PNG, WebP, HEIC, or HEIF files (25 MiB each) to remove their metadata.",
    ready: "Your images with metadata removed are ready to download.",
    running: "Removing metadata from the images…",
  },
  content: {
    howToUse: [
      "Add JPG, PNG, WebP, or HEIC images. They are decoded to raw pixels and re-encoded in your browser, which is what removes the metadata.",
      "There is nothing to configure: each image keeps its own format and dimensions, so a PNG stays a PNG and a JPG stays a JPG.",
      "Any rotation recorded in EXIF is applied to the pixels before the metadata is discarded, so the image still appears the right way up afterwards.",
      "Run it and download the cleaned files, named with a `-metadata-removed` suffix so they never overwrite the originals you still have.",
    ],
    limitations: [
      "HEIC inputs come out as JPG. There is no HEIC encoder available in the browser, so HEIC is the one format that cannot round-trip.",
      "JPG and WebP inputs are re-encoded lossily at quality 80, which costs a little detail. PNG is re-encoded losslessly.",
      "Colour profiles are stripped along with everything else. Images in a wide-gamut profile can shift in appearance once the profile is gone.",
      "This removes metadata from the file only. It does not alter the picture itself — faces, screens, and landmarks are still visible.",
      "Each image must be 25 MiB or smaller, up to 50 files per run, and no more than 100 megapixels once decoded.",
    ],
    faq: [
      {
        q: "What exactly gets removed?",
        a: "Everything outside the pixels: EXIF including GPS coordinates and camera body and lens, XMP and IPTC blocks, thumbnails, and the colour profile.",
      },
      {
        q: "Will my photos end up rotated wrongly?",
        a: "No. EXIF orientation is baked into the pixel data during decoding, so discarding the tag afterwards leaves the picture correctly oriented.",
      },
      {
        q: "Is this enough before posting a photo publicly?",
        a: "It removes the file-level trail, which is the main leak. The image content itself is untouched, so crop or blur anything identifying separately.",
      },
    ],
  },
} as const satisfies ToolSpec;
