/**
 * Raster image decode/encode/transform primitives.
 *
 * Every codec is loaded through `await import(...)` at the call site so a tool
 * only pays for the formats it actually touches. Nothing here knows which tool
 * is calling it.
 */

import { ToolError, type ToolRunFile } from "../run.ts";
import { readToolFile } from "./fileBytes.ts";
import {
  calculateResizeDimensions,
  fitRect,
  normalizeCropRect,
  rotatedDimensions,
  type QuarterTurn,
} from "./geometry.ts";
import {
  validateDecodedImageDimensions,
  validateMediaSignature,
  type MediaKind,
} from "./validation.ts";

export type OutputImageFormat = "jpeg" | "png" | "webp";

export type DecodableImageKind = Exclude<MediaKind, "pdf">;

export type DecodedImage = {
  readonly image: ImageData;
  readonly kind: DecodableImageKind;
};

export type CropRequest = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type FitTarget = {
  readonly width: number;
  readonly height: number;
};

/** The shape `resizeForOptions` reads; a superset of any single tool's form. */
export type ResizeRequest = {
  readonly width?: number;
  readonly height?: number;
  readonly percentage?: number;
  readonly lockAspectRatio: boolean;
  readonly noUpscale: boolean;
  readonly fit: "contain" | "cover" | "stretch";
};

export async function decodeImage(
  file: ToolRunFile,
  allowed: readonly DecodableImageKind[],
): Promise<DecodedImage> {
  const data = await readToolFile(file);
  const bytes = new Uint8Array(data);
  const signature = validateMediaSignature(bytes, file.mime, allowed);
  if (!signature.ok) throw new ToolError(signature.code, signature.message);
  if (signature.kind === "pdf") {
    throw new ToolError("unsupported-type", "Choose a supported image file.");
  }
  let image: ImageData;
  if (signature.kind === "jpeg") {
    const { decode } = await import("@jsquash/jpeg");
    image = await decode(data, { preserveOrientation: true });
  } else if (signature.kind === "png") {
    const { decode } = await import("@jsquash/png");
    image = await decode(data);
  } else if (signature.kind === "webp") {
    const { decode } = await import("@jsquash/webp");
    image = await decode(data);
  } else {
    const { heicTo } = await import("heic-to/csp");
    const bitmap = await heicTo({
      blob: new Blob([data], { type: file.mime }),
      type: "bitmap",
    });
    if (!(bitmap instanceof ImageBitmap)) {
      throw new ToolError("image-sequence", "Multi-image HEIC sequences are not supported.");
    }
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    context2d(canvas).drawImage(bitmap, 0, 0);
    bitmap.close();
    image = imageFromCanvas(canvas);
    canvas.width = 1;
    canvas.height = 1;
  }
  const dimensions = validateDecodedImageDimensions(image.width, image.height);
  if (!dimensions.ok) throw new ToolError(dimensions.code, dimensions.message);
  return { image, kind: signature.kind };
}

export async function encodeImage(
  image: ImageData,
  format: OutputImageFormat,
  quality = 0.8,
  background = "#ffffff",
  pngEffort = 0,
): Promise<ArrayBuffer> {
  if (format === "jpeg") {
    const { encode } = await import("@jsquash/jpeg");
    return encode(flattenImage(image, background), {
      quality: Math.round(clamp(quality, 0.01, 1) * 100),
    });
  }
  if (format === "webp") {
    const { encode } = await import("@jsquash/webp");
    return encode(image, { quality: Math.round(clamp(quality, 0.01, 1) * 100) });
  }
  const { encode } = await import("@jsquash/png");
  const encoded = await encode(image);
  // Conversion is already lossless; only explicit compression needs another pass.
  if (pngEffort <= 0) return encoded;
  const { optimise } = await import("@jsquash/oxipng");
  return optimise(encoded, {
    level: Math.min(6, Math.max(1, Math.round((pngEffort * 2) / 3))),
    interlace: false,
    optimiseAlpha: true,
  });
}

export async function resizeForOptions(
  image: ImageData,
  options: ResizeRequest,
  background: string,
): Promise<ImageData> {
  const calculated = calculateResizeDimensions(image, {
    width: options.width,
    height: options.height,
    percentage: options.percentage,
    lockAspectRatio: options.lockAspectRatio,
    noUpscale: options.noUpscale,
  });
  const hasBox = options.width !== undefined && options.height !== undefined;
  if (hasBox && options.fit !== "stretch") {
    const target = {
      width: options.noUpscale ? Math.min(options.width!, image.width) : options.width!,
      height: options.noUpscale ? Math.min(options.height!, image.height) : options.height!,
    };
    return fitImage(image, target, options.fit, background);
  }
  const { default: resize } = await import("@jsquash/resize");
  return resize(image, {
    width: calculated.width,
    height: calculated.height,
    method: "lanczos3",
    fitMethod: "stretch",
  });
}

export async function fitImage(
  image: ImageData,
  target: FitTarget,
  mode: "contain" | "cover" | "stretch",
  background: string,
): Promise<ImageData> {
  assertCanvasSize(target.width, target.height);
  const placement = fitRect(image, target, mode);
  const { default: resize } = await import("@jsquash/resize");
  const resized = await resize(image, {
    width: Math.max(1, Math.round(placement.width)),
    height: Math.max(1, Math.round(placement.height)),
    method: "lanczos3",
    fitMethod: "stretch",
  });
  const canvas = new OffscreenCanvas(target.width, target.height);
  const context = context2d(canvas);
  context.fillStyle = safeColor(background);
  context.fillRect(0, 0, target.width, target.height);
  const resizedCanvas = canvasFromImage(resized);
  context.drawImage(resizedCanvas, Math.round(placement.x), Math.round(placement.y));
  resizedCanvas.width = 1;
  resizedCanvas.height = 1;
  const output = imageFromCanvas(canvas);
  canvas.width = 1;
  canvas.height = 1;
  return output;
}

export function cropImage(image: ImageData, requested: CropRequest): ImageData {
  const x = Math.max(0, Math.round(requested.x));
  const y = Math.max(0, Math.round(requested.y));
  const crop = normalizeCropRect(
    {
      x,
      y,
      width: Math.max(1, Math.round(requested.width || image.width - x)),
      height: Math.max(1, Math.round(requested.height || image.height - y)),
    },
    image,
  );
  const canvas = new OffscreenCanvas(crop.width, crop.height);
  const source = canvasFromImage(image);
  context2d(canvas).drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );
  source.width = 1;
  source.height = 1;
  const output = imageFromCanvas(canvas);
  canvas.width = 1;
  canvas.height = 1;
  return output;
}

export function rotateImage(image: ImageData, degrees: QuarterTurn): ImageData {
  const dimensions = rotatedDimensions(image.width, image.height, degrees);
  const source = canvasFromImage(image);
  const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
  const context = context2d(canvas);
  context.translate(dimensions.width / 2, dimensions.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(source, -image.width / 2, -image.height / 2);
  source.width = 1;
  source.height = 1;
  const output = imageFromCanvas(canvas);
  canvas.width = 1;
  canvas.height = 1;
  return output;
}

export function flipImage(image: ImageData, axis: "horizontal" | "vertical"): ImageData {
  const source = canvasFromImage(image);
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = context2d(canvas);
  context.translate(
    axis === "horizontal" ? image.width : 0,
    axis === "vertical" ? image.height : 0,
  );
  context.scale(axis === "horizontal" ? -1 : 1, axis === "vertical" ? -1 : 1);
  context.drawImage(source, 0, 0);
  source.width = 1;
  source.height = 1;
  const output = imageFromCanvas(canvas);
  canvas.width = 1;
  canvas.height = 1;
  return output;
}

export function flattenImage(image: ImageData, background: string): ImageData {
  const source = canvasFromImage(image);
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = context2d(canvas);
  context.fillStyle = safeColor(background);
  context.fillRect(0, 0, image.width, image.height);
  context.drawImage(source, 0, 0);
  source.width = 1;
  source.height = 1;
  const output = imageFromCanvas(canvas);
  canvas.width = 1;
  canvas.height = 1;
  return output;
}

export function canvasFromImage(image: ImageData): OffscreenCanvas {
  const canvas = new OffscreenCanvas(image.width, image.height);
  context2d(canvas).putImageData(image, 0, 0);
  return canvas;
}

export function imageFromCanvas(canvas: OffscreenCanvas): ImageData {
  return context2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

export function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new ToolError("canvas-unavailable", "This browser cannot create an image canvas.");
  return context;
}

export function resolveOutputFormat(
  requested: "original" | OutputImageFormat,
  original: DecodableImageKind,
): OutputImageFormat {
  return requested === "original" ? originalOutputFormat(original) : requested;
}

export function originalOutputFormat(kind: DecodableImageKind): OutputImageFormat {
  return kind === "heic" ? "jpeg" : kind;
}

export function extensionFor(format: OutputImageFormat): "jpg" | "png" | "webp" {
  return format === "jpeg" ? "jpg" : format;
}

export function mimeFor(format: OutputImageFormat): string {
  return `image/${format}`;
}

export function assertCanvasSize(width: number, height: number): void {
  const result = validateDecodedImageDimensions(Math.round(width), Math.round(height));
  if (!result.ok) throw new ToolError(result.code, result.message);
}

export function safeColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
