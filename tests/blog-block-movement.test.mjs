import assert from "node:assert/strict";
import test from "node:test";
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
  assert.equal(moveBlogBlock(a.nodeSize, doc.content.size)(state, dispatch), true);
  assert.deepEqual(
    state.doc.content.content.map((node) => node.textContent),
    ["Alpha", "Charlie", "Quote"],
  );
  assert.equal(state.doc.lastChild.eq(quote), true);
  assert.equal(state.selection.from, a.nodeSize + c.nodeSize + 3);
  assert.equal(undo(state, dispatch), true);
  assert.equal(state.doc.eq(doc), true);
  assert.equal(redo(state, dispatch), true);
  assert.equal(moveBlogBlock(a.nodeSize + c.nodeSize, 0)(state, dispatch), true);
  assert.equal(state.doc.firstChild.eq(quote), true);
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
    assert.equal(
      moveBlogBlock(from, to)(state, () => assert.fail("Must not dispatch")),
      false,
    );
  }
  assert.equal(moveBlogBlock(0, 6)(state), true);
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
  assert.equal(moveBlogBlock(0, doc.content.size)(state, dispatch), true);
  assert.equal(state.doc.lastChild.eq(image), true);
  assert.equal(state.selection.node.eq(image), true);
  assert.equal(moveBlogBlock(0, state.doc.content.size)(state, dispatch), true);
  assert.equal(state.doc.lastChild.eq(table), true);
  assert.equal(state.doc.firstChild.eq(text), true);
});
