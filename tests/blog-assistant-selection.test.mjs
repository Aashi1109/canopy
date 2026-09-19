import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { history, undo } from "@tiptap/pm/history";
import {
  captureAssistantSelection,
  findAssistantPassage,
  assistantBodyMatches,
  captureAssistantInsertion,
} from "../app/admin/(protected)/blog/lib/assistantSelection.ts";

const paragraph = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const document = (text) => ({ type: "doc", content: [paragraph(text)] });
function setup() {
  const editor = new Editor({
    element: null,
    extensions: [StarterKit],
    content: document("Before target after target"),
  });
  Object.defineProperty(editor, "isDestroyed", { configurable: true, value: false });
  editor.registerPlugin(history());
  editor.commands.setTextSelection({ from: 8, to: 14 });
  return editor;
}
test("proposal follows its selected occurrence through earlier edits and undo restores only accepted change", () => {
  const editor = setup();
  const target = captureAssistantSelection(editor);
  editor.commands.insertContentAt(1, { type: "text", text: "New " });
  editor.commands.setTextSelection(1);
  const before = editor.getJSON();
  assert.equal(target.range.text, "target");
  assert.equal(target.apply(document("better"), "replace"), true);
  assert.equal(editor.state.doc.textContent, "New Before better after target");
  undo(editor.state, editor.view.dispatch);
  assert.deepEqual(editor.getJSON(), before);
  assert.equal(target.apply(document("again"), "replace"), false);
  editor.destroy();
});
test("changed and deleted passages reject stale proposals without any mutation", () => {
  for (const replacement of ["different", ""]) {
    const editor = setup();
    const target = captureAssistantSelection(editor);
    if (replacement) editor.commands.insertContentAt({ from: 8, to: 14 }, { type: "text", text: replacement });
    else editor.commands.deleteRange({ from: 8, to: 14 });
    const before = editor.getJSON();
    assert.equal(target.valid(), false);
    assert.equal(target.apply(document("proposal"), "replace"), false);
    assert.deepEqual(editor.getJSON(), before);
    target.dispose();
    editor.destroy();
  }
});
test("insert below preserves original passage and is one undo operation", () => {
  const editor = setup();
  const before = editor.getJSON();
  const target = captureAssistantSelection(editor);
  assert.equal(target.apply(document("More context"), "insert"), true);
  assert.equal(editor.state.doc.child(0).textContent, "Before target after target");
  assert.equal(editor.state.doc.child(1).textContent, "More context");
  undo(editor.state, editor.view.dispatch);
  assert.deepEqual(editor.getJSON(), before);
  editor.destroy();
});

test("whole-article proposals resolve only unique passages, including marked text", () => {
  const editor = setup();
  assert.equal(findAssistantPassage(editor, "target"), null);
  assert.deepEqual(findAssistantPassage(editor, "Before target"), { from: 1, to: 14 });
  editor.commands.setTextSelection({ from: 1, to: 7 });
  editor.commands.toggleBold();
  assert.deepEqual(findAssistantPassage(editor, "Before target"), { from: 1, to: 14 });
  assert.equal(findAssistantPassage(editor, "missing"), null);
  editor.destroy();
});
test("a multi-paragraph proposal replaces its exact span with a single undo", () => {
  const editor = setup();
  editor.commands.setContent({ type: "doc", content: [paragraph("First"), paragraph("Second"), paragraph("Last")] });
  const before = editor.getJSON();
  const range = findAssistantPassage(editor, "First\nSecond");
  assert.ok(range);
  const target = captureAssistantSelection(editor, range);
  assert.equal(target.apply(document("Combined"), "replace"), true);
  assert.equal(editor.state.doc.textContent, "CombinedLast");
  undo(editor.state, editor.view.dispatch);
  assert.deepEqual(editor.getJSON(), before);
  editor.destroy();
});

test("stored bodies with reordered JSON keys and default attributes still match the current article", () => {
  const editor = setup();
  assert.equal(
    assistantBodyMatches(editor, {
      content: [{ content: [{ text: "Before target after target", type: "text" }], type: "paragraph" }],
      type: "doc",
    }),
    true,
  );
  assert.equal(assistantBodyMatches(editor, document("Changed")), false);
  assert.equal(assistantBodyMatches(editor, { type: "unsupported" }), false);
  editor.destroy();
});

test("delete removes a whole section without leaving an empty block and has its own undo", () => {
  const editor = setup();
  editor.commands.setContent({
    type: "doc",
    content: [
      paragraph("Before"),
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Section" }] },
      paragraph("Section body"),
      paragraph("After"),
    ],
  });
  const target = captureAssistantSelection(editor, findAssistantPassage(editor, "Section\nSection body"));
  editor.commands.insertContentAt(1, { type: "text", text: "New " });
  editor.commands.setTextSelection(1);
  const before = editor.getJSON();
  assert.equal(target.apply(undefined, "delete"), true);
  assert.deepEqual(editor.getJSON().content, [paragraph("New Before"), paragraph("After")]);
  undo(editor.state, editor.view.dispatch);
  assert.deepEqual(editor.getJSON(), before);
  assert.equal(target.apply(undefined, "delete"), false);
  editor.destroy();
});

test("delete of a partial passage preserves surrounding content and targets the captured occurrence", () => {
  const editor = setup();
  const target = captureAssistantSelection(editor);
  editor.commands.setTextSelection(1);
  assert.equal(target.apply(undefined, "delete"), true);
  assert.equal(editor.state.doc.textContent, "Before  after target");
  editor.destroy();
});

test("delete of a complete nested list item removes only that item", () => {
  const items = ["First", "Middle", "Last"];
  for (const removed of items) {
    const editor = setup();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: items.map((text) => ({ type: "listItem", content: [paragraph(text)] })),
        },
      ],
    });
    const target = captureAssistantSelection(editor, findAssistantPassage(editor, removed));
    assert.equal(target.apply(undefined, "delete"), true);
    assert.deepEqual(
      editor.getJSON().content[0].content,
      items.filter((text) => text !== removed).map((text) => ({ type: "listItem", content: [paragraph(text)] })),
    );
    editor.destroy();
  }
});

test("deleting the entire article leaves an editable empty document and supports undo", () => {
  const editor = setup();
  const before = editor.getJSON();
  const target = captureAssistantSelection(editor, findAssistantPassage(editor, "Before target after target"));
  assert.equal(target.apply(undefined, "delete"), true);
  assert.equal(editor.isEmpty, true);
  editor.state.doc.check();
  undo(editor.state, editor.view.dispatch);
  assert.deepEqual(editor.getJSON(), before);
  editor.destroy();
});

test("delete refuses changed targets and read-only editors without modifying the article", () => {
  for (const stale of [true, false]) {
    const editor = setup();
    const target = captureAssistantSelection(editor);
    if (stale) editor.commands.insertContentAt(10, { type: "text", text: "changed" });
    else editor.setEditable(false);
    const before = editor.getJSON();
    assert.equal(target.apply(undefined, "delete"), false);
    assert.deepEqual(editor.getJSON(), before);
    target.dispose();
    editor.destroy();
  }
});

test("insert works after a captured range ending at the document boundary", () => {
  const editor = setup();
  const target = captureAssistantSelection(editor, { from: 0, to: editor.state.doc.content.size });
  assert.equal(target.apply(document("Next section"), "insert"), true);
  assert.deepEqual(editor.getJSON().content, [paragraph("Before target after target"), paragraph("Next section")]);
  editor.destroy();
});

test("empty-article insertion replaces blank paragraphs and has a single undo", () => {
  for (const content of [[{ type: "paragraph" }], [paragraph("  "), { type: "paragraph" }]]) {
    const editor = setup();
    editor.commands.setContent({ type: "doc", content });
    const before = editor.getJSON();
    const target = captureAssistantInsertion(editor);
    assert.ok(target);
    editor.commands.setTextSelection(1);
    assert.equal(target.apply(document("First section"), "insert"), true);
    assert.deepEqual(editor.getJSON().content, [paragraph("First section")]);
    undo(editor.state, editor.view.dispatch);
    assert.deepEqual(editor.getJSON(), before);
    assert.equal(target.apply(document("Again"), "insert"), false);
    editor.destroy();
  }
});

test("empty-article insertion refuses nonempty articles and structural content", () => {
  for (const content of [[paragraph("Content")], [{ type: "horizontalRule" }]]) {
    const editor = setup();
    editor.commands.setContent({ type: "doc", content });
    assert.equal(captureAssistantInsertion(editor), null);
    editor.destroy();
  }
});

test("empty-article insertion rejects edits made after the proposal was captured", () => {
  for (const position of [1, 2]) {
    const editor = setup();
    editor.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] });
    const target = captureAssistantInsertion(editor);
    assert.ok(target);
    editor.commands.insertContentAt(position, paragraph("User content"));
    const before = editor.getJSON();
    assert.equal(target.valid(), false);
    assert.equal(target.apply(document("First section"), "insert"), false);
    assert.deepEqual(editor.getJSON(), before);
    target.dispose();
    editor.destroy();
  }
});

test("invalid section content cannot mutate or consume a captured proposal", () => {
  const editor = setup();
  const target = captureAssistantSelection(editor);
  const before = editor.getJSON();
  assert.equal(target.apply({ type: "doc", content: [{ type: "unknown" }] }, "insert"), false);
  assert.deepEqual(editor.getJSON(), before);
  assert.equal(target.valid(), true);
  assert.equal(target.apply(document("Valid section"), "insert"), true);
  editor.destroy();
});
