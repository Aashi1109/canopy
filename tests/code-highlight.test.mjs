import { test, expect } from "vitest";
import {
  CODE_HIGHLIGHT_MAX_CHARS,
  codeLowlight,
  createCodeHighlightBudget,
  highlightCode,
} from "../lib/markdown/codeHighlight.ts";

function textContent(html) {
  return html
    .replace(/<span\b[^>]*>|<\/span>/g, "")
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[entity]);
}

test("supported code languages preserve their complete text and escape markup", () => {
  const samples = [
    ["json", '{"name":"<img src=x>","active":true,"count":42}'],
    ["typescript", "export interface Root { name: string; active: boolean; } // <safe>"],
    ["javascript", 'const value = { label: "<script>&\\\"", enabled: true };'],
    ["xml", '<?xml version="1.0"?>\n<root key="&quot;">&amp; text</root>'],
    ["yaml", "name: '<img src=x>'\nactive: true\ncount: 42\n"],
    ["html", '<article><img src="x" alt="A &amp; B"><script>const value = 1;</script></article>'],
    ["css", '.sample { color: red; content: "<safe>&"; }'],
    ["bash", '# A command\nprintf "%s\\n" "<safe>&"'],
    ["markdown", "# Heading\n\n**Bold** and *emphasis* with [Docs](https://example.com) and `<safe>&`.\n"],
  ];

  for (const [language, code] of samples) {
    const html = highlightCode(code, language);
    expect(html).toMatch(/<span class="hljs-/);
    expect(textContent(html), language).toBe(code);
    expect(html).not.toMatch(/<(?:script|img|root)\b/i);
  }
});

test("Markdown exposes heading, emphasis, links, and code roles without changing source text", () => {
  const code =
    "# Heading\n\n**Bold** and *emphasis* with [Docs](https://example.com) and `value`.\n\n```js\nconst value = true;\n```";
  const html = highlightCode(code, "markdown");
  for (const role of ["section", "strong", "emphasis", "link", "code"]) {
    expect(html.includes(`class="hljs-${role}"`), role).toBeTruthy();
  }
  expect(textContent(html)).toBe(code);
});

test("CSV highlights quoted fields, escaped quotes, numbers, and booleans without splitting quoted separators", () => {
  const code = 'name,note,count,active\r\nAda,"hello, ""world""\nnext line",-3.5e+2,true\r\nLin,"<script>&",0,false';
  const html = highlightCode(code, "csv");

  expect(codeLowlight.registered("csv")).toBe(true);
  expect(textContent(html)).toBe(code);
  expect(html).toMatch(/<span class="hljs-string">&quot;hello, &quot;&quot;world&quot;&quot;\nnext line&quot;<\/span>/);
  expect(html).toMatch(/<span class="hljs-number">-3\.5e\+2<\/span>/);
  expect(html).toMatch(/<span class="hljs-literal">true<\/span>/);
  expect(html).toMatch(/<span class="hljs-punctuation">,<\/span>/);
  expect(html).not.toMatch(/<script>/);
});

test("TSV keeps quoted tabs and multiline fields distinct from separators", () => {
  const code = 'name\tnote\tcount\nAda\t"quoted\ttab\nwith ""quotes"""\t12\nLin\tplain,comma\tfalse\n';
  const html = highlightCode(code, "tsv");

  expect(codeLowlight.registered("tsv")).toBe(true);
  expect(textContent(html)).toBe(code);
  expect(html).toMatch(
    /<span class="hljs-string">&quot;quoted\ttab\nwith &quot;&quot;quotes&quot;&quot;&quot;<\/span>/,
  );
  expect(html).toMatch(/<span class="hljs-punctuation">\t<\/span>/);
  expect(html).toMatch(/<span class="hljs-number">12<\/span>/);
  expect(html).toMatch(/<span class="hljs-literal">false<\/span>/);
  expect(html.includes("plain,comma")).toBeTruthy();
});

test("CSV supports semicolon, pipe, and tab separators without coloring punctuation inside quoted fields", () => {
  for (const separator of [";", "|", "\t"]) {
    const code =
      ["name", "note", "count", "active"].join(separator) +
      "\n" +
      ["Ada", '"comma, semicolon; pipe| tab\t and ""quotes""\nnext line"', "42", "true"].join(separator);
    const html = highlightCode(code, "csv");

    expect(textContent(html)).toBe(code);
    expect(html.includes(`<span class="hljs-punctuation">${separator}</span>`)).toBeTruthy();
    expect(html).toMatch(
      /<span class="hljs-string">&quot;comma, semicolon; pipe\| tab\t and &quot;&quot;quotes&quot;&quot;\nnext line&quot;<\/span>/,
    );
    expect(html).toMatch(/<span class="hljs-number">42<\/span>/);
    expect(html).toMatch(/<span class="hljs-literal">true<\/span>/);
  }
});

test("TSV treats commas, semicolons, and pipes as field content", () => {
  const code = "name\tvalue\nAda\t1,2;3|4\n";
  const html = highlightCode(code, "tsv");
  expect(textContent(html)).toBe(code);
  expect(html.includes("1,2;3|4")).toBeTruthy();
  expect(html).not.toMatch(/<span class="hljs-punctuation">[,;|]<\/span>/);
});

test("delimited highlighting preserves empty and unfinished fields while editing", () => {
  for (const [language, code] of [
    ["csv", ',"",,,\n"unterminated, <tag>\nnext'],
    ["tsv", '\t""\t\t\n"unterminated\t<tag>\nnext'],
  ]) {
    expect(textContent(highlightCode(code, language))).toBe(code);
  }
});

test("the markdown helper retains autodetection and explicit plain-text handling", () => {
  const code = 'const value = "<safe>&";';
  for (const language of ["text", "plaintext", "txt", "mermaid"]) {
    const html = highlightCode(code, language);
    expect(html).not.toMatch(/<span\b/);
    expect(textContent(html)).toBe(code);
  }
  expect(highlightCode(code)).toMatch(/<span class="hljs-/);
  for (const language of ["unsupported", 'js\"><img/src=x>']) {
    const html = highlightCode(code, language);
    expect(textContent(html)).toBe(code);
    expect(html).not.toMatch(/<img\b/);
  }
  expect(highlightCode(code, "JS")).toBe(highlightCode(code, "javascript"));
});

test("large code and exhausted budgets retain complete escaped text", () => {
  for (const language of ["json", "typescript", "xml", "csv", "tsv"]) {
    const code = '<keep>&"\n'.repeat(9000);
    const html = highlightCode(code, language);
    expect(html).not.toMatch(/<span\b/);
    expect(textContent(html)).toBe(code);
  }

  const budget = createCodeHighlightBudget();
  budget.remainingChars = 0;
  const code = "export type Root = string;";
  expect(textContent(highlightCode(code, "typescript", budget))).toBe(code);
  expect(highlightCode(code, "typescript", budget)).not.toMatch(/<span\b/);
});

test("known-language coloring includes the size boundary and falls back immediately above it", () => {
  const code = 'const value = "safe";'.padEnd(CODE_HIGHLIGHT_MAX_CHARS, " ");
  expect(highlightCode(code, "javascript")).toMatch(/<span class="hljs-keyword">/);
  const oversized = `${code}<`;
  const html = highlightCode(oversized, "javascript");
  expect(html).not.toMatch(/<span\b/);
  expect(textContent(html)).toBe(oversized);
});
