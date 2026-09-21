import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-to-xml",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "xml", "convert", "soap", "markup", "transform"],
  name: "JSON to XML",
  description: "Convert JSON values to XML.",
  outputLanguage: "xml",
  input: {
    kind: "text",
    language: "json",
    label: "JSON input",
    placeholder: '{"user":{"name":"Ada","active":true}}',
  },
  settings: {
    fields: {
      repairMode: {
        kind: "select",
        label: "Auto-fix broken JSON",
        help: "How to handle properties whose value is missing or unparseable.",
        default: "remove",
        choices: [
          { label: "Remove broken parts", value: "remove" },
          { label: "Set broken values to null", value: "null" },
          { label: "Off (strict)", value: "off" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Convert to XML" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "J>X", tone: "contrast" },
  labels: {
    empty: "Paste JSON to convert it to XML.",
    ready: "XML is ready.",
    running: "Converting to XML…",
  },
  content: {
    howToUse: [
      "Paste the JSON document you want as XML. The top-level value is wrapped in a `<root>` element.",
      "Convert, then check the element names: a JSON key that is not a legal XML name is emitted as `<item>` rather than failing.",
      'Copy the result, which is prefixed with an `<?xml version="1.0" encoding="UTF-8"?>` declaration.',
    ],
    limitations: [
      'The mapping is one-way and lossy. Types disappear — 42, "42", and true all become the text `42` / `true` — so converting back gives you strings.',
      'Arrays repeat the parent element name rather than nesting a wrapper, so `{"tag":[1,2]}` becomes `<tag>1</tag><tag>2</tag>`.',
      "Nothing becomes an XML attribute; every JSON key becomes a child element.",
      'Keys that do not match `[A-Za-z_][\\w.-]*` are replaced with `item`, so `{"1st":"x"}` yields `<item>x</item>` and the original key is lost.',
      "Values are escaped as HTML entities (&, <, >, \", '), which is valid XML but escapes more than the XML minimum.",
    ],
    faq: [
      {
        q: "Can I choose the root element name?",
        a: 'Not here — it is always `root`. Wrap your JSON in a single-key object such as `{"order":{…}}` and rename or unwrap the root afterwards.',
      },
      {
        q: "How is null represented?",
        a: "As a self-closing empty element, for example `<note/>`. There is no `xsi:nil` attribute.",
      },
      {
        q: "Is the output pretty-printed?",
        a: "No. The XML is emitted on one line after the declaration. Run it through an XML formatter if you need indentation.",
      },
    ],
    examples: [{ label: "Nested object", text: '{"user":{"name":"Ada","active":true}}' }],
  },
} as const satisfies ToolSpec;
