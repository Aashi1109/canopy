export type MediaKind = "pdf" | "jpeg" | "png" | "webp" | "heic";

export type RuleResult<T extends object = object> = ({ ok: true } & T) | { ok: false; code: string; message: string };

const MIB = 1024 * 1024;

export const MEDIA_LIMITS = {
  images: {
    maxFileBytes: 25 * MIB,
    maxFiles: 50,
    maxTotalBytes: 100 * MIB,
    maxPixels: 100_000_000,
  },
  pdfs: {
    maxFileBytes: 100 * MIB,
    maxMergeFiles: 20,
    maxMergeTotalBytes: 50 * MIB,
    maxStructuralPages: 500,
    maxRasterPages: 200,
  },
} as const;

const MIME_BY_KIND: Record<MediaKind, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

const ACCEPTED_MIMES: Record<MediaKind, readonly string[]> = {
  pdf: ["application/pdf"],
  jpeg: ["image/jpeg", "image/jpg"],
  png: ["image/png"],
  webp: ["image/webp"],
  heic: ["image/heic", "image/heif"],
};

const ALL_KINDS = Object.keys(MIME_BY_KIND) as MediaKind[];
const GENERIC_MIMES = new Set(["", "application/octet-stream"]);
const HEIC_SINGLE_BRANDS = new Set(["heic", "heix", "heif", "mif1"]);
const HEIC_SEQUENCE_BRANDS = new Set(["hevc", "hevx", "heim", "heis", "hevm", "hevs", "msf1"]);

export function detectMediaKind(bytes: Uint8Array): MediaKind | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "webp";
  }
  const brands = readFtypBrands(bytes);
  if (brands.some((brand) => HEIC_SINGLE_BRANDS.has(brand) || HEIC_SEQUENCE_BRANDS.has(brand))) {
    return "heic";
  }
  return null;
}

export function validateMediaSignature(
  bytes: Uint8Array,
  declaredMime: string,
  allowedKinds: readonly MediaKind[] = ALL_KINDS,
): RuleResult<{ kind: MediaKind; mime: string }> {
  const kind = detectMediaKind(bytes);
  if (!kind) {
    return failure("invalid-signature", "The file does not have a supported signature.");
  }
  if (!allowedKinds.includes(kind)) {
    return failure("unsupported-type", "This file type is not supported by this tool.");
  }

  const normalizedMime = declaredMime.trim().toLowerCase();
  if (!GENERIC_MIMES.has(normalizedMime) && !ACCEPTED_MIMES[kind].includes(normalizedMime)) {
    return failure("mime-mismatch", "The file contents do not match its reported type.");
  }
  if (kind === "webp" && isAnimatedWebp(bytes)) {
    return failure("animated-image", "Animated WebP files are not supported. Choose a static image.");
  }
  if (kind === "heic" && readFtypBrands(bytes).some((brand) => HEIC_SEQUENCE_BRANDS.has(brand))) {
    return failure("image-sequence", "Multi-image HEIC sequences are not supported. Choose a single image.");
  }
  return { ok: true, kind, mime: MIME_BY_KIND[kind] };
}

export function validateImageSelection(files: readonly { size: number }[]): RuleResult {
  if (files.length === 0) return failure("no-files", "Choose at least one image.");
  if (files.length > MEDIA_LIMITS.images.maxFiles) {
    return failure("too-many-files", `Choose no more than ${MEDIA_LIMITS.images.maxFiles} images.`);
  }
  const sizes = validSizes(files);
  if (!sizes) return failure("invalid-size", "A selected file has an invalid size.");
  if (sizes.some((size) => size > MEDIA_LIMITS.images.maxFileBytes)) {
    return failure("file-too-large", "Each image must be 25 MiB or smaller.");
  }
  if (sum(sizes) > MEDIA_LIMITS.images.maxTotalBytes) {
    return failure("total-too-large", "The selected images must total 100 MiB or less.");
  }
  return { ok: true };
}

export function validateDecodedImageDimensions(width: number, height: number): RuleResult {
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    return failure("invalid-dimensions", "The image dimensions are invalid.");
  }
  if (width * height > MEDIA_LIMITS.images.maxPixels) {
    return failure("too-many-pixels", "The decoded image must be 100 megapixels or less.");
  }
  return { ok: true };
}

export function validatePdfSelection(
  files: readonly { size: number }[],
  options: { merge?: boolean; pageCount?: number; raster?: boolean } = {},
): RuleResult {
  if (files.length === 0) return failure("no-files", "Choose at least one PDF.");
  const sizes = validSizes(files);
  if (!sizes) return failure("invalid-size", "A selected file has an invalid size.");
  if (sizes.some((size) => size > MEDIA_LIMITS.pdfs.maxFileBytes)) {
    return failure("file-too-large", "Each PDF must be 100 MiB or smaller.");
  }
  if (options.merge) {
    if (files.length > MEDIA_LIMITS.pdfs.maxMergeFiles) {
      return failure("too-many-files", `Merge no more than ${MEDIA_LIMITS.pdfs.maxMergeFiles} PDFs at once.`);
    }
    if (sum(sizes) > MEDIA_LIMITS.pdfs.maxMergeTotalBytes) {
      return failure("total-too-large", "PDFs selected for merging must total 50 MiB or less.");
    }
  }
  if (options.pageCount !== undefined) {
    if (!isPositiveInteger(options.pageCount)) {
      return failure("invalid-page-count", "The PDF page count is invalid.");
    }
    const limit = options.raster ? MEDIA_LIMITS.pdfs.maxRasterPages : MEDIA_LIMITS.pdfs.maxStructuralPages;
    if (options.pageCount > limit) {
      return failure("too-many-pages", `This operation supports at most ${limit} pages.`);
    }
  }
  return { ok: true };
}

export function parsePageRange(input: string, pageCount: number): RuleResult<{ pages: number[] }> {
  if (!isPositiveInteger(pageCount)) {
    throw new RangeError("Page count must be a positive integer.");
  }
  const normalized = input.trim().toLowerCase();
  if (!normalized) return failure("empty-range", "Enter one or more page numbers.");
  if (normalized === "all") {
    return { ok: true, pages: Array.from({ length: pageCount }, (_, index) => index + 1) };
  }

  const pages: number[] = [];
  const seen = new Set<number>();
  for (const rawPart of normalized.split(",")) {
    const part = rawPart.trim();
    if (!part) return failure("invalid-range", "Use page numbers such as 1-3,5,8.");
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) return failure("invalid-range", "Use page numbers such as 1-3,5,8.");
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start > end) {
      return failure("reversed-range", "Page ranges must run from lower to higher pages.");
    }
    if (start < 1 || end > pageCount) {
      return failure("page-out-of-range", `Choose pages between 1 and ${pageCount}.`);
    }
    for (let page = start; page <= end; page += 1) {
      if (seen.has(page)) {
        return failure("duplicate-page", `Page ${page} is selected more than once.`);
      }
      seen.add(page);
      pages.push(page);
    }
  }
  return { ok: true, pages };
}

export function sanitizeBaseName(input: string, fallback = "download") {
  const leaf = input.split(/[\\/]/).at(-1) ?? "";
  const cleaned = leaf
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/^[\s.-]+|[\s.-]+$/g, "")
    .slice(0, 120)
    .replace(/[\s.]+$/g, "");
  const safeFallback = fallback.trim() || "download";
  return !cleaned || isReservedFilename(cleaned) ? safeFallback : cleaned;
}

export function sanitizeFileName(input: string, fallback = "download") {
  const leaf = input.split(/[\\/]/).at(-1) ?? "";
  const dot = leaf.lastIndexOf(".");
  const hasExtension = dot > 0 && dot < leaf.length - 1;
  const base = sanitizeBaseName(hasExtension ? leaf.slice(0, dot) : leaf, fallback);
  if (!hasExtension) return base;
  const extension = leaf
    .slice(dot + 1)
    .replace(/[^a-z0-9]+/gi, "")
    .slice(0, 12);
  return extension ? `${base}.${extension}` : base;
}

export function createOutputFilename(inputName: string, extension: string, suffix?: string) {
  const base = sanitizeBaseName(withoutExtension(inputName));
  const safeSuffix = suffix ? `-${sanitizeBaseName(suffix, "output")}` : "";
  return `${base}${safeSuffix}.${sanitizeExtension(extension)}`;
}

export function createPageOutputFilename(inputName: string, page: number, totalPages: number, extension: string) {
  if (!isPositiveInteger(page) || !isPositiveInteger(totalPages) || page > totalPages) {
    throw new RangeError("Page numbers must be within the document.");
  }
  const width = Math.max(2, String(totalPages).length);
  return createOutputFilename(inputName, extension, `page-${String(page).padStart(width, "0")}`);
}

export function createPageArchiveFilename(inputName: string) {
  return createOutputFilename(inputName, "zip", "pages");
}

export function hasPdfDigitalSignature(bytes: Uint8Array) {
  return containsAscii(bytes, "/ByteRange");
}

function isAnimatedWebp(bytes: Uint8Array) {
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunk = ascii(bytes, offset, 4);
    const size = readUint32LittleEndian(bytes, offset + 4);
    if (chunk === "ANIM" || chunk === "ANMF") return true;
    if (chunk === "VP8X" && size > 0 && offset + 8 < bytes.length) {
      if ((bytes[offset + 8] & 0x02) !== 0) return true;
    }
    const next = offset + 8 + size + (size % 2);
    if (!Number.isSafeInteger(next) || next <= offset || next > bytes.length) break;
    offset = next;
  }
  return false;
}

function readFtypBrands(bytes: Uint8Array) {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== "ftyp") return [];
  const declaredSize = readUint32BigEndian(bytes, 0);
  const end = Math.min(bytes.length, declaredSize >= 16 ? declaredSize : bytes.length);
  const brands = [ascii(bytes, 8, 4)];
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    brands.push(ascii(bytes, offset, 4));
  }
  return brands;
}

function containsAscii(bytes: Uint8Array, value: string) {
  const first = value.charCodeAt(0);
  outer: for (let offset = 0; offset + value.length <= bytes.length; offset += 1) {
    if (bytes[offset] !== first) continue;
    for (let index = 1; index < value.length; index += 1) {
      if (bytes[offset + index] !== value.charCodeAt(index)) continue outer;
    }
    return true;
  }
  return false;
}

function withoutExtension(input: string) {
  const leaf = input.split(/[\\/]/).at(-1) ?? "";
  const dot = leaf.lastIndexOf(".");
  return dot > 0 ? leaf.slice(0, dot) : leaf;
}

function sanitizeExtension(extension: string) {
  const safe = extension
    .replace(/^\.+/, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
  if (!safe) throw new RangeError("Output extension is required.");
  return safe.slice(0, 12);
}

function isReservedFilename(value: string) {
  const stem = value.split(".", 1)[0];
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem);
}

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  let value = "";
  for (let index = offset; index < offset + length && index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
}

function readUint32BigEndian(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function validSizes(files: readonly { size: number }[]) {
  const sizes = files.map(({ size }) => size);
  return sizes.every((size) => Number.isSafeInteger(size) && size >= 0) ? sizes : null;
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function isPositiveInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

function failure(code: string, message: string) {
  return { ok: false as const, code, message };
}
