import assert from "node:assert/strict";
import test from "node:test";
import {
  agentDocumentFingerprint,
  sameAgentDocument,
  agentReplacement,
  supportedArtifact,
} from "../lib/blog/agentArtifacts.ts";
const document = {
  title: "Original",
  excerpt: "Intro",
  body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body" }] }] },
  seoTitle: "Search",
  seoDescription: "Description",
  coverImage: null,
  authorName: "Author",
  tags: [],
  category: null,
  relatedToolIds: [],
  schemaVersion: 1,
};
const artifact = {
  schemaVersion: 1,
  agentVersion: 1,
  agentId: "optimizer",
  summary: "Improved draft",
  inputArtifactIds: [],
  baseDocumentFingerprint: agentDocumentFingerprint(document),
  content: { document: { ...document, title: "Optimized", authorName: "Invented", tags: [{ id: "new" }] } },
};
test("snapshot comparison ignores key order and administrative metadata but detects editable changes", () => {
  const shuffled = { ...document, body: { content: document.body.content, type: "doc" }, authorName: "New author" };
  assert.equal(sameAgentDocument(document, shuffled), true);
  assert.equal(agentDocumentFingerprint(document), agentDocumentFingerprint(shuffled));
  for (const field of ["title", "excerpt", "seoTitle", "seoDescription"])
    assert.notEqual(agentDocumentFingerprint(document), agentDocumentFingerprint({ ...document, [field]: "Changed" }));
  assert.equal(sameAgentDocument(undefined, document), false);
});
test("approved replacement preserves unrelated fields and rejects stale or unsupported artifacts", () => {
  const current = { ...document, authorName: "New author" };
  const replacement = agentReplacement(artifact, current);
  assert.equal(replacement.title, "Optimized");
  assert.equal(replacement.authorName, "New author");
  assert.deepEqual(replacement.tags, []);
  assert.equal(document.title, "Original");
  assert.throws(() => agentReplacement(artifact, { ...document, seoTitle: "Changed" }), /changed/);
  assert.throws(() => agentReplacement({ ...artifact, agentId: "auditor" }, current), /no supported draft/);
  assert.equal(supportedArtifact({ ...artifact, agentVersion: 2 }), false);
});

test("TipTap default attributes and normalized server JSON have identical freshness and undo comparisons", async () => {
  const { validateBlogDocument } = await import("../lib/blog/document.ts");
  const raw = {
    ...document,
    title: "  Original  ",
    seoTitle: "",
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            {
              type: "text",
              text: "Link",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://openai.com", target: null, rel: null, class: null, title: null },
                },
                { type: "bold", attrs: {} },
              ],
            },
          ],
        },
        { type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "hello" }] },
        {
          type: "orderedList",
          attrs: { start: 1, type: null },
          content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null, backgroundColor: null },
                  content: [{ type: "paragraph" }],
                },
              ],
            },
          ],
        },
      ],
    },
  };
  const normalized = validateBlogDocument(raw);
  assert.equal(agentDocumentFingerprint(raw), agentDocumentFingerprint(normalized));
  assert.equal(sameAgentDocument(raw, normalized), true);
  const approved = {
    ...artifact,
    baseDocumentFingerprint: agentDocumentFingerprint(normalized),
    content: { document: normalized },
  };
  assert.doesNotThrow(() => agentReplacement(approved, raw));
  const changed = structuredClone(raw);
  changed.body.content[0].content[0].marks[0].attrs.href = "https://example.org/";
  assert.equal(sameAgentDocument(changed, normalized), false);
});

test("malformed persisted result content is unsupported instead of crashing a viewer", () => {
  for (const content of [
    { sections: "bad" },
    { sections: [{ heading: "Title", findings: [{ severity: "bad" }] }] },
    { keywords: [{ keyword: 3 }] },
    { document: { title: "Bad" } },
  ])
    assert.equal(supportedArtifact({ ...artifact, content }), false);
});
