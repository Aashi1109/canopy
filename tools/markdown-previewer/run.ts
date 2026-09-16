/**
 * Uses the same `marked.parse` renderer and required-input guard as the former
 * `markdown-previewer` case in `lib/devtools/format-json.ts`.
 *
 * The import is dynamic so `marked` stays out of the initial bundle.
 */

import { requireUtilityInput } from "../../lib/devtools/shared/options.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

const CODE_TOKEN =
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|<!--[\s\S]*?-->|<\/?[A-Za-z][^>\n]*>|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:as|async|await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|let|new|null|of|return|static|super|switch|this|throw|true|try|typeof|undefined|var|void|while|yield)\b|\b(?:0[xX][\dA-Fa-f]+|\d+(?:\.\d+)?)\b/g;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);
}

function highlightCode(source: string): string {
  let html = "";
  let cursor = 0;
  for (const match of source.matchAll(CODE_TOKEN)) {
    const token = match[0];
    const color =
      token.startsWith("//") || token.startsWith("/*") || token.startsWith("<!--")
        ? "#6e7781"
        : /^["'`]/.test(token)
          ? "#0a8040"
          : /^\d/.test(token)
            ? "#0550ae"
            : "#8250df";
    html += `${escapeHtml(source.slice(cursor, match.index))}<span style="color:${color}">${escapeHtml(token)}</span>`;
    cursor = match.index + token.length;
  }
  return html + escapeHtml(source.slice(cursor));
}

export const run: ToolRun<Settings> = async (ctx): Promise<ToolResult> => {
  const source = requireUtilityInput(ctx.input.text, "Markdown input");
  const { marked, Renderer } = await import("marked");
  const renderer =
    ctx.settings.safeLinks || ctx.settings.syntaxHighlighting ? new Renderer() : undefined;
  if (renderer && ctx.settings.safeLinks) {
    const renderLink = renderer.link.bind(renderer);
    renderer.link = (token) =>
      renderLink(token).replace(">", ' target="_blank" rel="noopener noreferrer">');
  }
  if (renderer && ctx.settings.syntaxHighlighting) {
    renderer.code = ({ text, lang }) => {
      const language = lang?.match(/^\S+/)?.[0];
      const className = language ? ` class="language-${escapeHtml(language)}"` : "";
      return `<pre><code${className}>${highlightCode(text.replace(/\n$/, ""))}\n</code></pre>\n`;
    };
  }
  ctx.signal.throwIfAborted();
  return {
    render: "html",
    html: String(
      await marked.parse(source, {
        gfm: ctx.settings.previewMode !== "commonmark",
        renderer,
      }),
    ),
    downloadName: "preview.html",
  };
};

export default run;
