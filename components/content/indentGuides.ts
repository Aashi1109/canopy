import { foldNodeProp, getIndentUnit, language, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

const MAX_LINES = 400;
const MAX_CONTEXT = 32;
const MAX_PREFIX = 256;
const MAX_DEPTH = 64;
const MAX_GUIDES = 32;
type GuideLine = { from: number; columns: number[]; activeColumn?: number };
type LineInfo = { number: number; from: number; indent: number; blank: boolean; closing: boolean };

/** Read only visible lines and bounded nearby/ancestor context; never request more parsing. */
export function collectIndentGuides(
  state: EditorState,
  visibleRanges: readonly { from: number; to: number }[],
  focused = false,
) {
  const lines: GuideLine[] = [];
  const cache = new Map<number, LineInfo>();
  let readCharacters = 0,
    visitedNodes = 0,
    limited = false;
  const result = () => ({ lines, readLines: cache.size, readCharacters, visitedNodes, limited });
  if (!state.facet(language)) return result();

  function info(number: number): LineInfo | undefined {
    if (number < 1 || number > state.doc.lines) return;
    const cached = cache.get(number);
    if (cached) return cached;
    if (cache.size >= MAX_LINES + MAX_CONTEXT * 4 + MAX_DEPTH * 2) {
      limited = true;
      return;
    }
    const line = state.doc.line(number),
      prefix = state.doc.sliceString(line.from, Math.min(line.to, line.from + MAX_PREFIX));
    readCharacters += prefix.length;
    let indent = 0,
      offset = 0;
    while (offset < prefix.length && (prefix[offset] === " " || prefix[offset] === "\t")) {
      indent += prefix[offset++] === "\t" ? state.tabSize - (indent % state.tabSize) : 1;
    }
    if (offset === MAX_PREFIX && line.length > MAX_PREFIX) limited = true;
    const value = {
      number,
      from: line.from,
      indent,
      blank: offset === line.length,
      closing: /^(?:[\]}\)]|<\/)/.test(prefix.slice(offset)),
    };
    cache.set(number, value);
    return value;
  }
  function nearby(number: number, direction: number) {
    for (let step = 1; step <= MAX_CONTEXT; step++) {
      const row = info(number + step * direction);
      if (!row || !row.blank) return row;
    }
  }
  function ancestors(position: number) {
    const cursor = syntaxTree(state).cursor(),
      nodes: SyntaxNode[] = [];
    do {
      visitedNodes++;
      nodes.push(cursor.node);
      info(state.doc.lineAt(cursor.from).number);
      if (nodes.length === MAX_DEPTH) {
        limited = true;
        return [];
      }
    } while (cursor.enter(position, -1));
    return nodes.reverse();
  }

  const visible = new Map<number, LineInfo>();
  for (const range of visibleRanges) {
    for (let number = state.doc.lineAt(range.from).number; number <= state.doc.lines; number++) {
      const row = info(number);
      if (!row || row.from > range.to) break;
      if (visible.size === MAX_LINES) {
        limited = true;
        break;
      }
      visible.set(number, row);
      if (number === state.doc.lines) break;
    }
    if (visible.size === MAX_LINES) break;
  }
  const first = visible.values().next().value as LineInfo | undefined;
  if (!first) return result();
  ancestors(first.from);
  nearby(first.number, -1);
  const caret = state.doc.lineAt(state.selection.main.head);
  const caretNodes = focused ? ancestors(state.selection.main.head) : [];
  let scope: { from: number; to: number; column: number } | undefined;
  for (const node of caretNodes) {
    if (/String|Comment|Literal/.test(node.name)) continue;
    const fold = node.type.prop(foldNodeProp)?.(node, state);
    if (!fold) continue;
    const start = info(state.doc.lineAt(node.from).number);
    const end = state.doc.lineAt(fold.to).number;
    if (start && end > start.number) {
      scope = { from: start.number, to: end, column: start.indent };
      break;
    }
  }

  // Infer the actual spacing from this viewport and its ancestors (e.g. pasted four-space JSON).
  let unit = 0;
  for (const row of cache.values()) {
    if (row.blank || !row.indent) continue;
    let a = unit,
      b = row.indent;
    while (b) [a, b] = [b, a % b];
    unit = a;
  }
  unit = Math.max(1, Math.min(unit || getIndentUnit(state), 8));

  if (focused && !scope) {
    let start = info(caret.number);
    const next = nearby(caret.number, 1);
    const currentIndent = start?.blank ? (nearby(caret.number, -1)?.indent ?? 0) : (start?.indent ?? 0);
    if (!start?.blank && next && next.indent > currentIndent) {
      scope = { from: caret.number, to: Math.min(state.doc.lines, caret.number + MAX_CONTEXT), column: currentIndent };
    } else {
      for (let step = 1; step <= MAX_CONTEXT; step++) {
        start = info(caret.number - step);
        if (!start) break;
        if (!start.blank && start.indent < currentIndent) {
          scope = {
            from: start.number,
            to: Math.min(state.doc.lines, caret.number + MAX_CONTEXT),
            column: start.indent,
          };
          break;
        }
      }
    }
    if (scope)
      for (let number = caret.number + 1; number <= scope.to; number++) {
        const row = info(number);
        if (row && !row.blank && row.indent <= scope.column) {
          scope.to = row.number;
          break;
        }
      }
  }

  for (const row of visible.values()) {
    let indent = row.indent;
    if (row.blank) {
      const before = nearby(row.number, -1),
        after = nearby(row.number, 1);
      indent =
        before && after
          ? before.indent <= after.indent
            ? after.indent
            : Math.min(before.indent, after.indent + (after.closing ? unit : 0))
          : 0;
      if (scope && row.number > scope.from && row.number <= scope.to) indent = Math.max(indent, scope.column + unit);
    }
    const count = Math.ceil(indent / unit);
    if (count > MAX_GUIDES) limited = true;
    const columns = Array.from({ length: Math.min(count, MAX_GUIDES) }, (_, index) => index * unit);
    const activeColumn =
      scope && row.number > scope.from && row.number <= scope.to && columns.includes(scope.column)
        ? scope.column
        : undefined;
    if (columns.length) lines.push({ from: row.from, columns, activeColumn });
  }
  return result();
}

function decorations(view: EditorView): DecorationSet {
  return Decoration.set(
    collectIndentGuides(view.state, view.visibleRanges, view.hasFocus).lines.map((line) =>
      Decoration.line({
        class: "cm-indentGuides",
        attributes: {
          // Restrict backgrounds to the first visual row, never wrapped continuation text.
          style: `background-image:${line.columns
            .map((column) => {
              const color = column === line.activeColumn ? "var(--code-guide-active)" : "var(--code-guide)";
              return `linear-gradient(${color},${color})`;
            })
            .join(
              ",",
            )};background-position:${line.columns.map((column) => `${column + 0.5}ch 0`).join(",")};background-size:1px 1lh;background-repeat:no-repeat;background-origin:content-box;`,
        },
      }).range(line.from),
    ),
    true,
  );
}

export const indentGuides = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.focusChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state) ||
        update.startState.facet(language) !== update.state.facet(language)
      )
        this.decorations = decorations(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
