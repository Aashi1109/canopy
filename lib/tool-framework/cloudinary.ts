/**
 * SERVER ONLY: this module reads upload credentials and must never be imported
 * by a Client Component. The `server-only` guard package is not installed.
 */

import { v2 as cloudinary } from "cloudinary";
import type { ToolIconRow } from "./icons";

const MAX_ICON_BYTES = 1_048_576;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type CloudinaryCredentials = {
  cloud_name: string;
  api_key: string;
  api_secret: string;
};

export type ToolIconUploadResult = { ok: true; row: ToolIconRow } | { ok: false; reason: string };

function readCredentials(): CloudinaryCredentials | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret };
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes).toLowerCase().includes("<svg");
}

function hasExpectedRasterSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  }
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  );
}

const credentials = readCredentials();
if (credentials) cloudinary.config(credentials);

export async function uploadToolIcon(
  toolId: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<ToolIconUploadResult> {
  if (bytes.byteLength > MAX_ICON_BYTES) {
    return { ok: false, reason: "The icon must be 1 MB or smaller." };
  }

  const normalizedMimeType = mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (normalizedMimeType === "image/svg+xml" || looksLikeSvg(bytes)) {
    return { ok: false, reason: "SVG icons are not supported." };
  }
  if (
    !bytes.byteLength ||
    !ALLOWED_MIME_TYPES.has(normalizedMimeType) ||
    !hasExpectedRasterSignature(bytes, normalizedMimeType)
  ) {
    return { ok: false, reason: "Use a PNG, JPG, or WebP image." };
  }
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(toolId)) {
    return { ok: false, reason: "The tool identifier is invalid." };
  }
  if (!credentials) {
    return { ok: false, reason: "Icon uploads are not configured." };
  }

  try {
    const uploaded = await cloudinary.uploader.upload(
      `data:${normalizedMimeType};base64,${Buffer.from(bytes).toString("base64")}`,
      {
        public_id: `smarttools/tool-icons/${toolId}`,
        overwrite: true,
        invalidate: true,
        resource_type: "image",
        allowed_formats: ["png", "jpg", "webp"],
        format: "png",
        transformation: [{ width: 512, height: 512, crop: "limit" }],
      },
    );

    return {
      ok: true,
      row: {
        toolId,
        publicId: uploaded.public_id,
        version: String(uploaded.version),
        format: "png",
        width: uploaded.width,
        height: uploaded.height,
        updatedAt: new Date(),
      },
    };
  } catch {
    return { ok: false, reason: "The icon could not be uploaded. Try again." };
  }
}
