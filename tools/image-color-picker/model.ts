import { rgbToHex, rgbToHsl } from "../../lib/devtools/shared/color.ts";
import { ToolError } from "../../lib/tool-framework/run.ts";

export function validateImageFile(file: { type: string; size: number }) {
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type))
    throw new ToolError("unsupported-image", "Choose a PNG, JPEG, WebP, or GIF image.");
  if (file.size <= 0 || file.size > 20 * 1024 * 1024)
    throw new ToolError("image-size", "Choose a nonempty image smaller than 20 MB.");
}

export function pixelCoordinates(
  left: number,
  top: number,
  displayedWidth: number,
  displayedHeight: number,
  width: number,
  height: number,
) {
  return {
    x: Math.max(0, Math.min(width - 1, Math.floor((left / displayedWidth) * width))),
    y: Math.max(0, Math.min(height - 1, Math.floor((top / displayedHeight) * height))),
  };
}

export function pixelColorValues(canvas: HTMLCanvasElement, x: number, y: number) {
  const context = canvas.getContext("2d");
  if (!context) throw new ToolError("canvas-unavailable", "Image sampling is unavailable in this browser.");
  const rgba = context.getImageData(x, y, 1, 1).data;
  const color = { red: rgba[0], green: rgba[1], blue: rgba[2], alpha: rgba[3] / 255 };
  const hex = rgbToHex(color);
  return {
    hex,
    entries: [
      { label: "Pixel", value: `${x}, ${y}` },
      { label: "HEX", value: hex },
      {
        label: "RGB",
        value: `rgb(${color.red} ${color.green} ${color.blue}${color.alpha < 1 ? ` / ${Number(color.alpha.toFixed(3))}` : ""})`,
      },
      { label: "HSL", value: rgbToHsl(color) },
    ],
  };
}

export function paletteFromPixels(pixels: Uint8ClampedArray, count: number): { hex: string; share: number }[] {
  const buckets = new Map<number, { weight: number; red: number; green: number; blue: number }>();
  let total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    if (!alpha) continue;
    const key = ((pixels[i] >> 3) << 10) | ((pixels[i + 1] >> 3) << 5) | (pixels[i + 2] >> 3);
    const bucket = buckets.get(key) ?? { weight: 0, red: 0, green: 0, blue: 0 };
    bucket.weight += alpha;
    bucket.red += pixels[i] * alpha;
    bucket.green += pixels[i + 1] * alpha;
    bucket.blue += pixels[i + 2] * alpha;
    buckets.set(key, bucket);
    total += alpha;
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1].weight - a[1].weight || a[0] - b[0])
    .slice(0, Math.max(1, Math.min(12, Math.round(count))))
    .map(([, bucket]) => ({
      hex: rgbToHex({
        red: Math.round(bucket.red / bucket.weight),
        green: Math.round(bucket.green / bucket.weight),
        blue: Math.round(bucket.blue / bucket.weight),
        alpha: 1,
      }),
      share: Number(((bucket.weight / total) * 100).toFixed(1)),
    }));
}

type DecodedImage = { canvas: HTMLCanvasElement; width: number; height: number; palettePixels: Uint8ClampedArray };
const decoded = new WeakMap<File, Promise<DecodedImage>>();

/** Reuse a local decoded image when only sampling coordinates change. */
export async function decodeImage(file: File, signal?: AbortSignal): Promise<DecodedImage> {
  validateImageFile(file);
  signal?.throwIfAborted();
  let pending = decoded.get(file);
  if (!pending) {
    pending = (async () => {
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        throw new ToolError("image-decode", "This image could not be read. Try another image or export it as PNG.");
      }
      try {
        if (bitmap.width * bitmap.height > 24_000_000 || !bitmap.width || !bitmap.height)
          throw new ToolError("image-dimensions", "Choose an image with no more than 24 million pixels.");
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new ToolError("canvas-unavailable", "Image sampling is unavailable in this browser.");
        context.drawImage(bitmap, 0, 0);
        const thumb = document.createElement("canvas");
        const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
        thumb.width = Math.max(1, Math.round(bitmap.width * scale));
        thumb.height = Math.max(1, Math.round(bitmap.height * scale));
        const thumbContext = thumb.getContext("2d", { willReadFrequently: true });
        if (!thumbContext) throw new ToolError("canvas-unavailable", "Image sampling is unavailable in this browser.");
        thumbContext.drawImage(bitmap, 0, 0, thumb.width, thumb.height);
        return {
          canvas,
          width: bitmap.width,
          height: bitmap.height,
          palettePixels: thumbContext.getImageData(0, 0, thumb.width, thumb.height).data,
        };
      } finally {
        bitmap.close();
      }
    })();
    decoded.set(file, pending);
    pending.catch(() => decoded.delete(file));
  }
  const image = await pending;
  signal?.throwIfAborted();
  return image;
}
