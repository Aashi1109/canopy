import { INPUT_EXECUTION_MESSAGES } from "../../lib/devtools/shared/execution-messages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  messages: {
    ...INPUT_EXECUTION_MESSAGES,
    "errors.xml-invalid-entity": "XML contains an unsupported entity or invalid character reference.",
    "errors.xml-unbalanced": "XML closing tags do not match.",
    "recovery.xml-unbalanced": "Check that every opening tag has a matching closing tag in the same order.",
    "errors.xml-invalid-tag": "XML contains an invalid tag.",
    "errors.xml-multiple-roots": "XML must have one root element.",
    "errors.xml-incomplete": "XML is incomplete or empty.",
    "recovery.xml-incomplete": "Paste the whole document, including its closing root tag.",
  },

  toolId: "devtools.xml-to-json",
  sharing: { version: 1 },
  app: "devtools",
  category: "json-tools",
  keywords: ["xml", "json", "convert", "parse", "attributes", "soap", "rss"],
  name: "XML to JSON",
  description: "Convert XML elements and attributes to JSON.",
  outputLanguage: "json",
  input: {
    kind: "text",
    language: "xml",
    label: "XML input",
    placeholder: '<user id="1"><name>Ada</name></user>',
  },
  settings: {
    fields: {},
  },
  trigger: {
    mode: "manual",
    actionLabel: "Convert to JSON",
  },
  capabilities: {
    copy: true,
    download: true,
  },
  workbenchMark: { text: "X>J" },
  labels: {
    empty: "Enter XML to convert it to JSON.",
    ready: "Converted JSON is ready.",
    running: "Converting XML to JSON…",
  },
  content: {
    howToUse: [
      "Paste a single well-formed XML document with exactly one root element.",
      "Convert. Attributes become keys prefixed with @, element text becomes #text when the element also has children or attributes, and repeated sibling names become arrays.",
      "Copy the formatted JSON, or fix the reported error if the tags do not balance.",
    ],
    limitations: [
      "This is a deliberately small parser, not a full XML processor. Namespaces are kept as literal prefixes. Predefined entities, numeric character references, and CDATA are supported; custom entities are not expanded.",
      "Whitespace-only text is trimmed away, so mixed content (text interleaved with child elements) loses its ordering.",
      "An element that appears once becomes an object; the same element appearing twice becomes an array. Consumers must handle both shapes.",
      "Numbers and booleans stay strings — XML has no types to infer them from.",
    ],
    faq: [
      {
        q: "Why is my attribute prefixed with @?",
        a: "So an attribute named id cannot collide with a child element named id. The convention matches most XML-to-JSON mappings.",
      },
      {
        q: "Why did a single-element list become an object?",
        a: "There is no way to tell a one-item list from a single value in XML without a schema. Normalise with Array.isArray on the consuming side.",
      },
    ],
    examples: [
      {
        label: "Element with an attribute",
        text: '<user id="1"><name>Ada</name><active>true</active></user>',
      },
    ],
  },
} as const satisfies ToolSpec;
