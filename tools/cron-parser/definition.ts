import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.cron-parser",
  app: "devtools",
  slug: "cron-parser",
  category: "date-time-tools",
  keywords: ["cron", "crontab", "schedule", "parse", "explain", "validate"],
  name: "Cron Expression Parser",
  description: "Validate and explain a five-field cron expression.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Cron Expression",
    fields: [
      {
        channel: "text",
        label: "Cron expression",
        placeholder: "*/15 * * * *",
        required: true,
        multiline: false,
      },
    ],
  },
  settings: {
    fields: {},
  },
  trigger: {
    mode: "manual",
    actionLabel: "Parse cron",
  },
  capabilities: {
    copy: true,
  },
  workbenchMark: { text: "CRN?" },
  labels: {
    empty: "Enter a five-field cron expression to parse it.",
    ready: "Cron schedule is ready.",
    running: "Parsing cron expression…",
  },
  content: {
    howToUse: [
      "Paste the five-field expression: minute, hour, day of month, month, weekday.",
      "Parse. Each field is range-checked and the result restates the schedule in words — the quickest way to catch a field written in the wrong position.",
      "An out-of-range or unsupported field names the field that failed, so you know which of the five to fix.",
    ],
    limitations: [
      "Five fields only. A leading seconds field (Quartz, some job runners) or a trailing year field is rejected.",
      "Supported syntax is *, */step, single numbers, ranges, and comma-separated lists. Named months and weekdays (JAN, MON), step-on-range (1-30/2), and the L, W, #, and ? specifiers are not accepted.",
      "Weekday accepts 0–7 with both 0 and 7 meaning Sunday.",
      "Day-of-month and weekday are validated independently; the OR relationship between them when both are restricted is not spelled out in the description.",
      "No next-run times are computed here, and no timezone is applied.",
    ],
    faq: [
      {
        q: "Why was my expression rejected?",
        a: "Either it did not have exactly five whitespace-separated fields, or a field used syntax outside *, */step, numbers, ranges, and lists.",
      },
      {
        q: "Can I use MON-FRI?",
        a: "Not here. Use the numeric equivalent 1-5.",
      },
    ],
    examples: [
      {
        label: "Weekdays at 09:00",
        text: "0 9 * * 1-5",
      },
    ],
  },
} as const satisfies ToolSpec;
