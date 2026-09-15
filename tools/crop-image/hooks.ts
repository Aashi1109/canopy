/**
 * Pre-run hooks. Pure, React-free, no heavy dependencies — see the note in
 * `../compress-pdf/hooks.ts` for why they may not live beside `run`.
 *
 * `detectMediaKind` is NOT imported: it lives in
 * `lib/tool-framework/media/validation.ts`, and nothing under `media/` may be
 * reachable from a main-thread import graph. Only the HEIC answer is needed
 * here, so the ISO-BMFF `ftyp` brand read that produces it is inlined below.
 * The other signatures `detectMediaKind` recognises (PDF, JPEG, PNG, WebP)
 * cannot also carry `ftyp` at offset 4, so the narrowed check agrees with it
 * on every input.
 */

import { parseCropPoints } from "./geometry.ts";
import type { ToolValidate } from "../../lib/tool-framework/run.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

function isHeic(file: { readonly mime: string; readonly name: string }): boolean {
  return /(?:heic|heif)/i.test(file.mime) || /\.(?:heic|heif)$/i.test(file.name);
}

/**
 * Replaces two `MediaWorkbench` branches:
 *  - the HEIC rejection at `MediaWorkbench.tsx:474-480`, which sniffed the file
 *    header rather than trusting the declared MIME, and
 *  - the `crop-image` arm of `cropBoxReady` at `MediaWorkbench.tsx:980-982`,
 *    whose message came from `processFiles` (`MediaWorkbench.tsx:800-805`).
 *
 * Reading the first bytes of an already-in-memory buffer is O(16), so this stays
 * safe to call on every keystroke.
 */
export const validate: ToolValidate<Settings> = (settings, files) => {
  for (const file of files) {
    if (isHeic(file)) {
      return "HEIC crop previews are not supported. Convert the image to JPEG or PNG first.";
    }
  }
  if (settings.cropMode === "freeform") {
    try { parseCropPoints(settings.cropPoints); return null; }
    catch { return "Add an image and choose a valid crop selection before processing."; }
  }
  return settings.cropWidth <= 0 || settings.cropHeight <= 0
    ? "Enter a valid crop area before processing."
    : null;
};
