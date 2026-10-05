import { ToolError } from "../../lib/tool-framework/run.ts";
import { parsePageSelection } from "../../lib/tool-framework/settings.ts";

type PageGeometry = { pageNumber: number; pageWidth: number; pageHeight: number };

function cropGeometry(settings: Readonly<Record<string, unknown>>, pages: readonly PageGeometry[]) {
  const expression = Array.isArray(settings.pages) ? settings.pages.join(",") : String(settings.pages ?? "");
  const parsed = parsePageSelection(expression, pages.length);
  const selected = parsed === "all" ? pages.map((page) => page.pageNumber) : parsed;
  if (!selected.length)
    throw new ToolError("invalid-crop", `Choose pages from 1 to ${pages.length}.`, undefined, {
      messageRef: { key: "errors.cropPages", values: { count: pages.length } },
    });
  const values = ["cropX", "cropY", "cropWidth", "cropHeight"].map((key) => {
    const raw = settings[key];
    return typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  });
  if (values.some((value) => !Number.isInteger(value))) {
    throw new ToolError("invalid-crop", "Enter whole-number points for Left, Bottom, Width, and Height.", undefined, {
      messageRef: { key: "readiness.wholeNumbers" },
    });
  }
  const [x, y, width, height] = values;
  if (values.some((value) => !Number.isFinite(value)) || x < 0 || y < 0 || width <= 0 || height <= 0) {
    throw new ToolError(
      "invalid-crop",
      "Enter non-negative Left and Bottom values and positive Width and Height.",
      undefined,
      { messageRef: { key: "errors.cropDimensions" } },
    );
  }
  return { selected, box: { x, y, width, height } };
}

export function cropPlan(settings: Readonly<Record<string, unknown>>, pages: readonly PageGeometry[]) {
  const { selected, box } = cropGeometry(settings, pages);
  const { x, y, width, height } = box;
  const outside = pages.find(
    (page) => selected.includes(page.pageNumber) && (x + width > page.pageWidth || y + height > page.pageHeight),
  );
  if (outside)
    throw new ToolError(
      "invalid-crop",
      `The crop extends beyond page ${outside.pageNumber}. Reduce its position or size, or change the selected pages.`,
      undefined,
      { messageRef: { key: "errors.cropBeyondPage", values: { page: outside.pageNumber } } },
    );
  return { selected, box };
}

/** Keep editing available even when manually entered values exceed the selected pages. */
export function cropEditorPlan(settings: Readonly<Record<string, unknown>>, pages: readonly PageGeometry[]) {
  const { selected, box } = cropGeometry(settings, pages);
  const selectedPages = pages.filter((page) => selected.includes(page.pageNumber));
  const bounds = {
    width: Math.floor(Math.min(...selectedPages.map((page) => page.pageWidth))),
    height: Math.floor(Math.min(...selectedPages.map((page) => page.pageHeight))),
  };
  if (bounds.width < 1 || bounds.height < 1)
    throw new ToolError("invalid-crop", "The selected pages are too small to crop.", undefined, {
      messageRef: { key: "errors.cropPagesTooSmall" },
    });
  const width = Math.min(box.width, bounds.width);
  const height = Math.min(box.height, bounds.height);
  return {
    selected,
    bounds,
    box: {
      width,
      height,
      x: Math.min(box.x, bounds.width - width),
      y: Math.min(box.y, bounds.height - height),
    },
  };
}
