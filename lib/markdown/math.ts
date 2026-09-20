import katex from "katex";

export const MAX_MATH_LENGTH = 10000;

/** Dollar delimiters must be unescaped, nonempty and not currency amounts. */
export function matchInlineMath(source: string): { raw: string; latex: string } | undefined {
  const match = /^\$(?!\$)([^\s$](?:[^$\n]*?[^\s$])?)\$(?![\d$])/.exec(source);
  if (!match || /\\$/.test(match[1]) || /^\d[\d,.]*$/.test(match[1])) return;
  return { raw: match[0], latex: match[1] };
}

export function renderMath(latex: string, displayMode: boolean): { html: string; error: boolean } {
  try {
    if (!latex.trim() || latex.length > MAX_MATH_LENGTH) throw new Error("Invalid formula length");
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
