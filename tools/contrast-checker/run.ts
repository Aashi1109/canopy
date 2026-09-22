import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { contrast, CONTRAST_CHECKS } from "./model.ts";
type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;
export const run: ToolRun<Settings> = ({ settings }) => {
  const value = contrast(
    settings.foreground ?? "#334155",
    settings.background ?? "#FFFFFF",
    settings.canvas ?? "#FFFFFF",
  );
  const entries = [
    { label: "Contrast ratio", value: `${value.ratio.toFixed(2)}:1` },
    ...CONTRAST_CHECKS.map((check) => ({ label: check.label, value: value.ratio >= check.minimum ? "Pass" : "Fail" })),
    { label: "Displayed text", value: value.foreground },
    { label: "Displayed background", value: value.background },
  ];
  return {
    render: "key-value",
    entries,
    artifacts: [
      {
        storage: "inline",
        name: "contrast-report.txt",
        mimeType: "text/plain",
        content: entries.map((entry) => `${entry.label}: ${entry.value}`).join("\n"),
      },
    ],
    verdict: {
      level: value.ratio >= 4.5 ? "ok" : "warn",
      label: value.ratio >= 4.5 ? "AA normal text passes" : "AA normal text fails",
    },
  };
};
export default run;
