export type RegexOutputToken = {
  readonly text: string;
  readonly kind:
    | "literal"
    | "comment"
    | "delimiter"
    | "character-class"
    | "escape"
    | "group"
    | "quantifier"
    | "anchor"
    | "alternation";
};

// Recognize only the literal and call wrappers emitted by this tool.
const OUTPUT_WRAPPERS = [
  /^(\/)(.+)(\/[gim]*)$/,
  /^(r")(.+)(")$/,
  /^(re\.findall\(r")(.+)(", text\))$/,
  /^(~)(.+)(~[im]*)$/,
  /^(preg_match_all\("~)(.+)(~[im]*", \$text, \$matches\))$/,
];

const REGEX_TOKENS =
  /\\[\s\S]|\[(?:\\[\s\S]|[^\]\\])*\]|\(\?(?:P?<[^>]+>|<[=!]|[=!]|[im]+:|:)|[()]|\{\d+(?:,\d*)?\}[?+]?|[?*+][?+]?|[.^$|]/g;

/** Highlight generated regex syntax without changing its copyable text. */
export function highlightRegexOutput(output: string): readonly RegexOutputToken[] {
  const comment = output.match(/^(?:\/\/ |# )[^\n]*\n/)?.[0] ?? "";
  const source = output.slice(comment.length);
  const match = OUTPUT_WRAPPERS.map((wrapper) => source.match(wrapper)).find(Boolean);
  if (!match) return [{ kind: "literal", text: output }];

  const [, prefix, body, suffix] = match;
  const tokens: RegexOutputToken[] = [];
  function add(kind: RegexOutputToken["kind"], text: string) {
    if (text) tokens.push({ kind, text });
  }

  add("comment", comment);
  const call = prefix.match(/^(.*\()(.*)$/);
  if (call) add("literal", call[1]);
  add("delimiter", call ? call[2] : prefix);

  let offset = 0;
  for (const token of body.matchAll(REGEX_TOKENS)) {
    add("literal", body.slice(offset, token.index));
    const text = token[0];
    const first = text[0];
    const kind: RegexOutputToken["kind"] =
      first === "["
        ? "character-class"
        : first === "\\"
          ? "escape"
          : first === "(" || first === ")"
            ? "group"
            : first === "|"
              ? "alternation"
              : ".^$".includes(first)
                ? "anchor"
                : "quantifier";
    add(kind, text);
    offset = token.index + text.length;
  }
  add("literal", body.slice(offset));

  const argumentsSuffix = suffix.match(/^(.*")(, .*)$/);
  add("delimiter", argumentsSuffix ? argumentsSuffix[1] : suffix);
  if (argumentsSuffix) add("literal", argumentsSuffix[2]);
  return tokens;
}
