import { parsePageRange } from "../../lib/tool-framework/media/validation.ts";
import { ToolError } from "../../lib/tool-framework/run.ts";

/** Shared by the split preview and execution so the advertised parts are exact. */
export function splitPageGroups(
  settings: { mode: string; interval: number; ranges: string },
  pageCount: number,
): number[][] {
  if (settings.mode === "every-page") {
    return Array.from({ length: pageCount }, (_, index) => [index + 1]);
  }
  if (settings.mode === "interval") {
    const interval = settings.interval;
    if (!Number.isInteger(interval) || interval < 1) {
      throw new ToolError("invalid-interval", "Pages per file must be a positive whole number.");
    }
    return Array.from({ length: Math.ceil(pageCount / interval) }, (_, index) =>
      Array.from(
        { length: Math.min(interval, pageCount - index * interval) },
        (_, offset) => index * interval + offset + 1,
      ),
    );
  }
  return settings.ranges.split(";").map((range) => {
    const result = parsePageRange(range, pageCount);
    if (!result.ok) throw new ToolError(result.code, result.message);
    return result.pages;
  });
}
