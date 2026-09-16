import { LARGE_TEXT_PREVIEW_BYTES, MAX_EDITABLE_TEXT_CHARS } from "./limits.ts";

export type TextFileReadResult = {
  readonly large: boolean;
  readonly text: string;
};

export async function readTextFileForEditor(
  file: File,
  options: {
    readonly maxEditableBytes?: number;
    readonly maxLength?: number;
    readonly previewBytes?: number;
  } = {},
): Promise<TextFileReadResult> {
  const maxEditableBytes = Math.max(
    0,
    Math.min(options.maxEditableBytes ?? MAX_EDITABLE_TEXT_CHARS, MAX_EDITABLE_TEXT_CHARS),
  );
  const large = file.size > maxEditableBytes;
  if (!large) {
    const text = await file.text();
    return {
      large: false,
      text: options.maxLength === undefined ? text : text.slice(0, Math.max(0, options.maxLength)),
    };
  }

  const previewBytes = Math.max(
    0,
    Math.min(options.previewBytes ?? LARGE_TEXT_PREVIEW_BYTES, LARGE_TEXT_PREVIEW_BYTES),
  );
  return {
    large: true,
    text: await readUtf8Prefix(file, previewBytes),
  };
}

async function readUtf8Prefix(file: File, limit: number): Promise<string> {
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, limit)).arrayBuffer());
  const end = Math.min(limit, bytes.byteLength);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let length = end; length >= Math.max(0, end - 3); length -= 1) {
    try {
      return decoder.decode(bytes.subarray(0, length));
    } catch {
      // The byte boundary may bisect a multi-byte UTF-8 code point.
    }
  }
  return new TextDecoder().decode(bytes.subarray(0, end));
}

export function isLargeTextFile(file: File | undefined, maxEditableBytes = MAX_EDITABLE_TEXT_CHARS): boolean {
  return Boolean(file && file.size > maxEditableBytes);
}
