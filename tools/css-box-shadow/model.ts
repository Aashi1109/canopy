import { parseColor, rgbToHex } from "../../lib/devtools/shared/color.ts";
import { ToolError } from "../../lib/tool-framework/run.ts";

export type ShadowLayer = {
  id: string;
  color: string;
  x: number;
  y: number;
  blur: number;
  spread: number;
  inset: boolean;
  enabled: boolean;
};
export const DEFAULT_LAYER: ShadowLayer = {
  id: "shadow-1",
  color: "#0f172a33",
  x: 0,
  y: 12,
  blur: 30,
  spread: -8,
  inset: false,
  enabled: true,
};

export function readLayers(source: string): ShadowLayer[] {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new ToolError("invalid-layers", "Choose a preset to replace invalid shadow layers.");
  }
  if (!Array.isArray(value) || !value.length || value.length > 12)
    throw new ToolError("invalid-layers", "Use between 1 and 12 visual shadow layers.");
  const ids = new Set<string>();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object")
      throw new ToolError("invalid-layer", "Each shadow needs a color and numeric offsets, blur, and spread.");
    const item = entry as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      !item.id ||
      ids.has(item.id) ||
      typeof item.color !== "string" ||
      item.color.length > 100 ||
      typeof item.inset !== "boolean" ||
      typeof item.enabled !== "boolean"
    )
      throw new ToolError("invalid-layer", "Each shadow needs a unique ID, color, and enabled and inset states.");
    ids.add(item.id);
    for (const key of ["x", "y", "blur", "spread"]) {
      const number = item[key];
      if (
        typeof number !== "number" ||
        !Number.isFinite(number) ||
        number < (key === "blur" ? 0 : -100) ||
        number > (key === "blur" ? 200 : 100)
      )
        throw new ToolError(
          "invalid-layer",
          "Offsets and spread must be between -100 and 100px; blur must be between 0 and 200px.",
        );
    }
    return {
      id: item.id,
      color: item.color,
      x: item.x as number,
      y: item.y as number,
      blur: item.blur as number,
      spread: item.spread as number,
      inset: item.inset,
      enabled: item.enabled,
    };
  });
}

function isRgbColor(value: string): boolean {
  const match = /^(rgb|rgba)\(([^()]*)\)$/i.exec(value);
  if (!match) return false;
  const parts = match[2].split(",").map((part) => part.trim());
  if (parts.length !== (match[1].toLowerCase() === "rgba" ? 4 : 3)) return false;
  if (!parts.every((part) => /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(part))) return false;
  const channels = parts.slice(0, 3).map(Number);
  const alpha = parts[3] === undefined ? 1 : Number(parts[3]);
  return channels.every((channel) => channel >= 0 && channel <= 255) && alpha >= 0 && alpha <= 1;
}

function isShadowLayer(value: string): boolean {
  const color = /(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|rgba?\([^()]*\))$/i.exec(value)?.[0];
  if (color && /^rgba?\(/i.test(color) && !isRgbColor(color)) return false;
  const parts = value
    .slice(0, color ? -color.length : undefined)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const insetCount = parts.filter((part) => part.toLowerCase() === "inset").length;
  const lengths = parts.filter((part) => part.toLowerCase() !== "inset");
  return (
    insetCount <= 1 &&
    lengths.length >= 2 &&
    lengths.length <= 4 &&
    lengths.every((length) => /^(?:0|-?(?:\d+(?:\.\d+)?|\.\d+)px)$/.test(length)) &&
    (lengths[2] === undefined || Number(lengths[2].replace(/px$/, "")) >= 0)
  );
}

export function shadowValue(input: string, settings: Readonly<Record<string, unknown>>): string {
  const source = typeof settings.layers === "string" ? settings.layers : "";
  if (source.length > 20_000) throw new ToolError("layers-too-large", "Shadow layers are too long.");
  const visual = source.trim() ? readLayers(source) : null;
  const primary = parseColor(visual?.find((layer) => layer.enabled)?.color ?? input);
  const hex = input.trim();
  const legacyColor = /^#?(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(hex)
    ? `#${hex.replace(/^#/, "")}`
    : rgbToHex(primary);
  const layers = visual
    ? visual
        .filter((layer) => layer.enabled)
        .map(
          (layer) =>
            `${layer.x}px ${layer.y}px ${layer.blur}px ${layer.spread}px ${rgbToHex(parseColor(layer.color))}${layer.inset ? " inset" : ""}`,
        )
    : (() => {
        const { x, y, blur, spread } = settings;
        if (
          [x, y, blur, spread].some((value) => typeof value !== "number" || !Number.isFinite(value)) ||
          Number(blur) < 0
        )
          throw new ToolError("invalid-shadow", "Use finite numeric shadow lengths and a nonnegative blur.");
        return [`${x}px ${y}px ${blur}px ${spread}px ${legacyColor}${settings.inset ? " inset" : ""}`];
      })();
  const extraSource = typeof settings.additionalLayers === "string" ? settings.additionalLayers : "";
  if (extraSource.length > 10_000) throw new ToolError("layers-too-large", "Additional shadow layers are too long.");
  const additionalLayers = extraSource
    .split("\n")
    .map((layer) => layer.trim().replace(/,$/, ""))
    .filter(Boolean);
  if (additionalLayers.length > 20) throw new ToolError("too-many-layers", "Add no more than 20 shadow layers.");
  if (additionalLayers.some((layer) => /[;{}]/.test(layer)))
    throw new ToolError("invalid-layer", "Shadow layers cannot contain declarations or blocks.");
  const invalidLayer = additionalLayers.findIndex((layer) => !isShadowLayer(layer));
  if (invalidLayer >= 0)
    throw new ToolError(
      "invalid-layer",
      `Shadow layer ${invalidLayer + 1} must use two to four 0/px lengths and an optional HEX or rgb() color.`,
    );
  const alpha = Number(primary.alpha.toFixed(3));
  const linked = settings.linkOpacity
    ? additionalLayers.map((layer) =>
        layer.replace(/rgba\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*[^)]+\)/gi, `rgba($1, $2, $3, ${alpha})`),
      )
    : additionalLayers;
  return [...layers, ...linked].join(", ") || "none";
}
