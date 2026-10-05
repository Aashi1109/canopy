import { parser } from "@lezer/javascript";
import { ToolError } from "../../tool-framework/run.ts";
import { requireUtilityInput } from "./options.ts";

/** Keep CSS string bytes outside whitespace, comment, and color transformations. */
export function protectCssStrings(input: string): { source: string; restore: (text: string) => string } {
  let prefix = "__CSS_STRING_";
  while (input.includes(prefix)) prefix += "_";
  const strings: string[] = [];
  let source = "";
  for (let index = 0; index < input.length;) {
    const character = input[index];
    if (character === '"' || character === "'") {
      const start = index++;
      while (index < input.length && input[index] !== character) {
        index += input[index] === "\\" ? 2 : 1;
      }
      if (index >= input.length)
        throw new ToolError("invalid-source", "Source contains an unfinished string.", undefined, {
          messageRef: { key: "sharedCode.string" },
        });
      const value = input.slice(start, ++index);
      let stringIndex = strings.indexOf(value);
      if (stringIndex < 0) stringIndex = strings.push(value) - 1;
      source += `${prefix}${stringIndex}__`;
    } else if (character === "/" && input[index + 1] === "*") {
      const end = input.indexOf("*/", index + 2);
      if (end < 0)
        throw new ToolError("invalid-source", "Source contains an unfinished comment.", undefined, {
          messageRef: { key: "sharedCode.comment" },
        });
      index = end + 2;
    } else {
      source += character;
      index += 1;
    }
  }
  return {
    source,
    restore: (text) => text.replace(new RegExp(`${prefix}(\\d+)__`, "g"), (_, index: string) => strings[Number(index)]),
  };
}

type JavaScriptToken = { text: string; name: string; from: number; to: number };

/** The parser distinguishes regexes from division and nested templates from code. */
export function tokenizeJavaScript(input: string, minifying = false): JavaScriptToken[] {
  const tree = parser.parse(input);
  const tokens: JavaScriptToken[] = [];
  let protectedUntil = -1;
  tree.iterate({
    enter(node) {
      if (node.type.isError) {
        let parent = node.node.parent;
        while (parent && !["String", "TemplateString", "BlockComment", "RegExp"].includes(parent.name))
          parent = parent.parent;
        if (minifying && parent) {
          throw new ToolError(
            "unterminated",
            "Source contains an unfinished string, regex, or comment.",
            "Close the open string or block comment and try again.",
            {
              messageRef: { key: "sharedCode.unterminated" },
              recoveryMessage: { key: "sharedCode.close" },
            },
          );
        }
        throw new ToolError(
          "invalid-source",
          "Source contains invalid JavaScript syntax.",
          "Correct the JavaScript syntax and try again.",
          {
            messageRef: { key: "sharedCode.syntax" },
            recoveryMessage: { key: "sharedCode.correct" },
          },
        );
      }
      if (node.from < protectedUntil || node.from === node.to) return;
      if (
        ["String", "TemplateString", "RegExp", "LineComment", "BlockComment"].includes(node.name) ||
        !node.node.firstChild
      ) {
        tokens.push({ text: input.slice(node.from, node.to), name: node.name, from: node.from, to: node.to });
        protectedUntil = node.to;
      }
    },
  });
  return tokens;
}

export function formatDelimitedCode(input: string, language: "javascript" | "css", indentUnit = "  "): string {
  requireUtilityInput(input, `${language === "css" ? "CSS" : "JavaScript"} input`);
  let output = "";
  let indent = 0;
  const newline = () => {
    output = output.trimEnd() + `\n${indentUnit.repeat(indent)}`;
  };
  const tokens =
    language === "javascript"
      ? tokenizeJavaScript(input)
      : (function* () {
          for (const match of input.matchAll(/\S/g))
            yield { text: match[0], name: "", from: match.index, to: match.index + 1 };
        })();
  let previousEnd = 0;
  for (const token of tokens) {
    const gap = input.slice(previousEnd, token.from);
    if (output && /\s/.test(gap)) {
      if (language === "javascript" && /[\n\r\u2028\u2029]/.test(gap)) newline();
      else if (!/\s$/.test(output)) output += " ";
    }
    previousEnd = token.to;
    if (token.text === "{") {
      output = /\n[\t ]*$/.test(output) ? `${output}{` : `${output.trimEnd()} {`;
      indent += 1;
      newline();
    } else if (token.text === "}") {
      indent = Math.max(0, indent - 1);
      output = output.trimEnd() + `\n${indentUnit.repeat(indent)}}`;
      newline();
    } else if (token.text === ";") {
      output = output.trimEnd() + ";";
      newline();
    } else {
      output += token.text;
      if (token.name === "LineComment") newline();
    }
  }
  return output.trim();
}
