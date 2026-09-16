/**
 * Moved verbatim from the `css-box-shadow` case in
 * `lib/devtools/format-json.ts` (line 2741).
 *
 * `parseHexColor` is called for its validation side effect only — the colour is
 * then emitted as the user typed it (trimmed), exactly as before, so shorthand
 * and casing survive.
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { parseHexColor } from "../../lib/devtools/shared/color.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

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

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const color = parseHexColor(ctx.input.text);
  const { x, y, blur, spread } = ctx.settings;
  const inset = ctx.settings.inset ? " inset" : "";
  const alpha = Number(color.alpha.toFixed(3));
  const extraSource = ctx.settings.additionalLayers ?? "";
  if (extraSource.length > 10_000) {
    throw new ToolError("layers-too-large", "Additional shadow layers are too long.");
  }
  const additionalLayers = extraSource
    .split("\n")
    .map((layer) => layer.trim().replace(/,$/, ""))
    .filter(Boolean);
  if (additionalLayers.length > 20) {
    throw new ToolError("too-many-layers", "Add no more than 20 shadow layers.");
  }
  if (additionalLayers.some((layer) => /[;{}]/.test(layer))) {
    throw new ToolError("invalid-layer", "Shadow layers cannot contain declarations or blocks.");
  }
  const invalidLayer = additionalLayers.findIndex((layer) => !isShadowLayer(layer));
  if (invalidLayer >= 0) {
    throw new ToolError(
      "invalid-layer",
      `Shadow layer ${invalidLayer + 1} must use two to four 0/px lengths and an optional HEX or rgb() color.`,
    );
  }
  const linkedLayers =
    (ctx.settings.linkOpacity ?? false)
      ? additionalLayers.map((layer) =>
          layer.replace(/rgba\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*[^)]+\)/gi, `rgba($1, $2, $3, ${alpha})`),
        )
      : additionalLayers;
  const layers = [`${x}px ${y}px ${blur}px ${spread}px ${ctx.input.text.trim()}${inset}`, ...linkedLayers].join(", ");
  const declaration = `box-shadow: ${layers};`;
  return {
    render: "text",
    text: (ctx.settings.showBrowserPrefixes ?? false) ? `-webkit-${declaration}\n${declaration}` : declaration,
  };
};

export default run;
