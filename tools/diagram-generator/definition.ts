import {
  CRYPTO_EXECUTION_MESSAGES,
  ENCODING_EXECUTION_MESSAGES,
  INPUT_EXECUTION_MESSAGES,
} from "../../lib/devtools/shared/execution-messages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  messages: {
    ...CRYPTO_EXECUTION_MESSAGES,
    ...ENCODING_EXECUTION_MESSAGES,
    ...INPUT_EXECUTION_MESSAGES,
    "execution.errors.diagram-invalid": "Mermaid diagram is invalid: {diagnostic}",
    "execution.errors.render-failed": "Mermaid diagram is invalid: render failed",
    "execution.recovery.diagram-invalid":
      "Check the first line declares a diagram type, and quote labels that contain brackets or punctuation.",
    "execution.errors.diagram-too-large": "Mermaid diagram code is too large.",
    "execution.recovery.diagram-too-large":
      "Split the diagram into smaller ones — anything this size is unreadable anyway.",
    "execution.errors.dom-required": "Mermaid diagram rendering requires a browser.",
    "execution.recovery.dom-required":
      "Open this tool in a browser tab; Mermaid measures rendered text to lay out the diagram.",
    "workspace.copy_svg_fde90b": "Copy SVG",
  },
  toolId: "devtools.diagram-generator",
  app: "devtools",
  category: "diagram-tools",
  keywords: ["mermaid", "diagram", "flowchart", "sequence diagram", "svg", "graph", "documentation"],
  name: "Diagram Generator",
  description: "Render Mermaid diagram code in the browser.",
  layout: "side-by-side",
  input: {
    kind: "text",
    label: "Mermaid diagram code",
    language: "mermaid",
    placeholder: "flowchart LR\n  A[Input] --> B[Transform] --> C[Output]",
    maxLength: 200_000,
  },
  settings: { fields: {} },
  trigger: { mode: "live", debounceMs: 160 },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "DIAG" },
  labels: {
    empty: "Enter Mermaid source to render a diagram.",
    ready: "Diagram preview is ready.",
    running: "Rendering diagram…",
  },
  content: {
    howToUse: [
      "Start with a diagram type on the first line — `flowchart LR`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `gantt` — because Mermaid decides everything else from it.",
      "Write the body underneath. The diagram re-renders as you pause typing, so a syntax error shows up on the line you just wrote rather than after a long edit.",
      "For flowcharts, set direction in the source: `flowchart LR` runs left to right; `flowchart TD` runs top to bottom.",
      "Open Download and choose SVG for a diagram that stays sharp at any size, or PNG for an image with a white background.",
    ],
    limitations: [
      "Rendering requires a browser — Mermaid measures text to lay the diagram out, so there is no server-side render and no static export outside a tab.",
      "Diagram source is capped at 200,000 characters. A diagram anywhere near that size is unreadable long before it is rejected.",
      "Mermaid runs in its strict security mode: raw HTML in node labels and click handlers are not executed.",
      "Themes, custom fonts, and CSS overrides are not exposed. The SVG carries its own inline styles, which you can edit after downloading it.",
    ],
    faq: [
      {
        q: "Is my diagram source uploaded?",
        a: "No. Mermaid runs in this browser tab and the source never leaves your machine.",
      },
      {
        q: "Why does my diagram fail with a parse error?",
        a: "Usually the first line: the diagram type and direction must come first. After that, the most common causes are unescaped punctuation in a label and inconsistent indentation in a sequence diagram.",
      },
      {
        q: "How do I get a PNG instead of an SVG?",
        a: "Open the download menu above the preview and choose diagram.png. The image is created in your browser only when you select PNG. Choose diagram.svg if you need a scalable vector file.",
      },
      {
        q: "Can I use a label containing brackets or quotes?",
        a: 'Yes, but wrap it in double quotes — `A["a [bracketed] label"]` — otherwise Mermaid reads the bracket as syntax.',
      },
    ],
    examples: [
      {
        label: "Flowchart",
        text: "flowchart LR\n  A[Input] --> B[Transform] --> C[Output]",
      },
      {
        label: "Sequence diagram",
        text: "sequenceDiagram\n  Client->>API: POST /orders\n  API-->>Client: 201 Created",
      },
    ],
  },
} as const satisfies ToolSpec;
