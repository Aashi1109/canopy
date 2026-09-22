import { parseColor, rgbToHex } from "../../lib/devtools/shared/color.ts";
import { ToolError } from "../../lib/tool-framework/run.ts";

export type GradientStop = { id: string; color: string; position: number };
export const DEFAULT_STOPS: GradientStop[] = [
  { id: "start", color: "#2563eb", position: 0 },
  { id: "end", color: "#7c3aed", position: 100 },
];

export function readStops(source: string): GradientStop[] {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new ToolError("invalid-stops", "Choose a preset to replace invalid gradient stops.");
  }
  if (!Array.isArray(value) || value.length < 2 || value.length > 12) {
    throw new ToolError("invalid-stops", "Use between 2 and 12 color stops.");
  }
  const ids = new Set<string>();
  return value.map((stop: unknown) => {
    if (
      !stop ||
      typeof stop !== "object" ||
      !("id" in stop) ||
      typeof stop.id !== "string" ||
      !stop.id ||
      ids.has(stop.id) ||
      !("color" in stop) ||
      typeof stop.color !== "string" ||
      stop.color.length > 100 ||
      !("position" in stop) ||
      typeof stop.position !== "number" ||
      !Number.isFinite(stop.position) ||
      stop.position < 0 ||
      stop.position > 100
    ) {
      throw new ToolError("invalid-stops", "Each stop needs a unique ID, color, and position from 0 to 100%.");
    }
    ids.add(stop.id);
    return { id: stop.id, color: stop.color, position: stop.position };
  });
}

function cssColor(value: string, preserveHex = false): string {
  const color = parseColor(value);
  const trimmed = value.trim();
  return preserveHex && /^#?(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(trimmed)
    ? `#${trimmed.replace(/^#/, "")}`
    : rgbToHex(color);
}

export function gradientValue(
  start: string,
  end: string,
  settings: Readonly<Record<string, unknown>>,
): { value: string; fallback: string } {
  const source = typeof settings.stops === "string" ? settings.stops : "";
  const stops = source.trim() ? readStops(source).sort((a, b) => a.position - b.position) : null;
  const colors = stops
    ? stops.map((stop) => `${cssColor(stop.color)} ${stop.position}%`).join(", ")
    : `${cssColor(start, true)}, ${cssColor(end, true)}`;
  const fallback = cssColor(stops?.[0].color ?? start, !stops);
  if (settings.type === "radial") {
    const shape = settings.radialShape ?? "circle";
    const x = settings.radialX ?? 50;
    const y = settings.radialY ?? 50;
    if (
      !["circle", "ellipse"].includes(String(shape)) ||
      [x, y].some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100)
    )
      throw new ToolError("invalid-radial", "Choose a radial shape and a center between 0 and 100%.");
    const center = x === 50 && y === 50 ? "" : ` at ${x}% ${y}%`;
    return { value: `radial-gradient(${shape}${center}, ${colors})`, fallback };
  }
  const angle = settings.angle ?? 135;
  if (typeof angle !== "number" || !Number.isFinite(angle) || angle < 0 || angle > 360)
    throw new ToolError("invalid-angle", "Choose an angle between 0 and 360 degrees.");
  return { value: `linear-gradient(${angle}deg, ${colors})`, fallback };
}
