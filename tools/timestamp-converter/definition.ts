import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.timestamp-converter",
  app: "devtools",
  category: "date-time-tools",
  keywords: ["timestamp", "unix", "epoch", "iso 8601", "utc", "date", "milliseconds", "convert"],
  name: "Timestamp Converter",
  description: "Convert Unix timestamps or date text to standard formats.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Unix Timestamp or Date",
    fields: [
      {
        channel: "text",
        label: "Timestamp or date",
        placeholder: "1704067200\n2024-01-01T00:00:00Z",
        required: true,
        multiline: true,
      },
    ],
  },
  settings: {
    fields: {
      inputUnit: {
        kind: "select",
        label: "Input unit",
        help: "Auto-detect numeric timestamps or treat them as seconds or milliseconds.",
        default: "auto",
        choices: [
          { label: "Auto-detect seconds / milliseconds", value: "auto" },
          { label: "Seconds", value: "seconds" },
          { label: "Milliseconds", value: "milliseconds" },
        ],
        pane: "main",
      },
      outputTimezone: {
        kind: "select",
        label: "Output timezone",
        help: "Show local and UTC dates together, or only one timezone.",
        default: "local-and-utc",
        choices: [
          { label: "Local time + UTC", value: "local-and-utc" },
          { label: "UTC only", value: "utc" },
          { label: "Local time only", value: "local" },
        ],
        pane: "main",
      },
      useLocalTimezone: {
        kind: "toggle",
        label: "Use local timezone",
        help: "Use the browser timezone for the locale-formatted date instead of UTC.",
        default: true,
      },
      includeRelativeTime: {
        kind: "toggle",
        label: "Include relative time",
        help: "Append an English approximation of how far the converted timestamp is from now.",
        default: false,
      },
      twentyFourHour: {
        kind: "toggle",
        label: "24-hour clock",
        help: "Format the local time without AM or PM.",
        default: false,
      },
    },
  },
  trigger: { mode: "live", debounceMs: 200 },
  capabilities: { copy: true },
  workbenchMark: { text: "UNIX" },
  labels: {
    empty: "Enter a Unix timestamp or a date to convert it.",
    ready: "Timestamp conversions are ready.",
    running: "Converting timestamp…",
  },
  content: {
    howToUse: [
      "Paste a Unix timestamp in seconds or milliseconds, or a date string such as `2024-01-01T00:00:00Z`. The conversions update as you type.",
      "Read ISO 8601 for logs and APIs, the RFC 1123 UTC line for HTTP headers, and the two Unix rows when you need the number in the other unit.",
      "The 'Local' line is a fixed en-US rendering in your browser's own time zone — useful for a sanity check, not a locale-accurate display.",
    ],
    limitations: [
      "Seconds and milliseconds are told apart by magnitude: a bare number whose absolute value is below 100,000,000,000 is read as seconds, otherwise as milliseconds. A far-future timestamp in seconds is therefore misread as milliseconds.",
      "Non-numeric input goes through the browser's date parser, whose handling of anything other than ISO 8601 is implementation-defined. `01/02/2024` is ambiguous and is not parsed consistently across browsers.",
      "A date with no time zone (`2024-01-01T00:00:00`) is interpreted as local time, while a date-only string (`2024-01-01`) is interpreted as UTC. That inconsistency is in the JavaScript language, not in this tool.",
      "The 'Local' line is formatted with an explicit `en-US` locale so the output is reproducible. It is not localised to your language or regional format.",
      "Sub-millisecond precision is not supported; nanosecond timestamps must be divided down first.",
    ],
    faq: [
      {
        q: "Seconds or milliseconds — which does it expect?",
        a: "Either. The magnitude decides: anything under 100,000,000,000 is treated as seconds, everything above as milliseconds. Both rows are always shown in the result.",
      },
      {
        q: "Which time zone is 'Local'?",
        a: "Your browser's. The date and time formatting is pinned to en-US so the same instant always renders identically, but the zone comes from your system.",
      },
      {
        q: "Why is my date one day off?",
        a: "Usually the local-versus-UTC rule. `2024-01-01` parses as UTC midnight, so anyone west of Greenwich sees it as December 31 locally. Add an explicit `T00:00:00Z` or an offset.",
      },
      {
        q: "Can I convert negative timestamps?",
        a: "Yes. Negative values are dates before 1970 and are handled normally.",
      },
    ],
    examples: [{ label: "New Year 2024 in seconds", text: "1704067200" }],
  },
} as const satisfies ToolSpec;
