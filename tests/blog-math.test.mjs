import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlogDocument,
  validateBlogDocument,
  renderBlogDocument,
  blogDocumentText,
} from "../lib/blog/document.ts";
import { normalizeBlogMath } from "../lib/blog/math.ts";
import { renderMath } from "../lib/markdown/math.ts";
import { blogMarkdownHtml } from "../app/admin/(protected)/blog/lib/markdownPaste.ts";

const paragraph = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const document = (content) => ({ ...createBlogDocument("Math"), body: { type: "doc", content } });

test("math paste preserves LaTeX escapes before Markdown parsing", () => {
  const html = blogMarkdownHtml(String.raw`Inline $E = mc^2$ and $\frac{a_1}{b}$.

$$
\int_{-\infty}^{\infty}
e^{-x^2}dx = \sqrt{\pi}
$$`);
  assert.match(html, /data-type="inline-math" data-latex="E = mc\^2"/);
  assert.match(html, /data-latex="\\frac\{a_1\}\{b\}"/);
  assert.match(html, /data-type="block-math"/);
  assert.match(blogMarkdownHtml("$2 + 2$"), /data-latex="2 \+ 2"/);
  assert.match(html, /\\int_\{-\\infty\}\^\{\\infty\}/);
});

test("currency, escaped delimiters and code remain literal", () => {
  const literal = String.raw`Costs $5 and $10. Escaped \$x\$. Code: ` + "`$x$`";
  assert.doesNotMatch(blogMarkdownHtml(literal), /data-type="(?:inline|block)-math"/);
  assert.doesNotMatch(blogMarkdownHtml("```tex\n$x$\n$$y$$\n```"), /data-type="(?:inline|block)-math"/);
  const code = { type: "codeBlock", content: [{ type: "text", text: "$x$" }] };
  assert.deepEqual(normalizeBlogMath(code), code);
  const marked = { type: "paragraph", content: [{ type: "text", text: "$x$", marks: [{ type: "code" }] }] };
  assert.deepEqual(normalizeBlogMath(marked), marked);
  assert.deepEqual(
    normalizeBlogMath(paragraph(String.raw`$5 and $10; \$x\$`)),
    paragraph(String.raw`$5 and $10; \$x\$`),
  );
});

test("legacy paragraphs and hard-break display math render without mutating saved JSON", () => {
  const article = document([
    paragraph("The equation $E = mc^2$ is useful."),
    {
      type: "paragraph",
      content: [
        { type: "text", text: "$$" },
        { type: "hardBreak" },
        { type: "text", text: String.raw`\int_{-\infty}^{\infty} e^{-x^2}dx = \sqrt{\pi}` },
        { type: "hardBreak" },
        { type: "text", text: "$$" },
      ],
    },
  ]);
  const before = structuredClone(article);
  const normalized = normalizeBlogMath(article.body);
  assert.equal(normalized.content[0].content[1].type, "inlineMath");
  assert.equal(normalized.content[1].type, "blockMath");
  const { html } = renderBlogDocument(article);
  assert.match(html, /class="blog-math-inline"/);
  assert.match(html, /class="blog-math-block"/);
  assert.match(html, /class="katex"/);
  assert.deepEqual(article, before);
});

test("math nodes validate, retain source and contribute searchable plain text", () => {
  const article = document([
    { type: "paragraph", content: [{ type: "inlineMath", attrs: { latex: "E=mc^2" } }] },
    { type: "blockMath", attrs: { latex: String.raw`\sqrt{x}` } },
  ]);
  const validated = validateBlogDocument(article);
  assert.match(blogDocumentText(validated), /E=mc\^2/);
  assert.match(blogDocumentText(validated), /\\sqrt\{x\}/);
  assert.match(renderBlogDocument(validated).html, /katex/);
  for (const attrs of [{ latex: "" }, { latex: "x".repeat(10001) }, { latex: "x", html: "unsafe" }]) {
    assert.throws(() => validateBlogDocument(document([{ type: "blockMath", attrs }])));
  }
  assert.throws(() => validateBlogDocument(document([{ type: "blockMath", attrs: { latex: "x" }, content: [] }])));
});

test("invalid formulas preserve escaped source and hostile LaTeX cannot activate HTML", () => {
  const source = String.raw`\unknown{<script>alert(1)</script>}`;
  const result = renderMath(source, true);
  assert.equal(result.error, true);
  assert.match(result.html, /&lt;script&gt;/);
  assert.doesNotMatch(result.html, /<script>/);
  for (const latex of [
    String.raw`\href{javascript:alert(1)}{click}`,
    String.raw`\includegraphics{https://example.com/track}`,
    String.raw`\htmlClass{evil}{x}`,
  ]) {
    const { html } = renderMath(latex, false);
    assert.doesNotMatch(html, /<a\b|<img\b|class="evil"/);
  }
  assert.equal(renderMath(String.raw`\def\x{\x}\x`, false).error, true);
});
