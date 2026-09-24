import { expect, test } from "vitest";
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
  expect(html).toMatch(/data-type="inline-math" data-latex="E = mc\^2"/);
  expect(html).toMatch(/data-latex="\\frac\{a_1\}\{b\}"/);
  expect(html).toMatch(/data-type="block-math"/);
  expect(blogMarkdownHtml("$2 + 2$")).toMatch(/data-latex="2 \+ 2"/);
  expect(html).toMatch(/\\int_\{-\\infty\}\^\{\\infty\}/);
});

test("currency, escaped delimiters and code remain literal", () => {
  const literal = String.raw`Costs $5 and $10. Escaped \$x\$. Code: ` + "`$x$`";
  expect(blogMarkdownHtml(literal)).not.toMatch(/data-type="(?:inline|block)-math"/);
  expect(blogMarkdownHtml("```tex\n$x$\n$$y$$\n```")).not.toMatch(/data-type="(?:inline|block)-math"/);
  const code = { type: "codeBlock", content: [{ type: "text", text: "$x$" }] };
  expect(normalizeBlogMath(code)).toEqual(code);
  const marked = { type: "paragraph", content: [{ type: "text", text: "$x$", marks: [{ type: "code" }] }] };
  expect(normalizeBlogMath(marked)).toEqual(marked);
  expect(normalizeBlogMath(paragraph(String.raw`$5 and $10; \$x\$`))).toEqual(paragraph(String.raw`$5 and $10; \$x\$`));
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
  expect(normalized.content[0].content[1].type).toBe("inlineMath");
  expect(normalized.content[1].type).toBe("blockMath");
  const { html } = renderBlogDocument(article);
  expect(html).toMatch(/class="blog-math-inline"/);
  expect(html).toMatch(/class="blog-math-block"/);
  expect(html).toMatch(/class="katex"/);
  expect(article).toEqual(before);
});

test("math nodes validate, retain source and contribute searchable plain text", () => {
  const article = document([
    { type: "paragraph", content: [{ type: "inlineMath", attrs: { latex: "E=mc^2" } }] },
    { type: "blockMath", attrs: { latex: String.raw`\sqrt{x}` } },
  ]);
  const validated = validateBlogDocument(article);
  expect(blogDocumentText(validated)).toMatch(/E=mc\^2/);
  expect(blogDocumentText(validated)).toMatch(/\\sqrt\{x\}/);
  expect(renderBlogDocument(validated).html).toMatch(/katex/);
  for (const attrs of [{ latex: "" }, { latex: "x".repeat(10001) }, { latex: "x", html: "unsafe" }]) {
    expect(() => validateBlogDocument(document([{ type: "blockMath", attrs }]))).toThrow();
  }
  expect(() => validateBlogDocument(document([{ type: "blockMath", attrs: { latex: "x" }, content: [] }]))).toThrow();
});

test("invalid formulas preserve escaped source and hostile LaTeX cannot activate HTML", () => {
  const source = String.raw`\unknown{<script>alert(1)</script>}`;
  const result = renderMath(source, true);
  expect(result.error).toBe(true);
  expect(result.html).toMatch(/&lt;script&gt;/);
  expect(result.html).not.toMatch(/<script>/);
  for (const latex of [
    String.raw`\href{javascript:alert(1)}{click}`,
    String.raw`\includegraphics{https://example.com/track}`,
    String.raw`\htmlClass{evil}{x}`,
  ]) {
    const { html } = renderMath(latex, false);
    expect(html).not.toMatch(/<a\b|<img\b|class="evil"/);
  }
  expect(renderMath(String.raw`\def\x{\x}\x`, false).error).toBe(true);
});
