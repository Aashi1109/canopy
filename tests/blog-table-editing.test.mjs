import { test, expect } from "vitest";
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
    expect(target).toBeTruthy();
    expect(editor.state).toBe(originalState);
    expect(getBlogTableContext(editor.state).tableStart).toBe(1);
    expect(getBlogTableContext(target).tableStart).toBe(secondTablePosition + 1);
    expect(appendBlogTableAxis(axis)(target, (transaction) => editor.view.dispatch(transaction))).toBe(true);
    expect(editor.state.doc.firstChild.eq(firstTable)).toBeTruthy();
    const changed = TableMap.get(editor.state.doc.child(2));
    expect(changed.width).toBe(axis === "column" ? 3 : 2);
    expect(changed.height).toBe(axis === "row" ? 2 : 1);
    expect(changed.problems).toBe(null);
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
    expect(getBlogTableStateAtCell(editor.state, invalid)).toBe(null);
    expect(editor.state).toBe(before);
  }
  editor.commands.deleteRange({ from: 0, to: editor.state.doc.firstChild.nodeSize });
  const removed = editor.state;
  expect(getBlogTableStateAtCell(editor.state, position)).toBe(null);
  expect(editor.state).toBe(removed);
  editor.destroy();
});

test("table edge actions append after the last row or column regardless of cursor position", () => {
  for (const axis of ["row", "column"]) {
    const editor = createEditor();
    select(editor, 0, 0);
    const before = editor.getJSON();
    expect(appendBlogTableAxis(axis)(editor.state)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(run(editor, appendBlogTableAxis(axis))).toBe(true);
    expect(cells(editor)).toEqual(
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
    expect(TableMap.get(editor.state.doc.firstChild).problems).toBe(null);
    editor.destroy();
  }
});

test("edge appending preserves merged cells and refuses the persisted column limit", () => {
  for (const axis of ["row", "column"]) {
    const editor = createEditor([row(cell("A", { rowspan: 2 }), cell("B")), row(cell("C"))]);
    select(editor, 0, 0);
    expect(run(editor, appendBlogTableAxis(axis))).toBe(true);
    const map = TableMap.get(editor.state.doc.firstChild);
    expect(map.problems).toBe(null);
    expect(axis === "row" ? map.height : map.width).toBe(3);
    expect(editor.state.doc.firstChild.firstChild.firstChild.attrs.rowspan).toBe(2);
    editor.destroy();
  }
  const editor = createEditor([row(...Array.from({ length: 100 }, (_, index) => cell(String(index))))]);
  select(editor, 0, 0);
  const before = editor.getJSON();
  expect(run(editor, appendBlogTableAxis("column"))).toBe(false);
  expect(editor.getJSON()).toEqual(before);
  editor.destroy();
});

test("table row and column moves preserve content and reject out-of-range movement", () => {
  const editor = createEditor();
  select(editor, 0, 1);
  expect(run(editor, moveBlogTableAxis("column", 1))).toBe(false);
  expect(run(editor, moveBlogTableAxis("column", -1))).toBe(true);
  expect(cells(editor)).toEqual([
    ["B", "A"],
    ["D", "C"],
  ]);
  select(editor, 0, 0);
  expect(run(editor, moveBlogTableAxis("row", -1))).toBe(false);
  expect(run(editor, moveBlogTableAxis("row", 1))).toBe(true);
  expect(cells(editor)).toEqual([
    ["D", "C"],
    ["B", "A"],
  ]);
  expect(TableMap.get(editor.state.doc.firstChild).problems).toBe(null);
  editor.destroy();
});

test("duplicate row and column preserve cell attributes and select the copy", () => {
  for (const axis of ["row", "column"]) {
    const editor = createEditor([
      row(cell("A", { colwidth: [180], align: "right", backgroundColor: "#dbeafe" }), cell("B")),
      row(cell("C", { colwidth: [180] }), cell("D")),
    ]);
    select(editor, 0, 0);
    expect(run(editor, duplicateBlogTableAxis(axis))).toBe(true);
    expect(cells(editor)).toEqual(
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
    expect(axis === "row" ? context.top : context.left).toBe(1);
    const copy = axis === "row" ? context.table.child(1).firstChild : context.table.firstChild.child(1);
    expect(copy.attrs.align).toBe("right");
    expect(copy.attrs.backgroundColor).toBe("#dbeafe");
    expect(copy.attrs.colwidth).toEqual([180]);
    expect(TableMap.get(editor.state.doc.firstChild).problems).toBe(null);
    editor.destroy();
  }
});

test("merged tables reject duplication without changing any content", () => {
  const editor = createEditor([row(cell("Merged", { colspan: 2 })), row(cell("C"), cell("D"))]);
  select(editor, 1, 1);
  const before = editor.getJSON();
  expect(run(editor, duplicateBlogTableAxis("row"))).toBe(false);
  expect(run(editor, duplicateBlogTableAxis("column"))).toBe(false);
  expect(editor.getJSON()).toEqual(before);
  editor.destroy();
});

test("formatting affects selected cells and clearing restores inherited styles", () => {
  const editor = createEditor();
  select(editor, 0, 1);
  expect(run(editor, selectBlogTableAxis("column"))).toBe(true);
  expect(run(editor, formatBlogTableCells({ align: "center", backgroundColor: "#fef3c7" }))).toBe(true);
  const table = editor.state.doc.firstChild;
  for (let index = 0; index < 2; index++) {
    expect(table.child(index).child(0).attrs.backgroundColor).toBe(null);
    expect(table.child(index).child(1).attrs.backgroundColor).toBe("#fef3c7");
    expect(table.child(index).child(1).attrs.align).toBe("center");
  }
  expect(run(editor, formatBlogTableCells({ backgroundColor: "url(evil)" }))).toBe(false);
  expect(run(editor, formatBlogTableCells({ backgroundColor: null, align: null }))).toBe(true);
  expect(editor.state.doc.firstChild.firstChild.child(1).attrs.align).toBe(null);
  expect(editor.state.doc.firstChild.firstChild.child(1).attrs.backgroundColor).toBe(null);
  editor.destroy();
});

test("keyboard column width updates every intersecting cell including a merged cell", () => {
  const editor = createEditor([
    row(cell("Merged", { colspan: 2, colwidth: [120, 140] })),
    row(cell("C", { colwidth: [120] }), cell("D", { colwidth: [140] })),
  ]);
  select(editor, 1, 1);
  expect(run(editor, setBlogTableColumnWidth(220))).toBe(true);
  const table = editor.state.doc.firstChild;
  expect(table.firstChild.firstChild.attrs.colwidth).toEqual([120, 220]);
  expect(table.child(1).child(1).attrs.colwidth).toEqual([220]);
  expect(table.child(1).child(0).attrs.colwidth).toEqual([120]);
  expect(run(editor, setBlogTableColumnWidth(20))).toBe(false);
  expect(run(editor, setBlogTableColumnWidth(Number.NaN))).toBe(false);
  expect(TableMap.get(table).problems).toBe(null);
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
    expect(run(editor, command)).toBe(false);
  expect(editor.getJSON()).toEqual(before);
  editor.destroy();
});

test("deleting the final row or column removes the table and preserves other content", () => {
  for (const axis of ["row", "column"]) {
    const editor = createEditor([row(cell("Only cell"))]);
    select(editor, 0, 0);
    expect(run(editor, deleteBlogTableAxis(axis))).toBe(true);
    expect(editor.getJSON().content).toEqual([{ type: "paragraph" }]);
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
  expect(run(editor, moveBlogTableAxis("row", 1))).toBe(true);
  expect(cells(editor)).toEqual([["C", "D"], ["Merged"], ["E", "F"]]);
  expect(TableMap.get(editor.state.doc.firstChild).problems).toBe(null);
  select(editor, 1, 0);
  expect(run(editor, moveBlogTableAxis("column", 1))).toBe(false);
  editor.destroy();
});

test("table changes cannot exceed persisted column or article node limits", () => {
  const editor = createEditor([row(...Array.from({ length: 100 }, (_, index) => cell(String(index))))]);
  select(editor, 0, 0);
  const before = editor.getJSON();
  expect(run(editor, duplicateBlogTableAxis("column"))).toBe(false);
  expect(editor.getJSON()).toEqual(before);
  expect(blogTableChangeFits(editor.state.doc)).toBe(true);
  editor.commands.insertContentAt(
    editor.state.doc.content.size,
    Array.from({ length: 10000 }, () => ({ type: "paragraph" })),
  );
  expect(blogTableChangeFits(editor.state.doc)).toBe(false);
  select(editor, 0, 0);
  expect(run(editor, duplicateBlogTableAxis("row"))).toBe(false);
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
    expect(resizeBlogTableAxis(axis, 2)(editor.state, dispatch)).toBe(true);
    expect(calls).toBe(1);
    expect(cells(editor)).toEqual(
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
    expect(resizeBlogTableAxis(axis, -3)(editor.state, dispatch)).toBe(true);
    expect(calls).toBe(2);
    expect(cells(editor)).toEqual(axis === "row" ? [["A", "B"]] : [["A"], ["C"]]);
    expect(TableMap.get(editor.state.doc.firstChild).problems).toBe(null);
    editor.destroy();
  }
});

test("drag shrinking cuts merged spans at the trailing boundary without deleting retained content", () => {
  for (const axis of ["row", "column"]) {
    const editor = createEditor([row(cell("Merged", { colspan: 2, rowspan: 2, colwidth: [100, 120] })), row()]);
    select(editor, 0, 0);
    expect(run(editor, resizeBlogTableAxis(axis, -1))).toBe(true);
    const table = editor.state.doc.firstChild;
    const map = TableMap.get(table);
    expect(map.width).toBe(axis === "column" ? 1 : 2);
    expect(map.height).toBe(axis === "row" ? 1 : 2);
    expect(map.problems).toBe(null);
    expect(table.textContent).toBe("Merged");
    expect(table.firstChild.firstChild.attrs.colspan).toBe(axis === "column" ? 1 : 2);
    expect(table.firstChild.firstChild.attrs.rowspan).toBe(axis === "row" ? 1 : 2);
    expect(table.firstChild.firstChild.attrs.colwidth).toEqual(axis === "column" ? [100] : [100, 120]);
    expect(run(editor, resizeBlogTableAxis(axis, 2))).toBe(true);
    expect(TableMap.get(editor.state.doc.firstChild).problems).toBe(null);
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
  expect(resizeBlogTableAxis("row", 2)(target, (transaction) => editor.view.dispatch(transaction))).toBe(true);
  expect(editor.state.doc.firstChild.eq(firstTable)).toBeTruthy();
  const changed = editor.state.doc.child(2);
  expect(changed.firstChild.firstChild.type.name).toBe("tableHeader");
  expect(changed.child(1).firstChild.type.name).toBe("tableCell");
  expect(changed.child(2).firstChild.type.name).toBe("tableCell");
  expect(TableMap.get(changed).problems).toBe(null);
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
    expect(resizeBlogTableAxis("row", delta)(editor.state, dispatch)).toBe(false);
  expect(resizeBlogTableAxis("row", 0)(editor.state, dispatch)).toBe(true);
  expect(resizeBlogTableAxis("column", 2)(editor.state)).toBe(true);
  expect(resizeBlogTableAxis("column", 99)(editor.state, dispatch)).toBe(false);
  expect(calls).toBe(0);
  expect(editor.state).toBe(original);
  editor.commands.insertContentAt(
    editor.state.doc.content.size,
    Array.from({ length: 9977 }, () => ({ type: "paragraph" })),
  );
  select(editor, 0, 0);
  expect(resizeBlogTableAxis("row", 2)(editor.state, dispatch)).toBe(false);
  expect(calls).toBe(0);
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  expect(resizeBlogTableAxis("row", 1)(editor.state, dispatch)).toBe(false);
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
  expect(resizeBlogTableAxis("row", 3)(state, dispatch)).toBe(true);
  const expanded = state.doc;
  expect(undoDepth(state)).toBe(1);
  expect(resizeBlogTableAxis("column", -1)(state, dispatch)).toBe(true);
  expect(undoDepth(state)).toBe(2);
  expect(undo(state, dispatch)).toBe(true);
  expect(state.doc.eq(expanded)).toBeTruthy();
  expect(undo(state, dispatch)).toBe(true);
  expect(state.doc.eq(original)).toBeTruthy();
  expect(undoDepth(state)).toBe(0);
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
  expect(
    resizeBlogTableAxis("row", 2)(state, (transaction) => {
      resizeTime = transaction.time;
      state = state.apply(transaction);
    }),
  ).toBe(true);
  const expanded = state.doc;
  const map = TableMap.get(state.doc.firstChild);
  const insideLastCell = 1 + map.map.at(-1) + 2;
  state = state.apply(state.tr.insertText("Typed immediately", insideLastCell).setTime(resizeTime + 1));
  expect(undoDepth(state)).toBe(2);
  const dispatch = (transaction) => {
    state = state.apply(transaction);
  };
  expect(undo(state, dispatch)).toBe(true);
  expect(state.doc.eq(expanded)).toBeTruthy();
  expect(undo(state, dispatch)).toBe(true);
  expect(state.doc.eq(original)).toBeTruthy();
  editor.destroy();
});

test("inward drag follows unequal column widths and row heights instead of a uniform guess", () => {
  const columns = { axis: "column", count: 2, edges: [0, 300], end: 325, step: 25 };
  expect(getBlogTableDragDelta({ ...columns, distance: -24 })).toBe(0);
  expect(getBlogTableDragDelta({ ...columns, distance: -25 })).toBe(-1);
  expect(getBlogTableDragDelta({ ...columns, distance: -300 })).toBe(-1);
  expect(getBlogTableDragDelta({ ...columns, distance: 50 })).toBe(2);
  const rows = { axis: "row", count: 3, edges: [100, 130, 350], end: 400, step: 50 };
  for (const [distance, expected] of [
    [-49, 0],
    [-50, -1],
    [-269, -1],
    [-270, -2],
    [-500, -2],
  ])
    expect(getBlogTableDragDelta({ ...rows, distance })).toBe(expected);
});

test("drag delta bounds preserve direction and refuse destructive guesses without exact edges", () => {
  const input = { axis: "row", count: 3, edges: [0, 30, 90], end: 120, step: 30, distance: -100 };
  for (const edges of [[], [0, 30], [0, NaN, 90], [0, 90, 30], [0, 30, 30], [0, 30, 120]])
    expect(getBlogTableDragDelta({ ...input, edges })).toBe(0);
  for (const distance of [NaN, Infinity, -Infinity, 0]) expect(getBlogTableDragDelta({ ...input, distance })).toBe(0);
  expect(getBlogTableDragDelta({ ...input, count: 1, edges: [0], distance: -500 })).toBe(0);
  expect(getBlogTableDragDelta({ ...input, count: 1200, distance: 90 })).toBe(3);
  expect(getBlogTableDragDelta({ ...input, count: 1200, distance: 999999 })).toBe(1000);
  expect(getBlogTableDragDelta({ ...input, axis: "column", count: 1200, distance: 90 })).toBe(0);
  expect(getBlogTableDragDelta({ ...input, axis: "column", count: 99, distance: 90 })).toBe(1);
  expect(getBlogTableDragDelta({ ...input, distance: 90, step: 0 })).toBe(0);
  expect(
    getBlogTableDragDelta({
      ...input,
      count: 1200,
      edges: Array.from({ length: 1200 }, (_, index) => index),
      end: 1200,
      distance: -1200,
    }),
  ).toBe(-1000);
});
