import { describeCronSchedule } from "../../lib/devtools/shared/datetime.ts";
import { requireUtilityInput } from "../../lib/devtools/shared/options.ts";
import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const expression = requireUtilityInput(ctx.input.text, "Cron expression").trim();
  const schedule = describeCronSchedule(expression);
  const notes = [
    ...schedule.notes,
    "Times use the timezone configured in your scheduler. The expression itself does not include a timezone.",
  ];
  return {
    render: "text",
    text: [
      schedule.description,
      `Cron expression: ${expression}`,
      `What each part means:\n${schedule.fields.map((field) => `${field.label} (${field.value}): ${field.description}`).join("\n")}`,
      ...notes,
    ].join("\n\n"),
    verdict: { level: "ok", label: "Valid schedule", detail: schedule.description },
    sections: [
      { title: "Cron expression", body: { render: "code", code: expression, language: "crontab" } },
      {
        title: "What each part means",
        body: {
          render: "table",
          columns: ["Part", "Value", "Meaning"],
          rows: schedule.fields.map((field) => [field.label, field.value, field.description]),
        },
      },
      { title: "Timing notes", body: { render: "list", items: notes } },
    ],
  };
};

export default run;
