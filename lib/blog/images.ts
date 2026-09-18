/** Server-only: upload credentials and authorization must never reach clients. */
import config from "../config/config.ts";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { db } from "../../db/index.ts";
import { AuthorizationError } from "../admin/index.ts";
import { cloudinaryFolder } from "../cloudinary/paths.ts";
import { requireTransactionPermission, writeAudit } from "../admin/adminMutations.ts";
import { BlogValidationError, validateBlogImage, type BlogImage } from "./document.ts";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const UPLOAD_LIFETIME_SECONDS = 600;

export interface BlogImageUploadCompletion {
  publicId: string;
  timestamp: number;
  name: string;
  size: number;
  type: string;
  token: string;
}
export interface PreparedBlogImageUpload {
  uploadUrl: string;
  fields: Record<string, string>;
  completion: BlogImageUploadCompletion;
}

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

function uploadInput(input: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
    Reflect.ownKeys(input).some((key) => typeof key !== "string" || !allowed.includes(key))
  )
    throw new BlogValidationError("Image upload details are invalid. Choose the image again.");
  return input as Record<string, unknown>;
}

function imageMetadata(input: Record<string, unknown>) {
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 4096 || !input.name.isWellFormed())
    throw new BlogValidationError("Image filename is invalid.");
  if (
    typeof input.size !== "number" ||
    !Number.isSafeInteger(input.size) ||
    input.size < 1 ||
    input.size > MAX_IMAGE_BYTES
  )
    throw new BlogValidationError("Images must be nonempty and no larger than 5 MiB.");
  if (typeof input.type !== "string" || !["image/jpeg", "image/png", "image/webp"].includes(input.type))
    throw new BlogValidationError("Use a JPEG, PNG or WebP image.");
  return { name: input.name, size: input.size, type: input.type };
}

function credentials() {
  const cloudName = config.cloudinary.cloudName?.trim();
  const apiKey = config.cloudinary.apiKey?.trim();
  const apiSecret = config.cloudinary.apiSecret?.trim();
  if (!cloudName || !/^[a-zA-Z0-9_-]+$/.test(cloudName) || !apiKey || !apiSecret)
    throw new BlogImageUploadError(
      "UPLOAD_NOT_CONFIGURED",
      "Image uploads are not configured. Ask an administrator to configure the Cloudinary cloud name, API key and API secret on the server.",
    );
  return { cloudName, apiKey, apiSecret };
}

function completionToken(actor: string, input: Omit<BlogImageUploadCompletion, "token">, secret: string): string {
  return createHmac("sha256", secret)
    .update(
      JSON.stringify(["blog-image-upload", actor, input.publicId, input.timestamp, input.name, input.size, input.type]),
    )
    .digest("hex");
}

async function authorizeUpload(actorUserId: string) {
  try {
    await db.transaction((transaction) => requireTransactionPermission(transaction, actorUserId, "blog", "edit"));
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    throw new BlogImageUploadError(
      "UPLOAD_TEMPORARY_FAILURE",
      "Image upload access could not be checked. Try uploading again.",
    );
  }
}

export async function prepareBlogImageUpload(actorUserId: string, input: unknown): Promise<PreparedBlogImageUpload> {
  await authorizeUpload(actorUserId);
  const metadata = imageMetadata(uploadInput(input, ["name", "size", "type"]));
  const { cloudName, apiKey, apiSecret } = credentials();
  const folder = cloudinaryFolder("blog");
  const publicId = `${folder}/${randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const fields = {
    timestamp: String(timestamp),
    public_id: publicId,
    asset_folder: folder,
    type: "upload",
    overwrite: "false",
    allowed_formats: "jpg,jpeg,png,webp",
  };
  const completion = { publicId, timestamp, ...metadata };
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    fields: { ...fields, api_key: apiKey, signature: cloudinary.utils.api_sign_request(fields, apiSecret) },
    completion: { ...completion, token: completionToken(actorUserId, completion, apiSecret) },
  };
}

export async function completeBlogImageUpload(actorUserId: string, input: unknown): Promise<BlogImage> {
  await authorizeUpload(actorUserId);
  const value = uploadInput(input, ["publicId", "timestamp", "name", "size", "type", "token"]);
  const metadata = imageMetadata(value);
  const { cloudName, apiKey, apiSecret } = credentials();
  const folder = cloudinaryFolder("blog");
  const now = Math.floor(Date.now() / 1000);
  if (
    typeof value.publicId !== "string" ||
    !value.publicId.startsWith(`${folder}/`) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value.publicId.slice(folder.length + 1),
    ) ||
    typeof value.timestamp !== "number" ||
    !Number.isSafeInteger(value.timestamp) ||
    value.timestamp > now ||
    now - value.timestamp > UPLOAD_LIFETIME_SECONDS ||
    typeof value.token !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.token)
  )
    throw new BlogValidationError("Image upload authorization is invalid or expired. Choose the image again.");
  const completion = { publicId: value.publicId, timestamp: value.timestamp, ...metadata };
  const expected = completionToken(actorUserId, completion, apiSecret);
  if (!timingSafeEqual(Buffer.from(value.token, "hex"), Buffer.from(expected, "hex")))
    throw new BlogValidationError("Image upload authorization is invalid. Choose the image again.");
  const publicId = completion.publicId;
  let image: BlogImage;
  let uploaded: Record<string, unknown>;
  // Verify storage metadata server-to-server, without holding a database transaction.
  try {
    uploaded = await cloudinary.api.resource(publicId, {
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      resource_type: "image",
      type: "upload",
      timeout: 30_000,
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
    if (status === 401 || status === 403)
      throw new BlogImageUploadError(
        "UPLOAD_CONFIGURATION_ERROR",
        "Image storage denied this upload. Ask an administrator to check the Cloudinary account, credentials and upload permissions.",
      );
    if (status === 404)
      throw new BlogImageUploadError(
        "UPLOAD_REJECTED",
        "The uploaded image was not found in storage. Choose the image and upload it again.",
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
    if (
      !uploaded ||
      typeof uploaded !== "object" ||
      uploaded.public_id !== publicId ||
      uploaded.resource_type !== "image" ||
      uploaded.type !== "upload" ||
      typeof uploaded.secure_url !== "string"
    )
      throw new Error("Unexpected upload response.");
    if (
      typeof uploaded.bytes !== "number" ||
      !Number.isSafeInteger(uploaded.bytes) ||
      uploaded.bytes < 1 ||
      uploaded.bytes > MAX_IMAGE_BYTES
    )
      throw new BlogImageUploadError(
        "UPLOAD_REJECTED",
        "Images must be nonempty and no larger than 5 MiB. Choose a smaller image and upload it again.",
      );
    image = validateBlogImage(
      {
        publicId: uploaded.public_id,
        version: uploaded.version,
        format: uploaded.format,
        width: uploaded.width,
        height: uploaded.height,
        alt: completion.name
          .replace(/\.[^.]*$/u, "")
          .replace(/[-_\s\u0000-\u001f\u007f]+/gu, " ")
          .trim()
          .slice(0, 500)
          .replace(/[\uD800-\uDBFF]$/u, ""),
        caption: "",
        src: uploaded.secure_url,
      },
      { cloudName },
    );
  } catch (error) {
    if (error instanceof BlogImageUploadError) throw error;
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
