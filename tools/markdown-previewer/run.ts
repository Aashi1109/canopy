/**
 * Uses the same `marked.parse` renderer and required-input guard as the former
 * `markdown-previewer` case in `lib/devtools/format-json.ts`.
 *
 * Rendering dependencies load dynamically to keep them out of the initial bundle.
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);
}

export const run: ToolRun<Settings> = async (ctx): Promise<ToolResult> => {
  const source = requireUtilityInput(ctx.input.text, "Markdown input");
  const { marked, Renderer } = await import("marked");
  const renderer = ctx.settings.safeLinks || ctx.settings.syntaxHighlighting ? new Renderer() : undefined;
  if (renderer && ctx.settings.safeLinks) {
    const renderLink = renderer.link.bind(renderer);
    renderer.link = (token) => renderLink(token).replace(">", ' target="_blank" rel="noopener noreferrer">');
  }
  if (renderer && ctx.settings.syntaxHighlighting) {
    const { highlightBlogCode } = await import("../../lib/blog/codeHighlight.ts");
    renderer.code = ({ text, lang }) => {
      const language = lang?.match(/^\S+/)?.[0];
      const className = language ? ` class="language-${escapeHtml(language)}"` : "";
      return `<pre><code${className}>${highlightBlogCode(text.replace(/\n$/, ""), language?.toLowerCase())}\n</code></pre>\n`;
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
