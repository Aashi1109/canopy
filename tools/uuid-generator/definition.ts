import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.uuid-generator",
  app: "devtools",
  category: "hashing-crypto",
  keywords: ["uuid", "guid", "uuid v1", "uuid v3", "uuid v4", "uuid v5", "uuid v6", "uuid v7", "identifier"],
  name: "UUID Generator",
  description: "Generate UUID v1, v3, v4, v5, v6, and v7 identifiers.",
  input: { kind: "none" },
  settings: {
    fields: {
      version: {
        kind: "select",
        label: "UUID version",
        help: "v3 and v5 use a namespace and name. The other versions generate new IDs.",
        default: "v4",
        choices: [
          { label: "UUID v1 — timestamp", value: "v1" },
          { label: "UUID v3 — name-based (MD5)", value: "v3" },
          { label: "UUID v4 — random", value: "v4" },
          { label: "UUID v5 — name-based (SHA-1)", value: "v5" },
          { label: "UUID v6 — reordered timestamp", value: "v6" },
          { label: "UUID v7 — time-ordered", value: "v7" },
        ],
      },
      namespace: {
        kind: "select",
        label: "Namespace",
        help: "Names in different namespaces produce different UUIDs.",
        default: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        choices: [
          { label: "DNS", value: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" },
          { label: "URL", value: "6ba7b811-9dad-11d1-80b4-00c04fd430c8" },
          { label: "OID", value: "6ba7b812-9dad-11d1-80b4-00c04fd430c8" },
          { label: "X.500", value: "6ba7b814-9dad-11d1-80b4-00c04fd430c8" },
          { label: "Custom", value: "custom" },
        ],
      },
      customNamespace: {
        kind: "text",
        label: "Namespace UUID",
        placeholder: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        default: "",
      },
      name: {
        kind: "text",
        label: "Name",
        help: "One UUID per name. Case and whitespace are preserved.",
        default: "example.com",
      },
      count: {
        kind: "number",
        label: "How many",
        default: 5,
        min: 1,
        max: 100,
      },
      hyphens: {
        kind: "toggle",
        label: "Hyphens",
        help: "Off produces the 32-character compact form.",
        default: true,
      },
      upper: {
        kind: "toggle",
        label: "Uppercase",
        help: "Use uppercase letters in the generated UUIDs.",
        default: false,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Generate" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "UUID", tone: "accent" },
  labels: {
    empty: "Choose a version and generate.",
    ready: "UUIDs are ready.",
    running: "Generating UUIDs…",
  },
  content: {
    howToUse: [
      "Choose v4 for random IDs or v7 for time-ordered IDs. v1 and v6 use a timestamp and a randomly generated node identifier.",
      "For v3 or v5, select a namespace and enter a name. The same version, namespace, and exact name always produce the same UUID.",
      "For v1, v4, v6, and v7, choose up to 100 IDs per run. Hyphens and uppercase apply to every version.",
      "Generate, then copy or download. All values are computed in this browser tab.",
    ],
    limitations: [
      "v2 requires legacy DCE Security identity data. v8 has an application-defined layout and no universal generation algorithm; neither is offered here.",
      "v1, v6, and v7 include creation time. v1 and v6 use a random node identifier, not your device's MAC address.",
      "UUIDs are identifiers, not secrets. Do not use them as passwords, API keys, or bearer credentials.",
      "v3 and v5 are deterministic and return one UUID per name. Generating again with the same inputs intentionally returns the same value.",
      "Removing the hyphens produces a 32-character string that most UUID parsers still accept, but some strict ones do not.",
    ],
    faq: [
      {
        q: "v4 or v7?",
        a: "v7 if the value is a database primary key — time ordering keeps B-tree inserts local instead of scattering them. v4 anywhere the creation time must not be inferable.",
      },
      {
        q: "Why are v2 and v8 missing?",
        a: "v2 is a legacy DCE Security format. v8 reserves space for custom application formats, so it needs a specific scheme rather than a generic generator.",
      },
      {
        q: "When should I use v3 or v5?",
        a: "Use a name-based UUID when the same namespace and exact name should always map to the same identifier. Use the version required by the system you integrate with.",
      },
      {
        q: "Can two of these collide?",
        a: "Accidental collisions are very unlikely for properly generated random UUIDs. v3 and v5 intentionally repeat when given the same namespace and name.",
      },
      {
        q: "Are these generated on a server?",
        a: "No. Randomness and name-based hashing run locally in this browser tab; names and UUIDs are never transmitted.",
      },
      {
        q: "Is v7 a real standard?",
        a: "Yes — RFC 9562 (2024) standardised versions 6, 7, and 8. v7 is the recommended time-ordered format.",
      },
    ],
  },
} as const satisfies ToolSpec;
