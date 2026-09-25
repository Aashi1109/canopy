import { snippetCompletion, type Completion, type CompletionSource } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";

const MAX_HEADER_LENGTH = 8_192;
const MAX_LINE_PREFIX = 512;
const MAX_CONTEXT_LENGTH = 16_384;
const DIAGRAM_NAMES =
  /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph|requirementDiagram)(?:\s|;|$)/;

function example(label: string, detail: string, template: string): Completion {
  return snippetCompletion(template, { label, detail, type: "keyword" });
}

const DECLARATIONS = [
  example("flowchart", "Flowchart", "flowchart ${1:TD}\n\t${2:A}[${3:Start}] --> ${4:B}[${5:End}]"),
  example("graph", "Flowchart alias", "graph ${1:LR}\n\t${2:A} --> ${3:B}"),
  example(
    "sequenceDiagram",
    "Sequence diagram",
    "sequenceDiagram\n\tparticipant ${1:Alice}\n\tparticipant ${2:Bob}\n\t${1:Alice}->>${2:Bob}: ${3:Hello}",
  ),
  example("classDiagram", "Class diagram", "classDiagram\n\tclass ${1:Animal} {\n\t\t+${2:String name}\n\t}"),
  example(
    "stateDiagram-v2",
    "State diagram",
    "stateDiagram-v2\n\t[*] --> ${1:Idle}\n\t${1:Idle} --> ${2:Running}: ${3:Start}",
  ),
  example("erDiagram", "Entity relationship diagram", "erDiagram\n\t${1:CUSTOMER} ||--o{ ${2:ORDER} : ${3:places}"),
  example(
    "gantt",
    "Gantt chart",
    "gantt\n\tdateFormat YYYY-MM-DD\n\tsection ${1:Project}\n\t${2:Task} :${3:2026-01-01}, ${4:7d}",
  ),
  example("pie", "Pie chart", 'pie title ${1:Distribution}\n\t"${2:Category}" : ${3:50}'),
  example(
    "journey",
    "User journey",
    "journey\n\ttitle ${1:My journey}\n\tsection ${2:Stage}\n\t${3:Task}: ${4:5}: ${5:User}",
  ),
  example("mindmap", "Mind map", "mindmap\n\troot((${1:Topic}))\n\t\t${2:Idea}"),
  example("timeline", "Timeline", "timeline\n\ttitle ${1:History}\n\t${2:2026} : ${3:Milestone}"),
  example("gitGraph", "Git history", "gitGraph\n\tcommit\n\tbranch ${1:feature}\n\tcheckout ${1:feature}\n\tcommit"),
  example(
    "requirementDiagram",
    "Requirement diagram",
    'requirementDiagram\n\trequirement ${1:feature} {\n\t\tid: ${2:1}\n\t\ttext: "${3:Requirement}"\n\t\trisk: low\n\t\tverifymethod: test\n\t}',
  ),
];

const DIRECTIONS: Completion[] = [
  { label: "TD", detail: "Top to bottom", type: "keyword" },
  { label: "TB", detail: "Top to bottom", type: "keyword" },
  { label: "BT", detail: "Bottom to top", type: "keyword" },
  { label: "LR", detail: "Left to right", type: "keyword" },
  { label: "RL", detail: "Right to left", type: "keyword" },
];

const FLOWCHART = [
  example("subgraph", "Group nodes", "subgraph ${1:Group}\n\t${2:A} --> ${3:B}\nend"),
  example("direction", "Layout direction", "direction ${1:LR}"),
  example("classDef", "Define node style", "classDef ${1:highlight} fill:${2:#e8f0ff},stroke:${3:#0066ff}"),
  example("class", "Apply node style", "class ${1:A} ${2:highlight}"),
  example("style", "Style a node", "style ${1:A} fill:${2:#e8f0ff},stroke:${3:#0066ff}"),
  example("linkStyle", "Style a connection", "linkStyle ${1:0} stroke:${2:#0066ff},stroke-width:${3:2px}"),
  { label: "end", detail: "Close a subgraph", type: "keyword" },
];

const STATEMENTS: Record<string, Completion[]> = {
  flowchart: FLOWCHART,
  graph: FLOWCHART,
  sequenceDiagram: [
    example("participant", "Declare a participant", "participant ${1:Alice}"),
    example("actor", "Declare an actor", "actor ${1:User}"),
    example("activate", "Start activation", "activate ${1:Alice}"),
    example("deactivate", "End activation", "deactivate ${1:Alice}"),
    example("Note", "Add a note", "Note over ${1:Alice}: ${2:Message}"),
    example("loop", "Repeat messages", "loop ${1:Condition}\n\t${2:Alice}->>${3:Bob}: ${4:Message}\nend"),
    example(
      "alt",
      "Alternative paths",
      "alt ${1:Condition}\n\t${2:Alice}->>${3:Bob}: ${4:Message}\nelse ${5:Otherwise}\n\t${3:Bob}-->>${2:Alice}: ${6:Reply}\nend",
    ),
    example("opt", "Optional messages", "opt ${1:Condition}\n\t${2:Alice}->>${3:Bob}: ${4:Message}\nend"),
    example(
      "par",
      "Parallel messages",
      "par ${1:First action}\n\t${2:Alice}->>${3:Bob}: ${4:Message}\nand ${5:Second action}\n\t${3:Bob}-->>${2:Alice}: ${6:Reply}\nend",
    ),
    { label: "autonumber", detail: "Number messages", type: "keyword" },
    { label: "end", detail: "Close a block", type: "keyword" },
    { label: "else", detail: "Alternative branch", type: "keyword" },
  ],
  classDiagram: [
    example("class", "Declare a class", "class ${1:Animal} {\n\t+${2:String name}\n}"),
    example("namespace", "Group classes", "namespace ${1:Models} {\n\tclass ${2:Animal}\n}"),
    example("note", "Add a class note", 'note for ${1:Animal} "${2:Description}"'),
    example("direction", "Layout direction", "direction ${1:LR}"),
  ],
  erDiagram: [
    example("direction", "Layout direction", "direction ${1:LR}"),
    example("entity", "Entity with an attribute", "${1:CUSTOMER} {\n\t${2:int} ${3:id} ${4:PK}\n}"),
    example("relationship", "One-to-many relationship", "${1:CUSTOMER} ||--o{ ${2:ORDER} : ${3:places}"),
  ],
  "stateDiagram-v2": [
    example("state", "Composite state", "state ${1:Processing} {\n\t[*] --> ${2:Working}\n}"),
    example("note", "Add a state note", "note right of ${1:Idle}\n\t${2:Description}\nend note"),
    example("direction", "Layout direction", "direction ${1:LR}"),
  ],
  gantt: [
    example("title", "Chart title", "title ${1:Project schedule}"),
    example("dateFormat", "Input date format", "dateFormat ${1:YYYY-MM-DD}"),
    example("axisFormat", "Axis date format", "axisFormat ${1:%Y-%m-%d}"),
    example("section", "Group tasks", "section ${1:Phase}"),
    example("excludes", "Skip dates", "excludes ${1:weekends}"),
    { label: "todayMarker", apply: "todayMarker off", detail: "Hide today's marker", type: "keyword" },
  ],
  pie: [example("title", "Chart title", "title ${1:Distribution}")],
  journey: [
    example("title", "Journey title", "title ${1:My journey}"),
    example("section", "Journey stage", "section ${1:Stage}"),
  ],
  timeline: [
    example("title", "Timeline title", "title ${1:History}"),
    example("section", "Group events", "section ${1:Period}"),
  ],
  gitGraph: [
    { label: "commit", detail: "Add a commit", type: "keyword" },
    example("branch", "Create a branch", "branch ${1:feature}"),
    example("checkout", "Switch branches", "checkout ${1:main}"),
    example("merge", "Merge a branch", "merge ${1:feature}"),
  ],
};

function headerContext(source: string): { diagram?: string; ready: boolean } {
  let frontmatter = false;
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "---") {
      frontmatter = !frontmatter;
      continue;
    }
    if (frontmatter || !trimmed || trimmed.startsWith("%%")) continue;
    const match = DIAGRAM_NAMES.exec(trimmed);
    return { diagram: match?.[1], ready: false };
  }
  return { ready: !frontmatter };
}

function insideQuotedText(source: string): boolean {
  let quote = "";
  let comment = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (comment) {
      if (character === "\n") comment = false;
      continue;
    }
    if (quote) {
      if (character === "\\") index++;
      else if (character === quote) quote = "";
    } else if (character === "%" && source[index + 1] === "%") {
      comment = true;
    } else if (character === '"' || character === "`" || (character === "'" && !/\w/.test(source[index - 1] ?? "")))
      quote = character;
  }
  return Boolean(quote || comment);
}

/** Small syntax/snippet suggestions, deliberately not semantic IntelliSense. */
export const mermaidCompletionSource: CompletionSource = (context) => {
  const { state, pos, explicit } = context;
  const windowStart = Math.max(0, pos - MAX_LINE_PREFIX);
  const lineWindow = state.doc.sliceString(windowStart, pos);
  const newline = lineWindow.lastIndexOf("\n");
  if (windowStart > 0 && newline < 0) return null;
  const lineStart = windowStart + newline + 1;
  const prefix = lineWindow.slice(newline + 1);
  const word = /[\w-]*$/.exec(prefix)?.[0] ?? "";
  if (!word && !explicit) return null;
  const direction = /^\s*(?:flowchart|graph|direction)\s+[A-Z]*$/.test(prefix);
  if (!direction && !/^\s*[\w-]*$/.test(prefix)) return null;

  const tree = syntaxTree(state);
  let parsedDiagram = false;
  let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, -1);
  for (let depth = 0; node && depth < 32; node = node.parent, depth++) {
    if (/^(?:String|LineComment|MessageText[12]|ImportantText|TitleText)$/.test(node.name)) return null;
    if (node.name === "Node" || node.name === "NodeEdge") return null;
    if (/^(?:Flowchart|Sequence|Gantt|Pie|Journey|Mindmap|Requirement)Diagram$/.test(node.name)) parsedDiagram = true;
  }
  // Short inputs also work before the lazy grammar finishes loading. For longer
  // inputs, trust an available syntax tree instead of rescanning the document.
  if (pos <= MAX_CONTEXT_LENGTH) {
    if (insideQuotedText(state.doc.sliceString(0, pos))) return null;
  } else if (!parsedDiagram || tree.length < pos) return null;

  const beforeLine = state.doc.sliceString(0, Math.min(lineStart, MAX_HEADER_LENGTH));
  const header = headerContext(beforeLine);
  const diagram = header.diagram === "stateDiagram" ? "stateDiagram-v2" : header.diagram;
  const options = direction
    ? header.ready || ["flowchart", "graph", "classDiagram", "erDiagram", "stateDiagram-v2"].includes(diagram ?? "")
      ? DIRECTIONS
      : undefined
    : header.ready && lineStart <= MAX_HEADER_LENGTH
      ? DECLARATIONS
      : STATEMENTS[diagram ?? ""];
  if (!options?.length) return null;
  return { from: pos - word.length, options, validFor: /^[\w-]*$/ };
};
