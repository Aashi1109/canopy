import { expect, test } from "vitest";
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
  expect(target.range.text).toBe("target");
  expect(target.apply(document("better"), "replace")).toBe(true);
  expect(editor.state.doc.textContent).toBe("New Before better after target");
  undo(editor.state, editor.view.dispatch);
  expect(editor.getJSON()).toEqual(before);
  expect(target.apply(document("again"), "replace")).toBe(false);
  editor.destroy();
});
test("changed and deleted passages reject stale proposals without any mutation", () => {
  for (const replacement of ["different", ""]) {
    const editor = setup();
    const target = captureAssistantSelection(editor);
    if (replacement) editor.commands.insertContentAt({ from: 8, to: 14 }, { type: "text", text: replacement });
    else editor.commands.deleteRange({ from: 8, to: 14 });
    const before = editor.getJSON();
    expect(target.valid()).toBe(false);
    expect(target.apply(document("proposal"), "replace")).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    target.dispose();
    editor.destroy();
  }
});
test("insert below preserves original passage and is one undo operation", () => {
  const editor = setup();
  const before = editor.getJSON();
  const target = captureAssistantSelection(editor);
  expect(target.apply(document("More context"), "insert")).toBe(true);
  expect(editor.state.doc.child(0).textContent).toBe("Before target after target");
  expect(editor.state.doc.child(1).textContent).toBe("More context");
  undo(editor.state, editor.view.dispatch);
  expect(editor.getJSON()).toEqual(before);
  editor.destroy();
});

test("whole-article proposals resolve only unique passages, including marked text", () => {
  const editor = setup();
  expect(findAssistantPassage(editor, "target")).toBe(null);
  expect(findAssistantPassage(editor, "Before target")).toEqual({ from: 1, to: 14 });
  editor.commands.setTextSelection({ from: 1, to: 7 });
  editor.commands.toggleBold();
  expect(findAssistantPassage(editor, "Before target")).toEqual({ from: 1, to: 14 });
  expect(findAssistantPassage(editor, "missing")).toBe(null);
  editor.destroy();
});
test("a multi-paragraph proposal replaces its exact span with a single undo", () => {
  const editor = setup();
  editor.commands.setContent({ type: "doc", content: [paragraph("First"), paragraph("Second"), paragraph("Last")] });
  const before = editor.getJSON();
  const range = findAssistantPassage(editor, "First\nSecond");
  expect(range).toBeTruthy();
  const target = captureAssistantSelection(editor, range);
  expect(target.apply(document("Combined"), "replace")).toBe(true);
  expect(editor.state.doc.textContent).toBe("CombinedLast");
  undo(editor.state, editor.view.dispatch);
  expect(editor.getJSON()).toEqual(before);
  editor.destroy();
});

test("stored bodies with reordered JSON keys and default attributes still match the current article", () => {
  const editor = setup();
  expect(
    assistantBodyMatches(editor, {
      content: [{ content: [{ text: "Before target after target", type: "text" }], type: "paragraph" }],
      type: "doc",
    }),
  ).toBe(true);
  expect(assistantBodyMatches(editor, document("Changed"))).toBe(false);
  expect(assistantBodyMatches(editor, { type: "unsupported" })).toBe(false);
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
  expect(target.apply(undefined, "delete")).toBe(true);
  expect(editor.getJSON().content).toEqual([paragraph("New Before"), paragraph("After")]);
  undo(editor.state, editor.view.dispatch);
  expect(editor.getJSON()).toEqual(before);
  expect(target.apply(undefined, "delete")).toBe(false);
  editor.destroy();
});

test("delete of a partial passage preserves surrounding content and targets the captured occurrence", () => {
  const editor = setup();
  const target = captureAssistantSelection(editor);
  editor.commands.setTextSelection(1);
  expect(target.apply(undefined, "delete")).toBe(true);
  expect(editor.state.doc.textContent).toBe("Before  after target");
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
    expect(target.apply(undefined, "delete")).toBe(true);
    expect(editor.getJSON().content[0].content).toEqual(
      items.filter((text) => text !== removed).map((text) => ({ type: "listItem", content: [paragraph(text)] })),
    );
    editor.destroy();
  }
});

test("deleting the entire article leaves an editable empty document and supports undo", () => {
  const editor = setup();
  const before = editor.getJSON();
  const target = captureAssistantSelection(editor, findAssistantPassage(editor, "Before target after target"));
  expect(target.apply(undefined, "delete")).toBe(true);
  expect(editor.isEmpty).toBe(true);
  editor.state.doc.check();
  undo(editor.state, editor.view.dispatch);
  expect(editor.getJSON()).toEqual(before);
  editor.destroy();
});

test("delete refuses changed targets and read-only editors without modifying the article", () => {
  for (const stale of [true, false]) {
    const editor = setup();
    const target = captureAssistantSelection(editor);
    if (stale) editor.commands.insertContentAt(10, { type: "text", text: "changed" });
    else editor.setEditable(false);
    const before = editor.getJSON();
    expect(target.apply(undefined, "delete")).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    target.dispose();
    editor.destroy();
  }
});

test("insert works after a captured range ending at the document boundary", () => {
  const editor = setup();
  const target = captureAssistantSelection(editor, { from: 0, to: editor.state.doc.content.size });
  expect(target.apply(document("Next section"), "insert")).toBe(true);
  expect(editor.getJSON().content).toEqual([paragraph("Before target after target"), paragraph("Next section")]);
  editor.destroy();
});

test("empty-article insertion replaces blank paragraphs and has a single undo", () => {
  for (const content of [[{ type: "paragraph" }], [paragraph("  "), { type: "paragraph" }]]) {
    const editor = setup();
    editor.commands.setContent({ type: "doc", content });
    const before = editor.getJSON();
    const target = captureAssistantInsertion(editor);
    expect(target).toBeTruthy();
    editor.commands.setTextSelection(1);
    expect(target.apply(document("First section"), "insert")).toBe(true);
    expect(editor.getJSON().content).toEqual([paragraph("First section")]);
    undo(editor.state, editor.view.dispatch);
    expect(editor.getJSON()).toEqual(before);
    expect(target.apply(document("Again"), "insert")).toBe(false);
    editor.destroy();
  }
});

test("empty-article insertion refuses nonempty articles and structural content", () => {
  for (const content of [[paragraph("Content")], [{ type: "horizontalRule" }]]) {
    const editor = setup();
    editor.commands.setContent({ type: "doc", content });
    expect(captureAssistantInsertion(editor)).toBe(null);
    editor.destroy();
  }
});

test("empty-article insertion rejects edits made after the proposal was captured", () => {
  for (const position of [1, 2]) {
    const editor = setup();
    editor.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] });
    const target = captureAssistantInsertion(editor);
    expect(target).toBeTruthy();
    editor.commands.insertContentAt(position, paragraph("User content"));
    const before = editor.getJSON();
    expect(target.valid()).toBe(false);
    expect(target.apply(document("First section"), "insert")).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    target.dispose();
    editor.destroy();
  }
});

test("invalid section content cannot mutate or consume a captured proposal", () => {
  const editor = setup();
  const target = captureAssistantSelection(editor);
  const before = editor.getJSON();
  expect(target.apply({ type: "doc", content: [{ type: "unknown" }] }, "insert")).toBe(false);
  expect(editor.getJSON()).toEqual(before);
  expect(target.valid()).toBe(true);
  expect(target.apply(document("Valid section"), "insert")).toBe(true);
  editor.destroy();
});
