import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.date-difference",
  app: "devtools",
  // `slugFromName("Date Difference Calculator")` is "date-difference-calculator",
  // which is not the folder name. The live indexed URL is the folder name and is
  // frozen at first insert, so it is declared explicitly.
  slug: "date-difference",
  category: "date-time-tools",
  keywords: ["date difference", "elapsed", "duration", "days between", "timestamp", "hours"],
  name: "Date Difference Calculator",
  description: "Calculate elapsed time between two dates.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Start and end dates",
    fields: [
      {
        channel: "text",
        label: "Start date",
        placeholder: "2026-01-01T00:00:00Z",
        required: true,
      },
      {
        channel: "secondary",
        label: "End date",
        placeholder: "2026-01-03T00:00:00Z",
        required: true,
      },
    ],
  },
  settings: {
    fields: {
      startTime: {
        kind: "text",
        label: "Start time",
        help: "Optionally set the start time in 24-hour format.",
        default: "",
        placeholder: "09:00",
        maxLength: 8,
        pane: "main",
      },
      endTime: {
        kind: "text",
        label: "End time",
        help: "Optionally set the end time in 24-hour format.",
        default: "",
        placeholder: "17:30",
        maxLength: 8,
        pane: "main",
      },
      timezone: {
        kind: "select",
        label: "Timezone",
        help: "Preserve entered offsets or reinterpret the clock time as local or UTC.",
        default: "as-entered",
        choices: [
          { label: "As entered", value: "as-entered" },
          { label: "Browser local time", value: "local" },
          { label: "UTC", value: "utc" },
        ],
        pane: "main",
      },
      exactDuration: {
        kind: "toggle",
        label: "Exact duration",
        help: "Include the total hours with the elapsed days.",
        default: true,
      },
    },
  },
  trigger: { mode: "live" },
  capabilities: { copy: true },
  workbenchMark: { text: "DAYS" },
  labels: {
    empty: "Enter start and end dates to calculate the elapsed time.",
    ready: "Date difference is ready.",
    running: "Calculating date difference…",
  },
  content: {
    howToUse: [
      "Enter the start date and the end date. ISO 8601 is the safest format — include the Z or an offset so the answer does not depend on your machine's time zone.",
      "A bare number is read as a timestamp: values under 1e11 are treated as Unix seconds, larger ones as milliseconds.",
      "The result updates as you type and shows days rounded to three decimals, with hours when Exact duration is enabled.",
    ],
    limitations: [
      "An end date before the start date yields a negative result rather than an error, which is usually what you want but is easy to misread.",
      "Days are fixed 24-hour periods. Across a daylight-saving transition the calendar-day count and this figure disagree by an hour.",
      "Leap seconds do not exist in JavaScript time, so they are not counted.",
      "A date string without a time zone is interpreted by the browser, which is not always UTC. Prefer explicit offsets.",
    ],
    faq: [
      {
        q: "Why do I get 2 days and not 2?",
        a: "Both figures are trimmed of trailing zeros, so a whole number is printed as a whole number. A partial gap shows up to three decimal places.",
      },
      {
        q: "Which formats are accepted?",
        a: "Anything the browser's Date parser understands, plus bare Unix seconds and milliseconds. ISO 8601 with an explicit offset is the only form that is unambiguous everywhere.",
      },
    ],
    examples: [
      {
        label: "Two days apart",
        text: "2026-01-01T00:00:00Z",
        secondary: "2026-01-03T00:00:00Z",
      },
    ],
  },
} as const satisfies ToolSpec;
