import type { BlogImage } from "@/lib/blog/document";
import { completeBlogImageUploadAction, prepareBlogImageUploadAction } from "../actions.ts";

type UploadResult = { ok: true; data: BlogImage } | { ok: false; message: string };

export async function uploadBlogImageDirect(file: File): Promise<UploadResult> {
  const failed = (message: string): UploadResult => ({ ok: false, message });
  if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return failed("Choose a JPEG, PNG or WebP image.");
  if (!file.size || file.size > 5 * 1024 * 1024) return failed("Images must be nonempty and no larger than 5 MiB.");

  const controller = new AbortController();
  const timeout = failed("Image upload timed out. Check your connection and try uploading again.");
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<UploadResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(timeout);
    }, 120_000);
  });
  const checkActive = () => controller.signal.throwIfAborted();
  const upload = async (): Promise<UploadResult> => {
    try {
      const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer());
      checkActive();
      const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
      const valid =
        file.type === "image/png"
          ? bytes.length >= 24 &&
            [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte) &&
            text(12, 16) === "IHDR"
          : file.type === "image/jpeg"
            ? bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : bytes.length >= 20 &&
              text(0, 4) === "RIFF" &&
              text(8, 12) === "WEBP" &&
              ["VP8 ", "VP8L", "VP8X"].includes(text(12, 16)) &&
              new DataView(bytes.buffer).getUint32(4, true) === file.size - 8;
      if (!valid) return failed("Image content does not match its JPEG, PNG or WebP file type.");

      const prepared = await prepareBlogImageUploadAction({ name: file.name, size: file.size, type: file.type });
      checkActive();
      if (!prepared.ok) return failed(prepared.message);
      const { uploadUrl, fields, completion } = prepared.data;
      if (
        !/^https:\/\/api\.cloudinary\.com\/v1_1\/[a-zA-Z0-9_-]+\/image\/upload$/.test(uploadUrl) ||
        !fields ||
        Object.values(fields).some((value) => typeof value !== "string") ||
        "file" in fields
      )
        return failed("Image upload could not be prepared. Try uploading again.");
      const body = new FormData();
      for (const [name, value] of Object.entries(fields)) body.append(name, value);
      body.append("file", file);
      const response = await fetch(uploadUrl, {
        method: "POST",
        body,
        credentials: "omit",
        redirect: "error",
        signal: controller.signal,
      });
      checkActive();
      if (!response.ok) {
        if (response.status === 429) return failed("Image uploads are busy. Wait a moment and try uploading again.");
        if (response.status >= 400 && response.status < 500)
          return failed(
            "The image upload was rejected. Try uploading again; if it continues, contact an administrator.",
          );
        return failed("Image uploads are temporarily unavailable. Try uploading again.");
      }
      const uploaded: unknown = await response.json();
      checkActive();
      if (
        !uploaded ||
        typeof uploaded !== "object" ||
        !("public_id" in uploaded) ||
        uploaded.public_id !== completion.publicId
      )
        return failed("The image service returned an incomplete response. Try uploading again.");
      const completed = await completeBlogImageUploadAction(completion);
      checkActive();
      return completed;
    } catch {
      return controller.signal.aborted
        ? timeout
        : failed("Image upload failed. Check your connection and try uploading again.");
    }
  };
  try {
    return await Promise.race([upload(), deadline]);
  } finally {
    clearTimeout(timer!);
  }
}
