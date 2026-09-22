import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const settings = ctx.settings;
  const unit = settings.unit ?? "px";
  if (!["px", "%", "rem"].includes(unit))
    throw new ToolError("invalid-unit", "Choose px, % or rem for the radius unit.");
  const corners = [settings.topLeft, settings.topRight, settings.bottomRight, settings.bottomLeft];
  const vertical = settings.elliptical
    ? [settings.topLeftY, settings.topRightY, settings.bottomRightY, settings.bottomLeftY]
    : corners;
  if ([...corners, ...vertical].some((value) => !Number.isFinite(value) || value < 0)) {
    throw new ToolError("invalid-radius", "Corner radii must be finite, non-negative numbers.");
  }
  function shorthand(values: number[]) {
    const [a, b, c, d] = values;
    const reduced = b !== d ? values : a !== c ? [a, b, c] : a !== b ? [a, b] : [a];
    return reduced.map((value) => `${value}${unit}`).join(" ");
  }
  const horizontalCss = shorthand(corners);
  const verticalCss = shorthand(vertical);
  return {
    render: "text",
    text: `border-radius: ${horizontalCss}${verticalCss === horizontalCss ? "" : ` / ${verticalCss}`};`,
  };
};

export default run;
