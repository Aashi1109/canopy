import { hslToRgb, parseColor, rgbToHex, rgbToHsl } from "../../lib/devtools/shared/color.ts";
import { ToolError } from "../../lib/tool-framework/run.ts";
export type PaletteColor = { id: string; color: string; locked: boolean };
export const HARMONIES = ["analogous", "complementary", "triadic", "monochromatic"] as const;

export function readPalette(raw: string, allowColorDrafts = false): PaletteColor[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ToolError("palette", "Palette data is invalid. Reset to generate a new palette.");
  }
  if (!Array.isArray(parsed) || parsed.length < 2 || parsed.length > 10)
    throw new ToolError("palette", "Use 2–10 palette colors.");
  const ids = new Set<string>();
  return parsed.map((item: unknown) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      !("color" in item) ||
      typeof item.id !== "string" ||
      !/^[\w-]{1,64}$/.test(item.id) ||
      ids.has(item.id) ||
      typeof item.color !== "string"
    ) {
      throw new ToolError("palette", "Each palette color needs a unique ID and a valid color.");
    }
    ids.add(item.id);
    return {
      id: item.id,
      color: allowColorDrafts ? item.color : rgbToHex(parseColor(item.color)),
      locked: "locked" in item && item.locked === true,
    };
  });
}

export function generatePalette(
  seed: string,
  harmony: string,
  count: number,
  variation = 0,
  previous: PaletteColor[] = [],
): PaletteColor[] {
  if (!Number.isInteger(count) || count < 2 || count > 10) throw new ToolError("count", "Choose 2–10 colors.");
  if (previous.slice(count).some((color) => color.locked))
    throw new ToolError("locked-color", "Unlock later colors before reducing the palette size.");
  if (!HARMONIES.some((item) => item === harmony)) throw new ToolError("harmony", "Choose a supported color harmony.");
  if (!Number.isSafeInteger(variation) || variation < 0)
    throw new ToolError("variation", "Variation must be a non-negative integer.");
  const color = parseColor(seed);
  const [h, s, l] = rgbToHsl(color)
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number);
  return Array.from({ length: count }, (_, index) => {
    const old = previous[index];
    if (old?.locked) return old;
    const hueOffset =
      harmony === "analogous"
        ? index * 30
        : harmony === "triadic"
          ? (index % 3) * 120
          : harmony === "complementary"
            ? (index % 2) * 180
            : 0;
    const lightness =
      harmony === "monochromatic"
        ? 16 + (index / (count - 1)) * 72
        : Math.min(85, Math.max(15, l + Math.floor(index / (harmony === "triadic" ? 3 : 2)) * 12));
    const generated =
      index === 0 && variation === 0
        ? color
        : hslToRgb(h + hueOffset + (variation % 360) * 37, s, lightness, color.alpha);
    return { id: old?.id ?? `color-${index + 1}`, color: rgbToHex(generated), locked: false };
  });
}

export function paletteForSettings(settings: Readonly<Record<string, unknown>>, allowColorDrafts = false) {
  const raw = String(settings.colors ?? "");
  return raw
    ? readPalette(raw, allowColorDrafts)
    : generatePalette(
        String(settings.seed ?? "#3366FF"),
        String(settings.harmony ?? "analogous"),
        Number(settings.count ?? 5),
        Number(settings.variation ?? 0),
      );
}
