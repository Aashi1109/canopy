/** Server-only: upload credentials and authorization must never reach clients. */
import config from "../config/config.ts";
import { randomUUID } from "node:crypto";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { db } from "../../db/index.ts";
import { AuthorizationError } from "../admin/index.ts";
import { cloudinaryFolder } from "../cloudinary/paths.ts";
import { requireTransactionPermission, writeAudit } from "../admin/adminMutations.ts";
import { BlogValidationError, validateBlogImage, type BlogImage } from "./document.ts";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Only messages authored here are safe to return to the upload UI. */
export class BlogImageUploadError extends Error {
  readonly code:
    | "UPLOAD_NOT_CONFIGURED"
    | "UPLOAD_CONFIGURATION_ERROR"
    | "UPLOAD_REJECTED"
    | "UPLOAD_TEMPORARY_FAILURE"
    | "UPLOAD_INVALID_RESPONSE"
    | "UPLOAD_FINALIZATION_FAILED";
  constructor(code: BlogImageUploadError["code"], message: string) {
    super(message);
    this.name = "BlogImageUploadError";
    this.code = code;
  }
}

async function imageBytes(file: File): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (!(file instanceof File)) throw new BlogValidationError("Choose a JPEG, PNG or WebP file.");
  if (!file.size || file.size > MAX_IMAGE_BYTES)
    throw new BlogValidationError("Images must be nonempty and no larger than 5 MiB.");
  const mimeType = file.type.split(";", 1)[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType))
    throw new BlogValidationError("Use a JPEG, PNG or WebP image.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size || bytes.byteLength > MAX_IMAGE_BYTES)
    throw new BlogValidationError("Image size is invalid.");
  let valid = false;
  if (mimeType === "image/png") {
    valid =
      bytes.length >= 24 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte) &&
      String.fromCharCode(...bytes.subarray(12, 16)) === "IHDR";
  } else if (mimeType === "image/jpeg") {
    valid = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  } else {
    valid =
      bytes.length >= 20 &&
      String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP" &&
      ["VP8 ", "VP8L", "VP8X"].includes(String.fromCharCode(...bytes.subarray(12, 16))) &&
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) === bytes.byteLength - 8;
  }
  if (!valid) throw new BlogValidationError("Image content does not match its JPEG, PNG or WebP file type.");
  return { bytes, mimeType };
}

export async function uploadBlogImage(actorUserId: string, file: File): Promise<BlogImage> {
  try {
    await db.transaction((transaction) => requireTransactionPermission(transaction, actorUserId, "blog", "edit"));
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    throw new BlogImageUploadError(
      "UPLOAD_TEMPORARY_FAILURE",
      "Image upload access could not be checked. Try uploading again.",
    );
  }
  const { bytes, mimeType } = await imageBytes(file);
  const cloudName = config.cloudinary.cloudName?.trim();
  const apiKey = config.cloudinary.apiKey?.trim();
  const apiSecret = config.cloudinary.apiSecret?.trim();
  if (!cloudName || !/^[a-zA-Z0-9_-]+$/.test(cloudName) || !apiKey || !apiSecret)
    throw new BlogImageUploadError(
      "UPLOAD_NOT_CONFIGURED",
      "Image uploads are not configured. Ask an administrator to configure the Cloudinary cloud name, API key and API secret on the server.",
    );
  const folder = cloudinaryFolder("blog");
  const publicId = `${folder}/${randomUUID()}`;
  let image: BlogImage;
  let uploaded: UploadApiResponse;
  // Avoid holding database locks over the provider request. Its decoder rejects
  // truncated/corrupt images after our bounded MIME and signature checks.
  try {
    uploaded = await cloudinary.uploader.upload(`data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`, {
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      public_id: publicId,
      asset_folder: folder,
      resource_type: "image",
      type: "upload",
      overwrite: false,
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
    });
  } catch (error) {
    // The SDK rejects HTTP errors directly but wraps transport failures in { error }.
    const failure =
      typeof error === "object" &&
      error !== null &&
      "error" in error &&
      typeof error.error === "object" &&
      error.error !== null
        ? error.error
        : error;
    const status =
      typeof failure === "object" && failure !== null && "http_code" in failure ? failure.http_code : undefined;
    const code = typeof failure === "object" && failure !== null && "code" in failure ? failure.code : undefined;
    if (status === 401 || status === 403 || status === 404)
      throw new BlogImageUploadError(
        "UPLOAD_CONFIGURATION_ERROR",
        "Image storage denied this upload. Ask an administrator to check the Cloudinary account, credentials and upload permissions.",
      );
    if (status === 400 || status === 413 || status === 415)
      throw new BlogImageUploadError(
        "UPLOAD_REJECTED",
        "Image storage rejected this file. Export a smaller JPEG, PNG or WebP image and try uploading it again.",
      );
    if (code === "ENOTFOUND" || code === "EAI_AGAIN")
      throw new BlogImageUploadError(
        "UPLOAD_TEMPORARY_FAILURE",
        `The server could not resolve image storage (${code}). Check the server DNS or network connection, then retry.`,
      );
    if (code === "ECONNREFUSED" || code === "ECONNRESET")
      throw new BlogImageUploadError(
        "UPLOAD_TEMPORARY_FAILURE",
        `The server connection to image storage failed (${code}). Check server internet or firewall access, then retry.`,
      );
    if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || status === 499)
      throw new BlogImageUploadError(
        "UPLOAD_TEMPORARY_FAILURE",
        `The image upload timed out (${status === 499 ? "HTTP 499" : code}). Retry; if it repeats, check the server connection to image storage.`,
      );
    if (
      typeof code === "string" &&
      [
        "CERT_HAS_EXPIRED",
        "CERT_NOT_YET_VALID",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
        "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
        "DEPTH_ZERO_SELF_SIGNED_CERT",
        "SELF_SIGNED_CERT_IN_CHAIN",
        "ERR_TLS_CERT_ALTNAME_INVALID",
      ].includes(code)
    )
      throw new BlogImageUploadError(
        "UPLOAD_TEMPORARY_FAILURE",
        `Image storage certificate verification failed (${code}). Check the server's trusted certificates or proxy configuration, then retry.`,
      );
    if (status === 420 || status === 429)
      throw new BlogImageUploadError(
        "UPLOAD_TEMPORARY_FAILURE",
        `Image storage rate limit reached (HTTP ${status}). Wait a moment, then retry the image upload.`,
      );
    throw new BlogImageUploadError(
      "UPLOAD_TEMPORARY_FAILURE",
      "Image storage could not complete the upload. Retry, or ask an administrator to check storage connectivity.",
    );
  }
  try {
    if (uploaded.public_id !== publicId || uploaded.resource_type !== "image" || uploaded.type !== "upload")
      throw new Error("Unexpected upload response.");
    image = validateBlogImage(
      {
        publicId: uploaded.public_id,
        version: uploaded.version,
        format: uploaded.format,
        width: uploaded.width,
        height: uploaded.height,
        alt: "",
        caption: "",
        src: uploaded.secure_url,
      },
      { cloudName },
    );
  } catch {
    throw new BlogImageUploadError(
      "UPLOAD_INVALID_RESPONSE",
      "Image storage returned an invalid upload result. Retry the upload; if it continues, ask an administrator to check image storage.",
    );
  }
  try {
    return await db.transaction(async (transaction) => {
      await requireTransactionPermission(transaction, actorUserId, "blog", "edit");
      await writeAudit(transaction, actorUserId, "blog.image.upload", "blog-image", image.publicId, {
        publicId: image.publicId,
        version: image.version,
        format: image.format,
        width: image.width,
        height: image.height,
      });
      return image;
    });
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    throw new BlogImageUploadError(
      "UPLOAD_FINALIZATION_FAILED",
      "The image reached storage but could not be recorded. Wait a moment, then retry the image upload.",
    );
  }
}
