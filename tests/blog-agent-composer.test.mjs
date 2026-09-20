import test from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { agentSlashQuery, removeAgentSlash, sameComposerSelection } from "../lib/assistant/composer.ts";
import { parseComposerContent } from "../lib/assistant/composerDocument.ts";

const richContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Please ", marks: [{ type: "bold" }] },
        { type: "agentMention", attrs: { agentId: "writer" } },
        { type: "text", text: " use this ", marks: [{ type: "italic" }, { type: "strike" }] },
        { type: "hardBreak" },
        { type: "text", text: "code", marks: [{ type: "code" }] },
      ],
    },
    {
      type: "bulletList",
      content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }] }],
    },
    {
      type: "orderedList",
      attrs: { start: 2, type: null },
      content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Second" }] }] }],
    },
  ],
};

test("slash actions activate only at an empty token, preserving surrounding instruction", () => {
  const text = "Please /audit this guide";
  const token = agentSlashQuery(text, 13);
  assert.deepEqual(token, { start: 7, end: 13, query: "audit" });
  assert.deepEqual(removeAgentSlash(text, token), { text: "Please  this guide", caret: 7 });
  assert.deepEqual(agentSlashQuery("/", 1), { start: 0, end: 1, query: "" });
  assert.equal(agentSlashQuery("https://example.com/audit", 25), null);
  assert.equal(agentSlashQuery("/usr/local/", 11), null);
  assert.equal(agentSlashQuery("some/path", 9), null);
  assert.equal(agentSlashQuery("Please /audit now", 17), null);
});

test("acknowledgement clears only the selection that was actually submitted", () => {
  const submitted = { agentId: "writer", attachmentIds: ["plan"] };
  assert.equal(sameComposerSelection(submitted, { ...submitted, attachmentIds: ["plan"] }), true);
  assert.equal(sameComposerSelection(submitted, { agentId: "auditor", attachmentIds: ["plan"] }), false);
  assert.equal(sameComposerSelection(submitted, { agentId: "writer", attachmentIds: ["plan", "source"] }), false);
  assert.equal(sameComposerSelection(submitted, { ...submitted, agentOffset: 0 }), true);
  assert.equal(sameComposerSelection(submitted, { ...submitted, agentOffset: 7 }), false);
  assert.equal(sameComposerSelection({ ...submitted, agentOffset: 7 }, { ...submitted, agentOffset: 7 }), true);
  const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Write" }] }] };
  assert.equal(
    sameComposerSelection({ ...submitted, content }, { ...submitted, content: structuredClone(content) }),
    true,
  );
  const changed = structuredClone(content);
  changed.content[0].content[0].marks = [{ type: "bold" }];
  assert.equal(sameComposerSelection({ ...submitted, content }, { ...submitted, content: changed }), false);
});

test("composer rich text preserves supported marks, lists, newlines and an inline agent", () => {
  assert.deepEqual(parseComposerContent(richContent), richContent);
  for (const href of ["https://example.com", "http://example.com", "mailto:editor@example.com", "/local", "#section"]) {
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Source",
              marks: [
                { type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer nofollow", class: null } },
              ],
            },
          ],
        },
      ],
    };
    assert.deepEqual(parseComposerContent(content), content);
  }
});

test("composer links roundtrip the installed TipTap schema default attributes", () => {
  const schema = getSchema([StarterKit]);
  const content = schema
    .nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Source", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
          ],
        },
      ],
    })
    .toJSON();
  assert.equal(content.content[0].content[0].marks[0].attrs.title, null);
  assert.deepEqual(parseComposerContent(content), content);
  for (const title of ["Native tooltip", 42, { html: "<script>" }]) {
    const invalid = structuredClone(content);
    invalid.content[0].content[0].marks[0].attrs.title = title;
    assert.equal(parseComposerContent(invalid), undefined);
  }
});

test("composer content rejects unsafe links, unsupported nodes and malformed nesting", () => {
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,test",
    "//example.com",
    "https://user:password@example.com",
  ]) {
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Source",
              marks: [{ type: "link", attrs: { href } }],
            },
          ],
        },
      ],
    };
    assert.equal(parseComposerContent(content), undefined);
  }
  for (const content of [
    { type: "doc", content: [{ type: "image", attrs: { src: "https://example.com/image.png" } }] },
    { type: "doc", content: [{ type: "text", text: "Wrong parent" }] },
    { type: "doc", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] },
    { type: "doc", content: [{ type: "paragraph", attrs: { onclick: "alert(1)" } }] },
    {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Underlined", marks: [{ type: "underline" }] }] }],
    },
  ])
    assert.equal(parseComposerContent(content), undefined);
});

test("composer content bounds text, nodes, depth, size and inline agent count", () => {
  const textDoc = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  assert.ok(parseComposerContent(textDoc("x".repeat(8000))));
  assert.equal(parseComposerContent(textDoc("x".repeat(8001))), undefined);
  assert.equal(
    parseComposerContent({ type: "doc", content: Array.from({ length: 2000 }, () => ({ type: "paragraph" })) }),
    undefined,
  );
  const duplicateAgents = structuredClone(richContent);
  duplicateAgents.content[0].content.push({ type: "agentMention", attrs: { agentId: "writer" } });
  assert.equal(parseComposerContent(duplicateAgents), undefined);
  const longAgent = structuredClone(richContent);
  longAgent.content[0].content[1].attrs.agentId = "x".repeat(101);
  assert.equal(parseComposerContent(longAgent), undefined);
  let nested = { type: "paragraph", content: [{ type: "text", text: "Nested" }] };
  for (let i = 0; i < 8; i++)
    nested = { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }, nested] }] };
  assert.equal(parseComposerContent({ type: "doc", content: [nested] }), undefined);
  const oversized = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: Array.from({ length: 40 }, () => ({
          type: "text",
          text: "link",
          marks: [{ type: "link", attrs: { href: `https://example.com/${"x".repeat(1900)}` } }],
        })),
      },
    ],
  };
  assert.equal(parseComposerContent(oversized), undefined);
});
