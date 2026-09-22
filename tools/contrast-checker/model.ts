import { parseColor, rgbToHex, type RgbColor } from "../../lib/devtools/shared/color.ts";
import { ToolError } from "../../lib/tool-framework/run.ts";

function composite(front: RgbColor, back: RgbColor): RgbColor {
  return {
    red: front.red * front.alpha + back.red * (1 - front.alpha),
    green: front.green * front.alpha + back.green * (1 - front.alpha),
    blue: front.blue * front.alpha + back.blue * (1 - front.alpha),
    alpha: 1,
  };
}

function luminance(color: RgbColor) {
  const channels = [color.red, color.green, color.blue].map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function displayedColor(color: RgbColor) {
  const channels = [color.red, color.green, color.blue];
  return channels.every(Number.isInteger) ? rgbToHex(color) : `rgb(${channels.join(" ")})`;
}

export function contrast(foreground: string, background: string, canvas = "white") {
  const base = parseColor(canvas);
  if (base.alpha !== 1) throw new ToolError("canvas", "Canvas color must be opaque to measure transparency.");
  const back = composite(parseColor(background), base);
  const front = composite(parseColor(foreground), back);
  const a = luminance(front),
    b = luminance(back);
  return {
    ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    foreground: displayedColor(front),
    background: displayedColor(back),
  };
}

/** Find the smallest sRGB mix towards black or white that passes; output is opaque. */
export function suggestForeground(foreground: string, background: string, canvas = "white", target = 4.5) {
  const front = parseColor(foreground);
  const candidates: { color: string; amount: number }[] = [];
  for (const end of [0, 255]) {
    if (contrast(end === 0 ? "black" : "white", background, canvas).ratio < target) continue;
    let low = 0,
      high = 1;
    const mixed = (amount: number) =>
      rgbToHex({
        red: front.red + (end - front.red) * amount,
        green: front.green + (end - front.green) * amount,
        blue: front.blue + (end - front.blue) * amount,
        alpha: 1,
      });
    for (let step = 0; step < 24; step++) {
      const amount = (low + high) / 2;
      if (contrast(mixed(amount), background, canvas).ratio >= target) high = amount;
      else low = amount;
    }
    candidates.push({ color: mixed(high), amount: high });
  }
  return candidates.sort((a, b) => a.amount - b.amount)[0]?.color ?? foreground;
}

export const CONTRAST_CHECKS = [
  { label: "AA · normal text", minimum: 4.5 },
  { label: "AA · large text", minimum: 3 },
  { label: "AAA · normal text", minimum: 7 },
  { label: "AAA · large text", minimum: 4.5 },
] as const;
