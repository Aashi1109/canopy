/**
 * Moved verbatim from the `xml-to-json` case and `xmlToJson` in
 * `lib/devtools/format-json.ts`. `xmlToJson` and `SimpleXmlNode` have exactly
 * one consumer — this tool — so they live here rather than in
 * `lib/devtools/shared/`.
 */

import { requireUtilityInput } from "../../lib/devtools/shared/options.ts";
import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

type SimpleXmlNode = {
  name: string;
  attributes: Record<string, string>;
  children: SimpleXmlNode[];
  text: string;
};

function xmlToJson(input: string): unknown {
  const tokens = input.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]+>|[^<]+/g) ?? [];
  const stack: SimpleXmlNode[] = [];
  let root: SimpleXmlNode | undefined;

  for (const token of tokens) {
    if (token.startsWith("<!--") || token.startsWith("<?")) continue;
    if (token.startsWith("</")) {
      const name = token.slice(2, -1).trim();
      const closed = stack.pop();
      if (!closed || closed.name !== name) {
        throw new ToolError(
          "xml-unbalanced",
          "XML closing tags do not match.",
          "Check that every opening tag has a matching closing tag in the same order.",
        );
      }
      continue;
    }
    if (token.startsWith("<")) {
      if (token.startsWith("<!")) continue;
      const selfClosing = /\/\s*>$/.test(token);
      const body = token.slice(1, selfClosing ? token.lastIndexOf("/") : -1).trim();
      const name = body.match(/^[^\s/>]+/)?.[0];
      if (!name) throw new ToolError("xml-invalid-tag", "XML contains an invalid tag.");
      const attributes = Object.fromEntries(
        [...body.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((match) => [
          match[1],
          match[2] ?? match[3] ?? "",
        ]),
      );
      const node: SimpleXmlNode = { name, attributes, children: [], text: "" };
      if (stack.length) stack.at(-1)!.children.push(node);
      else if (root) throw new ToolError("xml-multiple-roots", "XML must have one root element.");
      else root = node;
      if (!selfClosing) stack.push(node);
      continue;
    }
    if (stack.length) stack.at(-1)!.text += token;
  }
  if (!root || stack.length) {
    throw new ToolError(
      "xml-incomplete",
      "XML is incomplete or empty.",
      "Paste the whole document, including its closing root tag.",
    );
  }

  function convert(node: SimpleXmlNode): unknown {
    const text = node.text.trim();
    if (!node.children.length && !Object.keys(node.attributes).length) return text;
    const result: Record<string, unknown> = Object.fromEntries(
      Object.entries(node.attributes).map(([key, value]) => [`@${key}`, value]),
    );
    for (const child of node.children) {
      const childValue = convert(child);
      if (!(child.name in result)) result[child.name] = childValue;
      else if (Array.isArray(result[child.name]))
        (result[child.name] as unknown[]).push(childValue);
      else result[child.name] = [result[child.name], childValue];
    }
    if (text) result["#text"] = text;
    return result;
  }
  return { [root.name]: convert(root) };
}

export const run: ToolRun<Settings> = (ctx): ToolResult => ({
  render: "text",
  text: JSON.stringify(xmlToJson(requireUtilityInput(ctx.input.text, "XML input")), null, 2),
  downloadName: "converted-xml.json",
});

export default run;
