import { ToolError } from "../../lib/tool-framework/run.ts";

type Segment = { key: string; wildcard: boolean; start: number; raw: string };
type ScanBudget = { remaining: number; matches: number };

const SEGMENT =
  /\.([\w$-]+|\*)|\[(\d+|\*)\]|\[("(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*"|'(?:[^'\\\u0000-\u001f]|\\(?:['"\\/bfnrt]|u[\da-fA-F]{4}))*')\]/y;
const PLAIN_KEY = /^[\w$-]+$/;

function readPath(path: string) {
  const trimmed = path.trim();
  const addedRoot = trimmed.startsWith("$") ? "" : trimmed.startsWith(".") || trimmed.startsWith("[") ? "$" : "$.";
  const expression = `${addedRoot}${trimmed}`;
  const segments: Segment[] = [];
  let offset = 1;

  while (offset < expression.length) {
    SEGMENT.lastIndex = offset;
    const match = SEGMENT.exec(expression);
    if (!match) break;
    const quoted = match[3];
    const key = quoted
      ? (JSON.parse(
          quoted.startsWith('"')
            ? quoted
            : `"${quoted.slice(1, -1).replace(/\\(?:u[\da-fA-F]{4}|.)|"/g, (part) => (part === "\\'" ? "'" : part === '"' ? '\\"' : part))}"`,
        ) as string)
      : (match[1] ?? match[2]);
    segments.push({ key, wildcard: !quoted && key === "*", start: offset, raw: match[0] });
    offset = SEGMENT.lastIndex;
  }

  return { trimmed, expression, segments, addedRoot, rest: expression.slice(offset), offset };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function* ownKeys(value: unknown, budget: ScanBudget): Generator<string> {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length && budget.remaining > 0; index++) {
      budget.remaining--;
      if (Object.hasOwn(value, index)) yield String(index);
    }
  } else if (isObject(value)) {
    for (const key in value) {
      if (budget.remaining-- <= 0) return;
      if (Object.hasOwn(value, key)) yield key;
    }
  }
}

function childValue(value: unknown, key: string): unknown {
  return (value as Record<string, unknown>)[key];
}

function walk(value: unknown, segments: Segment[], budget: ScanBudget): unknown[] {
  let current = [value];
  for (const segment of segments) {
    const next: unknown[] = [];
    for (const item of current) {
      if (budget.remaining-- <= 0) break;
      if (segment.wildcard) {
        for (const key of ownKeys(item, budget)) {
          next.push(childValue(item, key));
          if (next.length >= budget.matches) break;
        }
      } else if (
        (isObject(item) || (Array.isArray(item) && /^\d+$/.test(segment.key))) &&
        Object.hasOwn(item, segment.key)
      ) {
        next.push(childValue(item, segment.key));
      }
      if (next.length >= budget.matches) break;
    }
    current = next;
    if (!current.length) break;
  }
  return current;
}

export function resolveJsonPath(value: unknown, path: string): unknown {
  const parsed = readPath(path);
  if (!parsed.trimmed) {
    throw new ToolError(
      "path-required",
      "Enter a JSON path.",
      "Choose a suggested key, enter a path such as users[0].name, or use $ for the whole document.",
    );
  }
  if (parsed.rest) {
    throw new ToolError(
      "path-unsupported",
      "JSONPath contains unsupported syntax.",
      "Use .key, [0], ['key'], and * only — filters and recursive descent are not supported.",
    );
  }
  const matches = walk(value, parsed.segments, { remaining: Infinity, matches: Infinity });
  if (!matches.length) {
    throw new ToolError(
      "path-no-match",
      "JSONPath did not match any value.",
      "Check each segment against the document — one of them selects nothing.",
    );
  }
  return matches.length === 1 ? matches[0] : matches;
}

function quoteKey(key: string, quote = '"'): string {
  return quote === "'"
    ? `'${key.replace(/[\\'\u0000-\u001f]/g, (character) => (character === "'" ? "\\'" : JSON.stringify(character).slice(1, -1)))}'`
    : JSON.stringify(key);
}

/** Full-path completions for the current segment and children of an exact path. */
export function getJsonPathSuggestions(value: unknown, path: string): string[] {
  if (path.length > 4096) return [];
  const parsed = readPath(path);
  if (parsed.segments.length > 128) return [];
  const suggestions = new Set<string>();
  const scanBudget: ScanBudget = { remaining: 1500, matches: 300 };
  const parents = (segments: Segment[]) => walk(value, segments, { remaining: 3000, matches: 300 });
  const displayPath = (candidate: string) => {
    if (!parsed.addedRoot) return candidate;
    if (parsed.addedRoot === "$") return candidate.slice(1);
    return candidate.startsWith("$.") ? candidate.slice(2) : candidate.slice(1);
  };
  const add = (candidate: string) => {
    const display = displayPath(candidate);
    if (display !== parsed.trimmed && suggestions.size < 30) suggestions.add(display);
  };
  const complete = (items: unknown[], prefix: string, partial: string, keyPrefix?: string) => {
    const bracket = partial.startsWith("[");
    const quote = partial[1] === "'" ? "'" : '"';
    for (const item of items) {
      if (scanBudget.remaining-- <= 0 || suggestions.size >= 30) break;
      const array = Array.isArray(item);
      if (
        array &&
        item.length &&
        keyPrefix === undefined &&
        (partial === "" || partial === "." || "[*]".startsWith(partial))
      ) {
        add(`${prefix}${partial.startsWith(".") ? ".*" : "[*]"}`);
      }
      for (const key of ownKeys(item, scanBudget)) {
        if (suggestions.size >= 30) break;
        if (keyPrefix !== undefined && !key.startsWith(keyPrefix)) continue;
        const segment = array
          ? `[${key}]`
          : bracket || !PLAIN_KEY.test(key) || (prefix === "$" && key.startsWith("$"))
            ? `[${quoteKey(key, quote)}]`
            : `.${key}`;
        if (bracket && !segment.startsWith(partial)) continue;
        add(`${prefix}${segment}`);
      }
    }
  };

  if (parsed.rest) {
    // Only a trailing segment under construction is eligible for completion.
    if (!/^(?:\.|\[(?:\d*|\*|["'](?:[^\\\r\n]|\\.)*))$/.test(parsed.rest)) return [];
    complete(parents(parsed.segments), parsed.expression.slice(0, parsed.offset), parsed.rest);
  } else {
    complete(parents(parsed.segments), parsed.expression, "");
    const last = parsed.segments.at(-1);
    if (suggestions.size < 30 && last && !last.wildcard) {
      complete(
        parents(parsed.segments.slice(0, -1)),
        parsed.expression.slice(0, last.start),
        last.raw.startsWith(".") ? "." : last.raw,
        last.raw.startsWith(".") ? last.key : undefined,
      );
    }
  }
  return [...suggestions];
}
