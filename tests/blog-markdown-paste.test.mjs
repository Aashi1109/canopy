import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { blogMarkdownHtml, parseBlogClipboardText } from "../app/admin/(protected)/blog/lib/markdownPaste.ts";

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
  assert.doesNotMatch(html, /<input\b/);
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
