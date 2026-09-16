/**
 * Moved verbatim from the `robots-txt-generator` case in
 * `lib/devtools/format-json.ts` (arm at line 2891), including the exact line
 * order, the `Disallow:`-when-empty rule, and the download name `robots.txt`.
 * `safeUrl` is shared (`lib/devtools/shared/url.ts`) and still rejects any
 * sitemap URL that is not absolute http or https.
 *
 * The directives are emitted as plain text, exactly as before. There is no
 * HTML escaping here and none is added: robots.txt is not markup, and escaping
 * would corrupt legitimate paths.
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { safeUrl } from "../../lib/devtools/shared/url.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const allowAll = ctx.settings.allowAll;
  const paths = ctx.input.text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const allowPaths = ctx.settings.allowPaths
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    (!allowAll && paths.some((path) => !path.startsWith("/"))) ||
    allowPaths.some((path) => !path.startsWith("/"))
  ) {
    throw new ToolError(
      "path-root-required",
      "Every path must start with /.",
      "Write paths relative to the site root, such as /admin or /public.",
    );
  }
  const sitemap = ctx.settings.sitemap.trim();
  if (sitemap) safeUrl(sitemap, "Sitemap URL");
  const crawlDelay = ctx.settings.crawlDelay;
  return {
    render: "text",
    text: [
      `User-agent: ${ctx.settings.userAgent}`,
      ...(allowAll || !paths.length
        ? ["Disallow:"]
        : paths.map(
            (path) => `${ctx.settings.newDirective === "allow" ? "Allow" : "Disallow"}: ${path}`,
          )),
      ...allowPaths.map((path) => `Allow: ${path}`),
      ...(crawlDelay ? [`Crawl-delay: ${crawlDelay}`] : []),
      ...(sitemap ? [`Sitemap: ${sitemap}`] : []),
    ].join("\n"),
    downloadName: "robots.txt",
  };
};

export default run;
