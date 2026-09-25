import type { Extension } from "@codemirror/state";
import { Decoration, EditorView, MatchDecorator, ViewPlugin, type ViewUpdate } from "@codemirror/view";

const MAX_HEADER_LENGTH = 8_192;
const NATIVE_DIAGRAMS = /^(?:flowchart|graph|sequenceDiagram|gantt|pie|journey|mindmap|requirementDiagram)(?:\s|;|$)/;
const FALLBACK_DIAGRAMS =
  /^(?:classDiagram|erDiagram|stateDiagram(?:-v2)?|timeline|gitGraph|quadrantChart|xychart-beta|sankey-beta|block-beta|architecture-beta|packet-beta|kanban|C4\w+)(?:\s|;|$)/;

function usesFallback(view: EditorView): boolean {
  const header = view.state.doc.sliceString(0, Math.min(view.state.doc.length, MAX_HEADER_LENGTH));
  let frontmatter = false;
  for (const line of header.split("\n")) {
    const text = line.trim();
    if (text === "---") {
      frontmatter = !frontmatter;
      continue;
    }
    if (frontmatter || !text || text.startsWith("%%")) continue;
    return !NATIVE_DIAGRAMS.test(text) && FALLBACK_DIAGRAMS.test(text);
  }
  return false;
}

const MARKS = Object.fromEntries(
  ["comment", "string", "keyword", "number", "operator"].map((role) => [
    role,
    Decoration.mark({
      class: `cm-mermaid-${role}`,
      attributes: { "data-mermaid-token": role },
    }),
  ]),
);

// A coloring fallback for diagram types not parsed by codemirror-lang-mermaid.
// Comments and strings consume their contents before keyword/number matching.
const matcher = new MatchDecorator({
  regexp:
    /(%%[^\n]*)|("(?:\\.|[^"\\])*"?|`[^`]*`?)|\b(classDiagram|erDiagram|stateDiagram-v2|stateDiagram|timeline|gitGraph|quadrantChart|xychart-beta|sankey-beta|block-beta|architecture-beta|packet-beta|kanban|C4\w+|class|namespace|note|state|direction|title|section|accTitle|accDescr|commit|branch|checkout|merge|cherry-pick|order|type|tag|id|as|end|fork|join|choice|concurrent|hide|empty|description|TB|TD|BT|LR|RL|PK|FK|UK|int|string|float|boolean|date|true|false)\b|\b(\d+(?:\.\d+)?)\b|(<\|--|--\|>|-->|<--|<\.\.|\.\.>|--|\.\.|[|{}[\]:=+~])/g,
  maxLength: 256,
  decoration(match) {
    const role = match[1] ? "comment" : match[2] ? "string" : match[3] ? "keyword" : match[4] ? "number" : "operator";
    return MARKS[role];
  },
});

export const mermaidFallbackHighlighting: Extension = [
  EditorView.theme({
    ".cm-mermaid-keyword, .cm-mermaid-operator": { color: "var(--primary)" },
    ".cm-mermaid-string": { color: "var(--syntax-string)" },
    ".cm-mermaid-number": { color: "var(--warning)" },
    ".cm-mermaid-comment": { color: "var(--muted-foreground)" },
  }),
  ViewPlugin.fromClass(
    class {
      enabled;
      decorations;
      constructor(view: EditorView) {
        this.enabled = usesFallback(view);
        this.decorations = this.enabled ? matcher.createDeco(view) : Decoration.none;
      }
      update(update: ViewUpdate) {
        const enabled = update.docChanged ? usesFallback(update.view) : this.enabled;
        this.decorations = !enabled
          ? Decoration.none
          : enabled !== this.enabled
            ? matcher.createDeco(update.view)
            : matcher.updateDeco(update, this.decorations);
        this.enabled = enabled;
      }
    },
    { decorations: (plugin) => plugin.decorations },
  ),
];
