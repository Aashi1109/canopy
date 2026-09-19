import assert from "node:assert/strict";
import test from "node:test";
import { createBlogDocument } from "../lib/blog/document.ts";
import {
  publicReference,
  validateRunRequest,
  validateAssistantImage,
  validateAssistantResult,
  validatedProposal,
  separateSeoProposals,
  blocksToNodes,
  threadPatchSchema,
} from "../lib/blog/assistantValidation.ts";

test("composer state accepts bounded inline agent positions and legacy selections", () => {
  const selection = { agentId: "writer", attachmentIds: ["plan"] };
  assert.deepEqual(threadPatchSchema.parse({ composerState: selection }).composerState, selection);
  for (const agentOffset of [0, 7, 8000]) {
    const composerState = { ...selection, agentOffset };
    assert.deepEqual(threadPatchSchema.parse({ composerState }).composerState, composerState);
  }
  for (const agentOffset of [-1, 0.5, 8001, "7", null]) {
    assert.equal(threadPatchSchema.safeParse({ composerState: { ...selection, agentOffset } }).success, false);
  }
});

test("thread patches validate and preserve rich composer content", () => {
  const content = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Draft", marks: [{ type: "bold" }] }] }],
  };
  const composerState = { attachmentIds: [], content };
  assert.deepEqual(threadPatchSchema.parse({ composerState }).composerState, composerState);
  const unsafe = structuredClone(content);
  unsafe.content[0].content[0].marks = [{ type: "link", attrs: { href: "javascript:alert(1)" } }];
  assert.equal(threadPatchSchema.safeParse({ composerState: { ...composerState, content: unsafe } }).success, false);
  assert.equal(
    threadPatchSchema.safeParse({ composerState: { ...composerState, content: "not a document" } }).success,
    false,
  );
});

const document = {
  ...createBlogDocument("Article"),
  body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Original text" }] }] },
};
const request = {
  clientRequestId: "request",
  operation: "rewrite",
  message: "Improve",
  postId: "post",
  threadId: "thread",
  selectedText: "Original text",
};
const block = { type: "paragraph", level: null, text: "Improved text", items: [] };
const result = (output, overrides = {}) => ({
  id: "response",
  provider: "openai",
  model: "fixture",
  status: "completed",
  text: "",
  output,
  toolCalls: [],
  citations: [],
  metadata: {},
  ...overrides,
});

test("inline requests send selected text without an article wrapper or coordinates", () => {
  const inline = { ...request, threadId: undefined };
  assert.equal(validateRunRequest(inline).selectedText, "Original text");
  for (const field of ["postId", "selectedText"])
    assert.throws(() => validateRunRequest({ ...inline, [field]: undefined }));
  assert.throws(() => validateRunRequest({ ...inline, document, version: 1 }));
  assert.throws(() => validateRunRequest({ ...inline, message: "x".repeat(8001) }));
  assert.throws(() => validateRunRequest({ ...inline, attachmentIds: ["private-image"] }));
});
test("chat accepts bounded editor JSON without validating full document publishing rules", () => {
  const chat = {
    clientRequestId: "chat",
    operation: "chat",
    message: "Help",
    postId: "post",
    threadId: "thread",
    editorJson: document.body,
  };
  assert.deepEqual(validateRunRequest(chat).editorJson, document.body);
  assert.throws(() => validateRunRequest({ ...chat, threadId: undefined }));
  assert.throws(() => validateRunRequest({ ...chat, editorJson: [] }));
  assert.throws(() =>
    validateRunRequest({ ...chat, editorJson: { type: "doc", content: [], extra: "x".repeat(1000000) } }),
  );
});
test("chat returns literal prose and JSON examples without an output envelope", () => {
  const text = 'Here is an example: {"text":"literal"}\nKeep this line.';
  const chat = { ...request, operation: "chat" };
  assert.equal(validateAssistantResult(result(null, { text }), chat).response.text, text);
  assert.throws(() => validateAssistantResult(result(null), chat), /empty/i);
});
test("reference URLs reject credentials, local destinations and encoded private addresses", () => {
  for (const url of [
    "http://openai.com",
    "https://localhost",
    "https://a.local",
    "https://user:pass@openai.com",
    "https://127.1",
    "https://0x7f000001",
    "https://10.0.0.1",
    "https://172.16.0.1",
    "https://192.168.1.1",
    "https://[::1]",
    "https://[::ffff:127.0.0.1]",
    "https://openai.com:8443",
    "file:///tmp/file",
  ]) {
    assert.throws(() => publicReference(url), /HTTPS/);
  }
  assert.equal(publicReference("https://openai.com/docs"), "https://openai.com/docs");
});
test("private images require matching signatures and bounded nonempty data", () => {
  assert.doesNotThrow(() => validateAssistantImage(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"));
  assert.doesNotThrow(() => validateAssistantImage(new Uint8Array([255, 216, 255, 0]), "image/jpeg"));
  assert.doesNotThrow(() => validateAssistantImage(new TextEncoder().encode("RIFFxxxxWEBP"), "image/webp"));
  for (const [bytes, type] of [
    [new Uint8Array(), "image/png"],
    [new Uint8Array([255, 216, 255]), "image/png"],
    [new Uint8Array(5242881), "image/png"],
    [new TextEncoder().encode("<svg/>"), "image/svg+xml"],
  ])
    assert.throws(() => validateAssistantImage(bytes, type));
});
test("rewrite proposals are validated and do not mutate the working article", () => {
  const before = structuredClone(document);
  const output = validateAssistantResult(result({ originalText: "Original text", blocks: [block] }), request).response;
  assert.equal(output.proposals[0].status, "pending");
  assert.equal(output.proposals[0].replacement[0].content[0].text, "Improved text");
  assert.deepEqual(document, before);
  assert.throws(
    () => validatedProposal("bad", "proposeEdit", { originalText: "Other text", blocks: [block] }, request),
    /selected/,
  );
  assert.throws(() => validatedProposal("bad", "publish", {}, request), /unsupported/);
  assert.throws(() => validateAssistantResult(result(null, { text: '{"broken"' }), request), /incomplete/);
});
const chatRequest = { ...request, operation: "chat", selectedText: undefined, editorJson: document.body };
const sectionEdit = {
  action: "replace",
  title: "Clarify the introduction",
  placement: "In the introduction",
  originalText: "Original text",
  blocks: [block],
};
test("section proposals preserve their operation and review context without changing the article", () => {
  const before = structuredClone(document);
  for (const action of ["insert", "replace", "delete"]) {
    const proposal = validatedProposal(
      action,
      "proposeEdit",
      { ...sectionEdit, action, blocks: action === "delete" ? [] : [block] },
      chatRequest,
    );
    assert.equal(proposal.type, "edit");
    assert.equal(proposal.status, "pending");
    assert.equal(proposal.action, action);
    assert.equal(proposal.title, sectionEdit.title);
    assert.equal(proposal.placement, sectionEdit.placement);
    assert.equal(proposal.originalText, "Original text");
    if (action === "delete") assert.equal(proposal.replacement, undefined);
    else assert.equal(proposal.replacement[0].content[0].text, "Improved text");
  }
  assert.deepEqual(document, before);
});
test("legacy chat replacements and inline rewrite responses keep their existing shape", () => {
  const input = { originalText: "Original text", blocks: [block] };
  for (const context of [chatRequest, request]) {
    const proposal = validatedProposal("legacy", "proposeEdit", input, context);
    assert.equal(proposal.action, undefined);
    assert.equal(proposal.replacement[0].content[0].text, "Improved text");
  }
  assert.throws(() => validatedProposal("inline", "proposeEdit", sectionEdit, request));
});
test("section operations reject incomplete metadata and incompatible replacement content", () => {
  for (const input of [
    { ...sectionEdit, action: "move" },
    { ...sectionEdit, action: undefined },
    { ...sectionEdit, title: " " },
    { ...sectionEdit, placement: undefined },
    { ...sectionEdit, placement: " " },
    { ...sectionEdit, action: "delete" },
    { ...sectionEdit, blocks: [] },
    { ...sectionEdit, action: "insert", blocks: [] },
    { ...sectionEdit, blocks: [{ ...block, text: " " }] },
    { ...sectionEdit, blocks: [{ ...block, type: "bulletList", text: "Unused", items: [" "] }] },
    { ...sectionEdit, blocks: [{ ...block, type: "paragraph", text: "", items: ["Unused"] }] },
  ]) {
    assert.throws(() => validatedProposal("bad", "proposeEdit", input, chatRequest));
  }
  assert.throws(() =>
    validatedProposal(
      "empty-inline",
      "proposeEdit",
      { originalText: "Original text", blocks: [{ ...block, text: " " }] },
      request,
    ),
  );
});
test("section proposals require one exact anchor from the supplied editor body", () => {
  const paragraph = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
  for (const [context, originalText] of [
    [chatRequest, "Missing passage"],
    [chatRequest, ""],
    [{ ...chatRequest, editorJson: undefined }, "Original text"],
    [
      {
        ...chatRequest,
        editorJson: { type: "doc", content: [paragraph("Original text"), paragraph("Original text")] },
      },
      "Original text",
    ],
    [{ ...chatRequest, editorJson: { type: "doc", content: [paragraph("aaa")] } }, "aa"],
  ]) {
    for (const action of ["insert", "replace", "delete"]) {
      assert.throws(() =>
        validatedProposal(
          "anchor",
          "proposeEdit",
          { ...sectionEdit, originalText, action, blocks: action === "delete" ? [] : [block] },
          context,
        ),
      );
    }
  }
  const body = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Section" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Original", marks: [{ type: "bold" }] },
          { type: "text", text: " text" },
        ],
      },
      { type: "bulletList", content: [{ type: "listItem", content: [paragraph("List item")] }] },
    ],
  };
  const originalText = "Section\nOriginal text\nList item";
  assert.equal(
    validatedProposal(
      "formatted",
      "proposeEdit",
      { ...sectionEdit, originalText },
      { ...chatRequest, editorJson: body },
    ).originalText,
    originalText,
  );
});
test("empty insertion anchors are allowed only for genuinely empty drafts", () => {
  const input = { ...sectionEdit, action: "insert", originalText: "" };
  for (const editorJson of [
    { type: "doc" },
    { type: "doc", content: [] },
    { type: "doc", content: [{ type: "paragraph" }] },
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: " " }] }] },
  ]) {
    assert.equal(validatedProposal("empty", "proposeEdit", input, { ...chatRequest, editorJson }).action, "insert");
  }
  for (const editorJson of [
    undefined,
    document.body,
    { type: "doc", content: [{ type: "image", attrs: { alt: "" } }] },
    { type: "doc", content: [{ type: "horizontalRule" }] },
    { type: "doc", content: [{ type: "blockMath", attrs: { latex: "x" } }] },
  ]) {
    assert.throws(() => validatedProposal("nonempty", "proposeEdit", input, { ...chatRequest, editorJson }));
  }
});
test("an empty draft receives one combined insertion proposal, never competing insertions", () => {
  const context = { ...chatRequest, editorJson: { type: "doc", content: [] } };
  const input = {
    ...sectionEdit,
    action: "insert",
    originalText: "",
    blocks: [block, { ...block, text: "A second section" }],
  };
  const proposal = validatedProposal("first", "proposeEdit", input, context);
  assert.equal(proposal.replacement.length, 2);
  const prior = [proposal];
  const before = structuredClone(prior);
  assert.throws(() => validatedProposal("second", "proposeEdit", input, context, prior), {
    code: "INVALID_OUTPUT",
    message: /one insertion proposal/i,
  });
  assert.deepEqual(prior, before);
  assert.doesNotThrow(() =>
    validatedProposal("seo", "proposeSeo", { seoTitle: "Title", seoDescription: "Description" }, context, prior),
  );
  const anchoredInput = { ...sectionEdit, action: "insert" };
  const anchoredProposal = validatedProposal("anchored-first", "proposeEdit", anchoredInput, chatRequest);
  assert.doesNotThrow(() =>
    validatedProposal("anchored-second", "proposeEdit", anchoredInput, chatRequest, [anchoredProposal]),
  );
  assert.throws(() => validatedProposal("missing-body", "proposeEdit", input, { ...context, editorJson: undefined }), {
    code: "INVALID_OUTPUT",
    message: /article context/i,
  });
});
test("all section operations reject a quote that differs from the explicit selection", () => {
  for (const action of ["insert", "replace", "delete"]) {
    assert.throws(
      () =>
        validatedProposal(
          "selection",
          "proposeEdit",
          { ...sectionEdit, action, blocks: action === "delete" ? [] : [block] },
          { ...chatRequest, selectedText: "Different selection" },
        ),
      /selected/,
    );
  }
});
test("SEO fields have separate proposal identities and evidence URLs must be actual citations", () => {
  const report = {
    text: "Review",
    keywords: ["topic"],
    findings: [{ text: "A claim", status: "supported", urls: ["https://openai.com/", "https://invented.org/"] }],
    seoTitle: "Better title",
    seoDescription: "Better description",
  };
  const response = validateAssistantResult(
    result(report, { citations: [{ url: "https://openai.com/", title: "Source" }] }),
    { ...request, operation: "review" },
  ).response;
  assert.deepEqual(
    response.proposals.map((p) => p.toolCallId),
    ["seo:title", "seo:description"],
  );
  assert.equal(response.proposals[0].seoDescription, undefined);
  assert.equal(response.proposals[1].seoTitle, undefined);
  assert.deepEqual(response.findings[0].urls, ["https://openai.com/"]);
  assert.equal(response.searchStatus, "not_requested");
  assert.equal(separateSeoProposals({ toolCallId: "edit", type: "edit", status: "pending" }).length, 1);
});
test("generated blocks become constrained editor JSON without HTML or invented assets", () => {
  const output = {
    title: "A useful article",
    excerpt: "Useful summary",
    blocks: [
      block,
      { type: "heading", level: 3, text: "Section", items: [] },
      { type: "bulletList", level: null, text: "", items: ["Item"] },
    ],
    seoTitle: "Title",
    seoDescription: "Description",
    keywords: ["useful"],
  };
  const validated = validateAssistantResult(result(output), {
    clientRequestId: "generate",
    operation: "generate",
    message: "Write",
  });
  assert.equal(validated.document.schemaVersion, 1);
  assert.equal(validated.document.coverImage, null);
  assert.equal(validated.document.category, null);
  assert.deepEqual(validated.document.tags, []);
  assert.equal(blocksToNodes(output.blocks)[2].content[0].type, "listItem");
});

test("source checks distinguish actual web execution from missing or failed search", () => {
  const output = {
    text: "A report",
    keywords: [],
    findings: [{ text: "Claim", status: "supported", urls: ["https://openai.com/"] }],
    seoTitle: null,
    seoDescription: null,
  };
  const sourceRequest = { ...request, operation: "check_sources" };
  const provider = { citations: [{ url: "https://openai.com/", title: "Source" }] };
  for (const searchStatus of [undefined, "not_requested", "failed"]) {
    const report = validateAssistantResult(result(output, { ...provider, searchStatus }), sourceRequest).response;
    assert.equal(report.searchStatus, "failed");
    assert.equal(report.findings[0].status, "unresolved");
  }
  const report = validateAssistantResult(
    result(output, { ...provider, searchStatus: "completed" }),
    sourceRequest,
  ).response;
  assert.equal(report.searchStatus, "completed");
  assert.equal(report.findings[0].status, "supported");
});
