import assert from "node:assert/strict";
import test from "node:test";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { TableMap } from "@tiptap/pm/tables";
import { EditorState } from "@tiptap/pm/state";
import { history, undo, undoDepth } from "@tiptap/pm/history";
import {
  BlogTableCell,
  BlogTableHeader,
  appendBlogTableAxis,
  blogTableChangeFits,
  deleteBlogTableAxis,
  duplicateBlogTableAxis,
  formatBlogTableCells,
  getBlogTableContext,
  getBlogTableDragDelta,
  getBlogTableStateAtCell,
  moveBlogTableAxis,
  resizeBlogTableAxis,
  selectBlogTableAxis,
  setBlogTableColumnWidth,
} from "../app/admin/(protected)/blog/lib/tableEditing.ts";

const cell = (text, attrs = {}) => ({
  type: "tableCell",
  attrs,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const row = (...content) => ({ type: "tableRow", content });
function createEditor(rows = [row(cell("A"), cell("B")), row(cell("C"), cell("D"))]) {
  return new Editor({
    element: null,
    extensions: [
      StarterKit,
      TableKit.configure({ tableCell: false, tableHeader: false }),
      BlogTableCell,
      BlogTableHeader,
    ],
    content: { type: "doc", content: [{ type: "table", content: rows }, { type: "paragraph" }] },
  });
}
function select(editor, rowIndex, column) {
  const table = editor.state.doc.firstChild;
  const map = TableMap.get(table);
  editor.commands.setTextSelection(1 + map.map[rowIndex * map.width + column] + 2);
}
const run = (editor, command) => command(editor.state, (transaction) => editor.view.dispatch(transaction));
const cells = (editor) =>
  editor
    .getJSON()
    .content[0].content.map((row) =>
      row.content.map((cell) =>
        cell.content.map((block) => block.content?.map((text) => text.text).join("") ?? "").join(""),
      ),
    );

test("hover resolution preserves the live selection and edge actions target the hovered second table", () => {
  for (const axis of ["row", "column"]) {
    const editor = createEditor();
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      type: "table",
      content: [row(cell("Second A"), cell("Second B"))],
    });
    select(editor, 0, 0);
    const originalState = editor.state;
    const firstTable = editor.state.doc.firstChild;
    const secondTablePosition = firstTable.nodeSize + editor.state.doc.child(1).nodeSize;
    const secondTable = editor.state.doc.child(2);
    const position = secondTablePosition + 1 + TableMap.get(secondTable).map[0];
    const target = getBlogTableStateAtCell(editor.state, position);
    assert.ok(target);
    assert.equal(editor.state, originalState);
    assert.equal(getBlogTableContext(editor.state).tableStart, 1);
    assert.equal(getBlogTableContext(target).tableStart, secondTablePosition + 1);
    assert.equal(
      appendBlogTableAxis(axis)(target, (transaction) => editor.view.dispatch(transaction)),
      true,
    );
    assert.ok(editor.state.doc.firstChild.eq(firstTable));
    const changed = TableMap.get(editor.state.doc.child(2));
    assert.equal(changed.width, axis === "column" ? 3 : 2);
    assert.equal(changed.height, axis === "row" ? 2 : 1);
    assert.equal(changed.problems, null);
    editor.destroy();
  }
});

test("hover targets reject invalid or removed cells without changing editor content or selection", () => {
  const editor = createEditor();
  select(editor, 0, 0);
  const position = 1 + TableMap.get(editor.state.doc.firstChild).map[0];
  const before = editor.state;
  for (const invalid of [
    -1,
    0,
    1,
    position + 1,
    1.5,
    NaN,
    editor.state.doc.content.size,
    editor.state.doc.content.size + 100,
  ]) {
    assert.equal(getBlogTableStateAtCell(editor.state, invalid), null);
    assert.equal(editor.state, before);
  }
  editor.commands.deleteRange({ from: 0, to: editor.state.doc.firstChild.nodeSize });
  const removed = editor.state;
  assert.equal(getBlogTableStateAtCell(editor.state, position), null);
  assert.equal(editor.state, removed);
  editor.destroy();
});

test("table edge actions append after the last row or column regardless of cursor position", () => {
  for (const axis of ["row", "column"]) {
    const editor = createEditor();
    select(editor, 0, 0);
    const before = editor.getJSON();
    assert.equal(appendBlogTableAxis(axis)(editor.state), true);
    assert.deepEqual(editor.getJSON(), before);
    assert.equal(run(editor, appendBlogTableAxis(axis)), true);
    assert.deepEqual(
      cells(editor),
      axis === "row"
        ? [
            ["A", "B"],
            ["C", "D"],
            ["", ""],
          ]
        : [
            ["A", "B", ""],
            ["C", "D", ""],
          ],
    );
    assert.equal(TableMap.get(editor.state.doc.firstChild).problems, null);
    editor.destroy();
  }
});

test("edge appending preserves merged cells and refuses the persisted column limit", () => {
  for (const axis of ["row", "column"]) {
    const editor = createEditor([row(cell("A", { rowspan: 2 }), cell("B")), row(cell("C"))]);
    select(editor, 0, 0);
    assert.equal(run(editor, appendBlogTableAxis(axis)), true);
    const map = TableMap.get(editor.state.doc.firstChild);
    assert.equal(map.problems, null);
    assert.equal(axis === "row" ? map.height : map.width, 3);
    assert.equal(editor.state.doc.firstChild.firstChild.firstChild.attrs.rowspan, 2);
    editor.destroy();
  }
  const editor = createEditor([row(...Array.from({ length: 100 }, (_, index) => cell(String(index))))]);
  select(editor, 0, 0);
  const before = editor.getJSON();
  assert.equal(run(editor, appendBlogTableAxis("column")), false);
  assert.deepEqual(editor.getJSON(), before);
  editor.destroy();
});

test("table row and column moves preserve content and reject out-of-range movement", () => {
  const editor = createEditor();
  select(editor, 0, 1);
  assert.equal(run(editor, moveBlogTableAxis("column", 1)), false);
  assert.equal(run(editor, moveBlogTableAxis("column", -1)), true);
  assert.deepEqual(cells(editor), [
    ["B", "A"],
    ["D", "C"],
  ]);
  select(editor, 0, 0);
  assert.equal(run(editor, moveBlogTableAxis("row", -1)), false);
  assert.equal(run(editor, moveBlogTableAxis("row", 1)), true);
  assert.deepEqual(cells(editor), [
    ["D", "C"],
    ["B", "A"],
  ]);
  assert.equal(TableMap.get(editor.state.doc.firstChild).problems, null);
  editor.destroy();
});

test("duplicate row and column preserve cell attributes and select the copy", () => {
  for (const axis of ["row", "column"]) {
    const editor = createEditor([
      row(cell("A", { colwidth: [180], align: "right", backgroundColor: "#dbeafe" }), cell("B")),
      row(cell("C", { colwidth: [180] }), cell("D")),
    ]);
    select(editor, 0, 0);
    assert.equal(run(editor, duplicateBlogTableAxis(axis)), true);
    assert.deepEqual(
      cells(editor),
      axis === "row"
        ? [
            ["A", "B"],
            ["A", "B"],
            ["C", "D"],
          ]
        : [
            ["A", "A", "B"],
            ["C", "C", "D"],
          ],
    );
    const context = getBlogTableContext(editor.state);
    assert.equal(axis === "row" ? context.top : context.left, 1);
    const copy = axis === "row" ? context.table.child(1).firstChild : context.table.firstChild.child(1);
    assert.equal(copy.attrs.align, "right");
    assert.equal(copy.attrs.backgroundColor, "#dbeafe");
    assert.deepEqual(copy.attrs.colwidth, [180]);
    assert.equal(TableMap.get(editor.state.doc.firstChild).problems, null);
    editor.destroy();
  }
});

test("merged tables reject duplication without changing any content", () => {
  const editor = createEditor([row(cell("Merged", { colspan: 2 })), row(cell("C"), cell("D"))]);
  select(editor, 1, 1);
  const before = editor.getJSON();
  assert.equal(run(editor, duplicateBlogTableAxis("row")), false);
  assert.equal(run(editor, duplicateBlogTableAxis("column")), false);
  assert.deepEqual(editor.getJSON(), before);
  editor.destroy();
});

test("formatting affects selected cells and clearing restores inherited styles", () => {
  const editor = createEditor();
  select(editor, 0, 1);
  assert.equal(run(editor, selectBlogTableAxis("column")), true);
  assert.equal(run(editor, formatBlogTableCells({ align: "center", backgroundColor: "#fef3c7" })), true);
  const table = editor.state.doc.firstChild;
  for (let index = 0; index < 2; index++) {
    assert.equal(table.child(index).child(0).attrs.backgroundColor, null);
    assert.equal(table.child(index).child(1).attrs.backgroundColor, "#fef3c7");
    assert.equal(table.child(index).child(1).attrs.align, "center");
  }
  assert.equal(run(editor, formatBlogTableCells({ backgroundColor: "url(evil)" })), false);
  assert.equal(run(editor, formatBlogTableCells({ backgroundColor: null, align: null })), true);
  assert.equal(editor.state.doc.firstChild.firstChild.child(1).attrs.align, null);
  assert.equal(editor.state.doc.firstChild.firstChild.child(1).attrs.backgroundColor, null);
  editor.destroy();
});

test("keyboard column width updates every intersecting cell including a merged cell", () => {
  const editor = createEditor([
    row(cell("Merged", { colspan: 2, colwidth: [120, 140] })),
    row(cell("C", { colwidth: [120] }), cell("D", { colwidth: [140] })),
  ]);
  select(editor, 1, 1);
  assert.equal(run(editor, setBlogTableColumnWidth(220)), true);
  const table = editor.state.doc.firstChild;
  assert.deepEqual(table.firstChild.firstChild.attrs.colwidth, [120, 220]);
  assert.deepEqual(table.child(1).child(1).attrs.colwidth, [220]);
  assert.deepEqual(table.child(1).child(0).attrs.colwidth, [120]);
  assert.equal(run(editor, setBlogTableColumnWidth(20)), false);
  assert.equal(run(editor, setBlogTableColumnWidth(Number.NaN)), false);
  assert.equal(TableMap.get(table).problems, null);
  editor.destroy();
});

test("table commands leave paragraphs untouched outside a table", () => {
  const editor = createEditor();
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  const before = editor.getJSON();
  for (const command of [
    appendBlogTableAxis("row"),
    appendBlogTableAxis("column"),
    selectBlogTableAxis("row"),
    moveBlogTableAxis("column", 1),
    duplicateBlogTableAxis("row"),
    formatBlogTableCells({ align: "right" }),
    setBlogTableColumnWidth(200),
  ])
    assert.equal(run(editor, command), false);
  assert.deepEqual(editor.getJSON(), before);
  editor.destroy();
});

test("deleting the final row or column removes the table and preserves other content", () => {
  for (const axis of ["row", "column"]) {
    const editor = createEditor([row(cell("Only cell"))]);
    select(editor, 0, 0);
    assert.equal(run(editor, deleteBlogTableAxis(axis)), true);
    assert.deepEqual(editor.getJSON().content, [{ type: "paragraph" }]);
    editor.destroy();
  }
});

test("native movement keeps merged spans valid and never duplicates merged content", () => {
  const editor = createEditor([
    row(cell("Merged", { colspan: 2 })),
    row(cell("C"), cell("D")),
    row(cell("E"), cell("F")),
  ]);
  select(editor, 0, 0);
  assert.equal(run(editor, moveBlogTableAxis("row", 1)), true);
  assert.deepEqual(cells(editor), [["C", "D"], ["Merged"], ["E", "F"]]);
  assert.equal(TableMap.get(editor.state.doc.firstChild).problems, null);
  select(editor, 1, 0);
  assert.equal(run(editor, moveBlogTableAxis("column", 1)), false);
  editor.destroy();
});

test("table changes cannot exceed persisted column or article node limits", () => {
  const editor = createEditor([row(...Array.from({ length: 100 }, (_, index) => cell(String(index))))]);
  select(editor, 0, 0);
  const before = editor.getJSON();
  assert.equal(run(editor, duplicateBlogTableAxis("column")), false);
  assert.deepEqual(editor.getJSON(), before);
  assert.equal(blogTableChangeFits(editor.state.doc), true);
  editor.commands.insertContentAt(
    editor.state.doc.content.size,
    Array.from({ length: 10000 }, () => ({ type: "paragraph" })),
  );
  assert.equal(blogTableChangeFits(editor.state.doc), false);
  select(editor, 0, 0);
  assert.equal(run(editor, duplicateBlogTableAxis("row")), false);
  editor.destroy();
});

test("drag resizing appends and removes trailing rows or columns with one atomic dispatch", () => {
  for (const axis of ["row", "column"]) {
    const editor = createEditor();
    select(editor, 0, 0);
    let calls = 0;
    const dispatch = (transaction) => {
      calls++;
      editor.view.dispatch(transaction);
    };
    assert.equal(resizeBlogTableAxis(axis, 2)(editor.state, dispatch), true);
    assert.equal(calls, 1);
    assert.deepEqual(
      cells(editor),
      axis === "row"
        ? [
            ["A", "B"],
            ["C", "D"],
            ["", ""],
            ["", ""],
          ]
        : [
            ["A", "B", "", ""],
            ["C", "D", "", ""],
          ],
    );
    assert.equal(resizeBlogTableAxis(axis, -3)(editor.state, dispatch), true);
    assert.equal(calls, 2);
    assert.deepEqual(cells(editor), axis === "row" ? [["A", "B"]] : [["A"], ["C"]]);
    assert.equal(TableMap.get(editor.state.doc.firstChild).problems, null);
    editor.destroy();
  }
});

test("drag shrinking cuts merged spans at the trailing boundary without deleting retained content", () => {
  for (const axis of ["row", "column"]) {
    const editor = createEditor([row(cell("Merged", { colspan: 2, rowspan: 2, colwidth: [100, 120] })), row()]);
    select(editor, 0, 0);
    assert.equal(run(editor, resizeBlogTableAxis(axis, -1)), true);
    const table = editor.state.doc.firstChild;
    const map = TableMap.get(table);
    assert.equal(map.width, axis === "column" ? 1 : 2);
    assert.equal(map.height, axis === "row" ? 1 : 2);
    assert.equal(map.problems, null);
    assert.equal(table.textContent, "Merged");
    assert.equal(table.firstChild.firstChild.attrs.colspan, axis === "column" ? 1 : 2);
    assert.equal(table.firstChild.firstChild.attrs.rowspan, axis === "row" ? 1 : 2);
    assert.deepEqual(table.firstChild.firstChild.attrs.colwidth, axis === "column" ? [100] : [100, 120]);
    assert.equal(run(editor, resizeBlogTableAxis(axis, 2)), true);
    assert.equal(TableMap.get(editor.state.doc.firstChild).problems, null);
    editor.destroy();
  }
});

test("drag resizing preserves native header behavior and targets only the hovered table", () => {
  const editor = createEditor();
  const firstTable = editor.state.doc.firstChild;
  editor.commands.insertContentAt(editor.state.doc.content.size, {
    type: "table",
    content: [row({ ...cell("Header"), type: "tableHeader" })],
  });
  select(editor, 0, 0);
  const tablePosition = firstTable.nodeSize + editor.state.doc.child(1).nodeSize;
  const target = getBlogTableStateAtCell(editor.state, tablePosition + 2);
  assert.equal(
    resizeBlogTableAxis("row", 2)(target, (transaction) => editor.view.dispatch(transaction)),
    true,
  );
  assert.ok(editor.state.doc.firstChild.eq(firstTable));
  const changed = editor.state.doc.child(2);
  assert.equal(changed.firstChild.firstChild.type.name, "tableHeader");
  assert.equal(changed.child(1).firstChild.type.name, "tableCell");
  assert.equal(changed.child(2).firstChild.type.name, "tableCell");
  assert.equal(TableMap.get(changed).problems, null);
  editor.destroy();
});

test("invalid, cancelled, dry-run, and oversized drags do not partially mutate a table", () => {
  const editor = createEditor();
  select(editor, 0, 0);
  const original = editor.state;
  let calls = 0;
  const dispatch = () => {
    calls++;
  };
  for (const delta of [NaN, Infinity, -Infinity, 0.5, 1001, -1001, -2])
    assert.equal(resizeBlogTableAxis("row", delta)(editor.state, dispatch), false);
  assert.equal(resizeBlogTableAxis("row", 0)(editor.state, dispatch), true);
  assert.equal(resizeBlogTableAxis("column", 2)(editor.state), true);
  assert.equal(resizeBlogTableAxis("column", 99)(editor.state, dispatch), false);
  assert.equal(calls, 0);
  assert.equal(editor.state, original);
  editor.commands.insertContentAt(
    editor.state.doc.content.size,
    Array.from({ length: 9977 }, () => ({ type: "paragraph" })),
  );
  select(editor, 0, 0);
  assert.equal(resizeBlogTableAxis("row", 2)(editor.state, dispatch), false);
  assert.equal(calls, 0);
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  assert.equal(resizeBlogTableAxis("row", 1)(editor.state, dispatch), false);
  editor.destroy();
});

test("each completed resize is one undo event that restores removed content", () => {
  const editor = createEditor();
  select(editor, 0, 0);
  const original = editor.state.doc;
  let state = EditorState.create({
    schema: editor.schema,
    doc: original,
    selection: editor.state.selection,
    plugins: [history()],
  });
  const dispatch = (transaction) => {
    state = state.apply(transaction);
  };
  assert.equal(resizeBlogTableAxis("row", 3)(state, dispatch), true);
  const expanded = state.doc;
  assert.equal(undoDepth(state), 1);
  assert.equal(resizeBlogTableAxis("column", -1)(state, dispatch), true);
  assert.equal(undoDepth(state), 2);
  assert.equal(undo(state, dispatch), true);
  assert.ok(state.doc.eq(expanded));
  assert.equal(undo(state, dispatch), true);
  assert.ok(state.doc.eq(original));
  assert.equal(undoDepth(state), 0);
  editor.destroy();
});

test("typing immediately after a resize stays a separate undo event", () => {
  const editor = createEditor();
  select(editor, 0, 0);
  const original = editor.state.doc;
  let state = EditorState.create({
    schema: editor.schema,
    doc: original,
    selection: editor.state.selection,
    plugins: [history()],
  });
  let resizeTime = 0;
  assert.equal(
    resizeBlogTableAxis("row", 2)(state, (transaction) => {
      resizeTime = transaction.time;
      state = state.apply(transaction);
    }),
    true,
  );
  const expanded = state.doc;
  const map = TableMap.get(state.doc.firstChild);
  const insideLastCell = 1 + map.map.at(-1) + 2;
  state = state.apply(state.tr.insertText("Typed immediately", insideLastCell).setTime(resizeTime + 1));
  assert.equal(undoDepth(state), 2);
  const dispatch = (transaction) => {
    state = state.apply(transaction);
  };
  assert.equal(undo(state, dispatch), true);
  assert.ok(state.doc.eq(expanded));
  assert.equal(undo(state, dispatch), true);
  assert.ok(state.doc.eq(original));
  editor.destroy();
});

test("inward drag follows unequal column widths and row heights instead of a uniform guess", () => {
  const columns = { axis: "column", count: 2, edges: [0, 300], end: 325, step: 25 };
  assert.equal(getBlogTableDragDelta({ ...columns, distance: -24 }), 0);
  assert.equal(getBlogTableDragDelta({ ...columns, distance: -25 }), -1);
  assert.equal(getBlogTableDragDelta({ ...columns, distance: -300 }), -1);
  assert.equal(getBlogTableDragDelta({ ...columns, distance: 50 }), 2);
  const rows = { axis: "row", count: 3, edges: [100, 130, 350], end: 400, step: 50 };
  for (const [distance, expected] of [
    [-49, 0],
    [-50, -1],
    [-269, -1],
    [-270, -2],
    [-500, -2],
  ])
    assert.equal(getBlogTableDragDelta({ ...rows, distance }), expected);
});

test("drag delta bounds preserve direction and refuse destructive guesses without exact edges", () => {
  const input = { axis: "row", count: 3, edges: [0, 30, 90], end: 120, step: 30, distance: -100 };
  for (const edges of [[], [0, 30], [0, NaN, 90], [0, 90, 30], [0, 30, 30], [0, 30, 120]])
    assert.equal(getBlogTableDragDelta({ ...input, edges }), 0);
  for (const distance of [NaN, Infinity, -Infinity, 0]) assert.equal(getBlogTableDragDelta({ ...input, distance }), 0);
  assert.equal(getBlogTableDragDelta({ ...input, count: 1, edges: [0], distance: -500 }), 0);
  assert.equal(getBlogTableDragDelta({ ...input, count: 1200, distance: 90 }), 3);
  assert.equal(getBlogTableDragDelta({ ...input, count: 1200, distance: 999999 }), 1000);
  assert.equal(getBlogTableDragDelta({ ...input, axis: "column", count: 1200, distance: 90 }), 0);
  assert.equal(getBlogTableDragDelta({ ...input, axis: "column", count: 99, distance: 90 }), 1);
  assert.equal(getBlogTableDragDelta({ ...input, distance: 90, step: 0 }), 0);
  assert.equal(
    getBlogTableDragDelta({
      ...input,
      count: 1200,
      edges: Array.from({ length: 1200 }, (_, index) => index),
      end: 1200,
      distance: -1200,
    }),
    -1000,
  );
});
