// RGB colour parsing and conversion.
// Verbatim extraction from lib/devtools/format-json.ts (region 4).

import { ToolError } from "../../tool-framework/run.ts";

export type RgbColor = { red: number; green: number; blue: number; alpha: number };

export function parseHexColor(input: string): RgbColor {
  const value = input.trim().replace(/^#/, "");
  if (![3, 4, 6, 8].includes(value.length) || !/^[\da-f]+$/i.test(value)) {
    throw new ToolError("invalid-hex-color", "HEX color must use #RGB, #RGBA, #RRGGBB, or #RRGGBBAA.");
  }
  const expanded = value.length <= 4 ? [...value].map((character) => character.repeat(2)).join("") : value;
  return {
    red: Number.parseInt(expanded.slice(0, 2), 16),
    green: Number.parseInt(expanded.slice(2, 4), 16),
    blue: Number.parseInt(expanded.slice(4, 6), 16),
    alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
}

export function rgbToHex(color: RgbColor): string {
  const channels = [color.red, color.green, color.blue];
  if (color.alpha < 1) channels.push(Math.round(color.alpha * 255));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function rgbToHsl({ red, green, blue, alpha }: RgbColor): string {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  if (delta) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const prefix = alpha < 1 ? "hsla" : "hsl";
  const suffix = alpha < 1 ? `, ${Number(alpha.toFixed(3))}` : "";
  return `${prefix}(${Math.round(hue)}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%${suffix})`;
}
