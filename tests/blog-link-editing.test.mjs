import assert from "node:assert/strict";
import test from "node:test";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { applyBlogLink, removeBlogLink } from "../app/admin/(protected)/blog/lib/linkEditing.ts";

const link = (href) => ({ type: "link", attrs: { href } });
const text = (value, marks = []) => ({ type: "text", text: value, marks });

function editorFor(content = []) {
  const editor = new Editor({
    element: null,
    extensions: [StarterKit],
    content: { type: "doc", content: [{ type: "paragraph", content }] },
  });
  // Keep real transactions available without a DOM-backed editor view.
  Object.defineProperty(editor, "isDestroyed", { configurable: true, value: false });
  return editor;
}

function runs(editor) {
  return editor.getJSON().content[0].content.map((node) => ({
    text: node.text,
    href: node.marks?.find((mark) => mark.type === "link")?.attrs.href,
    formatting: (node.marks ?? []).filter((mark) => mark.type !== "link").map((mark) => mark.type),
  }));
}

test("empty cursor inserts visible linked text for each supported destination", () => {
  for (const href of [
    "https://example.com/guide",
    "http://example.com/guide",
    "mailto:editor@example.com",
    "/blog/guide",
    "#details",
  ]) {
    for (const label of [undefined, "Read more"]) {
      const editor = editorFor();
      assert.equal(applyBlogLink(editor, href, label), true);
      assert.deepEqual(runs(editor), [{ text: label ?? href, href, formatting: [] }]);
      editor.destroy();
    }
  }
});

test("inserting a link between words preserves surrounding content", () => {
  const editor = editorFor([text("Before  After")]);
  editor.commands.setTextSelection(8);
  assert.equal(applyBlogLink(editor, "https://example.com/guide", "guide"), true);
  assert.equal(editor.state.doc.textContent, "Before guide After");
  assert.deepEqual(runs(editor), [
    { text: "Before ", href: undefined, formatting: [] },
    { text: "guide", href: "https://example.com/guide", formatting: [] },
    { text: " After", href: undefined, formatting: [] },
  ]);
  editor.destroy();
});

test("ordinary typing after an inserted link does not extend the link", () => {
  const editor = editorFor();
  assert.equal(applyBlogLink(editor, "/guide", "Guide"), true);
  editor.commands.insertContent({ type: "text", text: " details" });
  assert.deepEqual(runs(editor), [
    { text: "Guide", href: "/guide", formatting: [] },
    { text: " details", href: undefined, formatting: [] },
  ]);
  editor.destroy();
});

test("code blocks reject link insertion without changing their content", () => {
  for (const content of ["", "const answer = 42;"]) {
    const editor = editorFor(content ? [text(content)] : []);
    editor.commands.setCodeBlock();
    const before = editor.getJSON();
    assert.equal(applyBlogLink(editor, "/guide", "Guide"), false);
    assert.deepEqual(editor.getJSON(), before);
    editor.destroy();
  }
});

test("linking a selection retains its text and mixed formatting", () => {
  const editor = editorFor([
    text("Bold", [{ type: "bold" }]),
    text(" and italic", [{ type: "italic" }]),
    text(" outside"),
  ]);
  editor.commands.setTextSelection({ from: 1, to: 16 });
  assert.equal(applyBlogLink(editor, "/guide"), true);
  assert.deepEqual(runs(editor), [
    { text: "Bold", href: "/guide", formatting: ["bold"] },
    { text: " and italic", href: "/guide", formatting: ["italic"] },
    { text: " outside", href: undefined, formatting: [] },
  ]);
  editor.destroy();
});

test("editing from inside a link updates its whole range without replacing its label", () => {
  const editor = editorFor([
    text("Before "),
    text("Read ", [link("/old")]),
    text("guide", [link("/old"), { type: "bold" }]),
    text(" after"),
    text("Other", [link("/other")]),
  ]);
  editor.commands.setTextSelection(10);
  assert.equal(applyBlogLink(editor, "/new"), true);
  assert.deepEqual(runs(editor), [
    { text: "Before ", href: undefined, formatting: [] },
    { text: "Read ", href: "/new", formatting: [] },
    { text: "guide", href: "/new", formatting: ["bold"] },
    { text: " after", href: undefined, formatting: [] },
    { text: "Other", href: "/other", formatting: [] },
  ]);
  editor.destroy();
});

test("removing a link from an interior cursor retains the whole label and formatting", () => {
  const editor = editorFor([text("Read ", [link("/guide")]), text("guide", [link("/guide"), { type: "bold" }])]);
  editor.commands.setTextSelection(3);
  assert.equal(removeBlogLink(editor), true);
  assert.deepEqual(runs(editor), [
    { text: "Read ", href: undefined, formatting: [] },
    { text: "guide", href: undefined, formatting: ["bold"] },
  ]);
  editor.destroy();
});

test("unsafe destinations reject insertion and link edits without changing content", () => {
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//example.com",
    "ftp://example.com",
    "",
  ]) {
    for (const content of [[], [text("Existing", [link("/original")])]]) {
      const editor = editorFor(content);
      if (content.length) editor.commands.setTextSelection(3);
      const before = editor.getJSON();
      assert.equal(applyBlogLink(editor, href, "New label"), false);
      assert.deepEqual(editor.getJSON(), before);
      editor.destroy();
    }
  }
});

test("read-only and destroyed editors reject link changes and removals", () => {
  for (const stop of ["read-only", "destroyed"]) {
    const editor = editorFor([text("Existing", [link("/original")])]);
    editor.commands.setTextSelection(3);
    const before = editor.getJSON();
    if (stop === "read-only") editor.setEditable(false);
    else Object.defineProperty(editor, "isDestroyed", { value: true });
    assert.equal(applyBlogLink(editor, "/new"), false);
    assert.equal(removeBlogLink(editor), false);
    assert.deepEqual(editor.getJSON(), before);
    editor.destroy();
  }
});
