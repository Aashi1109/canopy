import { expect, test } from "vitest";
import { renderMarkdown } from "../lib/markdown/render.ts";

test("headings and line breaks default to Markdown conventions with explicit host overrides", () => {
  const source = "# Title\n\nOne line\nSecond line";
  const standard = renderMarkdown(source);
  expect(standard).toMatch(/<h1>Title<\/h1>/);
  expect(standard).toMatch(/One line\nSecond line/);
  expect(standard).not.toMatch(/<br>/);
  const blog = renderMarkdown(source, { minimumHeadingLevel: 2, breaks: true });
  expect(blog).toMatch(/<h2>Title<\/h2>/);
  expect(blog).toMatch(/One line<br>Second line/);
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
    expect(html.includes(`<img src="${href.replaceAll("&", "&amp;")}" alt="A useful description"`)).toBeTruthy();
  }
  expect(renderMarkdown("![](./decorative.png)")).toMatch(/alt=""/);
  expect(renderMarkdown('![A "quoted" <description>](/image.png)')).toMatch(
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
    expect(html).not.toMatch(/<img\b/);
    expect(html).toMatch(/Image description/);
  }
  const html = renderMarkdown('![Alt](/picture.png?x="onerror="alert%281%29)');
  expect(html).toMatch(/src="\/picture\.png\?x=&quot;onerror=&quot;alert%281%29"/);
  expect(html).not.toMatch(/\sonerror=/);
  expect(renderMarkdown("![Alt](javascript&#58;alert%281%29)")).not.toMatch(/src="javascript:/);
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
    expect(html.includes(fragment), fragment).toBeTruthy();
  }
  expect(renderMarkdown("```mermaid\ngraph LR\n A-->B\n```")).toMatch(/class="language-mermaid">graph LR\n A--&gt;B/);
  expect(renderMarkdown("An **unfinished response")).toMatch(/unfinished response/);
});

test("display Markdown uses shared math and task-list markup", () => {
  const html = renderMarkdown("- [x] Done\n- [ ] Next\n\nInline $x^2$\n\n$$\nx^2 + y^2\n$$");
  expect(html).toMatch(/data-task-checkbox="true"[^>]*aria-checked="true"/);
  expect(html).toMatch(/data-task-checkbox="false"[^>]*aria-checked="false"/);
  expect(html).not.toMatch(/<input\b/);
  expect(renderMarkdown("- [x] Done\n\n- [ ] Next")).not.toMatch(/<input\b/);
  expect(html).toMatch(/class="math-inline"><span class="katex"/);
  expect(html).toMatch(/class="math-block"><span class="katex-display"/);
  expect(renderMarkdown("$\\notACommand$")).toMatch(/class="math-inline math-error"/);
});

test("display Markdown escapes untrusted HTML and only activates safe links in new tabs", () => {
  const html = renderMarkdown(
    "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n![Remote](https://example.com/image.png)\n\n[Script](javascript:alert%281%29) [Data](data:text/html,test) [Encoded](javascript&#58;alert%281%29) [Relative](/blog) [Good](https://example.com)",
  );
  expect(html).not.toMatch(/<script|<img src=x|href="(?:javascript|data):/i);
  expect(html).toMatch(/&lt;script&gt;/);
  expect(html).toMatch(/<img src="https:\/\/example.com\/image.png" alt="Remote"/);
  expect(html).toMatch(/href="https:\/\/example.com" target="_blank" rel="noopener noreferrer"/);
  expect(html).toMatch(/href="\/blog" target="_blank" rel="noopener noreferrer"/);
  expect(renderMarkdown("```html\n<script>alert(1)</script>\n```")).not.toMatch(/<script>/);
});

test("generated table line breaks require an explicit HTML line-break option", () => {
  const source = "| Name | Notes |\n| --- | --- |\n| Ada | First<br>Second |";

  const standard = renderMarkdown(source);
  expect(standard).toMatch(/<td>First&lt;br&gt;Second<\/td>/);
  expect(renderMarkdown(source, { allowHtmlLineBreaks: false })).toBe(standard);
  const preview = renderMarkdown(source, { allowHtmlLineBreaks: true });
  expect(preview).toMatch(/<td>First<br>Second<\/td>/);
});

test("HTML line-break opt-in normalizes only attribute-free br tags", () => {
  for (const tag of ["<br>", "<BR>", "<br/>", "<Br />", "<br \t/>"]) {
    const html = renderMarkdown(`Before${tag}After`, { allowHtmlLineBreaks: true });
    expect(html, tag).toBe("<p>Before<br>After</p>\n");
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
    expect(html, tag).not.toMatch(/<\/?(?:br|brx|script|img|iframe)\b/i);
    expect(html, tag).toMatch(/&lt;/);
  }
  const combined = renderMarkdown('<br><img src="x" onerror="alert(1)">', { allowHtmlLineBreaks: true });
  expect(combined).not.toMatch(/<img\b/i);
  expect(combined).toMatch(/&lt;img\b/);
});

test("HTML line-break opt-in leaves code spans and fenced HTML literal", () => {
  const inline = renderMarkdown("`<br>` and `<br onclick=alert(1)>`", { allowHtmlLineBreaks: true });
  expect(inline).toMatch(/<code>&lt;br&gt;<\/code>/);
  expect(inline).toMatch(/<code>&lt;br onclick=alert\(1\)&gt;<\/code>/);
  expect(inline).not.toMatch(/<br\b/i);

  const table = renderMarkdown("| Literal |\n| --- |\n| `<br>` |", { allowHtmlLineBreaks: true });
  expect(table).toMatch(/<td><code>&lt;br&gt;<\/code><\/td>/);
  expect(table).not.toMatch(/<br\b/i);

  const fenced = renderMarkdown("```html\n<br>\n```", { allowHtmlLineBreaks: true });
  expect(fenced).toMatch(/<pre><code/);
  expect(fenced).not.toMatch(/<br\b/i);
});
