/**
 * Moved verbatim from the `url-query-builder` case in
 * `lib/devtools/format-json.ts` (line 2672). `safeUrl` (which enforces the
 * absolute http/https rule) and `requireUtilityInput` are the shared helpers;
 * the row-format error string is preserved exactly.
 *
 * `safeUrl` returns a fresh `URL`, so mutating its `searchParams` does not
 * touch the caller's input.
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { requireUtilityInput } from "../../lib/devtools/shared/options.ts";
import { safeUrl } from "../../lib/devtools/shared/url.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const url = safeUrl(requireUtilityInput(ctx.input.text, "Base URL"), "Base URL");
  const rows: { key: string; value: string }[] = [];
  for (const line of (ctx.input.secondary ?? "").split(/\r\n|\r|\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf("=");
    if (separator < 1) {
      throw new ToolError(
        "invalid-query-row",
        "Each query row must use key=value format.",
        "Give every non-blank line a key, an equals sign, and a value.",
      );
    }
    rows.push({
      key: line.slice(0, separator).trim(),
      value: line.slice(separator + 1).trim(),
    });
  }
  for (const row of ctx.settings.parameters ?? []) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key) {
      if (!value) continue;
      throw new ToolError(
        "invalid-query-row",
        "Each query row must use key=value format.",
        "Give every non-blank line a key, an equals sign, and a value.",
      );
    }
    rows.push({ key, value });
  }

  const appended = ctx.settings.skipEmptyRows ? rows.filter((row) => row.value !== "") : rows;
  let text: string;
  if (ctx.settings.encodeValues !== false) {
    for (const row of appended) url.searchParams.append(row.key, row.value);
    if (ctx.settings.sortParameters) url.searchParams.sort();
    text = url.toString();
  } else {
    const hash = url.hash;
    url.hash = "";
    const entries = [
      ...Array.from(url.searchParams, ([key, value]) => ({
        key,
        text: new URLSearchParams([[key, value]]).toString(),
      })),
      ...appended.map(({ key, value }) => ({
        key,
        text: `${new URLSearchParams([[key, ""]]).toString()}${value}`,
      })),
    ];
    if (ctx.settings.sortParameters) {
      entries.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
    }
    url.search = "";
    text = `${url.toString()}${entries.length ? `?${entries.map((entry) => entry.text).join("&")}` : ""}${hash}`;
  }
  return { render: "text", text, downloadName: "built-url.txt" };
};

export default run;
