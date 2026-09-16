import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.qr-code-generator",
  app: "devtools",
  category: "encoding-decoding",
  keywords: ["qr", "qr code", "barcode", "generator", "url", "wifi", "vcard", "png", "svg"],
  name: "QR Code Generator",
  description: "Generate a downloadable QR code PNG.",
  input: {
    kind: "text",
    label: "Content to encode",
    placeholder: "https://example.com",
  },
  settings: {
    fields: {
      errorCorrection: {
        kind: "select",
        label: "Error correction",
        help: "Higher levels survive damage and obstruction but pack fewer characters into the same grid.",
        default: "M",
        choices: [
          { label: "L", value: "L" },
          { label: "M", value: "M" },
          { label: "Q", value: "Q" },
          { label: "H", value: "H" },
        ],
      },
      size: {
        kind: "number",
        label: "Export size",
        default: 320,
        min: 100,
        max: 1000,
        suffix: "px",
      },
      margin: {
        kind: "number",
        label: "Margin",
        help: "Quiet zone in modules. Scanners need at least 4; going lower hurts reliability.",
        default: 4,
        min: 0,
        max: 20,
      },
      dark: {
        kind: "color",
        label: "Foreground color",
        default: "#111827",
      },
      light: {
        kind: "color",
        label: "Background color",
        default: "#ffffff",
      },
      transparentBackground: {
        kind: "toggle",
        label: "Transparent background",
        help: "Overrides the background color. Only scannable when placed on a light surface.",
        default: false,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Generate QR code" },
  capabilities: { download: true },
  workbenchMark: { text: "QR", tone: "accent" },
  labels: {
    empty: "Enter the URL or text you want to encode in a QR code.",
    ready: "QR code is ready.",
    running: "Generating QR code…",
  },
  content: {
    howToUse: [
      "Paste the URL or text to encode. Include the scheme (https://) so scanners open the link instead of searching for it.",
      "Pick an error-correction level. M is a good default; use Q or H when the code will be printed small, on fabric, or over a logo.",
      "Set the export size and margin, then adjust the foreground and background colors if the code needs to match a brand.",
      "Generate, download the PNG (or the SVG artifact for print), and scan the final asset with a real phone before you ship it.",
    ],
    limitations: [
      "Everything runs in your browser — nothing is uploaded — so the content is limited to what a QR code can hold: roughly 2,900 alphanumeric characters at level L, and far fewer at level H.",
      "Keep strong contrast between foreground and background. Light-on-dark and low-contrast pairings are rejected by many scanners.",
      "A transparent background is only scannable over a light surface; the scanner still needs a light quiet zone.",
      "Dense content plus a small export size reduces scan reliability. Raise the size or shorten the URL rather than lowering the margin.",
      "The tool does not shorten URLs, add a logo overlay, or produce dynamic/trackable codes.",
    ],
    faq: [
      {
        q: "Do these QR codes expire or get tracked?",
        a: "No. The code is generated locally and encodes your content directly, so there is no redirect service, no expiry, and no analytics.",
      },
      {
        q: "Which error-correction level should I pick?",
        a: "L for a clean on-screen code with long content, M for general use, and Q or H for print, stickers, or anywhere the code may be scratched or partly covered.",
      },
      {
        q: "Why will my code not scan?",
        a: "Usually contrast, size, or margin. Use a dark foreground on a light background, keep the margin at 4 or more, and increase the export size for long content.",
      },
      {
        q: "Can I get a vector file?",
        a: "Yes. Every run also produces an SVG artifact alongside the PNG, which is what you want for print.",
      },
      {
        q: "Can I encode Wi-Fi credentials or a contact card?",
        a: "Yes — paste the formatted string, for example WIFI:T:WPA;S:MyNetwork;P:MyPassword;; or a full vCard block.",
      },
    ],
    examples: [
      { label: "Website URL", text: "https://example.com" },
      {
        label: "Wi-Fi network",
        text: "WIFI:T:WPA;S:MyNetwork;P:MyPassword;;",
      },
      { label: "Plain text", text: "Scan me" },
    ],
  },
} as const satisfies ToolSpec;
