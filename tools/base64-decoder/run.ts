/**
 * Moved verbatim from the `base64-decoder` case in
 * `lib/devtools/format-json.ts` (line 2447). Both the required-input guard and
 * the decode itself are shared helpers, so the error strings ("Base64 input is
 * required.", "Base64 input is invalid.", "Base64 does not contain valid UTF-8
 * text.") are the originals rather than copies.
 */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import { base64ToBytes, bytesToBase64 } from "../../lib/devtools/shared/encoding.ts";
import { requireUtilityInput } from "../../lib/devtools/shared/options.ts";
import { detectMediaKind } from "../../lib/tool-framework/media/validation.ts";

const IMAGE_TYPES = {
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
  const mediaKind = detectMediaKind(bytes);
  const image = mediaKind && mediaKind in IMAGE_TYPES ? IMAGE_TYPES[mediaKind as keyof typeof IMAGE_TYPES] : null;

  if (image) {
    return {
      alt: "Decoded Base64 image",
      downloadName: `decoded.${image.extension}`,
      mime: image.mime,
      render: "image",
      src: `data:${image.mime};base64,${bytesToBase64(bytes)}`,
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
  };
};

export default run;
