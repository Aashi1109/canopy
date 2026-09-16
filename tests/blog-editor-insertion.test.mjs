import assert from "node:assert/strict";
import test from "node:test";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit, createTable } from "@tiptap/extension-table";
import {
  captureBlogInsertion,
  createBlogTable,
} from "../app/admin/(protected)/blog/lib/editorInsertion.ts";

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
    assert.equal(captureBlogInsertion(editor, true).insert(content), true);
    assert.equal(editor.state.doc.childCount, 2);
    assert.equal(editor.state.doc.firstChild.attrs.publicId, "original");
    assert.equal(editor.state.doc.lastChild.type.name, kind);
    editor.destroy();
  }
});

test("a pending upload follows its original insertion point through edits and ignores cursor movement", () => {
  const editor = editorFor([paragraph("Before"), paragraph("After")]);
  editor.commands.setTextSelection(9);
  const pending = captureBlogInsertion(editor);
  editor.commands.insertContentAt(1, { type: "text", text: "New " });
  editor.commands.setTextSelection(1);
  assert.equal(pending.insert(image("uploaded")), true);
  assert.equal(editor.state.doc.childCount, 3);
  assert.equal(editor.state.doc.child(0).textContent, "New Before");
  assert.equal(editor.state.doc.child(1).attrs.publicId, "uploaded");
  assert.equal(editor.state.doc.child(2).textContent, "After");
  editor.destroy();
});

test("pending append remains an append even if another block is inserted during upload", () => {
  const editor = editorFor([image("original")]);
  const pending = captureBlogInsertion(editor, true);
  editor.commands.insertContentAt(editor.state.doc.content.size, paragraph("New paragraph"));
  editor.commands.setNodeSelection(0);
  assert.equal(pending.insert(image("uploaded")), true);
  assert.equal(editor.state.doc.firstChild.attrs.publicId, "original");
  assert.equal(editor.state.doc.child(1).textContent, "New paragraph");
  assert.equal(editor.state.doc.lastChild.attrs.publicId, "uploaded");
  editor.destroy();
});

test("one captured upload inserts multiple images together in clipboard order", () => {
  const editor = editorFor([paragraph("Before"), paragraph("After")]);
  editor.commands.setTextSelection(9);
  const pending = captureBlogInsertion(editor);
  editor.commands.setTextSelection(1);
  assert.equal(pending.insert([image("first"), image("second")]), true);
  assert.deepEqual(
    editor.getJSON().content.map((node) => node.attrs?.publicId || node.content?.[0]?.text),
    ["Before", "first", "second", "After"],
  );
  assert.equal(pending.insert(image("duplicate")), false);
  editor.destroy();
});

test("cancelled, read-only, and destroyed upload destinations leave content untouched", () => {
  for (const stop of ["cancelled", "read-only", "destroyed"]) {
    const editor = editorFor([image("original")]);
    const pending = captureBlogInsertion(editor, true);
    if (stop === "cancelled") pending.dispose();
    if (stop === "read-only") editor.setEditable(false);
    if (stop === "destroyed") Object.defineProperty(editor, "isDestroyed", { value: true });
    assert.equal(pending.insert(image("uploaded")), false);
    assert.equal(editor.state.doc.childCount, 1);
    assert.equal(editor.state.doc.firstChild.attrs.publicId, "original");
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
    assert.equal(captureBlogInsertion(editor, true).insert(table), true);
    assert.equal(editor.state.doc.firstChild.attrs.publicId, "original");
    const inserted = editor.state.doc.lastChild;
    assert.equal(inserted.childCount, rows);
    for (let row = 0; row < rows; row++) {
      assert.equal(inserted.child(row).childCount, columns);
      assert.equal(
        inserted.child(row).firstChild.type.name,
        row === 0 ? "tableHeader" : "tableCell",
      );
    }
    editor.destroy();
  }
});

test("invalid table dimensions are rejected without changing editor content", () => {
  const editor = editorFor([image("original")]);
  for (const value of [0, -1, 21, 2.5, NaN, Infinity]) {
    assert.throws(() => createBlogTable(editor, value, 3), /1.*20/);
    assert.throws(() => createBlogTable(editor, 3, value), /1.*20/);
  }
  assert.equal(editor.state.doc.childCount, 1);
  editor.destroy();
});

test("image descriptions update the original mapped image after cursor movement", () => {
  const editor = editorFor([image("original"), image("other")]);
  editor.commands.setNodeSelection(0);
  const edit = captureBlogInsertion(editor);
  editor.commands.insertContentAt(0, paragraph("Before"));
  editor.commands.setNodeSelection(editor.state.doc.content.size - 1);
  assert.equal(
    edit.updateImage({ alt: "Original description", caption: "Original caption" }),
    true,
  );
  assert.equal(editor.state.doc.child(1).attrs.alt, "Original description");
  assert.equal(editor.state.doc.child(2).attrs.alt, "");
  editor.destroy();
});

test("a stale image description never changes a replacement or neighboring image", () => {
  for (const changed of ["removed", "replaced"]) {
    const editor = editorFor([image("original"), image("other")]);
    editor.commands.setNodeSelection(0);
    const edit = captureBlogInsertion(editor);
    if (changed === "removed") editor.commands.deleteSelection();
    else editor.commands.updateAttributes("image", { publicId: "replacement" });
    assert.equal(edit.updateImage({ alt: "Wrong description", caption: "" }), false);
    for (const node of editor.getJSON().content) assert.equal(node.attrs.alt, "");
    editor.destroy();
  }
});

test("removing an image while editing its description does not change an identical copy", () => {
  const editor = editorFor([image("same-asset"), image("same-asset")]);
  editor.commands.setNodeSelection(0);
  const edit = captureBlogInsertion(editor);
  editor.commands.deleteSelection();
  assert.equal(edit.updateImage({ alt: "Wrong description", caption: "Wrong caption" }), false);
  assert.equal(editor.state.doc.childCount, 1);
  assert.equal(editor.state.doc.firstChild.attrs.alt, "");
  assert.equal(editor.state.doc.firstChild.attrs.caption, "");
  editor.destroy();
});
