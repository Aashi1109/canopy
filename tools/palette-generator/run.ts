import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { paletteForSettings } from "./model.ts";
type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;
export const run: ToolRun<Settings> = ({ settings }) => {
  const colors = paletteForSettings(settings);
  const css = `:root {\n${colors.map((color, index) => `  --color-${index + 1}: ${color.color};`).join("\n")}\n}`;
  const json = JSON.stringify(
    colors.map((color, index) => ({ name: `color-${index + 1}`, color: color.color })),
    null,
    2,
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${colors.length * 140}" height="180" viewBox="0 0 ${colors.length * 140} 180">\n<rect width="100%" height="100%" fill="white"/>\n${colors.map((color, index) => `<rect x="${index * 140}" width="140" height="140" fill="${color.color}"/><text x="${index * 140 + 70}" y="165" text-anchor="middle" font-family="monospace" font-size="14" fill="black">${color.color}</text>`).join("\n")}\n</svg>`;
  const artifacts = [
    { storage: "inline" as const, name: "palette.css", mimeType: "text/css", content: css },
    { storage: "inline" as const, name: "palette.json", mimeType: "application/json", content: json },
    { storage: "inline" as const, name: "palette.svg", mimeType: "image/svg+xml", content: svg },
  ];
  const format = settings.format ?? "css";
  return {
    render: "code",
    code: format === "json" ? json : format === "svg" ? svg : css,
    language: format === "svg" ? "xml" : format,
    downloadName: `palette.${format}`,
    artifacts,
    tablePreview: {
      render: "table",
      columns: ["Name", "Color"],
      rows: colors.map((color, index) => [`color-${index + 1}`, color.color]),
    },
  };
};
export default run;
