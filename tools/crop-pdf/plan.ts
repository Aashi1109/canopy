import { parsePageSelection } from "../../lib/tool-framework/settings.ts";

type PageGeometry = { pageNumber: number; pageWidth: number; pageHeight: number };

function cropGeometry(settings: Readonly<Record<string, unknown>>, pages: readonly PageGeometry[]) {
  const expression = Array.isArray(settings.pages) ? settings.pages.join(",") : String(settings.pages ?? "");
  const parsed = parsePageSelection(expression, pages.length);
  const selected = parsed === "all" ? pages.map((page) => page.pageNumber) : parsed;
  if (!selected.length) throw new Error(`Choose pages from 1 to ${pages.length}.`);
  const values = ["cropX", "cropY", "cropWidth", "cropHeight"].map((key) => {
    const raw = settings[key];
    return typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  });
  if (values.some((value) => !Number.isInteger(value))) {
    throw new Error("Enter whole-number points for Left, Bottom, Width, and Height.");
  }
  const [x, y, width, height] = values;
  if (values.some((value) => !Number.isFinite(value)) || x < 0 || y < 0 || width <= 0 || height <= 0) {
    throw new Error("Enter non-negative Left and Bottom values and positive Width and Height.");
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
    throw new Error(
      `The crop extends beyond page ${outside.pageNumber}. Reduce its position or size, or change the selected pages.`,
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
  if (bounds.width < 1 || bounds.height < 1) throw new Error("The selected pages are too small to crop.");
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
