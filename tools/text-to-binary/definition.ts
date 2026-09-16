import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.text-to-binary",
  app: "devtools",
  category: "encoding-decoding",
  keywords: ["binary", "text", "utf-8", "bytes", "encode", "bits", "base 2"],
  name: "Text to Binary",
  description: "Encode UTF-8 text as binary bytes.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Text input",
    placeholder: "Hello 👋",
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Encode as binary" },
  capabilities: { copy: true },
  workbenchMark: { text: "T>B" },
  labels: {
    empty: "Enter text to encode as UTF-8 binary.",
    ready: "Binary bytes are ready.",
    running: "Encoding text as binary…",
  },
  content: {
    howToUse: [
      "Type or paste the text. It is encoded as UTF-8 first, then each byte is written as eight bits.",
      "Encode. Bytes are separated by a single space and are always zero-padded to eight digits.",
      "Remember that one character is not one byte: ASCII characters take one byte, accented Latin usually two, and most emoji four.",
    ],
    limitations: [
      "UTF-8 only. There is no option for UTF-16, Latin-1, or any other encoding.",
      "The separator is a fixed single space — there is no way to group by character, insert byte prefixes, or emit a continuous bit stream.",
      "Whitespace in the input is encoded like any other character, so a trailing newline becomes `00001010`.",
      "Output grows to roughly nine times the byte length of the input, so large inputs get unwieldy fast.",
    ],
    faq: [
      {
        q: "Why does one emoji produce four groups?",
        a: "It is four UTF-8 bytes. The tool shows bytes, not characters.",
      },
      {
        q: "Can I change the separator or grouping?",
        a: "No. The format is a fixed space-separated list of eight-bit groups.",
      },
      {
        q: "How do I go back to text?",
        a: "Use the Binary to Text tool, which reads the same space-separated eight-bit format.",
      },
    ],
    examples: [
      { label: "ASCII and emoji", text: "Hello 👋" },
      { label: "Plain word", text: "binary" },
    ],
  },
} as const satisfies ToolSpec;
