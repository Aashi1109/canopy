import { common, createLowlight, type LanguageFn } from "lowlight";

export const codeLowlight = createLowlight(common);

const AUTO_HIGHLIGHT_MAX_CHARS = 4 * 1024;
export const CODE_HIGHLIGHT_MAX_CHARS = 64 * 1024;
const DOCUMENT_HIGHLIGHT_MAX_CHARS = 256 * 1024;

function delimitedGrammar(separator: "," | "\t"): LanguageFn {
  const delimiters = separator === "," ? "[,;|\\t]" : "\\t";
  const start = `(?:^|(?<=${delimiters}))`;
  const space = " *";
  const end = `(?=${delimiters}|$)`;
  return () => ({
    disableAutodetect: true,
    contains: [
      {
        scope: "string",
        begin: new RegExp(`${start}${space}"`, "m"),
        end: /"(?!")/,
        contains: [{ match: /""/, relevance: 0 }],
        relevance: 0,
      },
      {
        scope: "number",
        match: new RegExp(`${start}${space}[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?${space}${end}`, "m"),
        relevance: 0,
      },
      {
        scope: "literal",
        match: new RegExp(`${start}${space}(?:true|false|null)${space}${end}`, "m"),
        relevance: 0,
      },
      { scope: "punctuation", match: new RegExp(delimiters), relevance: 0 },
    ],
  });
}

codeLowlight.register({
  csv: delimitedGrammar(","),
  tsv: delimitedGrammar("\t"),
  unicode: () => ({
    disableAutodetect: true,
    case_insensitive: true,
    contains: [{ scope: "symbol", match: /\\u(?:\{[\da-f]{1,6}\}|[\da-f]{4})/i, relevance: 0 }],
  }),
  "url-encoded": () => ({
    disableAutodetect: true,
    case_insensitive: true,
    contains: [{ scope: "symbol", match: /%[\da-f]{2}/i, relevance: 0 }],
  }),
  robots: () => ({
    disableAutodetect: true,
    case_insensitive: true,
    contains: [
      { scope: "comment", match: /#[^\r\n]*/, relevance: 0 },
      {
        match: [/^[ \t]*(?:User-agent|Allow|Disallow|Sitemap|Crawl-delay)/, /[ \t]*:[ \t]*/, /[^\r\n#]*/],
        scope: { 1: "attr", 3: "string" },
        relevance: 0,
      },
    ],
  }),
});

export type CodeHighlightBudget = { remainingChars: number };

/** Share one budget across a document, not across unrelated render requests. */
export function createCodeHighlightBudget(): CodeHighlightBudget {
  return { remainingChars: DOCUMENT_HIGHLIGHT_MAX_CHARS };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

export function highlightCode(code: string, language?: string | null, budget?: CodeHighlightBudget): string {
  const normalizedLanguage = language?.toLowerCase();
  if (["mermaid", "text", "plaintext", "txt"].includes(normalizedLanguage ?? "")) return escapeHtml(code);
  const knownLanguage = normalizedLanguage && codeLowlight.registered(normalizedLanguage);
  const maxChars = knownLanguage ? CODE_HIGHLIGHT_MAX_CHARS : AUTO_HIGHLIGHT_MAX_CHARS;
  if (code.length > maxChars || (budget && code.length > budget.remainingChars)) return escapeHtml(code);
  if (budget) budget.remainingChars -= code.length;
  const tree = knownLanguage ? codeLowlight.highlight(normalizedLanguage, code) : codeLowlight.highlightAuto(code);

  function render(node: (typeof tree.children)[number]): string {
    if (node.type === "text") return escapeHtml(node.value);
    if (node.type !== "element") return "";
    const content = node.children.map(render).join("");
    if (node.tagName !== "span") return content;
    const classes = Array.isArray(node.properties.className)
      ? node.properties.className.filter((value) => typeof value === "string" && /^[\w-]+$/.test(value)).join(" ")
      : "";
    return classes ? `<span class="${classes}">${content}</span>` : content;
  }

  return tree.children.map(render).join("");
}
