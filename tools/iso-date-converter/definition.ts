import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.iso-date-converter",
  app: "devtools",
  category: "date-time-tools",
  keywords: ["iso 8601", "date", "utc", "unix", "timestamp", "convert", "timezone"],
  name: "ISO Date Converter",
  description: "Normalize date input and show ISO, UTC, local, and Unix values.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Date Input",
    fields: [
      {
        channel: "text",
        label: "Date or Unix timestamp",
        placeholder: "2026-07-22T12:30:00+05:30\n2026-08-01T09:00:00Z\n1784703600",
        required: true,
        multiline: true,
      },
    ],
  },
  settings: {
    fields: {
      displayTimezone: {
        kind: "select",
        label: "Display timezone",
        help: "Format the readable date in browser local time or UTC.",
        default: "local",
        choices: [
          { label: "Browser local time", value: "local" },
          { label: "UTC", value: "utc" },
        ],
        pane: "main",
      },
      locale: {
        kind: "select",
        label: "Locale",
        help: "Choose the regional format for the readable date.",
        default: "en-US",
        choices: [
          { label: "English (United States)", value: "en-US" },
          { label: "English (United Kingdom)", value: "en-GB" },
        ],
        pane: "main",
      },
      showUtc: {
        kind: "toggle",
        label: "Show UTC",
        help: "Include the RFC 1123 UTC value.",
        default: true,
      },
      preserveOffset: {
        kind: "toggle",
        label: "Preserve offset",
        help: "Keep an explicit source offset in the ISO value instead of normalizing it to Z.",
        default: false,
      },
    },
  },
  trigger: { mode: "live", debounceMs: 200 },
  capabilities: { copy: true },
  workbenchMark: { text: "ISO", tone: "contrast" },
  labels: {
    empty: "Enter a date or a Unix timestamp to normalize it.",
    ready: "Converted date forms are ready.",
    running: "Converting date…",
  },
  content: {
    howToUse: [
      "Paste an ISO 8601 string, a date the browser can parse, or a bare Unix timestamp. Values under 100000000000 are read as seconds; anything larger is read as milliseconds.",
      "All four forms appear at once: ISO 8601 for APIs and logs, RFC 1123 UTC for HTTP headers, a human-readable local form, and the Unix epoch in seconds.",
      "Use the ISO line when you need an unambiguous value to store or send — it always carries the UTC offset.",
      "Include an explicit offset in your input (`+05:30`, `Z`) whenever you can. Without one, the browser assumes local time and the answer depends on the machine.",
    ],
    limitations: [
      "The `Local` line is formatted with the `en-US` locale so the output is stable across machines; it is not localised to your own regional format.",
      "The `Local` line still reflects your machine's time zone, so two people in different zones see different local values for the same instant.",
      "Parsing of non-ISO strings is delegated to the browser and is not standardised. `03/04/2026` is read as March 4 in some engines and April 3 in others — use ISO to avoid the ambiguity.",
      "Unix output is truncated to whole seconds, so sub-second precision is lost.",
      "Leap seconds are not represented, and years outside roughly ±275,760 from 1970 cannot be represented at all.",
    ],
    faq: [
      {
        q: "Is my timestamp in seconds or milliseconds?",
        a: "A bare number below 100,000,000,000 is treated as seconds and anything above as milliseconds. Ten-digit values are seconds; thirteen-digit values are milliseconds.",
      },
      {
        q: "Why is the local time not in my country's format?",
        a: "The local line is deliberately pinned to `en-US` so the same input produces the same output on every machine. It is a stable rendering, not a localised one.",
      },
      {
        q: "Why did my date come out a day off?",
        a: "Almost always a missing offset. A date-only string like `2026-07-22` is parsed as UTC midnight, which is the previous day in the Americas.",
      },
    ],
    examples: [
      { label: "ISO with offset", text: "2026-07-22T12:30:00+05:30" },
      { label: "Unix seconds", text: "1784703600" },
    ],
  },
} as const satisfies ToolSpec;
