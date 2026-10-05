import { JSON_EXECUTION_MESSAGES } from "../../lib/devtools/shared/execution-messages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

/**
 * `maxLength` is the literal 2,000,000 rather than an import of
 * `MAX_JSON_INPUT_CHARS`: this file must load under a plain `fs` walk with no
 * bundler, so its value imports remain lightweight, seedable message dictionaries.
 */
export default {
  toolId: "devtools.json-viewer",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "viewer", "tree", "explore", "inspect", "repair", "pretty print"],
  name: "JSON Viewer",
  description: "Explore nested JSON in a searchable tree without uploading your data.",
  layout: "side-by-side",
  input: {
    kind: "text",
    language: "json",
    label: "JSON input",
    acceptFiles: {
      accept: ".json,application/json,text/json",
      maxBytes: 104_857_600,
      maxEditableBytes: 2_000_000,
    },
    placeholder: '{"name":"CodeUtilityKit","version":2}',
    maxLength: 2_000_000,
  },
  settings: {
    fields: {
      largeFileOperation: {
        kind: "select",
        label: "Large-file action",
        help: "Used by the large-file controls in the viewer workspace.",
        default: "validate",
        choices: [
          { label: "Validate", value: "validate" },
          { label: "Beautify", value: "format" },
          { label: "Minify", value: "minify" },
        ],
      },
      repairMode: {
        kind: "select",
        label: "Repair strategy",
        help: "Used only when Repair & clean is requested.",
        default: "remove",
        choices: [
          { label: "Remove broken properties", value: "remove" },
          { label: "Set broken values to null", value: "null" },
        ],
      },
    },
  },
  trigger: { mode: "live", debounceMs: 120 },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "JV", tone: "contrast" },
  labels: {
    empty: "Paste JSON or load an example to begin.",
    ready: "Interactive tree ready · split view.",
    running: "Parsing JSON…",
  },
  messages: {
    ...JSON_EXECUTION_MESSAGES,
    "execution.recovery.json": "Fix the reported line, or run Repair & clean to drop the broken parts.",
    "errors.json-empty": "Paste JSON to inspect it.",
    "errors.json-too-large": "JSON must be {limit, number} characters or fewer. Upload a file to use large-file mode.",
    "errors.json-syntax":
      "JSON is invalid near line {line, number}, column {column, number}. Check for a missing comma, quote, or bracket.",
    "errors.json-encoding":
      "The file is not valid UTF-8 near line {line, number}, column {column, number}. Save it as UTF-8 and upload it again.",
    dismiss: "Dismiss",
    goToErrorLabel: "Go to JSON error at line {line, number}, column {column, number}",
    goToError: "Go to line {line, number}, column {column, number}",
    copyPreviewLabel: "Copy JSON preview",
    copyInputLabel: "Copy JSON input",
    previewCopied: "JSON preview copied.",
    inputCopied: "JSON input copied.",
    copyInputFailed: "Copy failed. Select the input and copy it manually.",
    copyPreview: "Copy preview",
    copy: "Copy",
    largeFileMode: "Large-file mode",
    treeUnavailable: "JSON tree unavailable",
    parsing: "Parsing JSON…",
    treePlaceholder: "Interactive tree will appear here",
    treeDescription: "Paste JSON to inspect its structure.",
    copyValueFailed: "Copy failed. Select the value and copy it manually.",
    undo: "Undo",
    undone: "Last change undone.",
    precisionEditBlocked: "Edit blocked because it could change a high-precision number. Edit the source directly.",
    inputCleared: "Input cleared.",
    precisionRepairBlocked: "Repair blocked because it could change a high-precision number.",
    repairCancelled: "Repair cancelled. Input was not changed.",
    alreadyValid: "JSON was already valid; formatting was applied.",
    brokenExampleLoaded: "Broken example loaded. Choose a repair strategy, then run Repair & clean.",
    example: "Example",
    sampleLoaded: "Sample loaded.",
    precisionWarning:
      "High-precision number: previews may round it; copy and download preserve the exact source. Transform actions are blocked.",
    processingCompleteFile: "Processing the complete JSON file",
    readyToProcess: "Ready to process",
    processingDescription: "The file stays local while the worker reads it incrementally.",
    largeFileDescription:
      "Validate every byte, or generate a formatted or minified download without loading the full file into the editor.",
    inputTitle: "JSON input",
    beautifyLabel: "Beautify JSON code",
    minifyLabel: "Minify JSON code",
    brokenExample: "Broken example",
    repairStrategy: "Repair strategy",
    previewMeta: "Read-only · bounded preview",
    largeResultTitle: "Large JSON result",
    upload: "Upload",
    validate: "Validate",
    beautify: "Beautify",
    minify: "Minify",
    repair: "Repair & clean",
    repairHeading: "REPAIR",
    removeBroken: "Remove broken",
    setNull: "Set to null",
    clear: "Clear",
    errorBeyondPreview: "Error is beyond the loaded preview",
    validationFailed: "JSON validation failed",
    errorBeyondPreviewDescription: "The reported location is beyond the loaded preview.",
    fileUnreadable: "{name} could not be read.",
    inputBytes: "{count, plural, one {# byte} other {# bytes}}",
    valueCopied: "{label} copied.",
    repairConfirmation:
      "Repair will remove {count, plural, one {# broken path} other {# broken paths}} ({paths}). Continue?",
    repairCompleted:
      "JSON repaired with the “{strategy, select, null {Set broken values to null} other {Remove broken properties}}” strategy.",
    precisionTransformBlocked:
      "{mode, select, minify {Minify} other {Beautify}} blocked because it could change a high-precision number.",
    repairEmpty: "Paste JSON to repair it.",
    repairTooLarge: "JSON must be {limit, number} characters or fewer.",
    repairFailed: "JSON could not be repaired safely.",
  },
  content: {
    howToUse: [
      "Paste JSON on the left. It parses as you type, so a syntax error is reported with the line and column while you are still looking at it.",
      "Explore the tree on the right — expand and collapse branches to find the shape of a payload without scrolling through a wall of text.",
      "If the input will not parse, choose a repair strategy and run Repair & clean. Removing broken properties drops them; setting them to null keeps the key so the surrounding structure survives.",
      "Copy or download the cleaned JSON once the tree looks right.",
    ],
    limitations: [
      "Editable text is capped at 2,000,000 characters. JSON files up to 100 MiB open in read-only large-file mode for complete validation, beautifying, or minifying with a bounded preview and downloadable output.",
      "Parsing is strict JSON. Comments, trailing commas, and single-quoted strings are errors, though the repair pass can often recover from them.",
      "The tree preview uses JavaScript numbers, so integers beyond 2^53 and high-precision decimals may look rounded. Transform actions are blocked for those values; whole-document copy and download preserve the exact source.",
      "Repair is a best-effort structural fix, not a schema validator. Always compare the repaired output against the original before using it.",
    ],
    faq: [
      {
        q: "Is my JSON uploaded anywhere?",
        a: "No. Parsing, repair, and the tree all run in this browser tab. Nothing is sent to a server.",
      },
      {
        q: "Which repair strategy should I pick?",
        a: "Remove when a broken property is noise you can drop. Null when downstream code expects the key to exist and can handle a null.",
      },
      {
        q: "Why does the tree round my large number?",
        a: "The tree uses IEEE-754 doubles, but whole-document copy and download keep the exact source. Format, minify, and repair stay blocked when they could change the number.",
      },
      {
        q: "Does the tree preserve key order?",
        a: "Yes for ordinary string keys. Keys that look like array indices are reordered first, which is a JavaScript object rule rather than a choice made here.",
      },
    ],
    examples: [
      {
        label: "Nested object",
        text: `{
  "name": "CodeUtilityKit",
  "version": 2,
  "active": true,
  "tags": ["json", "viewer", "free"],
  "author": {
    "name": "Dev",
    "url": "https://codeutilitykit.com"
  }
}`,
      },
    ],
  },
} as const satisfies ToolSpec;
