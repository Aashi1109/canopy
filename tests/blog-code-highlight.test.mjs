import { expect, test } from "vitest";
import { createBlogDocument, renderBlogDocument, validateBlogDocument } from "../lib/blog/document.ts";

function article(code, language) {
  return {
    ...createBlogDocument("Code examples"),
    body: {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: language === undefined ? {} : { language },
          content: [{ type: "text", text: code }],
        },
      ],
    },
  };
}

function codeText(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

test("published code highlights Python, JSON and JavaScript, including language aliases", () => {
  for (const [language, code] of [
    ["python", 'def convert_pdf(filename):\n    return "done"'],
    ["py", 'def convert_pdf(filename):\n    return "done"'],
    ["json", '{"input": "document.docx", "pages": 12, "encrypted": true}'],
    ["javascript", 'const filename = "document.docx";'],
    ["js", 'const filename = "document.docx";'],
  ]) {
    const { html } = renderBlogDocument(article(code, language));
    expect(html).toMatch(/<span class="hljs-[a-z]/);
    expect(html.includes(`class="language-${language}"`)).toBeTruthy();
    expect(codeText(html)).toBe(code);
  }
});

test("unknown or missing languages autodetect while explicit plaintext stays literal", () => {
  const code = 'def convert_pdf(filename):\n    print("Converting")\n    return True\n';
  const autodetected = renderBlogDocument(article(code, null)).html;
  expect(autodetected).toMatch(/<span class="hljs-/);
  for (const language of [undefined, null, "unknown-language"]) {
    const { html } = renderBlogDocument(article(code, language));
    expect(codeText(html)).toBe(code);
    expect(html.replace(/ class="language-unknown-language"/, "")).toBe(autodetected);
  }
  for (const language of ["plaintext", "text", "txt", "mermaid"]) {
    const { html } = renderBlogDocument(article(code, language));
    expect(html).not.toMatch(/<span/);
    expect(codeText(html)).toBe(code);
  }
});

test("highlighted code remains literal safe text with all source whitespace intact", () => {
  const code = '\n\tconst html = "<img src=x onerror=alert(1)> & </code><script>alert(1)</script>";  \n\n';
  const value = article(code, "js");
  value.body.content[0].content = [
    { type: "text", text: code.slice(0, 12) },
    { type: "text", text: code.slice(12) },
  ];
  const { html } = renderBlogDocument(value);
  expect(codeText(html)).toBe(code);
  expect(html).not.toMatch(/<(?:img|script)\b/);
  expect(html).toMatch(/&lt;img src=x onerror=alert\(1\)&gt;/);
  expect(
    [...html.matchAll(/<[^>]*>/g)].every(([tag]) => /^<\/?(?:pre|code|span)(?: class="[a-zA-Z0-9_+ -]+")?>$/.test(tag)),
  ).toBeTruthy();
});

test("code rendering retains empty blocks and document language validation", () => {
  const empty = article("", "python");
  empty.body.content[0].content = [];
  expect(renderBlogDocument(empty).html).toBe('<pre><code class="language-python"></code></pre>');
  for (const language of ['js" onmouseover="alert(1)', "<script>", "x".repeat(41)]) {
    const value = article("const n = 1;", language);
    expect(() => validateBlogDocument(value)).toThrow(/Code language/);
    expect(() => renderBlogDocument(value)).toThrow(/Code language/);
  }
});
