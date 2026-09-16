import assert from "node:assert/strict";
import test from "node:test";

import {
  TOOL_CONTENT_DOC_VERSION,
  resolveContent,
  resolveContentMap,
} from "../lib/tool-framework/content.ts";

const SPEC_CONTENT = {
  seoTitle: "Spec SEO Title",
  howToUse: ["Paste input", "Read output"],
  limitations: ["Runs in the browser"],
  faq: [{ q: "Spec question?", a: "Spec answer." }],
  examples: [{ label: "Spec example", text: "abc" }],
  relatedToolIds: ["devtools.fixture-beta"],
};

function makeSpec(overrides = {}) {
  return {
    toolId: "devtools.fixture-alpha",
    app: "devtools",
    category: "text-tools",
    keywords: ["spec-keyword"],
    name: "Fixture Alpha",
    description: "Spec description.",
    input: { kind: "fields", label: "Input" },
    settings: {},
    trigger: { mode: "live" },
    labels: { empty: "Empty", ready: "Ready", running: "Running" },
    content: SPEC_CONTENT,
    ...overrides,
  };
}

function makeRow(overrides = {}) {
  return {
    toolId: "devtools.fixture-alpha",
    category: null,
    keywords: null,
    seoTitle: null,
    seoDescription: null,
    contentDoc: null,
    docVersion: TOOL_CONTENT_DOC_VERSION,
    publishedAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** Runs `fn` with console.warn captured; returns the number of warnings. */
function countWarnings(fn) {
  const original = console.warn;
  let calls = 0;
  console.warn = () => {
    calls += 1;
  };
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return calls;
}

test("an absent row resolves every field from the spec", () => {
  const spec = makeSpec();
  assert.deepEqual(resolveContent(spec, null), {
    toolId: "devtools.fixture-alpha",
    category: "text-tools",
    keywords: ["spec-keyword"],
    seoTitle: "Spec SEO Title",
    seoDescription: "Spec description.",
    content: SPEC_CONTENT,
  });
});

test("seoTitle falls back to the spec name when the spec has no title", () => {
  const spec = makeSpec({ content: { howToUse: ["Only step"] } });
  assert.equal(resolveContent(spec, null).seoTitle, "Fixture Alpha");
});

test("an unpublished row is ignored even when it carries data", () => {
  const spec = makeSpec();
  const row = makeRow({
    publishedAt: null,
    category: "json-tools",
    keywords: ["row-keyword"],
    seoTitle: "Row SEO Title",
    seoDescription: "Row description.",
    contentDoc: { version: TOOL_CONTENT_DOC_VERSION, howToUse: ["Row step"] },
  });

  assert.deepEqual(resolveContent(spec, row), resolveContent(spec, null));
});

test("a partial published row overrides only the fields it sets", () => {
  const spec = makeSpec();
  const resolved = resolveContent(spec, makeRow({ seoTitle: "Row SEO Title" }));

  assert.equal(resolved.seoTitle, "Row SEO Title");
  assert.equal(resolved.seoDescription, "Spec description.");
  assert.equal(resolved.category, "text-tools");
  assert.deepEqual(resolved.keywords, ["spec-keyword"]);
  assert.deepEqual(resolved.content, SPEC_CONTENT);
});

test("a valid published content doc replaces the spec content", () => {
  const spec = makeSpec();
  const resolved = resolveContent(
    spec,
    makeRow({
      contentDoc: {
        version: TOOL_CONTENT_DOC_VERSION,
        howToUse: ["Row step one", "Row step two"],
        faq: [{ q: "Row question?", a: "Row answer." }],
      },
    }),
  );

  assert.deepEqual(resolved.content, {
    howToUse: ["Row step one", "Row step two"],
    faq: [{ q: "Row question?", a: "Row answer." }],
  });
  // The spec object is never mutated.
  assert.deepEqual(spec.content, SPEC_CONTENT);
});

test("an invalid content doc falls back to the spec content without throwing", () => {
  const invalidDocs = [
    { contentDoc: { version: TOOL_CONTENT_DOC_VERSION } }, // missing howToUse
    { contentDoc: { version: TOOL_CONTENT_DOC_VERSION, howToUse: "a string" } },
    { contentDoc: { version: TOOL_CONTENT_DOC_VERSION, howToUse: [1, 2] } },
    {
      contentDoc: {
        version: TOOL_CONTENT_DOC_VERSION,
        howToUse: ["ok"],
        faq: [{ q: "Only a question?" }],
      },
    },
    { contentDoc: { version: 99, howToUse: ["ok"] } },
    { contentDoc: { howToUse: ["ok"] } }, // no version at all
    { contentDoc: { version: TOOL_CONTENT_DOC_VERSION, howToUse: ["ok"] }, docVersion: 2 },
  ];

  invalidDocs.forEach((overrides, index) => {
    const spec = makeSpec({ toolId: `devtools.fixture-invalid-${index}` });
    const row = makeRow({ toolId: spec.toolId, ...overrides });
    const warnings = countWarnings(() => {
      assert.deepEqual(resolveContent(spec, row).content, SPEC_CONTENT);
    });
    assert.equal(warnings, 1, `expected one warning for doc #${index}`);
  });
});

test("the invalid-doc warning is logged only once per tool", () => {
  const spec = makeSpec({ toolId: "devtools.fixture-warn-once" });
  const row = makeRow({ toolId: spec.toolId, contentDoc: { nope: true } });

  const warnings = countWarnings(() => {
    resolveContent(spec, row);
    resolveContent(spec, row);
    resolveContent(spec, row);
  });
  assert.equal(warnings, 1);
});

test("a content doc that is not an object falls back without throwing", () => {
  const nonObjects = ["a string", 42, true, [], [{ howToUse: [] }]];

  nonObjects.forEach((contentDoc, index) => {
    const spec = makeSpec({ toolId: `devtools.fixture-nonobject-${index}` });
    const row = makeRow({ toolId: spec.toolId, contentDoc });
    countWarnings(() => {
      assert.deepEqual(resolveContent(spec, row).content, SPEC_CONTENT);
    });
  });

  // A null doc is "unset", not invalid: it falls back and stays silent.
  const spec = makeSpec({ toolId: "devtools.fixture-nulldoc" });
  const warnings = countWarnings(() => {
    const resolved = resolveContent(spec, makeRow({ toolId: spec.toolId, contentDoc: null }));
    assert.deepEqual(resolved.content, SPEC_CONTENT);
  });
  assert.equal(warnings, 0);
});

test("an unknown category falls back to the spec category", () => {
  const spec = makeSpec();

  for (const category of ["not-a-real-category", "", "__proto__"]) {
    assert.equal(resolveContent(spec, makeRow({ category })).category, "text-tools");
  }

  assert.equal(resolveContent(spec, makeRow({ category: "json-tools" })).category, "json-tools");
});

test("an empty keywords array is a fallback, not an override", () => {
  const spec = makeSpec();

  assert.deepEqual(resolveContent(spec, makeRow({ keywords: [] })).keywords, ["spec-keyword"]);
  assert.deepEqual(resolveContent(spec, makeRow({ keywords: ["  ", ""] })).keywords, [
    "spec-keyword",
  ]);
  assert.deepEqual(resolveContent(spec, makeRow({ keywords: [" row-keyword "] })).keywords, [
    "row-keyword",
  ]);
});

test("blank stored text is not an override", () => {
  const spec = makeSpec();
  const resolved = resolveContent(spec, makeRow({ seoTitle: "   ", seoDescription: "" }));

  assert.equal(resolved.seoTitle, "Spec SEO Title");
  assert.equal(resolved.seoDescription, "Spec description.");
});

test("resolveContentMap keeps spec order and drops unknown toolIds", () => {
  const specs = [
    makeSpec({ toolId: "devtools.fixture-alpha" }),
    makeSpec({ toolId: "devtools.fixture-beta", name: "Fixture Beta" }),
  ];
  const rows = [
    makeRow({ toolId: "devtools.fixture-beta", seoTitle: "Row Beta Title" }),
    makeRow({ toolId: "devtools.fixture-ghost", seoTitle: "Row Ghost Title" }),
  ];

  const map = resolveContentMap(specs, rows);

  assert.deepEqual([...map.keys()], ["devtools.fixture-alpha", "devtools.fixture-beta"]);
  assert.equal(map.get("devtools.fixture-alpha").seoTitle, "Spec SEO Title");
  assert.equal(map.get("devtools.fixture-beta").seoTitle, "Row Beta Title");
  assert.equal(map.has("devtools.fixture-ghost"), false);
});

test("resolveContentMap tolerates an empty row set", () => {
  const specs = [makeSpec()];
  assert.deepEqual(
    resolveContentMap(specs, []),
    new Map([["devtools.fixture-alpha", resolveContent(specs[0], null)]]),
  );
});
