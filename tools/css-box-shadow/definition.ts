import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.css-box-shadow",
  // `slugFromName("CSS Box Shadow Generator")` is "css-box-shadow-generator",
  // but the live indexed URL is /devtools/css-box-shadow and a slug is frozen
  // at first insert — so it is declared explicitly rather than derived.
  slug: "css-box-shadow",
  app: "devtools",
  category: "color-design-tools",
  keywords: ["box-shadow", "css", "shadow", "elevation", "inset", "blur", "spread", "generator"],
  name: "CSS Box Shadow Generator",
  description: "Generate a CSS box-shadow declaration.",
  outputLanguage: "css",
  input: {
    kind: "fields",
    label: "Shadow Color",
    fields: [
      {
        channel: "text",
        label: "HEX color",
        placeholder: "#00000080",
        required: true,
        multiline: false,
      },
    ],
  },
  settings: {
    fields: {
      layers: { kind: "textarea", label: "Visual shadow layers", default: "", help: "Visual layer editor data." },
      previewBackground: { kind: "color", label: "Preview background", default: "#f1f5f9" },
      previewObject: { kind: "color", label: "Object color", default: "#ffffff" },
      x: {
        kind: "number",
        label: "X offset",
        help: "Horizontal distance in pixels. Positive moves the shadow right.",
        default: 0,
        min: -100,
        max: 100,
        suffix: "px",
        pane: "main",
      },
      y: {
        kind: "number",
        label: "Y offset",
        help: "Vertical distance in pixels. Positive moves the shadow down.",
        default: 12,
        min: -100,
        max: 100,
        suffix: "px",
        pane: "main",
      },
      blur: {
        kind: "number",
        label: "Blur",
        help: "Larger values give a softer, more diffuse edge.",
        default: 30,
        min: 0,
        max: 200,
        suffix: "px",
        pane: "main",
      },
      spread: {
        kind: "number",
        label: "Spread",
        help: "Grows or shrinks the shadow before blurring. Negative values pull it in under the element.",
        default: -8,
        min: -100,
        max: 100,
        suffix: "px",
        pane: "main",
      },
      inset: {
        kind: "toggle",
        label: "Inset",
        help: "Draws the shadow inside the element instead of behind it.",
        default: false,
      },
      additionalLayers: {
        kind: "textarea",
        label: "Additional shadow layers",
        help: "Add one shadow per line using 0/px lengths and an optional HEX or rgb() color.",
        default: "",
        rows: 4,
        pane: "main",
        span: "full",
      },
      linkOpacity: {
        kind: "toggle",
        label: "Link opacity",
        help: "Apply the input HEX alpha to rgba() colors in additional layers.",
        default: false,
      },
      showBrowserPrefixes: {
        kind: "toggle",
        label: "Show browser prefixes",
        help: "Include a -webkit-box-shadow declaration before the standard one.",
        default: false,
      },
    },
  },
  trigger: { mode: "live", debounceMs: 120 },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "SHDW" },
  labels: {
    empty: "Enter a HEX shadow color to build a CSS box-shadow declaration.",
    ready: "CSS box-shadow declaration is ready.",
    running: "Building box shadow…",
  },
  content: {
    howToUse: [
      "Enter the shadow colour as a hex value. `#RRGGBBAA` gives you a translucent shadow, which is almost always what you want — a fully opaque shadow reads as a hard outline.",
      "Adjust the offsets, blur, and spread; add one extra shadow layer per line when a single elevation is not enough.",
      "A believable elevation usually means a small Y offset, a blur two to three times that offset, and a slightly negative spread. Copy the declaration when it looks right.",
    ],
    limitations: [
      "Additional layers accept two to four 0/px lengths, optional inset, and an optional HEX or comma-separated rgb()/rgba() colour.",
      "Lengths are pixels only — no rem, em, or percentage units.",
      "Visual layers accept HEX, supported CSS names, rgb(), and hsl(). Advanced text layers accept HEX or comma-separated rgb()/rgba().",
      "Use up to 12 visual layers and up to 20 advanced text layers.",
      "This produces `box-shadow`, not `filter: drop-shadow()` — the two differ on transparent PNGs and non-rectangular shapes.",
    ],
    faq: [
      {
        q: "What is the difference between blur and spread?",
        a: "Spread resizes the shadow's shape before it is blurred; blur softens its edge. A negative spread with a large blur is the usual recipe for a soft, grounded elevation.",
      },
      {
        q: "How do I stack two shadows?",
        a: "Keep the generated first layer, then add the second complete shadow value on a new line under Additional shadow layers.",
      },
      {
        q: "Why does inset look like nothing happened?",
        a: "An inset shadow draws inside the padding box, so it is hidden if the element has no background or if the offsets are too small to clear the edge. Increase the offset or blur.",
      },
      {
        q: "Can I use a CSS variable for the colour?",
        a: "Not as input — it has to be a hex value so it can be validated. Swap the literal for `var(--shadow-color)` in the generated declaration afterwards.",
      },
    ],
    examples: [
      {
        label: "Slate elevation",
        text: "#0f172a",
        settings: { layers: "", additionalLayers: "", x: 0, y: 12, blur: 30, spread: -8, inset: false },
      },
    ],
  },
} as const satisfies ToolSpec;
