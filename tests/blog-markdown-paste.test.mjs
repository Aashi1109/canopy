import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  blogMarkdownHtml,
  parseBlogClipboardText,
  renderBlogMarkdown,
} from "../app/admin/(protected)/blog/lib/markdownPaste.ts";

test("explicit plain paste keeps Markdown literal and preserves the insertion marks", () => {
  const schema = getSchema([StarterKit]);
  const doc = schema.nodes.doc.create(
    null,
    schema.nodes.paragraph.create(null, schema.text("Here", [schema.marks.bold.create()])),
  );
  const slice = parseBlogClipboardText("**literal**\r\n# Heading", doc.resolve(2), true, { state: { schema } });
  assert.equal(slice.content.child(0).textContent, "**literal**");
  assert.equal(slice.content.child(1).textContent, "# Heading");
  assert.equal(slice.content.child(0).firstChild.marks[0].type.name, "bold");
});

test("list starts and code languages stay within the saved article schema", () => {
  for (const start of [0, 1000001]) assert.doesNotMatch(blogMarkdownHtml(`${start}. Item`), /start=/);
  assert.doesNotMatch(blogMarkdownHtml("```bad!\ncode\n```"), /class=/);
});

test("pasted Markdown renders article blocks and inline formatting", () => {
  const html = blogMarkdownHtml(
    "# Title\n\n## Section\n\n**Bold** and *italic* and ~~old~~ and `code`.\n\n- First\n  - Nested\n\n3. Third\n\n> Quote\n\n---\n\n```js\nconst n = 1;\n```\n\n| Name | Value |\n| --- | --- |\n| A | B |",
  );
  for (const fragment of [
    "<h2>Title</h2>",
    "<h2>Section</h2>",
    "<strong>Bold</strong>",
    "<em>italic</em>",
    "<del>old</del>",
    "<code>code</code>",
    "<ul>",
    '<ol start="3">',
    "<blockquote>",
    "<hr>",
    '<pre><code class="language-js">',
    "<table>",
    "<th>Name</th>",
    "<td>B</td>",
  ]) {
    assert.ok(html.includes(fragment), fragment);
  }
});

test("task lists retain checked state and normal text retains line breaks", () => {
  const html = blogMarkdownHtml("- [x] Done\n- [ ] Next");
  assert.match(html, /data-type="taskList"/);
  assert.match(html, /data-checked="true"/);
  assert.match(html, /data-checked="false"/);
  assert.match(blogMarkdownHtml("Line one\nLine two"), /Line one<br>Line two/);
  assert.match(
    blogMarkdownHtml("- Normal\n- [x] Done"),
    /<ul>\s*<li>Normal<\/li>\s*<\/ul>\s*<ul data-type="taskList">/,
  );
});

test("raw HTML and external images remain literal and unsafe links cannot become active", () => {
  const html = blogMarkdownHtml(
    "**Safe**\n\n<script>alert(1)</script>\n\n![Alt](https://example.com/image.png)\n\n[Bad](javascript:alert%281%29) [Good](https://example.com)",
  );
  assert.ok(!/<script|<img|href="javascript:/i.test(html));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /!\[Alt\]\(https:\/\/example.com\/image.png\)/);
  assert.match(html, /href="https:\/\/example.com"/);
});

test("display Markdown renders article formatting, highlighted code and tables", () => {
  const html = renderBlogMarkdown(
    "# Heading\n\n**Bold** and *italic* and `inline`.\n\n> Quote\n\n- First\n- Second\n\n```js\nconst value = 1;\n```\n\n| Name | Value |\n| --- | --- |\n| A | B |",
  );
  for (const fragment of [
    "<h2>Heading</h2>",
    "<strong>Bold</strong>",
    "<em>italic</em>",
    "<code>inline</code>",
    "<blockquote>",
    "<ul>",
    "<table>",
    "<td>B</td>",
    'class="hljs-keyword"',
  ]) {
    assert.ok(html.includes(fragment), fragment);
  }
  assert.match(renderBlogMarkdown("```mermaid\ngraph LR\n A-->B\n```"), /class="language-mermaid">graph LR\n A--&gt;B/);
  assert.match(renderBlogMarkdown("An **unfinished response"), /unfinished response/);
});

test("display Markdown uses the public article math and task-list markup", () => {
  const html = renderBlogMarkdown("- [x] Done\n- [ ] Next\n\nInline $x^2$\n\n$$\nx^2 + y^2\n$$");
  assert.match(html, /data-task-checkbox="true"[^>]*aria-checked="true"/);
  assert.match(html, /data-task-checkbox="false"[^>]*aria-checked="false"/);
  assert.match(html, /class="blog-math-inline"><span class="katex"/);
  assert.match(html, /class="blog-math-block"><span class="katex-display"/);
  assert.match(renderBlogMarkdown("$\\notACommand$"), /class="blog-math-inline blog-math-error"/);
  assert.doesNotMatch(blogMarkdownHtml("$x^2$"), /class="katex"/);
  assert.match(blogMarkdownHtml("$x^2$"), /data-type="inline-math" data-latex="x\^2"/);
});

test("display Markdown escapes untrusted HTML and only activates safe links in new tabs", () => {
  const html = renderBlogMarkdown(
    "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n![Remote](https://example.com/image.png)\n\n[Script](javascript:alert%281%29) [Data](data:text/html,test) [Encoded](javascript&#58;alert%281%29) [Relative](/blog) [Good](https://example.com)",
  );
  assert.doesNotMatch(html, /<script|<img|href="(?:javascript|data):/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /!\[Remote\]\(https:\/\/example.com\/image.png\)/);
  assert.match(html, /href="https:\/\/example.com" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="\/blog" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(renderBlogMarkdown("```html\n<script>alert(1)</script>\n```"), /<script>/);
});
