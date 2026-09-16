import assert from "node:assert/strict";
import test from "node:test";
import { Editor, getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { blogFormattingExtensions } from "../app/admin/(protected)/blog/lib/formattingExtensions.ts";

const extensions = [StarterKit, ...blogFormattingExtensions];
const schema = getSchema(extensions);
const highlight = schema.marks.highlight;
const parse = highlight.spec.parseDOM.find((rule) => rule.tag === "mark").getAttrs;
const element = (color, style = "") => ({
  getAttribute: (name) => (name === "data-color" ? color : null),
  style: { backgroundColor: style },
});
const content = (editor) => JSON.parse(JSON.stringify(editor.getJSON())).content[0].content;

test("native highlight commands apply, recolor without duplicates, and remove only the selected text", () => {
  const editor = new Editor({
    element: null,
    extensions,
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
    },
  });
  editor.commands.setTextSelection({ from: 1, to: 12 });
  assert.equal(editor.commands.setMark("highlight", { color: "#dcfce7" }), true);
  assert.equal(editor.commands.setMark("highlight", { color: "#dbeafe" }), true);
  assert.deepEqual(content(editor)[0].marks, [{ type: "highlight", attrs: { color: "#dbeafe" } }]);
  editor.commands.setTextSelection({ from: 1, to: 6 });
  editor.commands.setMark("bold");
  assert.equal(editor.commands.unsetMark("highlight"), true);
  assert.deepEqual(content(editor), [
    { type: "text", text: "Hello", marks: [{ type: "bold" }] },
    { type: "text", text: " world", marks: [{ type: "highlight", attrs: { color: "#dbeafe" } }] },
  ]);
  editor.destroy();
});

test("native highlights at the caret apply to typing and clear for following text", () => {
  const editor = new Editor({
    element: null,
    extensions,
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
  editor.commands.setTextSelection(1);
  editor.commands.setMark("highlight", { color: "#f3e8ff" });
  editor.view.dispatch(editor.state.tr.insertText("First"));
  editor.commands.setMark("highlight", { color: "#fce7f3" });
  editor.view.dispatch(editor.state.tr.insertText("Second"));
  editor.commands.unsetMark("highlight");
  editor.view.dispatch(editor.state.tr.insertText("Third"));
  assert.deepEqual(content(editor), [
    { type: "text", text: "First", marks: [{ type: "highlight", attrs: { color: "#f3e8ff" } }] },
    { type: "text", text: "Second", marks: [{ type: "highlight", attrs: { color: "#fce7f3" } }] },
    { type: "text", text: "Third" },
  ]);
  editor.destroy();
});

test("highlight clipboard serialization preserves safe color and imports public CSS colors", () => {
  const rendered = highlight.spec.toDOM(highlight.create({ color: "#ABCDEF" }));
  assert.deepEqual(rendered, [
    "mark",
    { "data-color": "#abcdef", style: "background-color: #abcdef" },
    0,
  ]);
  assert.equal(parse(element(rendered[1]["data-color"])).color, "#abcdef");
  assert.equal(parse(element(null, "rgb(171, 205, 239)")).color, "#abcdef");
  assert.equal(parse(element(null, "#ABCDEF")).color, "#abcdef");
  assert.equal(highlight.create(parse(element(null))).attrs.color, null);
  assert.deepEqual(highlight.spec.toDOM(highlight.create()), ["mark", {}, 0]);
});

test("clipboard color parsing and rendering discard untrusted or malformed CSS values", () => {
  for (const color of [
    "#fff",
    "#123456;background:url(x)",
    "url(evil)",
    "rgb(999, 0, 0)",
    "transparent",
    "",
  ]) {
    assert.equal(highlight.create(parse(element(color))).attrs.color, null);
    assert.equal(highlight.create(parse(element(null, color))).attrs.color, null);
    assert.deepEqual(highlight.spec.toDOM(highlight.create({ color })), ["mark", {}, 0]);
  }
});
