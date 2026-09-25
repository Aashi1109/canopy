// @vitest-environment jsdom
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, test } from "vitest";

import { mermaidFallbackHighlighting } from "../components/content/mermaidHighlighting.ts";

const views = [];
function editor(doc) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [mermaidFallbackHighlighting] }),
    parent,
  });
  views.push(view);
  return view;
}
function tokens(view, role) {
  return [...view.dom.querySelectorAll(`[data-mermaid-token="${role}"]`)].map((element) => element.textContent);
}
afterEach(() => {
  for (const view of views.splice(0)) {
    const parent = view.dom.parentNode;
    view.destroy();
    parent.remove();
  }
});

test("class and ER diagrams get basic syntax colors without modifying their source", () => {
  const source =
    'classDiagram\nclass Animal {\n  +int age\n}\nnote for Animal "class 123"\n%% class 42\nAnimal --> Person : 2';
  const view = editor(source);
  assert.ok(tokens(view, "keyword").includes("classDiagram"));
  assert.ok(tokens(view, "keyword").includes("class"));
  assert.deepEqual(tokens(view, "string"), ['"class 123"']);
  assert.deepEqual(tokens(view, "comment"), ["%% class 42"]);
  assert.deepEqual(tokens(view, "number"), ["2"]);
  assert.ok(tokens(view, "operator").includes("-->"));
  assert.equal(view.state.doc.toString(), source);
  view.dispatch({ selection: { anchor: 0, head: source.length } });
  assert.equal(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to), source);

  const er = editor("erDiagram\nCUSTOMER ||--o{ ORDER : places\nCUSTOMER {\n int id PK\n}");
  assert.ok(tokens(er, "keyword").includes("erDiagram"));
  assert.ok(tokens(er, "keyword").includes("PK"));
});

test("other unsupported diagram declarations receive fallback colors", () => {
  for (const diagram of ["stateDiagram-v2", "stateDiagram", "timeline", "gitGraph", "quadrantChart", "C4Context"]) {
    assert.ok(tokens(editor(`${diagram}\n%% Example`), "keyword").includes(diagram));
  }
});

test("native diagram grammars are left alone, including after comments and frontmatter", () => {
  for (const diagram of [
    "flowchart TD",
    "graph LR",
    "sequenceDiagram",
    "gantt",
    "pie",
    "journey",
    "mindmap",
    "requirementDiagram",
  ]) {
    const view = editor(`---\ntitle: Example\n---\n%% Intro\n${diagram}\n"label" 42`);
    assert.equal(view.dom.querySelectorAll("[data-mermaid-token]").length, 0);
  }
  assert.ok(
    tokens(editor("---\ntitle: Example\n---\n%% Intro\nclassDiagram\nclass Person"), "keyword").includes(
      "classDiagram",
    ),
  );
});

test("switching diagram types adds or removes fallback coloring immediately", () => {
  const view = editor("classDiagram\nclass Animal");
  assert.ok(tokens(view, "keyword").includes("classDiagram"));
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "flowchart TD\nA --> B" } });
  assert.equal(view.dom.querySelectorAll("[data-mermaid-token]").length, 0);
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "gitGraph\ncommit" } });
  assert.deepEqual(tokens(view, "keyword"), ["gitGraph", "commit"]);
});

test("large inputs color the visible viewport while preserving all off-screen text", () => {
  const source = `classDiagram\n${"class Animal\n".repeat(20_000)}`;
  const view = editor(source);
  assert.ok(tokens(view, "keyword").length > 0);
  assert.ok(tokens(view, "keyword").length < 200);
  assert.equal(view.state.doc.length, source.length);
});
