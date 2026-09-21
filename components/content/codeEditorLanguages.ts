import { StreamLanguage, syntaxTree } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { Decoration, ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { Tree } from "@lezer/common";

const loadedLanguages = new Map<string, Promise<Extension>>();

const YAML_KEYWORD = /^(?:true|True|TRUE|false|False|FALSE|null|Null|NULL|~)$/;
const YAML_NUMBER =
  /^(?:[+-]?(?:0b[01](?:_?[01])*|0o[0-7](?:_?[0-7])*|0x[\da-fA-F](?:_?[\da-fA-F])*|(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?|\.inf|\.Inf|\.INF)|\.nan|\.NaN|\.NAN)$/;
const YAML_TYPED_SCALAR = /^(?:!!(?:int|float|bool|null)|!<tag:yaml.org,2002:(?:int|float|bool|null)>)$/;

/** Classify only short visible native Literal nodes; parsing and folding stay native. */
export function collectYamlScalars(
  tree: Tree,
  visibleRanges: readonly { from: number; to: number }[],
  readText: (from: number, to: number) => string,
): { from: number; to: number }[] {
  const scalars: { from: number; to: number }[] = [];
  let visited = 0;
  for (const range of visibleRanges) {
    if (range.to <= range.from || range.from >= tree.length) continue;
    const cursor = tree.cursor();
    while (cursor.childAfter(range.from)) {
      if (++visited > 4_000) return scalars;
    }
    do {
      if (++visited > 4_000 || scalars.length >= 1_000) return scalars;
      if (cursor.from >= range.to) break;
      if (
        cursor.name !== "Literal" ||
        cursor.to <= range.from ||
        cursor.to - cursor.from > 128 ||
        cursor.from < (scalars.at(-1)?.to ?? -1)
      )
        continue;
      let excluded = false;
      for (let parent = cursor.node.parent, depth = 0; parent && depth < 8; parent = parent.parent, depth++) {
        if (parent.name === "Key") excluded = true;
        if (parent.name === "Tagged") {
          const tag = parent.getChild("Tag");
          if (!tag || tag.to - tag.from > 64 || !YAML_TYPED_SCALAR.test(readText(tag.from, tag.to))) excluded = true;
        }
        if (excluded || parent.name === "Pair" || parent.name === "Item") break;
      }
      if (excluded) continue;
      const text = readText(cursor.from, cursor.to).trim();
      if (YAML_KEYWORD.test(text) || YAML_NUMBER.test(text)) scalars.push({ from: cursor.from, to: cursor.to });
    } while (cursor.next());
  }
  return scalars;
}

const yamlScalarMark = Decoration.mark({ class: "cm-yaml-scalar" });
const yamlScalarHighlighting = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = this.highlight(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) {
        this.decorations = this.highlight(update.view);
      }
    }
    highlight(view: EditorView) {
      const ranges = collectYamlScalars(syntaxTree(view.state), view.visibleRanges, (from, to) =>
        view.state.doc.sliceString(from, to),
      );
      return Decoration.set(ranges.map(({ from, to }) => yamlScalarMark.range(from, to)));
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function createDelimitedLanguage(tabSeparated: boolean) {
  const delimiter = tabSeparated ? /^\t/ : /^[,;\t|]/;
  const unquoted = tabSeparated ? /^[^"\t]+/ : /^[^",;\t|]+/;
  return StreamLanguage.define({
    startState: () => ({ quoted: false }),
    token(stream, state) {
      if (state.quoted || stream.peek() === '"') {
        if (!state.quoted) {
          stream.next();
          state.quoted = true;
        }
        while (!stream.eol()) {
          if (stream.next() !== '"') continue;
          if (stream.peek() === '"') stream.next();
          else {
            state.quoted = false;
            break;
          }
        }
        return "string";
      }
      if (stream.match(delimiter)) return "punctuation";
      stream.match(unquoted);
      const cell = stream.current().trim();
      if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(cell)) return "number";
      if (/^(?:true|false|null)$/i.test(cell)) return "atom";
      return "string";
    },
  });
}

async function importLanguage(language: string): Promise<Extension> {
  switch (language) {
    case "json":
      return (await import("@codemirror/lang-json")).json();
    case "js":
    case "javascript":
    case "jsx":
    case "ts":
    case "typescript":
    case "tsx":
      return (await import("@codemirror/lang-javascript")).javascript({
        typescript: ["ts", "typescript", "tsx"].includes(language),
        jsx: ["jsx", "tsx"].includes(language),
      });
    case "html":
      return (await import("@codemirror/lang-html")).html({ autoCloseTags: false });
    case "xml":
      return (await import("@codemirror/lang-xml")).xml({ autoCloseTags: false });
    case "css":
      return (await import("@codemirror/lang-css")).css();
    case "yaml":
    case "yml":
      return [(await import("@codemirror/lang-yaml")).yaml(), yamlScalarHighlighting];
    case "markdown":
    case "md":
    case "mkdown":
    case "mkd":
      return (await import("@codemirror/lang-markdown")).markdown();
    case "sql":
      return (await import("@codemirror/lang-sql")).sql();
    case "shell":
    case "sh":
    case "bash":
      return StreamLanguage.define((await import("@codemirror/legacy-modes/mode/shell")).shell);
    case "csv":
      return createDelimitedLanguage(false);
    case "tsv":
      return createDelimitedLanguage(true);
    default:
      return [];
  }
}

export function loadCodeEditorLanguage(language: string): Promise<Extension> {
  const key = language.trim().toLowerCase();
  let loading = loadedLanguages.get(key);
  if (!loading) {
    loading = importLanguage(key).catch((error: unknown) => {
      loadedLanguages.delete(key);
      throw error;
    });
    loadedLanguages.set(key, loading);
  }
  return loading;
}
