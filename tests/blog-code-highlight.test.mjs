import assert from "node:assert/strict";
import test from "node:test";
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
    assert.match(html, /<span class="hljs-[a-z]/);
    assert.ok(html.includes(`class="language-${language}"`));
    assert.equal(codeText(html), code);
  }
});

test("unknown or missing languages autodetect while explicit plaintext stays literal", () => {
  const code = 'def convert_pdf(filename):\n    print("Converting")\n    return True\n';
  const autodetected = renderBlogDocument(article(code, null)).html;
  assert.match(autodetected, /<span class="hljs-/);
  for (const language of [undefined, null, "unknown-language"]) {
    const { html } = renderBlogDocument(article(code, language));
    assert.equal(codeText(html), code);
    assert.equal(html.replace(/ class="language-unknown-language"/, ""), autodetected);
  }
  for (const language of ["plaintext", "text", "txt", "mermaid"]) {
    const { html } = renderBlogDocument(article(code, language));
    assert.doesNotMatch(html, /<span/);
    assert.equal(codeText(html), code);
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
  assert.equal(codeText(html), code);
  assert.doesNotMatch(html, /<(?:img|script)\b/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.ok(
    [...html.matchAll(/<[^>]*>/g)].every(([tag]) => /^<\/?(?:pre|code|span)(?: class="[a-zA-Z0-9_+ -]+")?>$/.test(tag)),
  );
});

test("code rendering retains empty blocks and document language validation", () => {
  const empty = article("", "python");
  empty.body.content[0].content = [];
  assert.equal(renderBlogDocument(empty).html, '<pre><code class="language-python"></code></pre>');
  for (const language of ['js" onmouseover="alert(1)', "<script>", "x".repeat(41)]) {
    const value = article("const n = 1;", language);
    assert.throws(() => validateBlogDocument(value), /Code language/);
    assert.throws(() => renderBlogDocument(value), /Code language/);
  }
});
