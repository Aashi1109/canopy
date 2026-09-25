import assert from "node:assert/strict";
const { test } = await import(process.env.VITEST ? "vitest" : "node:test");
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { mermaid } from "codemirror-lang-mermaid";
import { mermaidCompletionSource } from "../components/content/mermaidCompletions.ts";

function complete(doc, explicit = false, pos = doc.length) {
  return mermaidCompletionSource(new CompletionContext(EditorState.create({ doc }), pos, explicit));
}

test("diagram declarations are offered at the beginning and after comments or frontmatter", () => {
  for (const prefix of ["", "%% A diagram\n", "---\ntitle: My diagram\n---\n"]) {
    const result = complete(`${prefix}seq`);
    assert.ok(result.options.some(({ label }) => label === "sequenceDiagram"));
    assert.equal(result.from, prefix.length);
  }
  assert.equal(complete(""), null);
  assert.ok(complete("", true).options.some(({ label }) => label === "flowchart"));
  assert.equal(complete("---\ntitle: My diagram\nseq"), null);
});

test("statement suggestions follow the declared diagram type", () => {
  const flow = complete("flowchart TD\nsub");
  assert.ok(flow.options.some(({ label }) => label === "subgraph"));
  assert.ok(!flow.options.some(({ label }) => label === "participant"));
  const sequence = complete("sequenceDiagram\npar");
  assert.ok(sequence.options.some(({ label }) => label === "participant"));
  assert.ok(!sequence.options.some(({ label }) => label === "subgraph"));
  for (const [diagram, keyword] of [
    ["classDiagram", "class"],
    ["stateDiagram-v2", "state"],
    ["stateDiagram", "state"],
    ["erDiagram", "direction"],
    ["gantt", "section"],
    ["gitGraph", "branch"],
  ]) {
    assert.ok(complete(`${diagram}\n`, true).options.some(({ label }) => label === keyword));
  }
});

test("layout direction suggestions replace only the direction", () => {
  for (const doc of ["flowchart L", "graph R", "flowchart TD\n  direction L"]) {
    const result = complete(doc);
    assert.equal(result.from, doc.length - 1);
    assert.deepEqual(
      result.options.map(({ label }) => label),
      ["TD", "TB", "BT", "LR", "RL"],
    );
  }
  assert.equal(complete("sequenceDiagram\ndirection L"), null);
});

test("comments, quoted labels and ordinary label text do not trigger suggestions", () => {
  for (const doc of [
    "%% seq",
    "flowchart TD\n%% sub",
    "flowchart TD\nA[participant",
    'flowchart TD\nA["sub',
    'flowchart TD\nA["A multiline label\nsub',
    "sequenceDiagram\nAlice->>Bob: par",
    "sequenceDiagram\nparticipant My par",
    "gantt\ntitle My sec",
    "flowchart TD\nsubgraph My sub",
    "mindmap\n  Ordinary label",
    "flowchart TD\nA -->|par",
  ])
    assert.equal(complete(doc, true), null, doc);
  assert.ok(complete('flowchart TD\nA["Finished label"]\nsub'));
  assert.ok(complete('flowchart TD\n%% "quote inside a comment\nsub'));
});

test("snippet completions insert editable diagram templates", () => {
  const completion = complete("seq").options.find(({ label }) => label === "sequenceDiagram");
  let state = EditorState.create({ doc: "seq" });
  completion.apply(
    {
      get state() {
        return state;
      },
      dispatch(transaction) {
        state = transaction.state;
      },
    },
    completion,
    0,
    3,
  );
  assert.match(
    state.doc.toString(),
    /^sequenceDiagram\n\s+participant Alice\n\s+participant Bob\n\s+Alice->>Bob: Hello$/,
  );
  assert.equal(state.sliceDoc(state.selection.main.from, state.selection.main.to), "Alice");
});

test("large unparsed documents and very long lines decline suggestions safely", () => {
  assert.equal(complete(`flowchart TD\n${"A --> B\n".repeat(10_000)}sub`), null);
  assert.equal(complete(`flowchart TD\n${" ".repeat(100_000)}sub`), null);
});

test("parsed diagrams keep completions beyond the fallback limit and reject multiline labels", () => {
  for (const [doc, expected] of [
    [`flowchart TD\n${"A --> B\n".repeat(2_500)}sub`, "subgraph"],
    ['flowchart TD\nA["A long label\nsub', null],
    ["sequenceDiagram\npar", "participant"],
    ["gantt\nsec", "section"],
  ]) {
    const state = EditorState.create({ doc, extensions: [mermaid()] });
    ensureSyntaxTree(state, doc.length, 1_000);
    const result = mermaidCompletionSource(new CompletionContext(state, doc.length, false));
    if (expected) assert.ok(result.options.some(({ label }) => label === expected));
    else assert.equal(result, null);
  }
});
