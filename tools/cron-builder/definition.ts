import type { ToolSpec } from "../../lib/tool-framework/spec";

/**
 * `slug` is declared because `slugFromName("Cron Expression Builder")` is
 * `cron-expression-builder`, which does not match the folder name. The folder
 * name is the live indexed URL and must not move.
 */
export default {
  toolId: "devtools.cron-builder",
  slug: "cron-builder",
  app: "devtools",
  category: "date-time-tools",
  keywords: ["cron", "crontab", "schedule", "expression", "builder", "job", "timer"],
  name: "Cron Expression Builder",
  description: "Build a standard five-field cron expression.",
  input: { kind: "none" },
  settings: {
    fields: {
      /**
       * The five cron fields are the tool's primary input, so they sit in the
       * main pane as one row, matching how a crontab line reads left to right.
       * They stay free text rather than becoming selects: a select cannot
       * express the ranges, lists and steps (`1-5`, `1,15`, `*​/15`) that the
       * field accepts.
       */
      minute: {
        kind: "text",
        label: "Minute",
        help: "0-59, or * for every minute.",
        default: "0",
        maxLength: 64,
        pane: "main",
      },
      hour: {
        kind: "text",
        label: "Hour",
        help: "0-23, or * for every hour.",
        default: "9",
        maxLength: 64,
        pane: "main",
      },
      dayOfMonth: {
        kind: "text",
        label: "Day of month",
        help: "1-31, or * for every day.",
        default: "*",
        pane: "main",
      },
      month: {
        kind: "text",
        label: "Month",
        help: "1-12, or * for every month.",
        default: "*",
        pane: "main",
      },
      dayOfWeek: {
        kind: "text",
        label: "Day of week",
        help: "0-7 with both 0 and 7 meaning Sunday. 1-5 is Monday to Friday.",
        default: "1-5",
        pane: "main",
      },
      timezone: {
        kind: "select",
        label: "Timezone",
        help: "Documentation only — a cron expression carries no timezone. It records which clock you intended.",
        default: "utc",
        choices: [
          { label: "UTC", value: "utc" },
          { label: "Local time", value: "local" },
        ],
        pane: "main",
      },
      commandLabel: {
        kind: "text",
        label: "Command label (optional)",
        help: "Appended as a Label line so the expression arrives in a ticket with its purpose attached.",
        default: "",
        pane: "main",
      },
    },
  },
  trigger: { mode: "live", debounceMs: 160 },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "CRN+" },
  labels: {
    empty: "Adjust the schedule fields to build a cron expression.",
    ready: "Cron expression is ready.",
    running: "Building cron expression…",
  },
  content: {
    howToUse: [
      "Enter the minute and hour, then set day of month, month, and day of week. Each field accepts a number, a range (1-5), a list (1,15), a step (*/15), or * for every value.",
      "Read the plain-English description under the expression before you use it — it is generated from the fields you actually typed, which is how you catch a misplaced value.",
      "Watch out for the classic trap: setting both day of month and day of week means the job runs when either matches, not both. Leave one as * unless you want that.",
      "Add a command label if the expression is going into a ticket or a runbook, then copy the result into your crontab or scheduler.",
    ],
    limitations: [
      "Only the standard five-field format is produced. Six-field dialects with a seconds column, and the Quartz-style ? and L specifiers, are not supported.",
      "Named values are not accepted — use 1-5 rather than MON-FRI, and 1 rather than JAN.",
      "The timezone setting is documentation only. A cron expression carries no timezone; the schedule runs in whatever zone the executing machine is configured for.",
      "The description explains the fields but does not compute upcoming run times.",
    ],
    faq: [
      {
        q: "Why does my job run more often than expected?",
        a: "Almost always the day-of-month and day-of-week interaction: when both are set to something other than *, cron runs the job when either matches. Set one of them to *.",
      },
      {
        q: "How do I run something every fifteen minutes?",
        a: "Put */15 in the minute field and * in the hour field.",
      },
      {
        q: "Is midnight 0 or 24?",
        a: "0. The hour field runs 0-23, so midnight is hour 0 and 11pm is hour 23.",
      },
      {
        q: "Which timezone does the schedule use?",
        a: "The one the machine running cron is set to, which is often UTC on a server and local time on a laptop. Confirm it on the host rather than assuming.",
      },
    ],
    examples: [
      {
        label: "Every 15 minutes",
        text: "",
        settings: {
          minute: "*/15",
          hour: "*",
          dayOfMonth: "*",
          month: "*",
          dayOfWeek: "*",
          timezone: "utc",
          commandLabel: "Health check",
        },
      },
    ],
  },
} as const satisfies ToolSpec;
