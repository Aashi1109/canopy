import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown } from "../lib/markdown/render.ts";

test("headings and line breaks default to Markdown conventions with explicit host overrides", () => {
  const source = "# Title\n\nOne line\nSecond line";
  const standard = renderMarkdown(source);
  assert.match(standard, /<h1>Title<\/h1>/);
  assert.match(standard, /One line\nSecond line/);
  assert.doesNotMatch(standard, /<br>/);
  const blog = renderMarkdown(source, { minimumHeadingLevel: 2, breaks: true });
  assert.match(blog, /<h2>Title<\/h2>/);
  assert.match(blog, /One line<br>Second line/);
});

test("Markdown images render HTTP(S) and relative paths without modifying their resolution", () => {
  for (const href of [
    "https://example.com/picture.png",
    "http://example.com/picture.png",
    "/images/picture.png",
    "./picture.png",
    "../picture.png",
    "images/picture.png",
    "picture.png?width=640&height=480",
  ]) {
    const html = renderMarkdown(`![A useful description](${href})`);
    assert.ok(html.includes(`<img src="${href.replaceAll("&", "&amp;")}" alt="A useful description"`));
  }
  assert.match(renderMarkdown("![](./decorative.png)"), /alt=""/);
  assert.match(
    renderMarkdown('![A "quoted" <description>](/image.png)'),
    /alt="A &quot;quoted&quot; &lt;description&gt;"/,
  );
});

test("unsafe image destinations have readable fallbacks and attributes cannot inject HTML", () => {
  for (const href of [
    "javascript:alert%281%29",
    "data:image/svg+xml,test",
    "file:///tmp/image.png",
    "blob:https://example.com/image",
    "mailto:photo@example.com",
    "https://user:password@example.com/image.png",
  ]) {
    const html = renderMarkdown(`![Image description](${href})`);
    assert.doesNotMatch(html, /<img\b/);
    assert.match(html, /Image description/);
  }
  const html = renderMarkdown('![Alt](/picture.png?x="onerror="alert%281%29)');
  assert.match(html, /src="\/picture\.png\?x=&quot;onerror=&quot;alert%281%29"/);
  assert.doesNotMatch(html, /\sonerror=/);
  assert.doesNotMatch(renderMarkdown("![Alt](javascript&#58;alert%281%29)"), /src="javascript:/);
});

test("standalone Markdown renders formatting, highlighted code and tables", () => {
  const html = renderMarkdown(
    "# Heading\n\n**Bold** and *italic* and `inline`.\n\n> Quote\n\n- First\n- Second\n\n```js\nconst value = 1;\n```\n\n| Name | Value |\n| --- | --- |\n| A | B |",
  );
  for (const fragment of [
    "<h1>Heading</h1>",
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
  assert.match(renderMarkdown("```mermaid\ngraph LR\n A-->B\n```"), /class="language-mermaid">graph LR\n A--&gt;B/);
  assert.match(renderMarkdown("An **unfinished response"), /unfinished response/);
});

test("display Markdown uses shared math and task-list markup", () => {
  const html = renderMarkdown("- [x] Done\n- [ ] Next\n\nInline $x^2$\n\n$$\nx^2 + y^2\n$$");
  assert.match(html, /data-task-checkbox="true"[^>]*aria-checked="true"/);
  assert.match(html, /data-task-checkbox="false"[^>]*aria-checked="false"/);
  assert.doesNotMatch(html, /<input\b/);
  assert.doesNotMatch(renderMarkdown("- [x] Done\n\n- [ ] Next"), /<input\b/);
  assert.match(html, /class="math-inline"><span class="katex"/);
  assert.match(html, /class="math-block"><span class="katex-display"/);
  assert.match(renderMarkdown("$\\notACommand$"), /class="math-inline math-error"/);
});

test("display Markdown escapes untrusted HTML and only activates safe links in new tabs", () => {
  const html = renderMarkdown(
    "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n![Remote](https://example.com/image.png)\n\n[Script](javascript:alert%281%29) [Data](data:text/html,test) [Encoded](javascript&#58;alert%281%29) [Relative](/blog) [Good](https://example.com)",
  );
  assert.doesNotMatch(html, /<script|<img src=x|href="(?:javascript|data):/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<img src="https:\/\/example.com\/image.png" alt="Remote"/);
  assert.match(html, /href="https:\/\/example.com" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="\/blog" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(renderMarkdown("```html\n<script>alert(1)</script>\n```"), /<script>/);
});

test("generated table line breaks require an explicit HTML line-break option", () => {
  const source = "| Name | Notes |\n| --- | --- |\n| Ada | First<br>Second |";

  const standard = renderMarkdown(source);
  assert.match(standard, /<td>First&lt;br&gt;Second<\/td>/);
  assert.equal(renderMarkdown(source, { allowHtmlLineBreaks: false }), standard);
  const preview = renderMarkdown(source, { allowHtmlLineBreaks: true });
  assert.match(preview, /<td>First<br>Second<\/td>/);
});

test("HTML line-break opt-in normalizes only attribute-free br tags", () => {
  for (const tag of ["<br>", "<BR>", "<br/>", "<Br />", "<br \t/>"]) {
    const html = renderMarkdown(`Before${tag}After`, { allowHtmlLineBreaks: true });
    assert.equal(html, "<p>Before<br>After</p>\n", tag);
  }
});

test("HTML line-break opt-in still escapes attributes and every other raw HTML element", () => {
  for (const tag of [
    '<br onclick="alert(1)">',
    '<br style="color:red">',
    '<br class="example"/>',
    "</br>",
    "<brx>",
    "<script>alert(1)</script>",
    '<img src="x" onerror="alert(1)">',
    '<iframe src="https://example.com"></iframe>',
  ]) {
    const html = renderMarkdown(`Before${tag}After`, { allowHtmlLineBreaks: true });
    assert.doesNotMatch(html, /<\/?(?:br|brx|script|img|iframe)\b/i, tag);
    assert.match(html, /&lt;/, tag);
  }
  const combined = renderMarkdown('<br><img src="x" onerror="alert(1)">', { allowHtmlLineBreaks: true });
  assert.doesNotMatch(combined, /<img\b/i);
  assert.match(combined, /&lt;img\b/);
});

test("HTML line-break opt-in leaves code spans and fenced HTML literal", () => {
  const inline = renderMarkdown("`<br>` and `<br onclick=alert(1)>`", { allowHtmlLineBreaks: true });
  assert.match(inline, /<code>&lt;br&gt;<\/code>/);
  assert.match(inline, /<code>&lt;br onclick=alert\(1\)&gt;<\/code>/);
  assert.doesNotMatch(inline, /<br\b/i);

  const table = renderMarkdown("| Literal |\n| --- |\n| `<br>` |", { allowHtmlLineBreaks: true });
  assert.match(table, /<td><code>&lt;br&gt;<\/code><\/td>/);
  assert.doesNotMatch(table, /<br\b/i);

  const fenced = renderMarkdown("```html\n<br>\n```", { allowHtmlLineBreaks: true });
  assert.match(fenced, /<pre><code/);
  assert.doesNotMatch(fenced, /<br\b/i);
});
