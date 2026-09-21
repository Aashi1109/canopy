import { Marked } from "marked";
import { highlightCode } from "./codeHighlight.ts";
import { MAX_MATH_LENGTH, matchInlineMath, renderMath } from "./math.ts";

export type MarkdownOptions = {
  minimumHeadingLevel?: 1 | 2;
  breaks?: boolean;
  /** Allow generated line breaks while keeping all other raw HTML escaped. */
  allowHtmlLineBreaks?: boolean;
};

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

function safeDestination(href: string, image: boolean): boolean {
  if (!href || href.length > 2048 || /[\u0000-\u0020\u007f\\]/u.test(href)) return false;
  try {
    const url = new URL(href, "https://markdown.invalid/");
    return (
      (url.protocol === "https:" || url.protocol === "http:" || (!image && url.protocol === "mailto:")) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/** Markdown images are allowed; raw HTML is escaped except explicitly enabled bare line breaks. */
export function renderMarkdown(
  source: string,
  { minimumHeadingLevel = 1, breaks = false, allowHtmlLineBreaks = false }: MarkdownOptions = {},
): string {
  const markdown = new Marked({
    gfm: true,
    breaks,
    extensions: [
      {
        name: "blockMath",
        level: "block",
        start: (text) => text.indexOf("$$"),
        tokenizer(text) {
          const match = /^\$\$[ \t]*\n?([\s\S]+?)\n?\$\$(?:[ \t]*\n|$)/.exec(text);
          if (match && match[1].trim() && match[1].length <= MAX_MATH_LENGTH)
            return { type: "blockMath", raw: match[0], latex: match[1].trim() };
        },
        renderer(token) {
          const { html, error } = renderMath(token.latex, true);
          return `<div class="math-block${error ? " math-error" : ""}">${html}</div>`;
        },
      },
      {
        name: "inlineMath",
        level: "inline",
        start: (text) => text.indexOf("$"),
        tokenizer(text) {
          const match = matchInlineMath(text);
          if (match && match.latex.length <= MAX_MATH_LENGTH) return { type: "inlineMath", ...match };
        },
        renderer(token) {
          const { html, error } = renderMath(token.latex, false);
          return `<span class="math-inline${error ? " math-error" : ""}">${html}</span>`;
        },
      },
    ],
    renderer: {
      heading({ depth, tokens }) {
        const level = Math.max(minimumHeadingLevel, depth);
        return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>`;
      },
      html({ text }) {
        if (allowHtmlLineBreaks && /^<br\s*\/?>$/i.test(text)) return "<br>";
        return escapeHtml(text);
      },
      image({ href, text, tokens, raw }) {
        const description = tokens ? this.parser.parseInline(tokens, this.parser.textRenderer) : text;
        if (!safeDestination(href, true)) return escapeHtml(description || raw);
        return `<img src="${escapeHtml(href)}" alt="${escapeHtml(description)}" loading="lazy" decoding="async">`;
      },
      link({ href, tokens }) {
        const label = this.parser.parseInline(tokens);
        if (!safeDestination(href, false)) return label;
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      },
      code({ text, lang }) {
        const language = lang?.split(/\s/)[0] ?? "";
        const attribute = /^[a-zA-Z0-9_+-]{1,40}$/.test(language) ? ` class="language-${language}"` : "";
        return `<pre><code${attribute}>${highlightCode(text, language.toLowerCase())}</code></pre>`;
      },
      list(token) {
        if (token.ordered && (Number(token.start) < 1 || Number(token.start) > 1000000)) token.start = 1;
        if (token.ordered || !token.items.some((item) => item.task)) return false;
        if (token.items.some((item) => !item.task)) {
          const groups: (typeof token.items)[] = [];
          for (const item of token.items) {
            const previous = groups.at(-1);
            if (previous && previous[0].task === item.task) previous.push(item);
            else groups.push([item]);
          }
          return groups.map((items) => this.list({ ...token, items })).join("");
        }
        return `<ul data-type="taskList">${token.items
          .map((item) => {
            const tokens = item.tokens
              .filter((child) => child.type !== "checkbox")
              .map((child) =>
                child.type === "paragraph"
                  ? { ...child, tokens: child.tokens?.filter((inline) => inline.type !== "checkbox") ?? [] }
                  : child,
              );
            return `<li data-type="taskItem"><span data-task-checkbox="${!!item.checked}" role="checkbox" aria-readonly="true" aria-checked="${!!item.checked}" aria-label="${item.checked ? "Completed" : "Not completed"}">${item.checked ? "☑" : "☐"}</span><div>${this.parser.parse(tokens)}</div></li>`;
          })
          .join("")}</ul>`;
      },
    },
  });
  return markdown.parse(source, { async: false });
}
