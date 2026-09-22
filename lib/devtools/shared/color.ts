// Context-free sRGB color parsing and conversion. No DOM or remote lookup is needed.

import { ToolError } from "../../tool-framework/run.ts";

export type RgbColor = { red: number; green: number; blue: number; alpha: number };

// CSS named colors are fixed standard data, including the gray/grey aliases.
const NAMED_COLORS: Readonly<Record<string, string>> = Object.fromEntries(
  `aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff
beige:f5f5dc bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887
cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff
darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgrey:a9a9a9 darkgreen:006400 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3
deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff
firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 grey:808080 green:008000 greenyellow:adff2f honeydew:f0fff0 hotpink:ff69b4
indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd
lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgrey:d3d3d3 lightgreen:90ee90 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6
magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080
oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1
saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32`
    .split(/\s+/)
    .map((entry) => entry.split(":")),
);

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function numeric(value: string, label: string): number {
  if (!NUMBER.test(value) || !Number.isFinite(Number(value))) {
    throw new ToolError("syntax", `${label} must be a finite number.`);
  }
  return Number(value);
}

function bounded(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ToolError("range", `${label} must be ${min}–${max}.`);
  }
  return value;
}

function parseAlpha(value: string | undefined): number {
  if (value === undefined) return 1;
  return bounded(
    value.endsWith("%") ? numeric(value.slice(0, -1), "Alpha") / 100 : numeric(value, "Alpha"),
    0,
    1,
    "Alpha",
  );
}

/** Parse standalone HEX, RGB(A), HSL(A), named colors and transparent. */
export function parseColor(input: string): RgbColor {
  const value = input.trim().toLowerCase();
  if (value === "transparent") return { red: 0, green: 0, blue: 0, alpha: 0 };
  if (Object.hasOwn(NAMED_COLORS, value)) return parseHexColor(NAMED_COLORS[value]);
  if (/^#?[\da-f]+$/i.test(value)) return parseHexColor(value);
  const match = /^(rgba?|hsla?)\(([^()]*)\)$/.exec(value);
  if (!match) {
    throw new ToolError(
      "syntax",
      "Enter HEX, rgb(), hsl(), or a CSS color name.",
      "Use a standalone color; variables and relative colors need stylesheet context.",
    );
  }
  const legacy = match[2].includes(",");
  let channels: string[];
  let alpha: string | undefined;
  if (legacy) {
    const parts = match[2].split(",").map((part) => part.trim());
    if (match[2].includes("/") || (parts.length !== 3 && parts.length !== 4)) {
      throw new ToolError("syntax", "Use three comma-separated channels and optional alpha, or spaces with / alpha.");
    }
    channels = parts.slice(0, 3);
    alpha = parts[3];
  } else {
    const parts = match[2].split("/");
    channels = parts[0].trim().split(/\s+/);
    alpha = parts[1]?.trim();
    if (parts.length > 2 || channels.length !== 3 || alpha === "") {
      throw new ToolError("syntax", "Use three space-separated channels and optional / alpha.");
    }
  }
  const opacity = parseAlpha(alpha);
  if (match[1].startsWith("rgb")) {
    if (
      legacy &&
      channels.some((channel) => channel.endsWith("%")) &&
      !channels.every((channel) => channel.endsWith("%"))
    ) {
      throw new ToolError("syntax", "Comma-separated RGB channels must all use numbers or all use percentages.");
    }
    const values = channels.map((channel) =>
      channel.endsWith("%")
        ? (bounded(numeric(channel.slice(0, -1), "RGB percentage"), 0, 100, "RGB percentage") * 255) / 100
        : bounded(numeric(channel, "RGB channel"), 0, 255, "RGB channel"),
    );
    return { red: values[0], green: values[1], blue: values[2], alpha: opacity };
  }
  const hueMatch = /^(.+?)(deg|grad|rad|turn)?$/.exec(channels[0]);
  const hue =
    numeric(hueMatch?.[1] ?? "", "Hue") *
    ({ deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 }[hueMatch?.[2] ?? "deg"] ?? 1);
  const percentages = channels.slice(1).map((channel) => {
    if (!channel.endsWith("%")) throw new ToolError("syntax", "HSL saturation and lightness need a % suffix.");
    return bounded(numeric(channel.slice(0, -1), "HSL percentage"), 0, 100, "HSL percentage");
  });
  return hslToRgb(hue, percentages[0], percentages[1], opacity);
}

export function hslToRgb(hue: number, saturation: number, lightness: number, alpha = 1): RgbColor {
  if (!Number.isFinite(hue)) throw new ToolError("range", "Hue must be a finite number.");
  const s = bounded(saturation, 0, 100, "Saturation") / 100;
  const l = bounded(lightness, 0, 100, "Lightness") / 100;
  const h = ((hue % 360) + 360) % 360;
  const amplitude = s * Math.min(l, 1 - l);
  const channel = (offset: number) => {
    const position = (offset + h / 30) % 12;
    return 255 * (l - amplitude * Math.max(-1, Math.min(position - 3, 9 - position, 1)));
  };
  return { red: channel(0), green: channel(8), blue: channel(4), alpha: bounded(alpha, 0, 1, "Alpha") };
}

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
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function rgbToHsl(
  { red, green, blue, alpha }: RgbColor,
  {
    precision = 3,
    percentagePrecision = precision,
    syntax = "legacy",
  }: { precision?: number; percentagePrecision?: number; syntax?: "legacy" | "modern" } = {},
): string {
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
  const rounded = (value: number, places: number) => Number(value.toFixed(Math.max(0, Math.min(8, places))));
  const channels = [
    rounded(hue, precision),
    `${rounded(saturation * 100, percentagePrecision)}%`,
    `${rounded(lightness * 100, percentagePrecision)}%`,
  ];
  if (syntax === "modern")
    return `hsl(${channels.join(" ")}${alpha < 1 ? ` / ${rounded(alpha, Math.max(3, precision))}` : ""})`;
  return `${alpha < 1 ? "hsla" : "hsl"}(${channels.join(", ")}${alpha < 1 ? `, ${rounded(alpha, Math.max(3, precision))}` : ""})`;
}
