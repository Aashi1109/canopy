import { expect, test } from "vitest";
import { getSchema, Node } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { EditorState, TextSelection, NodeSelection } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import { moveBlogBlock } from "../app/admin/(protected)/blog/lib/blockMovement.ts";

const schema = getSchema([StarterKit]);
const paragraph = (text) => schema.node("paragraph", null, text ? schema.text(text) : null);
test("moving a whole block preserves formatting, selection, and one-step undo/redo", () => {
  const a = paragraph("Alpha");
  const quote = schema.node("blockquote", null, paragraph("Quote"));
  const c = paragraph("Charlie");
  const doc = schema.node("doc", null, [a, quote, c]);
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, a.nodeSize + 3), plugins: [history()] });
  const dispatch = (tr) => {
    state = state.apply(tr);
  };
  expect(moveBlogBlock(a.nodeSize, doc.content.size)(state, dispatch)).toBe(true);
  expect(state.doc.content.content.map((node) => node.textContent)).toEqual(["Alpha", "Charlie", "Quote"]);
  expect(state.doc.lastChild.eq(quote)).toBe(true);
  expect(state.selection.from).toBe(a.nodeSize + c.nodeSize + 3);
  expect(undo(state, dispatch)).toBe(true);
  expect(state.doc.eq(doc)).toBe(true);
  expect(redo(state, dispatch)).toBe(true);
  expect(moveBlogBlock(a.nodeSize + c.nodeSize, 0)(state, dispatch)).toBe(true);
  expect(state.doc.firstChild.eq(quote)).toBe(true);
});

test("invalid, nested, adjacent, and same-position drops never change content", () => {
  const doc = schema.node("doc", null, [paragraph("A"), paragraph("B")]);
  const state = EditorState.create({ doc });
  for (const [from, to] of [
    [0, 0],
    [0, 3],
    [1, 6],
    [0, 1],
    [-1, 6],
    [0, 99],
    [NaN, 3],
    [0, 2.5],
  ]) {
    expect(
      moveBlogBlock(from, to)(state, () => {
        throw new Error("Must not dispatch");
      }),
    ).toBe(false);
  }
  expect(moveBlogBlock(0, 6)(state)).toBe(true);
});

test("table and image moves retain their entire content and metadata", () => {
  const schema = getSchema([
    StarterKit,
    TableKit,
    Node.create({
      name: "image",
      group: "block",
      atom: true,
      addAttributes: () => ({ alt: { default: "" }, publicId: { default: "" } }),
    }),
  ]);
  const table = schema.nodeFromJSON({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Cell content" }] }] },
        ],
      },
    ],
  });
  const image = schema.node("image", { alt: "A landscape", publicId: "asset-123" });
  const text = schema.node("paragraph", null, schema.text("Keep me"));
  const doc = schema.node("doc", null, [image, table, text]);
  let state = EditorState.create({ doc, selection: NodeSelection.create(doc, 0) });
  const dispatch = (tr) => {
    state = state.apply(tr);
  };
  expect(moveBlogBlock(0, doc.content.size)(state, dispatch)).toBe(true);
  expect(state.doc.lastChild.eq(image)).toBe(true);
  expect(state.selection.node.eq(image)).toBe(true);
  expect(moveBlogBlock(0, state.doc.content.size)(state, dispatch)).toBe(true);
  expect(state.doc.lastChild.eq(table)).toBe(true);
  expect(state.doc.firstChild.eq(text)).toBe(true);
});
