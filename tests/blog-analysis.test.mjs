import assert from "node:assert/strict";
import test from "node:test";
import { createBlogDocument, validateBlogDocument } from "../lib/blog/document.ts";
import { validateRunRequest } from "../lib/blog/assistantValidation.ts";
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    return specifier === "server-only"
      ? { shortCircuit: true, url: "data:text/javascript,export {};" }
      : next(specifier, context);
  },
});
const { validateAgentOutput, AUDIT_CATEGORIES } = await import("../lib/blog/agentRegistry.ts");
import { BLOG_AGENTS } from "../lib/blog/agentCatalog.ts";
const paragraph = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const document = {
  ...createBlogDocument("Working title"),
  body: { type: "doc", content: [paragraph("The original article.")] },
  authorName: "Actual author",
  category: { id: "category", label: "Category" },
  tags: [{ id: "tag", label: "Tag" }],
  relatedToolIds: ["devtools.json"],
};
const request = (agentId, overrides = {}) => ({
  clientRequestId: "analysis",
  operation: "agent",
  agentId,
  message: "Analyze the article",
  postId: "post",
  threadId: "thread",
  document,
  ...overrides,
});
const result = (output) => ({
  id: "response",
  provider: "openai",
  model: "fixture",
  status: "completed",
  text: "",
  output,
  toolCalls: [],
  citations: [],
  metadata: {},
});
const base = () => ({
  label: "Result",
  summary: "Useful result.",
  sections: [],
  document: null,
  keywords: [],
  searchIntent: "",
  changes: [],
  remainingTasks: [],
});
const audit = () => ({
  ...base(),
  sections: AUDIT_CATEGORIES.map((heading) => ({
    heading,
    text: "Reviewed this category.",
    items: [],
    findings:
      heading === "Depth and completeness"
        ? [
            {
              severity: "medium",
              passage: "The original article.",
              issue: "The example needs detail.",
              recommendation: "Add one concrete example.",
            },
          ]
        : [],
  })),
});
const optimization = (body = document.body) => ({
  ...base(),
  keywords: [
    { keyword: "article", kind: "primary", rationale: "Matches topic" },
    { keyword: "guide", kind: "secondary", rationale: "Supports intent" },
    { keyword: "how to write an article", kind: "long-tail", rationale: "Specific intent" },
  ],
  searchIntent: "Learn about the topic",
  changes: ["Improved introduction"],
  remainingTasks: ["Verify the example"],
  document: {
    title: "Improved article",
    excerpt: "A useful guide.",
    seoTitle: "Useful article guide",
    seoDescription: "A useful guide to the topic.",
    bodyJson: JSON.stringify(body),
  },
});
test("all four agents share one validated operation and reject obsolete direct analysis requests", () => {
  for (const { id } of BLOG_AGENTS) {
    assert.equal(validateRunRequest(request(id)).agentId, id);
    for (const field of ["postId", "threadId"])
      assert.throws(() => validateRunRequest(request(id, { [field]: undefined })));
    assert.throws(() => validateRunRequest(request(id, { selectedText: "partial" })));
    assert.throws(() => validateRunRequest(request(id, { inputMessageId: "chat-message" })));
  }
  for (const operation of ["review", "optimize", "check_sources"])
    assert.throws(() => validateRunRequest({ ...request("auditor"), operation }), /Refresh/);
  assert.throws(() => validateRunRequest(request("unknown")));
  for (const agent of ["writer", "auditor", "optimizer"])
    assert.throws(() => validateRunRequest(request(agent, { document: undefined })));
  assert.equal(validateRunRequest(request("planner", { document: undefined })).document, undefined);
  assert.throws(() => validateRunRequest(request("planner", { document: undefined, message: "" })));
  assert.equal(
    validateRunRequest(request("writer", { document: createBlogDocument("Empty"), message: "" })).agentId,
    "writer",
  );
  assert.throws(() => validateRunRequest(request("auditor", { document: createBlogDocument("Empty") })));
  assert.throws(() => validateRunRequest(request("optimizer", { document: { ...document, unexpected: true } })));
});
test("audits cover all categories and contain no draft or ordinary chat output", () => {
  const value = validateAgentOutput(result(audit()), request("auditor"), []);
  assert.equal(value.artifact.agentId, "auditor");
  assert.equal(value.artifact.content.sections.length, 8);
  assert.equal(value.artifact.content.document, undefined);
  assert.equal(value.response, undefined);
  const output = audit();
  output.sections.pop();
  assert.throws(() => validateAgentOutput(result(output), request("auditor"), []));
  output.sections.push(output.sections[0]);
  assert.throws(() => validateAgentOutput(result(output), request("auditor"), []));
});
test("optimizer produces complete immutable generic artifact preserving administrative metadata", () => {
  const value = validateAgentOutput(result(optimization()), request("optimizer"), ["plan"]);
  assert.equal(value.artifact.content.document.title, "Improved article");
  for (const field of ["authorName", "category", "tags", "relatedToolIds", "coverImage"])
    assert.deepEqual(value.artifact.content.document[field], document[field]);
  assert.deepEqual(value.artifact.inputArtifactIds, ["plan"]);
  assert.equal(value.artifact.content.html, undefined);
  assert.throws(() => validateAgentOutput(result({ ...optimization(), keywords: [] }), request("optimizer"), []));
  assert.throws(() =>
    validateAgentOutput(result(optimization({ type: "doc", content: [paragraph("")] })), request("optimizer"), []),
  );
});
test("draft agents normalize recoverable provider heading levels without changing heading content", () => {
  const heading = (attrs) => ({
    type: "heading",
    ...(attrs === undefined ? {} : { attrs }),
    content: [{ type: "text", text: "Useful heading", marks: [{ type: "bold" }] }],
  });
  const cases = [
    [undefined, 2],
    [{ textAlign: "center" }, 2],
    [{ level: null, textAlign: "center" }, 2],
    [{ level: 1, textAlign: "center" }, 2],
    ...Array.from({ length: 6 }, (_, index) => [
      { level: String(index + 1), textAlign: "center" },
      Math.max(2, index + 1),
    ]),
    ...Array.from({ length: 5 }, (_, index) => [{ level: index + 2, textAlign: "center" }, index + 2]),
  ];
  for (const agent of ["writer", "optimizer"]) {
    for (const [attrs, level] of cases) {
      const body = {
        type: "doc",
        content: [heading(attrs), { type: "blockquote", content: [heading(attrs), paragraph("Supporting text.")] }],
      };
      const expected = heading({ level, ...(attrs?.textAlign ? { textAlign: attrs.textAlign } : {}) });
      const value = validateAgentOutput(result(optimization(body)), request(agent), []);
      assert.deepEqual(value.artifact.content.document.body, {
        type: "doc",
        content: [expected, { type: "blockquote", content: [expected, paragraph("Supporting text.")] }],
      });
      assert.deepEqual(body.content[0], heading(attrs), "The provider document must not be mutated");
    }
  }
});
test("draft agents still reject malformed provider heading levels", () => {
  for (const agent of ["writer", "optimizer"]) {
    for (const level of [0, 7, -1, 2.5, "h2", "2oops", true, false, {}]) {
      const body = {
        type: "doc",
        content: [{ type: "heading", attrs: { level }, content: [{ type: "text", text: "Invalid heading" }] }],
      };
      assert.throws(
        () => validateAgentOutput(result(optimization(body)), request(agent), []),
        /Heading level/,
        `${agent} must reject heading level ${JSON.stringify(level)}`,
      );
    }
    for (const attrs of [null, []]) {
      const body = {
        type: "doc",
        content: [{ type: "heading", attrs, content: [{ type: "text", text: "Invalid attributes" }] }],
      };
      assert.throws(() => validateAgentOutput(result(optimization(body)), request(agent), []), /Node attributes/);
    }
  }
});
test("saved blog documents retain strict heading validation outside agent output", () => {
  for (const level of [1, "1", "2", "3", "4", "5", "6", null, undefined]) {
    const body = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: level === undefined ? {} : { level },
          content: [{ type: "text", text: "Invalid heading" }],
        },
      ],
    };
    assert.throws(() => validateBlogDocument({ ...document, body }), /Heading level/);
  }
});
test("whole-draft proposals cannot silently remove rich blocks or links", () => {
  const nodes = [
    { type: "codeBlock", attrs: { language: "javascript" }, content: [{ type: "text", text: "const answer = 42;" }] },
    { type: "blockMath", attrs: { latex: "x^2" } },
    { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [paragraph("Cell")] }] }] },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Important",
          marks: [
            { type: "link", attrs: { href: "https://openai.com/", target: "_blank", rel: "noopener noreferrer" } },
          ],
        },
        { type: "inlineMath", attrs: { latex: "x" } },
      ],
    },
  ];
  const rich = validateBlogDocument({ ...document, body: { type: "doc", content: [paragraph("Intro"), ...nodes] } });
  const body = { ...rich.body, content: [paragraph("Improved intro"), ...rich.body.content.slice(1)] };
  for (const agent of ["writer", "optimizer"]) {
    assert.deepEqual(
      validateAgentOutput(result(optimization(body)), request(agent, { document: rich }), []).artifact.content.document
        .body,
      body,
    );
    for (let index = 1; index < rich.body.content.length; index++)
      assert.throws(
        () =>
          validateAgentOutput(
            result(optimization({ ...body, content: body.content.filter((_, i) => i !== index) })),
            request(agent, { document: rich }),
            [],
          ),
        /preserve/,
      );
  }
});
test("agent images validate against configured cloud and preserve image identity", () => {
  const cloud = "fixture-cloud";
  const image = {
    publicId: "smarttools/blog/12345678-1234-4234-8234-123456789012",
    version: 1,
    format: "png",
    width: 400,
    height: 300,
    alt: "Diagram",
    caption: "Original caption",
  };
  const rich = {
    ...document,
    coverImage: image,
    body: {
      type: "doc",
      content: [
        paragraph("Intro"),
        {
          type: "image",
          attrs: { ...image, src: `https://res.cloudinary.com/${cloud}/image/upload/v1/${image.publicId}.png` },
        },
      ],
    },
  };
  const input = validateRunRequest(request("optimizer", { document: rich }), cloud);
  assert.deepEqual(
    validateAgentOutput(result(optimization(input.document.body)), input, [], cloud).artifact.content.document
      .coverImage,
    image,
  );
  assert.throws(() => validateRunRequest(request("auditor", { document: rich }), "other-cloud"));
});

test("Planner validates complete planning sections and Writer accepts an empty draft base", () => {
  const plan = {
    ...base(),
    sections: ["Brief", "Reader intent", "Working title", "Outline", "Research gaps"].map((heading) => ({
      heading,
      text: heading === "Brief" ? "Assumption: the audience is new to the topic." : "Useful guidance",
      items: heading === "Outline" ? ["Introduction: establish the problem", "Steps: show the method"] : [],
      findings: [],
    })),
  };
  assert.equal(
    validateAgentOutput(result(plan), request("planner", { document: undefined }), []).artifact.content.sections.length,
    5,
  );
  assert.throws(() =>
    validateAgentOutput(result({ ...plan, sections: plan.sections.slice(1) }), request("planner"), []),
  );
  const empty = createBlogDocument("Empty draft");
  assert.equal(
    validateAgentOutput(result(optimization()), request("writer", { document: empty }), []).artifact.content.document
      .title,
    "Improved article",
  );
});

test("results reject invented metric fields, new internal destinations, unsafe URLs, malformed and oversized payloads", () => {
  assert.throws(() => validateAgentOutput(result({ ...optimization(), searchVolume: 5000 }), request("optimizer"), []));
  const linked = (href) => ({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Useful article",
            marks: [{ type: "link", attrs: { href, target: "_self", rel: "" } }],
          },
        ],
      },
    ],
  });
  assert.throws(
    () => validateAgentOutput(result(optimization(linked("/invented-destination"))), request("optimizer"), []),
    /unverified internal link/,
  );
  assert.throws(() =>
    validateAgentOutput(result(optimization(linked("javascript:alert(1)"))), request("optimizer"), []),
  );
  assert.throws(() => validateAgentOutput({ ...result(null), text: "not JSON" }, request("auditor"), []));
  assert.throws(
    () => validateAgentOutput(result({ ...audit(), summary: "a".repeat(2 * 1024 * 1024) }), request("auditor"), []),
    /exceeded/,
  );
  const cited = {
    ...result(audit()),
    citations: [
      { url: "https://openai.com/research", title: "Actual citation" },
      { url: "https://127.0.0.1/private", title: "Unsafe" },
    ],
  };
  assert.deepEqual(validateAgentOutput(cited, request("auditor"), []).artifact.content.citations, [
    { url: "https://openai.com/research", title: "Actual citation" },
  ]);
});
