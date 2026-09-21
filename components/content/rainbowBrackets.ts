import { syntaxTree } from "@codemirror/language";
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode, Tree } from "@lezer/common";

const CLOSERS = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
]);
const MAX_CONTEXT_SIBLINGS = 32;
const MARKS = Array.from({ length: 6 }, (_, color) => Decoration.mark({ class: `cm-rainbow-${color}` }));

type BracketRange = { from: number; to: number; color: number };
type VisibleRange = { from: number; to: number };

function isLiteral(node: SyntaxNode) {
  return (node.name !== "TemplateString" && /String|Comment|RegExp/.test(node.name)) || node.type.isError;
}

function bracketToken(node: SyntaxNode): { from: number; to: number; name: string } | undefined {
  if (node.name === "InterpolationStart") return { from: node.to - 1, to: node.to, name: "{" };
  if (node.name === "InterpolationEnd") return { from: node.from, to: node.to, name: "}" };
  if (node.to === node.from + 1 && "()[]{}".includes(node.name) && node.name.length === 1) return node;
}

/** Uses the available incremental tree only; budget exhaustion leaves the rest uncolored. */
export function collectRainbowBrackets(
  tree: Tree,
  visibleRanges: readonly VisibleRange[],
  limits: { maxNodes?: number; maxDepth?: number; maxBrackets?: number } = {},
): { brackets: BracketRange[]; limited: boolean; visitedNodes: number } {
  const maxNodes = limits.maxNodes ?? 6_000;
  const maxDepth = limits.maxDepth ?? 128;
  const maxBrackets = limits.maxBrackets ?? 2_000;
  const brackets: BracketRange[] = [];
  let limited = false;
  let visitedNodes = 0;
  const spend = () => {
    if (visitedNodes >= maxNodes) {
      limited = true;
      return false;
    }
    visitedNodes += 1;
    return true;
  };

  // Delimiter owners may have a prefix (obj[...] or language keywords).
  // Inspect only their immediate children, never offscreen descendant trees.
  function enclosingCloser(node: SyntaxNode, position: number): string | undefined {
    if (node.type.isTop || isLiteral(node)) return;
    let child = node.firstChild;
    let scanned = 0;
    while (child && child.from < position) {
      if (!spend()) return;
      if (++scanned > MAX_CONTEXT_SIBLINGS) {
        limited = true;
        return;
      }
      const token = bracketToken(child);
      const closer = token && CLOSERS.get(token.name);
      if (closer && token.from < position) {
        let closing = node.lastChild;
        let tailScanned = 0;
        while (closing && closing.from > child.from) {
          if (!spend()) return;
          if (++tailScanned > MAX_CONTEXT_SIBLINGS) {
            limited = true;
            return;
          }
          if (bracketToken(closing)?.name === closer) {
            return closing.from >= position ? closer : undefined;
          }
          closing = closing.prevSibling;
        }
        // An unfinished construct still has a useful nesting level while typing.
        return closer;
      }
      child = child.nextSibling;
    }
  }

  for (const range of visibleRanges) {
    if (!spend() || limited) break;
    if (range.to <= range.from) continue;
    const cursor = tree.cursor();
    const ancestors: SyntaxNode[] = [cursor.node];
    while (!isLiteral(cursor.node) && cursor.enter(range.from, 1)) {
      if (!spend()) break;
      if (ancestors.length >= maxDepth) {
        limited = true;
        break;
      }
      ancestors.push(cursor.node);
    }
    if (limited) break;

    const stack: string[] = [];
    for (const ancestor of ancestors) {
      const closer = enclosingCloser(ancestor, range.from);
      if (closer) stack.push(closer);
      if (limited) break;
    }
    if (limited) break;

    let depth = ancestors.length - 1;
    while (cursor.from < range.to && spend()) {
      const node = cursor.node;
      const token = bracketToken(node);
      if (token && token.from >= range.from && token.to <= range.to) {
        const closer = CLOSERS.get(token.name);
        let color: number | undefined;
        if (closer) {
          color = stack.length % MARKS.length;
          stack.push(closer);
        } else if (stack.at(-1) === token.name) {
          stack.pop();
          color = stack.length % MARKS.length;
        }
        if (color !== undefined) {
          if (brackets.length >= maxBrackets) {
            limited = true;
            break;
          }
          brackets.push({ from: token.from, to: token.to, color });
        }
      }

      if (!isLiteral(node) && cursor.childAfter(range.from)) {
        if (++depth >= maxDepth) {
          limited = true;
          break;
        }
        continue;
      }
      let next = cursor.nextSibling();
      while (!next && cursor.parent()) {
        if (!spend()) break;
        depth -= 1;
        next = cursor.nextSibling();
      }
      if (!next || limited) break;
    }
    if (limited) break;
  }
  return { brackets, limited, visitedNodes };
}

function decorations(view: EditorView): DecorationSet {
  const { brackets } = collectRainbowBrackets(syntaxTree(view.state), view.visibleRanges);
  return Decoration.set(
    brackets.map(({ from, to, color }) => MARKS[color].range(from, to)),
    true,
  );
}

export const rainbowBrackets = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = decorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = decorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
