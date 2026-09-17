import { DOMParser, Fragment, Slice } from "@tiptap/pm/model";
import type { EditorProps } from "@tiptap/pm/view";
import { Marked } from "marked";
import { MAX_BLOG_MATH_LENGTH, matchBlogInlineMath } from "../../../../../lib/blog/math.ts";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const markdown = new Marked({
  breaks: true,
  extensions: [
    {
      name: "blogBlockMath",
      level: "block",
      start: (source) => source.indexOf("$$"),
      tokenizer(source) {
        const match = /^\$\$[ \t]*\n?([\s\S]+?)\n?\$\$(?:[ \t]*\n|$)/.exec(source);
        if (match && match[1].trim() && match[1].length <= MAX_BLOG_MATH_LENGTH)
          return { type: "blogBlockMath", raw: match[0], latex: match[1].trim() };
      },
      renderer: (token) => `<div data-type="block-math" data-latex="${escapeHtml(token.latex)}"></div>`,
    },
    {
      name: "blogInlineMath",
      level: "inline",
      start: (source) => source.indexOf("$"),
      tokenizer(source) {
        const match = matchBlogInlineMath(source);
        if (match && match.latex.length <= MAX_BLOG_MATH_LENGTH) return { type: "blogInlineMath", ...match };
      },
      renderer: (token) => `<span data-type="inline-math" data-latex="${escapeHtml(token.latex)}"></span>`,
    },
  ],
  renderer: {
    // Article titles own h1. The body schema starts at h2.
    heading({ depth, tokens }) {
      const level = Math.max(2, depth);
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>`;
    },
    html({ text }) {
      return escapeHtml(text);
    },
    // Images must go through the existing upload and validation flow.
    image({ raw }) {
      return escapeHtml(raw);
    },
    link({ href, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (href.length > 2048 || /[\u0000-\u0020\u007f\\]/u.test(href)) return label;
      if (!/^\/(?!\/)|^#/.test(href)) {
        try {
          const url = new URL(href);
          if (!["http:", "https:", "mailto:"].includes(url.protocol) || url.username || url.password) return label;
        } catch {
          return label;
        }
      }
      return `<a href="${escapeHtml(href)}">${label}</a>`;
    },
    code({ text, lang }) {
      const language = lang?.split(/\s/)[0] ?? "";
      const attribute = /^[a-zA-Z0-9_+-]{1,40}$/.test(language) ? ` class="language-${language}"` : "";
      return `<pre><code${attribute}>${escapeHtml(text)}</code></pre>`;
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
        .map(
          (item) => `<li data-type="taskItem" data-checked="${!!item.checked}">${this.parser.parse(item.tokens)}</li>`,
        )
        .join("")}</ul>`;
    },
  },
});

export function blogMarkdownHtml(text: string): string {
  return markdown.parse(text, { async: false });
}

/** Native HTML and code-block pastes bypass this plain-text clipboard parser. */
export const parseBlogClipboardText: NonNullable<EditorProps["clipboardTextParser"]> = (text, context, plain, view) => {
  const schema = view.state.schema;
  if (plain || !text.trim()) {
    return Slice.maxOpen(
      Fragment.from(
        text
          .split(/(?:\r\n?|\n)+/)
          .map((line) => schema.nodes.paragraph.create(null, line ? schema.text(line, context.marks()) : undefined)),
      ),
    );
  }
  const container = document.createElement("div");
  container.innerHTML = blogMarkdownHtml(text);
  return DOMParser.fromSchema(schema).parseSlice(container, { context, preserveWhitespace: true });
};
