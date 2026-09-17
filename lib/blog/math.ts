import katex from "katex";
import type { BlogNode } from "./document.ts";

export const MAX_BLOG_MATH_LENGTH = 10000;

/** Dollar delimiters must be unescaped, nonempty and not currency amounts. */
export function matchBlogInlineMath(source: string): { raw: string; latex: string } | undefined {
  const match = /^\$(?!\$)([^\s$](?:[^$\n]*?[^\s$])?)\$(?![\d$])/.exec(source);
  if (!match || /\\$/.test(match[1]) || /^\d[\d,.]*$/.test(match[1])) return;
  return { raw: match[0], latex: match[1] };
}

export function renderBlogMath(latex: string, displayMode: boolean): { html: string; error: boolean } {
  try {
    if (!latex.trim() || latex.length > MAX_BLOG_MATH_LENGTH) throw new Error("Invalid formula length");
    return {
      html: katex.renderToString(latex, {
        displayMode,
        trust: false,
        throwOnError: true,
        strict: "error",
        maxExpand: 1000,
        maxSize: 20,
      }),
      error: false,
    };
  } catch {
    return {
      html: latex.replace(
        /[&<>"']/g,
        (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
      ),
      error: true,
    };
  }
}

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
    const match = matchBlogInlineMath(text.slice(index));
    if (!match || match.latex.length > MAX_BLOG_MATH_LENGTH) continue;
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
      if (match && match[1].length <= MAX_BLOG_MATH_LENGTH) return { type: "blockMath", attrs: { latex: match[1] } };
    }
  }
  if (!node.content) return node;
  const content = node.content.flatMap((child) => inlineMath(normalizeBlogMath(child)));
  if (["listItem", "taskItem"].includes(node.type) && content[0]?.type !== "paragraph")
    content.unshift({ type: "paragraph" });
  return { ...node, content };
}
