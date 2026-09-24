import type { RgbColor } from "../../lib/devtools/shared/color.ts";

type Channels = readonly [number, number, number];
type Matrix = readonly [Channels, Channels, Channels];

// Matrices, transfer curves, and white points follow CSS Color 4 sample conversions.
// https://www.w3.org/TR/css-color-4/#color-conversion-code
function transform(matrix: Matrix, values: readonly number[]): Channels {
  const channel = (row: Channels) => row[0] * values[0] + row[1] * values[1] + row[2] * values[2];
  return [channel(matrix[0]), channel(matrix[1]), channel(matrix[2])];
}

function rounded(value: number, precision = 3): number {
  return Number(value.toFixed(precision));
}

function srgbGamma(value: number): number {
  return Math.abs(value) <= 0.0031308
    ? value * 12.92
    : Math.sign(value) * (1.055 * Math.abs(value) ** (1 / 2.4) - 0.055);
}

function polarChannels([lightness, a, b]: Channels, epsilon: number, precision: number): string {
  const chroma = Math.hypot(a, b);
  const hue = chroma <= epsilon ? "none" : rounded((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return `${rounded(lightness, precision)} ${rounded(chroma <= epsilon ? 0 : chroma, precision)} ${hue}`;
}

export function additionalColorFormats(color: RgbColor) {
  const srgb = [color.red / 255, color.green / 255, color.blue / 255];
  const [red, green, blue] = srgb;
  const maximum = Math.max(...srgb);
  const minimum = Math.min(...srgb);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    hue =
      maximum === red
        ? (green - blue) / delta
        : maximum === green
          ? (blue - red) / delta + 2
          : (red - green) / delta + 4;
    hue = rounded(hue * 60 + 360) % 360;
  }
  const linear = srgb.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  const xyz65 = transform(
    [
      [506752 / 1228815, 87881 / 245763, 12673 / 70218],
      [87098 / 409605, 175762 / 245763, 12673 / 175545],
      [7918 / 409605, 87881 / 737289, 1001167 / 1053270],
    ],
    linear,
  );
  const xyz50 = transform(
    [
      [1.0479297925449969, 0.022946870601609652, -0.05019226628920524],
      [0.02962780877005599, 0.9904344267538799, -0.017073799063418826],
      [-0.009243040646204504, 0.015055191490298152, 0.7518742814281371],
    ],
    xyz65,
  );
  const d50 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
  const labBase = xyz50.map((channel, index) => {
    const value = channel / d50[index];
    return value > 216 / 24389 ? Math.cbrt(value) : ((24389 / 27) * value + 16) / 116;
  });
  const lab: Channels = [116 * labBase[1] - 16, 500 * (labBase[0] - labBase[1]), 200 * (labBase[1] - labBase[2])];
  const lms = transform(
    [
      [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
      [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
      [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
    ],
    xyz65,
  );
  const oklab = transform(
    [
      [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
      [1.9779985324311684, -2.4285922420485799, 0.450593709617411],
      [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
    ],
    lms.map(Math.cbrt),
  );
  const p3 = transform(
    [
      [446124 / 178915, -333277 / 357830, -72051 / 178915],
      [-14852 / 17905, 63121 / 35810, 423 / 17905],
      [11844 / 330415, -50337 / 660830, 316169 / 330415],
    ],
    xyz65,
  ).map(srgbGamma);
  const a98 = transform(
    [
      [1829569 / 896150, -506331 / 896150, -308931 / 896150],
      [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
      [16779 / 1248040, -147721 / 1248040, 1266979 / 1248040],
    ],
    xyz65,
  ).map((value) => Math.sign(value) * Math.abs(value) ** (256 / 563));
  const prophoto = transform(
    [
      [1.3457868816471583, -0.25557208737979464, -0.05110186497554526],
      [-0.5446307051249019, 1.5082477428451468, 0.02052744743642139],
      [0, 0, 1.2119675456389452],
    ],
    xyz50,
  ).map((value) => (Math.abs(value) < 1 / 512 ? 16 * value : Math.sign(value) * Math.abs(value) ** (1 / 1.8)));
  const rec2020 = transform(
    [
      [30757411 / 17917100, -6372589 / 17917100, -4539589 / 17917100],
      [-19765991 / 29648200, 47925759 / 29648200, 467509 / 29648200],
      [792561 / 44930125, -1921689 / 44930125, 42328811 / 44930125],
    ],
    xyz65,
  ).map((value) => Math.sign(value) * Math.abs(value) ** (1 / 2.4));

  const alpha = color.alpha < 1 ? ` / ${rounded(color.alpha, 6)}` : "";
  const designAlpha = color.alpha < 1 ? `, A: ${rounded(color.alpha * 100, 3)}%` : "";
  const css = (name: string, values: readonly number[], precision = 6) =>
    `${name}(${values.map((value) => rounded(value, precision)).join(" ")}${alpha})`;
  const space = (name: string, values: readonly number[]) =>
    `color(${name} ${values.map((value) => rounded(value, 6)).join(" ")}${alpha})`;
  // CMYK is an unprofiled arithmetic approximation; print values depend on the target ICC profile.
  const cmyk = [...srgb.map((value) => (maximum === 0 ? 0 : 1 - value / maximum)), 1 - maximum];

  return [
    {
      format: "hsv",
      label: "HSV / HSB",
      value: `H: ${hue}°, S: ${rounded(maximum === 0 ? 0 : (delta / maximum) * 100)}%, V: ${rounded(maximum * 100)}%${designAlpha}`,
    },
    {
      format: "hwb",
      label: "HWB",
      value: `hwb(${hue} ${rounded(minimum * 100)}% ${rounded((1 - maximum) * 100)}%${alpha})`,
    },
    {
      format: "cmyk",
      label: "CMYK",
      value:
        cmyk.map((value, index) => `${["C", "M", "Y", "K"][index]}: ${rounded(value * 100)}%`).join(", ") + designAlpha,
    },
    { format: "lab", label: "Lab", value: css("lab", lab, 3) },
    { format: "lch", label: "LCH", value: `lch(${polarChannels(lab, 0.0015, 3)}${alpha})` },
    { format: "oklab", label: "OKLab", value: css("oklab", oklab) },
    { format: "oklch", label: "OKLCH", value: `oklch(${polarChannels(oklab, 0.000004, 6)}${alpha})` },
    { format: "xyz-d65", label: "XYZ D65", value: space("xyz-d65", xyz65) },
    { format: "xyz-d50", label: "XYZ D50", value: space("xyz-d50", xyz50) },
    { format: "srgb", label: "sRGB", value: space("srgb", srgb) },
    { format: "srgb-linear", label: "Linear sRGB", value: space("srgb-linear", linear) },
    { format: "display-p3", label: "Display P3", value: space("display-p3", p3) },
    { format: "a98-rgb", label: "A98 RGB", value: space("a98-rgb", a98) },
    { format: "prophoto-rgb", label: "ProPhoto RGB", value: space("prophoto-rgb", prophoto) },
    { format: "rec2020", label: "Rec.2020", value: space("rec2020", rec2020) },
  ];
}
