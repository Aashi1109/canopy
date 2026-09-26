import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import { base64ToBytes, bytesToBase64 } from "../../lib/devtools/shared/encoding.ts";
import { requireUtilityInput } from "../../lib/devtools/shared/options.ts";
import { detectMediaKind } from "../../lib/tool-framework/media/validation.ts";

const IMAGE_TYPES = {
  gif: { extension: "gif", mime: "image/gif" },
  jpeg: { extension: "jpg", mime: "image/jpeg" },
  png: { extension: "png", mime: "image/png" },
  webp: { extension: "webp", mime: "image/webp" },
} as const;

function decodedText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) ? null : text;
  } catch {
    return null;
  }
}

export const run: ToolRun<Record<string, never>> = async (ctx): Promise<ToolResult> => {
  const input = requireUtilityInput(ctx.input.text, "Base64 input");
  const dataUri = /^data:[^,]*;base64,(.*)$/is.exec(input.trim());
  const bytes = base64ToBytes(dataUri?.[1] ?? input);
  // GIF previews belong here; Media processing has a narrower format allowlist.
  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  const isGif =
    bytes.length >= 13 &&
    (signature === "GIF87a" || signature === "GIF89a") &&
    width > 0 &&
    height > 0 &&
    decodedText(bytes) === null;
  const mediaKind = isGif ? "gif" : detectMediaKind(bytes);
  const image = mediaKind && mediaKind in IMAGE_TYPES ? IMAGE_TYPES[mediaKind as keyof typeof IMAGE_TYPES] : null;

  if (image) {
    return {
      alt: "Decoded Base64 image",
      downloadName: `decoded.${image.extension}`,
      mime: image.mime,
      render: "image",
      src: `data:${image.mime};base64,${bytesToBase64(bytes)}`,
      ...(isGif
        ? {
            width,
            height,
            notification: {
              level: "ok" as const,
              label: `GIF decoded · ${width} × ${height} px`,
            },
          }
        : {}),
    };
  }

  const text = decodedText(bytes);
  if (text !== null) {
    return { downloadName: "decoded.txt", render: "text", text };
  }

  const artifact = await ctx.writeArtifact({
    mime: "application/octet-stream",
    name: "decoded.bin",
    source: bytes,
  });
  return {
    files: [artifact],
    outputBytes: bytes.byteLength,
    render: "files",
    notification: {
      level: "ok",
      label: "File decoded",
      detail: "Preview unavailable. Download to open.",
    },
  };
};

export default run;
