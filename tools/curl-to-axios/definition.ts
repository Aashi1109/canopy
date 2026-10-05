import {
  CURL_EXECUTION_MESSAGES,
  ENCODING_EXECUTION_MESSAGES,
  INPUT_EXECUTION_MESSAGES,
} from "../../lib/devtools/shared/execution-messages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  messages: {
    ...CURL_EXECUTION_MESSAGES,
    ...ENCODING_EXECUTION_MESSAGES,
    ...INPUT_EXECUTION_MESSAGES,
    "curl.flagsNotConverted": "Some cURL flags were not converted",
    "curl.unsupportedFlags": "Unsupported cURL flags were ignored: {flags}.",
    "workspace.unable_to_convert_54606f": "Unable to convert",
    "workspace.output_language_bf3bcc": "Output language",
    "workspace.javascript_b27ad0": "JavaScript",
    "workspace.typescript_ed0504": "TypeScript",
    "workspace.module_format_ba8e98": "Module format",
    "workspace.no_import_18a0da": "No import",
    "workspace.es_module_import_9044c4": "ES module import",
    "workspace.commonjs_require_190f0a": "CommonJS require",
    "workspace.request_style_71ed43": "Request style",
    "workspace.loadExample": "Load example",
    "workspace.aliases": "Aliases",
  },
  toolId: "devtools.curl-to-axios",
  app: "devtools",
  category: "jwt-api-tools",
  keywords: ["curl", "axios", "convert", "http request", "javascript", "api client", "code generator"],
  name: "cURL to Axios",
  description: "Convert common cURL requests to Axios and surface flags that cannot be represented.",
  layout: "stacked",
  optionsPanel: {
    title: "OUTPUT & RUNTIME",
    note: "Forms, cookie jars, proxies, redirects, certificates, uploads, and unsupported shell syntax are not converted.",
  },
  input: {
    kind: "text",
    language: "bash",
    label: "cURL command",
    placeholder: "curl https://api.example.com/users",
  },
  settings: {
    fields: {
      moduleFormat: {
        kind: "select",
        label: "Module format",
        help: "Add an Axios import when the snippet should stand on its own.",
        default: "none",
        choices: [
          { label: "No import", value: "none" },
          { label: "ESM import", value: "esm" },
          { label: "CommonJS require", value: "commonjs" },
        ],
      },
      requestStyle: {
        kind: "select",
        label: "Request style",
        help: "Choose a config call, explicit axios.request, or a method alias such as axios.get.",
        default: "config",
        choices: [
          { label: "axios(config)", value: "config" },
          { label: "axios.request(config)", value: "request" },
          { label: "Method alias", value: "alias" },
        ],
      },
      outputLanguage: {
        kind: "select",
        label: "Output language",
        help: "TypeScript adds an Axios response type so generated data must be narrowed before use.",
        default: "javascript",
        choices: [
          { label: "JavaScript", value: "javascript" },
          { label: "TypeScript", value: "typescript" },
        ],
      },
    },
  },
  trigger: { mode: "live", debounceMs: 150 },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "AXIO" },
  labels: {
    empty: "Paste a cURL command to generate Axios code.",
    ready: "Axios request code is ready.",
    running: "Generating Axios code…",
  },
  content: {
    howToUse: [
      "Paste the whole command, starting with `curl`. Quoting is parsed the way a shell would, so headers such as `-H 'Authorization: Bearer …'` come across intact.",
      "Choose the module format, request-call style, and JavaScript or TypeScript output. The result updates as you edit.",
      "Check the result before running it: strip any credential that came along in a header, and confirm the method matches what you intended.",
    ],
    limitations: [
      "A subset of flags is understood: `-X/--request`, `-H/--header`, `-d/--data/--data-raw/--data-binary`, and `-u/--user`. Anything else — `-F`, `--form`, `-b`, `--cookie`, `-k`, `--compressed`, `-o`, proxy and TLS flags — is ignored and reported in a warning, not translated.",
      "As with curl, supplying a body promotes an unspecified method from GET to POST.",
      "A JSON body is parsed and embedded as an object; anything that is not valid JSON is passed through as a string. No `Content-Type` header is inferred either way.",
      "`-u user:pass` becomes a Base64 `Authorization: Basic` header, so the credential ends up in plain sight in the generated code. Replace it with an environment variable before committing.",
      "The URL must be absolute http or https. Repeated `-d` flags do not concatenate the way curl does — only the last one is used.",
    ],
    faq: [
      {
        q: "Why is my `--form` upload missing?",
        a: "Multipart flags are not supported. Build a `FormData` object by hand and pass it as `data`.",
      },
      {
        q: "Do I need to set Content-Type for a JSON body?",
        a: "Axios sets `application/json` automatically when `data` is a plain object, which is what a parsed JSON body becomes here. Add the header explicitly if you send a string.",
      },
      {
        q: "Is my command sent anywhere?",
        a: "No. Parsing and code generation happen entirely in this browser tab, and no request is made.",
      },
    ],
    examples: [
      {
        label: "GET with a bearer token",
        text: "curl https://api.example.com/users -H 'Authorization: Bearer token'",
      },
    ],
  },
} as const satisfies ToolSpec;
