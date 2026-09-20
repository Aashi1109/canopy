import type { BlogNode } from "./document.ts";
import { MAX_MATH_LENGTH, matchInlineMath } from "../markdown/math.ts";

function inlineMath(node: BlogNode): BlogNode[] {
  if (node.type !== "text" || node.marks?.some((mark) => mark.type === "code")) return [node];
  const text = node.text ?? "";
  const result: BlogNode[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\\") {
      index++;
      continue;
    }
    if (text[index] !== "$" || text[index - 1] === "$") continue;
    const match = matchInlineMath(text.slice(index));
    if (!match || match.latex.length > MAX_MATH_LENGTH) continue;
    if (index > start) result.push({ ...node, text: text.slice(start, index) });
    result.push({
      type: "inlineMath",
      attrs: { latex: match.latex },
      ...(node.marks?.length ? { marks: node.marks } : {}),
    });
    index += match.raw.length - 1;
    start = index + 1;
  }
  if (start < text.length) result.push({ ...node, text: text.slice(start) });
  return result.length ? result : [node];
}

/** Upgrade legacy raw formulas for display/editor initialization without changing the stored record. */
export function normalizeBlogMath(node: BlogNode): BlogNode {
  if (node.type === "codeBlock") return node;
  if (node.type === "paragraph") {
    const children = node.content ?? [];
    if (children.every((child) => child.type === "hardBreak" || (child.type === "text" && !child.marks?.length))) {
      const text = children.map((child) => (child.type === "hardBreak" ? "\n" : (child.text ?? ""))).join("");
      const match = /^\s*\$\$\s*([\s\S]+?)\s*\$\$\s*$/.exec(text);
      if (match && match[1].length <= MAX_MATH_LENGTH) return { type: "blockMath", attrs: { latex: match[1] } };
    }
  }
  if (!node.content) return node;
  const content = node.content.flatMap((child) => inlineMath(normalizeBlogMath(child)));
  if (["listItem", "taskItem"].includes(node.type) && content[0]?.type !== "paragraph")
    content.unshift({ type: "paragraph" });
  return { ...node, content };
}
