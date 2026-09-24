import { expect, test } from "vitest";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit, createTable } from "@tiptap/extension-table";
import { captureBlogInsertion, createBlogTable } from "../app/admin/(protected)/blog/lib/editorInsertion.ts";

const Image = Node.create({
  name: "image",
  group: "block",
  atom: true,
  addAttributes: () => ({
    publicId: { default: "" },
    version: { default: 1 },
    alt: { default: "" },
    caption: { default: "" },
  }),
});
const image = (publicId) => ({ type: "image", attrs: { publicId } });
const paragraph = (text) => ({
  type: "paragraph",
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
function editorFor(content) {
  const editor = new Editor({
    element: null,
    extensions: [StarterKit, Image, TableKit],
    content: { type: "doc", content },
  });
  // No view exists in these DOM-free tests. Commands and transactions remain real.
  Object.defineProperty(editor, "isDestroyed", { configurable: true, value: false });
  return editor;
}

test("append preserves a selected last image when adding another image, block, or table", () => {
  for (const kind of ["image", "blockquote", "table"]) {
    const editor = editorFor([image("original")]);
    editor.commands.setNodeSelection(0);
    const content =
      kind === "image"
        ? image("new")
        : kind === "table"
          ? createTable(editor.schema, 3, 3, true).toJSON()
          : { type: "blockquote", content: [paragraph("quote")] };
    expect(captureBlogInsertion(editor, true).insert(content)).toBe(true);
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.firstChild.attrs.publicId).toBe("original");
    expect(editor.state.doc.lastChild.type.name).toBe(kind);
    editor.destroy();
  }
});

test("a pending upload follows its original insertion point through edits and ignores cursor movement", () => {
  const editor = editorFor([paragraph("Before"), paragraph("After")]);
  editor.commands.setTextSelection(9);
  const pending = captureBlogInsertion(editor);
  editor.commands.insertContentAt(1, { type: "text", text: "New " });
  editor.commands.setTextSelection(1);
  expect(pending.insert(image("uploaded"))).toBe(true);
  expect(editor.state.doc.childCount).toBe(3);
  expect(editor.state.doc.child(0).textContent).toBe("New Before");
  expect(editor.state.doc.child(1).attrs.publicId).toBe("uploaded");
  expect(editor.state.doc.child(2).textContent).toBe("After");
  editor.destroy();
});

test("pending append remains an append even if another block is inserted during upload", () => {
  const editor = editorFor([image("original")]);
  const pending = captureBlogInsertion(editor, true);
  editor.commands.insertContentAt(editor.state.doc.content.size, paragraph("New paragraph"));
  editor.commands.setNodeSelection(0);
  expect(pending.insert(image("uploaded"))).toBe(true);
  expect(editor.state.doc.firstChild.attrs.publicId).toBe("original");
  expect(editor.state.doc.child(1).textContent).toBe("New paragraph");
  expect(editor.state.doc.lastChild.attrs.publicId).toBe("uploaded");
  editor.destroy();
});

test("one captured upload inserts multiple images together in clipboard order", () => {
  const editor = editorFor([paragraph("Before"), paragraph("After")]);
  editor.commands.setTextSelection(9);
  const pending = captureBlogInsertion(editor);
  editor.commands.setTextSelection(1);
  expect(pending.insert([image("first"), image("second")])).toBe(true);
  expect(editor.getJSON().content.map((node) => node.attrs?.publicId || node.content?.[0]?.text)).toEqual([
    "Before",
    "first",
    "second",
    "After",
  ]);
  expect(pending.insert(image("duplicate"))).toBe(false);
  editor.destroy();
});

test("cancelled, read-only, and destroyed upload destinations leave content untouched", () => {
  for (const stop of ["cancelled", "read-only", "destroyed"]) {
    const editor = editorFor([image("original")]);
    const pending = captureBlogInsertion(editor, true);
    if (stop === "cancelled") pending.dispose();
    if (stop === "read-only") editor.setEditable(false);
    if (stop === "destroyed") Object.defineProperty(editor, "isDestroyed", { value: true });
    expect(pending.insert(image("uploaded"))).toBe(false);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.firstChild.attrs.publicId).toBe("original");
    pending.dispose();
    editor.destroy();
  }
});

test("table dimensions preserve chosen rows, columns, header row, and the existing image", () => {
  for (const [columns, rows] of [
    [1, 1],
    [5, 2],
    [2, 5],
    [20, 20],
  ]) {
    const editor = editorFor([image("original")]);
    const table = createBlogTable(editor, columns, rows);
    expect(captureBlogInsertion(editor, true).insert(table)).toBe(true);
    expect(editor.state.doc.firstChild.attrs.publicId).toBe("original");
    const inserted = editor.state.doc.lastChild;
    expect(inserted.childCount).toBe(rows);
    for (let row = 0; row < rows; row++) {
      expect(inserted.child(row).childCount).toBe(columns);
      expect(inserted.child(row).firstChild.type.name).toBe(row === 0 ? "tableHeader" : "tableCell");
    }
    editor.destroy();
  }
});

test("invalid table dimensions are rejected without changing editor content", () => {
  const editor = editorFor([image("original")]);
  for (const value of [0, -1, 21, 2.5, NaN, Infinity]) {
    expect(() => createBlogTable(editor, value, 3)).toThrow(/1.*20/);
    expect(() => createBlogTable(editor, 3, value)).toThrow(/1.*20/);
  }
  expect(editor.state.doc.childCount).toBe(1);
  editor.destroy();
});

test("image descriptions update the original mapped image after cursor movement", () => {
  const editor = editorFor([image("original"), image("other")]);
  editor.commands.setNodeSelection(0);
  const edit = captureBlogInsertion(editor);
  editor.commands.insertContentAt(0, paragraph("Before"));
  editor.commands.setNodeSelection(editor.state.doc.content.size - 1);
  expect(edit.updateImage({ alt: "Original description", caption: "Original caption" })).toBe(true);
  expect(editor.state.doc.child(1).attrs.alt).toBe("Original description");
  expect(editor.state.doc.child(2).attrs.alt).toBe("");
  editor.destroy();
});

test("a stale image description never changes a replacement or neighboring image", () => {
  for (const changed of ["removed", "replaced"]) {
    const editor = editorFor([image("original"), image("other")]);
    editor.commands.setNodeSelection(0);
    const edit = captureBlogInsertion(editor);
    if (changed === "removed") editor.commands.deleteSelection();
    else editor.commands.updateAttributes("image", { publicId: "replacement" });
    expect(edit.updateImage({ alt: "Wrong description", caption: "" })).toBe(false);
    for (const node of editor.getJSON().content) expect(node.attrs.alt).toBe("");
    editor.destroy();
  }
});

test("removing an image while editing its description does not change an identical copy", () => {
  const editor = editorFor([image("same-asset"), image("same-asset")]);
  editor.commands.setNodeSelection(0);
  const edit = captureBlogInsertion(editor);
  editor.commands.deleteSelection();
  expect(edit.updateImage({ alt: "Wrong description", caption: "Wrong caption" })).toBe(false);
  expect(editor.state.doc.childCount).toBe(1);
  expect(editor.state.doc.firstChild.attrs.alt).toBe("");
  expect(editor.state.doc.firstChild.attrs.caption).toBe("");
  editor.destroy();
});

test("inline insertion uses the hovered whole block instead of the selection", () => {
  for (const block of [paragraph("First"), image("original"), { type: "blockquote", content: [paragraph("Quote")] }]) {
    const editor = editorFor([block, paragraph("Last")]);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const pending = captureBlogInsertion(editor, false, 0);
    expect(pending.insert(paragraph("Added"))).toBe(true);
    expect(editor.getJSON().content.map((node) => node.type)).toEqual([block.type, "paragraph", "paragraph"]);
    expect(editor.state.doc.child(1).textContent).toBe("Added");
    expect(editor.state.doc.child(2).textContent).toBe("Last");
    editor.destroy();
  }
});

test("inline insertion reuses an empty line without changing content on cancel", () => {
  const editor = editorFor([paragraph("Before"), paragraph(), paragraph("After")]);
  const position = editor.state.doc.firstChild.nodeSize;
  const cancelled = captureBlogInsertion(editor, false, position);
  cancelled.dispose();
  expect(editor.state.doc.childCount).toBe(3);
  expect(captureBlogInsertion(editor, false, position).insert(image("new"))).toBe(true);
  expect(editor.state.doc.childCount).toBe(3);
  expect(editor.state.doc.child(1).attrs.publicId).toBe("new");
  editor.destroy();
});

test("inline insertion follows block edits and rejects a deleted destination", () => {
  const editor = editorFor([paragraph("Before"), paragraph("After")]);
  const pending = captureBlogInsertion(editor, false, 0);
  editor.commands.insertContentAt(1, { type: "text", text: "New " });
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  expect(pending.insert(image("uploaded"))).toBe(true);
  expect(editor.state.doc.child(0).textContent).toBe("New Before");
  expect(editor.state.doc.child(1).attrs.publicId).toBe("uploaded");
  const deleted = captureBlogInsertion(editor, false, 0);
  editor.commands.deleteRange({ from: 0, to: editor.state.doc.firstChild.nodeSize });
  expect(deleted.insert(paragraph("Wrong place"))).toBe(false);
  expect(editor.state.doc.childCount).toBe(2);
  editor.destroy();
});

test("inline insertion keeps newly typed empty-line content and follows preceding blocks", () => {
  const editor = editorFor([paragraph("Before"), paragraph(), paragraph("After")]);
  const position = editor.state.doc.firstChild.nodeSize;
  const pending = captureBlogInsertion(editor, false, position);
  editor.commands.insertContentAt(position + 1, { type: "text", text: "Keep me" });
  editor.commands.insertContentAt(0, paragraph("First"));
  expect(pending.insert({ type: "heading", attrs: { level: 2 } })).toBe(true);
  expect(editor.state.doc.child(2).textContent).toBe("Keep me");
  expect(editor.state.doc.child(3).type.name).toBe("heading");
  expect(editor.state.doc.child(3).attrs.level).toBe(2);
  expect(editor.state.doc.child(4).textContent).toBe("After");
  editor.destroy();
});
