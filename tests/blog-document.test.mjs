import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { blogFormattingExtensions } from "../app/admin/(protected)/blog/lib/formattingExtensions.ts";
import {
  assertBlogPublishable,
  blogDocumentHash,
  blogDocumentText,
  blogImageUrl,
  blogSlugFromTitle,
  createBlogDocument,
  renderBlogDocument,
  validateBlogDocument,
} from "../lib/blog/document.ts";

const paragraph = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const image = {
  publicId: "smarttools/blog/95c40d91-c008-4474-965b-71ec2e4f2b81", version: 1234, format: "webp",
  width: 800, height: 600, alt: "A useful diagram", caption: "Diagram caption",
};
function article() {
  return { ...createBlogDocument(" My article "), excerpt: "A useful summary",
    category: { id: "category-1", label: "Guides" }, body: { type: "doc", content: [paragraph("Hello world")] } };
}

test("draft creation is normalized and publication requires completed article fields", () => {
  const draft = createBlogDocument("  Hello & world  ");
  assert.equal(draft.title, "Hello & world");
  assert.equal(draft.authorName, "SmartTools Team");
  assert.throws(() => assertBlogPublishable(draft), /excerpt/i);
  for (const [field, value] of [["title", ""], ["excerpt", ""], ["authorName", ""], ["category", null]]) {
    assert.throws(() => assertBlogPublishable({ ...article(), [field]: value }));
  }
  assert.throws(() => assertBlogPublishable({ ...article(), body: { type: "doc", content: [{ type: "paragraph" }] } }), /body/i);
  assert.doesNotThrow(() => assertBlogPublishable(validateBlogDocument(article())));
});

test("slugs use existing tool normalization, bounded lengths and Unicode fallback", () => {
  assert.equal(blogSlugFromTitle("  PDFs & Images!  "), "pdfs-and-images");
  assert.equal(blogSlugFromTitle("a".repeat(200)).length, 160);
  assert.match(blogSlugFromTitle("हिन्दी"), /^post-[a-f0-9]{8}$/);
  assert.throws(() => createBlogDocument("   "), /title/i);
});

test("document hashes ignore property order and tag order, but preserve article edits", () => {
  const a = article();
  a.tags = [{ id: "b", label: "B" }, { id: "a", label: "A" }];
  const b = Object.fromEntries(Object.entries(a).reverse());
  b.tags = [...a.tags].reverse();
  assert.equal(blogDocumentHash(validateBlogDocument(a)), blogDocumentHash(validateBlogDocument(b)));
  assert.notEqual(blogDocumentHash(a), blogDocumentHash({ ...a, title: "Different" }));
});

test("unknown properties, prototype payloads, cycles and non-JSON input fail closed", () => {
  const polluted = JSON.parse(JSON.stringify(article()).replace('"schemaVersion":1', '"schemaVersion":1,"__proto__":{"polluted":true}'));
  for (const value of [{ ...article(), created_by: "forged" }, polluted, { ...article(), category: new Date() }, { ...article(), title: undefined }]) {
    assert.throws(() => validateBlogDocument(value));
  }
  const cycle = article(); cycle.body.content.push(cycle.body);
  assert.throws(() => validateBlogDocument(cycle), /JSON|cyclic|depth/i);
  const arrayWithSerializer = article(); arrayWithSerializer.tags.toJSON = () => [];
  assert.throws(() => validateBlogDocument(arrayWithSerializer), /JSON/i);
  assert.throws(() => validateBlogDocument({ ...article(), title: "broken \ud800" }), /text/i);
  assert.throws(() => validateBlogDocument({ ...article(), body: { type: "doc", content: [{ type: "html", text: "<script>bad()</script>" }] } }));
  assert.equal({}.polluted, undefined);
});

test("normalization is idempotent and rendering supports every basic article block", () => {
  const value = article();
  value.body.content = [
    {type:"blockquote",content:[paragraph("A quotation")]},
    {type:"bulletList",content:[{type:"listItem",content:[paragraph("A bullet")]}]},
    {type:"horizontalRule"},
    {type:"paragraph",content:[{type:"text",text:"Line one",marks:[{type:"underline"},{type:"italic"},{type:"strike"}]},{type:"hardBreak"},{type:"text",text:"inline code",marks:[{type:"code"}]}]},
    {type:"paragraph",content:[{type:"text",text:"Read more",marks:[{type:"link",attrs:{href:"/blog/another",target:"_self",rel:"nofollow"}}]}]},
  ];
  const normalized = validateBlogDocument(value);
  assert.deepEqual(validateBlogDocument(normalized), normalized);
  const {html} = renderBlogDocument(normalized);
  assert.match(html, /<blockquote><p>A quotation<\/p><\/blockquote>/);
  assert.match(html, /<ul><li><p>A bullet<\/p><\/li><\/ul>/);
  assert.match(html, /<hr>/);
  assert.match(html, /<br><code>inline code<\/code>/);
  assert.match(html, /href="\/blog\/another" target="_self" rel="nofollow"/);
});

test("bounded fields, bytes, node count, depth and duplicate selections are enforced", () => {
  for (const [field, value] of [["title", "a".repeat(201)], ["excerpt", "a".repeat(501)], ["seoTitle", "a".repeat(161)], ["seoDescription", "a".repeat(321)], ["tags", Array.from({length:21}, (_,i) => ({ id: String(i), label: "Tag" }))], ["relatedToolIds", Array.from({length:13}, (_,i) => `media.${i}`)]]) {
    assert.throws(() => validateBlogDocument({ ...article(), [field]: value }));
  }
  assert.throws(() => validateBlogDocument({ ...article(), body: { type: "doc", content: [paragraph("😀".repeat(300000))] } }), /size|MiB/i);
  assert.throws(() => validateBlogDocument({ ...article(), body: { type: "doc", content: Array.from({length:10001}, () => ({ type: "paragraph" })) } }), /nodes|complex/i);
  let nested = paragraph("deep");
  for (let i = 0; i < 33; i++) nested = { type: "blockquote", content: [nested] };
  assert.throws(() => validateBlogDocument({ ...article(), body: { type: "doc", content: [nested] } }), /depth/i);
  assert.throws(() => validateBlogDocument({ ...article(), tags: [{id:"same",label:"A"},{id:"same",label:"B"}] }), /duplicate/i);
  assert.throws(() => validateBlogDocument({ ...article(), relatedToolIds: ["media.a", "media.a"] }), /duplicate/i);
});

test("malicious links and unsupported attributes cannot reach rendered HTML", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,bad", "//evil.example", "java\tscript:bad", "https://user:pass@example.com", "\\evil.example"]) {
    const value = article(); value.body.content[0].content[0].marks = [{ type: "link", attrs: { href } }];
    assert.throws(() => validateBlogDocument(value), /link|URL/i, href);
  }
  const value = article(); value.body.content[0].attrs = { onclick: "bad()" };
  assert.throws(() => validateBlogDocument(value), /attribute|property/i);
});

test("links survive the installed editor schema and normalize without extra attributes", () => {
  const value = article();
  value.body.content[0].content[0].marks = [{ type: "link", attrs: { href: "https://example.com/guide" } }];
  const schema = getSchema([StarterKit]);
  value.body = schema.nodeFromJSON(value.body).toJSON();
  const normalized = validateBlogDocument(value);
  assert.deepEqual(normalized.body.content[0].content[0].marks, [{
    type: "link", attrs: { href: "https://example.com/guide", target: "_blank", rel: "noopener noreferrer nofollow" },
  }]);
  assert.deepEqual(validateBlogDocument({ ...normalized, body: schema.nodeFromJSON(normalized.body).toJSON() }), normalized);
  value.body.content[0].content[0].marks[0].attrs.title = "Unapproved tooltip";
  assert.throws(() => validateBlogDocument(value), /unsupported attributes/i);
});

test("renderer safely escapes text, creates stable distinct headings, and protects outbound links", () => {
  const value = article();
  value.body.content = [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A & B" }] },
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "A & B" }] },
    { type: "paragraph", content: [{ type: "text", text: '<script>alert("x")</script>', marks: [{ type: "bold" }, { type: "link", attrs: { href: 'https://example.com/?a="quoted"&b=1', target: "_blank" } }] }] },
    { type: "codeBlock", attrs: { language: "javascript" }, content: [{ type: "text", text: "<b>code</b>" }] },
  ];
  const output = renderBlogDocument(validateBlogDocument(value));
  assert.equal(output.headings.length, 2);
  assert.notEqual(output.headings[0].id, output.headings[1].id);
  assert.match(output.html, /&lt;script&gt;/);
  assert.doesNotMatch(output.html, /<script>/);
  assert.match(output.html, /rel="noopener noreferrer"/);
  assert.match(output.html, /<pre><code class="language-javascript">&lt;b&gt;code&lt;\/b&gt;/);
  assert.equal(output.readingMinutes, 1);
  assert.match(blogDocumentText(value), /A & B\s+A & B/);
});

test("Cloudinary images use immutable configured-cloud URLs and require alt text on publication", () => {
  const value = { ...article(), coverImage: image };
  value.body.content.push({ type: "image", attrs: image });
  assert.throws(() => validateBlogDocument(value), /cloud/i);
  const normalized = validateBlogDocument(value, { cloudName: "my-cloud" });
  const output = renderBlogDocument(normalized, { cloudName: "my-cloud" });
  assert.ok(output.html.includes(blogImageUrl(normalized.coverImage, { cloudName: "my-cloud" })));
  assert.equal(blogImageUrl(normalized.coverImage, { cloudName: "my-cloud" }), "https://res.cloudinary.com/my-cloud/image/upload/v1234/smarttools/blog/95c40d91-c008-4474-965b-71ec2e4f2b81.webp");
  assert.match(output.html, /<figcaption>Diagram caption<\/figcaption>/);
  assert.doesNotThrow(() => assertBlogPublishable(normalized));
  for (const attrs of [ { ...image, publicId: "../escape" }, { ...image, version: 0 }, { ...image, format: "svg" }, { ...image, width: -1 }, { ...image, src: "https://evil.example/image.webp" } ]) {
    assert.throws(() => validateBlogDocument({ ...article(), coverImage: attrs }, { cloudName: "my-cloud" }));
  }
  const noAlt = validateBlogDocument({ ...value, coverImage: { ...image, alt: "" } }, { cloudName: "my-cloud" });
  assert.throws(() => assertBlogPublishable(noAlt), /alt/i);
});

test("body image layout survives document roundtrips without changing intrinsic dimensions or the cover", () => {
  const options = { cloudName: "my-cloud" };
  for (const [alignment, marginLeft, marginRight] of [["left", "0", "auto"], ["center", "auto", "auto"], ["right", "auto", "0"]]) {
    for (const displayWidth of [10, 55, 100]) {
      const value = { ...article(), coverImage: image, body: { type: "doc", content: [{ type: "image", attrs: { ...image, displayWidth, alignment } }] } };
      const normalized = validateBlogDocument(value, options);
      assert.deepEqual(normalized.body.content[0].attrs, { ...image, displayWidth, alignment });
      assert.deepEqual(normalized.coverImage, image);
      assert.deepEqual(validateBlogDocument(JSON.parse(JSON.stringify(normalized)), options), normalized);
      const { html } = renderBlogDocument(normalized, options);
      assert.ok(html.includes(`width:${displayWidth}%;margin-left:${marginLeft};margin-right:${marginRight}`));
      assert.match(html, /width="800" height="600"/);
      assert.match(html, /style="width:100%;height:auto"/);
    }
  }
});

test("legacy body images and empty editor layout defaults keep their full-width centered layout", () => {
  const options = { cloudName: "my-cloud" };
  const legacy = { ...article(), body: { type: "doc", content: [{ type: "image", attrs: image }] } };
  const normalized = validateBlogDocument(legacy, options);
  assert.deepEqual(normalized.body.content[0].attrs, { ...image, displayWidth: 100, alignment: "center" });
  const defaults = { ...legacy, body: { type: "doc", content: [{ type: "image", attrs: { ...image, displayWidth: null, alignment: null } }] } };
  assert.deepEqual(validateBlogDocument(defaults, options), normalized);
  assert.equal(renderBlogDocument(legacy, options).html, renderBlogDocument(normalized, options).html);
  assert.doesNotThrow(() => assertBlogPublishable(normalized));
  const resized = structuredClone(normalized);
  resized.body.content[0].attrs.displayWidth = 50;
  assert.notEqual(blogDocumentHash(resized), blogDocumentHash(normalized));
});

test("image layout rejects unsafe values and remains exclusive to body images", () => {
  const options = { cloudName: "my-cloud" };
  for (const layout of [
    ...[0, 9, 101, 50.5, "50", "50%;color:red", true].map((displayWidth) => ({ displayWidth })),
    ...["justify", "left;color:red", "CENTER", 0, true].map((alignment) => ({ alignment })),
    { style: "width:50%" }, { onclick: "alert(1)" },
  ]) {
    const value = { ...article(), body: { type: "doc", content: [{ type: "image", attrs: { ...image, ...layout } }] } };
    assert.throws(() => validateBlogDocument(value, options));
    assert.throws(() => renderBlogDocument(value, options));
  }
  for (const layout of [{ displayWidth: 50 }, { alignment: "right" }]) {
    assert.throws(() => validateBlogDocument({ ...article(), coverImage: { ...image, ...layout } }, options), /unsupported property/);
  }
});

test("images cannot reference mutable Cloudinary assets outside the immutable blog namespace", () => {
  for (const publicId of [
    "smarttools/tool-icons/media.image-converter",
    "smarttools/blog/cover",
    "smarttools/blog/95c40d91-c008-1474-965b-71ec2e4f2b81",
    "smarttools/blog/95c40d91-c008-4474-765b-71ec2e4f2b81",
    "smarttools/blog/95C40D91-C008-4474-965B-71EC2E4F2B81",
    "smarttools/blog/95c40d91-c008-4474-965b-71ec2e4f2b81/suffix",
  ]) {
    assert.throws(() => validateBlogDocument({ ...article(), coverImage: { ...image, publicId } }, { cloudName: "my-cloud" }), /immutable blog asset/);
    assert.throws(() => validateBlogDocument({ ...article(), body: { type: "doc", content: [{ type: "image", attrs: { ...image, publicId } }] } }, { cloudName: "my-cloud" }), /immutable blog asset/);
  }
});

test("table and list content models reject malformed structures and allow safe merges", () => {
  const cell = (text, attrs = {}) => ({type:"tableCell", attrs, content:[paragraph(text)]});
  const valid = article(); valid.body.content = [
    {type:"orderedList",attrs:{start:3},content:[{type:"listItem",content:[paragraph("First")]}]},
    {type:"table",content:[
      {type:"tableRow",content:[cell("Wide", {colspan:2, rowspan:1,colwidth:[100,100]})]},
      {type:"tableRow",content:[cell("Left"),cell("Right")]},
    ]},
  ];
  assert.match(renderBlogDocument(validateBlogDocument(valid)).html, /<ol start="3">/);
  assert.match(renderBlogDocument(validateBlogDocument(valid)).html, /colspan="2"/);
  const rowspan = { type: "table", content: [
    { type: "tableRow", content: [cell("Merged", { rowspan: 2, colspan: 2, colwidth: [0, 120] })] },
    { type: "tableRow", content: [] },
  ] };
  assert.match(renderBlogDocument(validateBlogDocument({ ...article(), body: { type: "doc", content: [rowspan] } })).html, /rowspan="2"/);
  for (const node of [
    {type:"table",content:[{type:"tableRow",content:[cell("A")]},{type:"tableRow",content:[cell("B"),cell("C")]}]},
    {type:"table",content:[{type:"tableRow",content:[cell("A",{rowspan:2})]}]},
    {type:"paragraph",content:[paragraph("Nested block")]},
    {type:"bulletList",content:[paragraph("Not a list item")]},
    {type:"heading",attrs:{level:1},content:[]},
    {type:"codeBlock",content:[{type:"text",text:"x",marks:[{type:"bold"}]}]},
  ]) assert.throws(() => validateBlogDocument({...article(),body:{type:"doc",content:[node]}}));
});

test("table cell colors and alignment normalize and render without accepting arbitrary CSS", () => {
  for (const align of ["left", "center", "right"]) {
    const value = { ...article(), body: { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [
      { type: "tableHeader", attrs: { align, backgroundColor: "#ABCDEF" }, content: [paragraph("Heading")] },
      { type: "tableCell", attrs: { align: null, backgroundColor: null }, content: [paragraph("Value")] },
    ] }] }] } };
    const normalized = validateBlogDocument(value);
    assert.equal(normalized.body.content[0].content[0].content[0].attrs.backgroundColor, "#abcdef");
    assert.deepEqual(validateBlogDocument(JSON.parse(JSON.stringify(normalized))), normalized);
    assert.match(renderBlogDocument(normalized).html, new RegExp(`style="text-align:${align};background-color:#abcdef"`));
  }
  for (const attrs of [
    ...["justify", "center;color:red", true, 1].map((align) => ({ align })),
    ...["red", "#fff", "#ffffffff", "#ffffff;background:url(x)", "var(--primary)", true].map((backgroundColor) => ({ backgroundColor })),
    { style: "background:red" },
  ]) {
    const value = { ...article(), body: { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [
      { type: "tableCell", attrs, content: [paragraph("Value")] },
    ] }] }] } };
    assert.throws(() => validateBlogDocument(value));
    assert.throws(() => renderBlogDocument(value));
  }
});

test("resized table columns retain widths through merged cells and rows in public HTML", () => {
  const cell = (text, attrs = {}) => ({ type: "tableCell", attrs, content: [paragraph(text)] });
  const value = { ...article(), body: { type: "doc", content: [{ type: "table", content: [
    { type: "tableRow", content: [cell("Two rows", { rowspan: 2, colwidth: [120] }), cell("Two columns", { colspan: 2, colwidth: [180, 240] })] },
    { type: "tableRow", content: [cell("Middle"), cell("Right")] },
  ] }] } };
  const { html } = renderBlogDocument(validateBlogDocument(value));
  assert.match(html, /<colgroup><col style="width:120px"><col style="width:180px"><col style="width:240px"><\/colgroup>/);
  assert.match(html, /<table style="display:table;max-width:none;table-layout:fixed;width:540px">/);
  assert.match(html, /colspan="2" rowspan="1"/);
  assert.match(html, /role="region" aria-label="Scrollable table" tabindex="0"/);
  assert.match(html, /max-width:100%;overflow-x:auto/);
  value.body.content[0].content[0].content[1].attrs.colwidth = [0, 0];
  value.body.content[0].content[1].content[0].attrs.colwidth = [180];
  value.body.content[0].content[1].content[1].attrs.colwidth = [240];
  assert.match(renderBlogDocument(value).html, /<colgroup><col style="width:120px"><col style="width:180px"><col style="width:240px"><\/colgroup>/);

  // Older snapshots may put widths only on later rows; zero leaves the column automatic.
  value.body.content[0].content = [
    { type: "tableRow", content: [cell("Auto"), cell("Resized")] },
    { type: "tableRow", content: [cell("Merged", { colspan: 2, colwidth: [0, 220] })] },
  ];
  const partial = renderBlogDocument(validateBlogDocument(value)).html;
  assert.match(partial, /<colgroup><col><col style="width:220px"><\/colgroup>/);
  assert.match(partial, /min-width:245px/);
  value.body.content[0].content.push({ type: "tableRow", content: [cell("Auto"), cell("Legacy conflicting width", { colwidth: [300] })] });
  assert.match(renderBlogDocument(value).html, /<colgroup><col><col style="width:220px"><\/colgroup>/);
});

test("legacy tables without column sizes retain automatic layout", () => {
  const value = { ...article(), body: { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [
    { type: "tableCell", content: [paragraph("First")] },
    { type: "tableCell", attrs: { colwidth: [0] }, content: [paragraph("Second")] },
  ] }] }] } };
  const { html } = renderBlogDocument(validateBlogDocument(value));
  assert.match(html, /<table style="display:table;max-width:none">/);
  assert.doesNotMatch(html, /<colgroup>|table-layout:fixed/);
});


test("editor formatting survives validation and renders safely in public articles", () => {
  const value = article();
  value.body.content = [
    { type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Highlighted", marks: [{ type: "highlight" }, { type: "superscript" }] }] },
    { type: "heading", attrs: { level: 2, textAlign: "right" }, content: [{ type: "text", text: "H2O", marks: [{ type: "subscript" }] }] },
    { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [paragraph("Done")] }] },
  ];
  const schema = getSchema([StarterKit, ...blogFormattingExtensions]);
  const body = schema.nodeFromJSON(value.body);
  body.check();
  const normalized = validateBlogDocument({ ...value, body: body.toJSON() });
  assert.deepEqual(validateBlogDocument(normalized), normalized);
  const { html } = renderBlogDocument(normalized);
  assert.match(html, /text-align:center/);
  assert.match(html, /<sup><mark>Highlighted<\/mark><\/sup>/);
  assert.match(html, /text-align:right/);
  assert.match(html, /<sub>H2O<\/sub>/);
  assert.match(html, /type="checkbox" disabled checked/);
  for (const textAlign of ["center;color:red", "diagonal"]) {
    assert.throws(() => validateBlogDocument({ ...article(), body: { type: "doc", content: [{ ...paragraph("Unsafe"), attrs: { textAlign } }] } }));
  }
  value.body.content[2].content[0].attrs.checked = "yes";
  assert.throws(() => validateBlogDocument(value));
});

test("highlight colors retain their value through editor, revision, and public rendering roundtrips", () => {
  const value = article();
  value.body.content[0].content[0].marks = [{ type: "highlight", attrs: { color: "#ABCDEF" } }];
  const schema = getSchema([StarterKit, ...blogFormattingExtensions]);
  const normalized = validateBlogDocument({ ...value, body: schema.nodeFromJSON(value.body).toJSON() });
  assert.deepEqual(normalized.body.content[0].content[0].marks, [{ type: "highlight", attrs: { color: "#abcdef" } }]);
  assert.deepEqual(validateBlogDocument(JSON.parse(JSON.stringify(normalized))), normalized);
  assert.deepEqual(validateBlogDocument({ ...normalized, body: schema.nodeFromJSON(normalized.body).toJSON() }), normalized);
  assert.equal(renderBlogDocument(normalized).html, '<p><mark style="background-color:#abcdef">Hello world</mark></p>');
  const recolored = structuredClone(normalized);
  recolored.body.content[0].content[0].marks[0].attrs.color = "#123456";
  assert.notEqual(blogDocumentHash(recolored), blogDocumentHash(normalized));
});

test("legacy highlights retain their normalized document hash and yellow default rendering", () => {
  const legacy = article();
  legacy.body.content[0].content[0].marks = [{ type: "highlight" }];
  const normalized = validateBlogDocument(legacy);
  for (const attrs of [undefined, {}, { color: null }]) {
    const value = structuredClone(legacy);
    value.body.content[0].content[0].marks = [{ type: "highlight", ...(attrs === undefined ? {} : { attrs }) }];
    const schema = getSchema([StarterKit, ...blogFormattingExtensions]);
    const roundtrip = validateBlogDocument({ ...value, body: schema.nodeFromJSON(value.body).toJSON() });
    assert.deepEqual(roundtrip, normalized);
    assert.equal(blogDocumentHash(roundtrip), blogDocumentHash(normalized));
    assert.equal(renderBlogDocument(roundtrip).html, "<p><mark>Hello world</mark></p>");
  }
});

test("highlight colors reject arbitrary CSS and duplicate or unsupported attributes", () => {
  for (const attrs of [
    ...["red", "#fff", "#ffffffff", "#123456;background:url(x)", "var(--primary)", "url(javascript:alert(1))", "", true, 1, [], {}].map(color => ({ color })),
    { color: "#abcdef", style: "color:red" }, { onclick: "alert(1)" },
  ]) {
    const value = article();
    value.body.content[0].content[0].marks = [{ type: "highlight", attrs }];
    assert.throws(() => validateBlogDocument(value));
    assert.throws(() => renderBlogDocument(value));
  }
  const value = article();
  value.body.content[0].content[0].marks = [{ type: "highlight", attrs: { color: "#abcdef" } }, { type: "highlight", attrs: { color: "#123456" } }];
  assert.throws(() => validateBlogDocument(value), /Duplicate text marks/);
});
