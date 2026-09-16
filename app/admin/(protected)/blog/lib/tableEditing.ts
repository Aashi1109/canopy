import { TableCell, TableHeader } from "@tiptap/extension-table";
import type { Command, EditorState, Transaction } from "@tiptap/pm/state";
import type { Node } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import {
  addColumnAfter,
  addRowAfter,
  CellSelection,
  deleteColumn,
  deleteRow,
  deleteTable,
  fixTables,
  isInTable,
  moveTableColumn,
  moveTableRow,
  removeColumn,
  removeRow,
  selectedRect,
  TableMap,
} from "@tiptap/pm/tables";

export type BlogTableAxis = "row" | "column";

/** Shrink only after crossing real trailing cell boundaries, never an averaged size. */
export function getBlogTableDragDelta({
  axis,
  distance,
  step,
  count,
  edges,
  end,
}: {
  axis: BlogTableAxis;
  distance: number;
  step: number;
  count: number;
  edges: readonly number[];
  end: number;
}) {
  if (!Number.isFinite(distance) || !Number.isInteger(count) || count < 1 || distance === 0)
    return 0;
  if (distance > 0) {
    if (!Number.isFinite(step) || step <= 0) return 0;
    return Math.min(
      1000,
      Math.floor(distance / step),
      axis === "column" ? Math.max(0, 100 - count) : 1000,
    );
  }
  if (
    !Number.isFinite(end) ||
    edges.length !== count ||
    !edges.every(
      (edge, index) =>
        Number.isFinite(edge) && edge < end && (index === 0 || edge > edges[index - 1]),
    )
  )
    return 0;
  const crossed = edges.slice(1).filter((edge) => end + distance <= edge).length;
  return -Math.min(1000, crossed) || 0;
}

const backgroundColor = {
  default: null,
  parseHTML: (element: HTMLElement) => {
    const color = element.style.backgroundColor;
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
    const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color);
    return rgb
      ? `#${rgb
          .slice(1)
          .map((value) => Number(value).toString(16).padStart(2, "0"))
          .join("")}`
      : null;
  },
  renderHTML: (attrs: Record<string, unknown>) =>
    typeof attrs.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(attrs.backgroundColor)
      ? { style: `background-color: ${attrs.backgroundColor}` }
      : {},
};
export const BlogTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), backgroundColor };
  },
});
export const BlogTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), backgroundColor };
  },
});

export function getBlogTableContext(state: EditorState) {
  if (!isInTable(state)) return null;
  const context = selectedRect(state);
  let merged = false;
  context.table.forEach((row) =>
    row.forEach((cell) => {
      if (cell.attrs.colspan > 1 || cell.attrs.rowspan > 1) merged = true;
    }),
  );
  return { ...context, merged };
}

/** Resolve a hovered cell without moving the editor's live selection. */
export function getBlogTableStateAtCell(state: EditorState, position: number) {
  if (!Number.isInteger(position) || position < 0 || position >= state.doc.content.size)
    return null;
  const name = state.doc.nodeAt(position)?.type.name;
  if (name !== "tableCell" && name !== "tableHeader") return null;
  return state.apply(state.tr.setSelection(CellSelection.create(state.doc, position)));
}

function selectAxis(
  transaction: Transaction,
  tableStart: number,
  axis: BlogTableAxis,
  index: number,
) {
  const table = transaction.doc.nodeAt(tableStart - 1)!;
  const map = TableMap.get(table);
  const first = tableStart + map.map[axis === "row" ? index * map.width : index];
  const last =
    tableStart +
    map.map[axis === "row" ? (index + 1) * map.width - 1 : (map.height - 1) * map.width + index];
  const selection = axis === "row" ? CellSelection.rowSelection : CellSelection.colSelection;
  transaction.setSelection(
    selection(transaction.doc.resolve(first), transaction.doc.resolve(last)),
  );
}

export function selectBlogTableAxis(axis: BlogTableAxis): Command {
  return (state, dispatch) => {
    const context = getBlogTableContext(state);
    if (!context) return false;
    const transaction = state.tr;
    selectAxis(transaction, context.tableStart, axis, axis === "row" ? context.top : context.left);
    dispatch?.(transaction);
    return true;
  };
}

/** The outer plus rails always append at the table edge, regardless of the cursor. */
export function appendBlogTableAxis(axis: BlogTableAxis): Command {
  return (state, dispatch) => {
    const context = getBlogTableContext(state);
    if (!context) return false;
    const { map, tableStart } = context;
    const index =
      axis === "row"
        ? (map.height - 1) * map.width + context.left
        : context.top * map.width + map.width - 1;
    const edgeState = state.apply(
      state.tr.setSelection(CellSelection.create(state.doc, tableStart + map.map[index])),
    );
    let change: Transaction | undefined;
    (axis === "row" ? addRowAfter : addColumnAfter)(edgeState, (transaction) => {
      change = transaction;
    });
    if (!change || !blogTableChangeFits(change.doc)) return false;
    dispatch?.(change);
    return true;
  };
}

/** Commit one rail drag atomically; the UI previews changes until release. */
export function resizeBlogTableAxis(axis: BlogTableAxis, delta: number): Command {
  return (state, dispatch) => {
    const context = getBlogTableContext(state);
    if (!context || !Number.isInteger(delta) || Math.abs(delta) > 1000) return false;
    const size = axis === "row" ? context.map.height : context.map.width;
    if (size + delta < 1 || (axis === "column" && size + delta > 100)) return false;
    if (!delta) return true;
    const transaction = state.tr;
    let working = state;
    for (let count = 0; count < Math.abs(delta); count++) {
      const table = working.doc.nodeAt(context.tableStart - 1)!;
      const map = TableMap.get(table);
      const edge = getBlogTableStateAtCell(
        working,
        context.tableStart + map.map[map.map.length - 1],
      )!;
      let change: Transaction | undefined;
      if (delta > 0) {
        if (
          !appendBlogTableAxis(axis)(edge, (next) => {
            change = next;
          })
        )
          return false;
      } else {
        change = edge.tr;
        // A selected merged cell may cover several rows/columns. Remove only
        // the physical trailing axis; the native primitive adjusts its span.
        const rect = { ...context, table, map };
        if (axis === "row") removeRow(change, rect, map.height - 1);
        else removeColumn(change, rect, map.width - 1);
      }
      if (!change) return false;
      for (const step of change.steps) transaction.step(step);
      working = edge.apply(change);
    }
    const repair = fixTables(working, state);
    if (repair) for (const step of repair.steps) transaction.step(step);
    if (!blogTableChangeFits(transaction.doc)) return false;
    // Keep both preceding edits and the next immediate keystroke outside this undo event.
    dispatch?.(closeHistory(transaction.setTime(0)));
    return true;
  };
}

export function moveBlogTableAxis(axis: BlogTableAxis, direction: -1 | 1): Command {
  return (state, dispatch) => {
    const context = getBlogTableContext(state);
    if (!context) return false;
    const from = axis === "row" ? context.top : context.left;
    const to = direction === -1 ? from - 1 : axis === "row" ? context.bottom : context.right;
    if (to < 0 || to >= (axis === "row" ? context.map.height : context.map.width)) return false;
    return (axis === "row" ? moveTableRow : moveTableColumn)({ from, to })(state, dispatch);
  };
}

export function duplicateBlogTableAxis(axis: BlogTableAxis): Command {
  return (state, dispatch) => {
    const context = getBlogTableContext(state);
    // A merged cell can cross the copied boundary. Require splitting it first.
    if (!context || context.merged || (axis === "column" && context.map.width >= 100)) return false;
    const { table, tableStart, map } = context;
    const transaction = state.tr;
    const index = axis === "row" ? context.top : context.left;
    if (axis === "row") {
      let position = tableStart;
      for (let row = 0; row <= index; row++) position += table.child(row).nodeSize;
      transaction.insert(position, table.child(index));
    } else {
      for (let row = map.height - 1; row >= 0; row--) {
        const position = map.map[row * map.width + index];
        const cell = table.nodeAt(position)!;
        transaction.insert(tableStart + position + cell.nodeSize, cell);
      }
    }
    selectAxis(transaction, tableStart, axis, index + 1);
    if (!blogTableChangeFits(transaction.doc)) return false;
    dispatch?.(transaction.scrollIntoView());
    return true;
  };
}

export function blogTableChangeFits(doc: Node) {
  let nodes = 1;
  let fits = true;
  doc.descendants((node) => {
    nodes++;
    if (nodes > 10000 || (node.type.name === "table" && TableMap.get(node).width > 100))
      fits = false;
    return fits;
  });
  return fits;
}

export function deleteBlogTableAxis(axis: BlogTableAxis): Command {
  return (state, dispatch) => {
    const context = getBlogTableContext(state);
    if (!context) return false;
    const all =
      axis === "row"
        ? context.top === 0 && context.bottom === context.map.height
        : context.left === 0 && context.right === context.map.width;
    return (all ? deleteTable : axis === "row" ? deleteRow : deleteColumn)(state, dispatch);
  };
}

export function formatBlogTableCells(attrs: {
  align?: "left" | "center" | "right" | null;
  backgroundColor?: string | null;
}): Command {
  return (state, dispatch) => {
    const context = getBlogTableContext(state);
    if (
      !context ||
      (attrs.backgroundColor != null && !/^#[0-9a-f]{6}$/i.test(attrs.backgroundColor)) ||
      (attrs.align != null && !["left", "center", "right"].includes(attrs.align))
    )
      return false;
    if (!dispatch) return true;
    const transaction = state.tr;
    for (const offset of context.map.cellsInRect(context)) {
      const cell = context.table.nodeAt(offset)!;
      const position = context.tableStart + offset;
      transaction.setNodeMarkup(position, undefined, { ...cell.attrs, ...attrs });
      if ("align" in attrs)
        cell.descendants((node, childOffset) => {
          if (
            (node.type.name === "paragraph" || node.type.name === "heading") &&
            node.attrs.textAlign != null
          )
            transaction.setNodeMarkup(position + 1 + childOffset, undefined, {
              ...node.attrs,
              textAlign: null,
            });
        });
    }
    dispatch(transaction);
    return true;
  };
}

/** Keyboard-accessible alternative to dragging the column boundary. */
export function setBlogTableColumnWidth(width: number): Command {
  return (state, dispatch) => {
    const context = getBlogTableContext(state);
    if (!context || !Number.isInteger(width) || width < 25 || width > 10000) return false;
    const transaction = state.tr;
    const offsets = new Set(
      Array.from(
        { length: context.map.height },
        (_, row) => context.map.map[row * context.map.width + context.left],
      ),
    );
    for (const offset of offsets) {
      const cell = context.table.nodeAt(offset)!;
      const widths: number[] = cell.attrs.colwidth?.slice() ?? Array(cell.attrs.colspan).fill(0);
      widths[context.left - context.map.findCell(offset).left] = width;
      transaction.setNodeMarkup(context.tableStart + offset, undefined, {
        ...cell.attrs,
        colwidth: widths,
      });
    }
    dispatch?.(transaction);
    return true;
  };
}
