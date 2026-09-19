import { z } from "zod";
import { getBlogAgent } from "./agentCatalog.ts";
import { isIP } from "node:net";
import {
  validateBlogDocument,
  createBlogDocument,
  blogDocumentText,
  type BlogDocument,
  type BlogNode,
} from "./document.ts";
import type { BlogRunRequest, BlogAssistantResult, BlogProposal } from "./assistantTypes.ts";
import type { AIResult } from "../ai/types.ts";
import { parseComposerContent } from "./composerDocument.ts";
import type { JSONContent } from "@tiptap/core";

export class BlogAssistantError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "BlogAssistantError";
    this.code = code;
    this.status = status;
  }
}
export const assistantId = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const settingsSchema = z
  .object({
    language: z.string().trim().max(80).optional(),
    tone: z.string().trim().max(120).optional(),
    length: z.string().trim().max(80).optional(),
    keyword: z.string().trim().max(200).optional(),
    audience: z.string().trim().max(300).optional(),
    webSearch: z.boolean().optional(),
  })
  .strict();
export const threadPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    settings: settingsSchema.optional(),
    composerDraft: z.string().max(8000).optional(),
    composerState: z
      .object({
        agentId: z.string().max(100).optional(),
        agentOffset: z.number().int().min(0).max(8000).optional(),
        content: z.custom<JSONContent>((value) => parseComposerContent(value) !== undefined).optional(),
        attachmentIds: z.array(assistantId).max(5),
      })
      .strict()
      .optional(),
  })
  .strict();
export const runRequestSchema = z
  .object({
    clientRequestId: assistantId,
    operation: z.enum(["generate", "chat", "rewrite", "review", "check_sources", "agent", "optimize"]),
    agentId: z.string().max(100).optional(),
    document: z.unknown().optional(),
    message: z.string().trim().max(8000),
    postId: assistantId.optional(),
    threadId: assistantId.optional(),
    inputMessageId: assistantId.optional(),
    selectedText: z.string().min(1).max(12000).optional(),
    editorJson: z
      .object({ type: z.literal("doc"), content: z.array(z.unknown()).optional() })
      .passthrough()
      .optional(),
    settings: settingsSchema.optional(),
    references: z.array(z.string().max(2048)).max(5).optional(),
    attachmentIds: z.array(assistantId).max(5).optional(),
  })
  .strict();

export function publicReference(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new BlogAssistantError("VALIDATION", "Reference links must be public HTTPS URLs.");
  }
  const host = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  const privateHost = !host.includes(".") || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host);
  const ipv4 =
    isIP(host) === 4 &&
    /^(0\.|10\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|192\.0\.|198\.(18|19)\.|22[4-9]\.|2[3-5]\d\.)/.test(
      host,
    );
  // Supplied literal IPv6 URLs are unnecessary for editorial references; reject all to include mapped private addresses.
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    privateHost ||
    ipv4 ||
    isIP(host) === 6 ||
    (url.port && url.port !== "443")
  ) {
    throw new BlogAssistantError("VALIDATION", "Use a public HTTPS reference without credentials or a custom port.");
  }
  return url.href;
}

export function validateRunRequest(input: unknown, _cloudName?: string): BlogRunRequest {
  const parsed = runRequestSchema.parse(input);
  if (["review", "optimize", "check_sources"].includes(parsed.operation))
    throw new BlogAssistantError("VALIDATION", "Refresh the editor and select Auditor or Optimizer from the composer.");
  if (parsed.operation === "agent") {
    const agent = getBlogAgent(parsed.agentId);
    if (!agent) throw new BlogAssistantError("VALIDATION", "Choose an available agent.");
    if (!parsed.postId || !parsed.threadId)
      throw new BlogAssistantError("VALIDATION", "Choose an article and private thread first.");
    if (parsed.selectedText || parsed.editorJson || parsed.inputMessageId || parsed.references?.length)
      throw new BlogAssistantError("VALIDATION", "Agent requests use the current document and attached source IDs.");
    const document =
      parsed.document === undefined ? undefined : validateBlogDocument(parsed.document, { cloudName: _cloudName });
    if (agent.requiresDocument && !document)
      throw new BlogAssistantError("VALIDATION", "Attach the current blog to this agent.");
    if (["auditor", "optimizer"].includes(agent.id) && (!document || !blogDocumentText(document).trim()))
      throw new BlogAssistantError("VALIDATION", "Write some article content before running this agent.");
    if (agent.id === "planner" && !parsed.message && (!document || !blogDocumentText(document).trim()))
      throw new BlogAssistantError("VALIDATION", "Describe the topic you want to plan.");
    return {
      ...parsed,
      agentId: agent.id,
      message: parsed.message || `Run ${agent.name} on the current blog.`,
      document,
      attachmentIds: [...new Set(parsed.attachmentIds ?? [])],
    } as BlogRunRequest;
  }
  if (parsed.agentId || parsed.document !== undefined || !parsed.message || (parsed.attachmentIds?.length ?? 0) > 3)
    throw new BlogAssistantError("VALIDATION", "Check the request context and instruction.");
  const references = [...new Set((parsed.references ?? []).map(publicReference))];
  const attachmentIds = [...new Set(parsed.attachmentIds ?? [])];
  if (parsed.editorJson && JSON.stringify(parsed.editorJson).length > 60000)
    throw new BlogAssistantError("VALIDATION", "Article context exceeds 60,000 characters.");
  if (parsed.operation === "generate") {
    if (
      parsed.selectedText ||
      parsed.editorJson ||
      (parsed.postId && !parsed.inputMessageId) ||
      (parsed.threadId && !parsed.inputMessageId) ||
      (!parsed.threadId && attachmentIds.length)
    )
      throw new BlogAssistantError(
        "VALIDATION",
        "New generation uses a brief; use the original message to retry an existing draft.",
      );
  } else {
    if (!parsed.postId) throw new BlogAssistantError("VALIDATION", "Choose an article first.");
    if (parsed.operation === "rewrite") {
      if (!parsed.selectedText) throw new BlogAssistantError("VALIDATION", "Select the text to improve first.");
      if (parsed.editorJson || attachmentIds.length || references.length)
        throw new BlogAssistantError("VALIDATION", "Inline rewriting uses only the selected text and instruction.");
    } else {
      if (!parsed.threadId) throw new BlogAssistantError("VALIDATION", "Choose a private thread first.");
      if (!parsed.editorJson && !parsed.inputMessageId)
        throw new BlogAssistantError("VALIDATION", "Send the editor body JSON as context.");
    }
  }
  if (parsed.inputMessageId && (!parsed.postId || !parsed.threadId))
    throw new BlogAssistantError("VALIDATION", "Retry requires the original post and thread.");
  return {
    ...parsed,
    document: undefined,
    editorJson: parsed.editorJson as BlogNode | undefined,
    references,
    attachmentIds,
  };
}

export function validateAssistantImage(data: Uint8Array, type: string) {
  if (!data.length || data.length > 5 * 1024 * 1024)
    throw new BlogAssistantError("VALIDATION", "Images must be nonempty and at most 5 MiB.");
  const starts = (...bytes: number[]) => bytes.every((value, index) => data[index] === value);
  const ascii = (start: number, end: number) => String.fromCharCode(...data.subarray(start, end));
  const valid =
    type === "image/jpeg"
      ? starts(0xff, 0xd8, 0xff)
      : type === "image/png"
        ? starts(137, 80, 78, 71, 13, 10, 26, 10)
        : type === "image/webp" && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (!valid)
    throw new BlogAssistantError("VALIDATION", "Choose a valid JPEG, PNG, or WebP image matching its file type.");
}

const blockSchema = z
  .object({
    type: z.enum(["paragraph", "heading", "bulletList", "orderedList", "blockquote", "codeBlock"]),
    level: z.union([z.literal(2), z.literal(3)]).nullable(),
    text: z.string().max(60000),
    items: z.array(z.string().max(12000)).max(100),
  })
  .strict();
const blocks = z.array(blockSchema).min(1).max(300);
export const editToolSchema = z.object({ originalText: z.string().min(1).max(12000), blocks }).strict();
export const sectionEditToolSchema = z
  .object({
    action: z.enum(["insert", "replace", "delete"]),
    title: z.string().trim().min(1).max(160),
    placement: z.string().trim().min(1).max(200),
    originalText: z.string().max(12000),
    blocks: z.array(blockSchema).max(300),
  })
  .strict();
export const seoToolSchema = z.object({ seoTitle: z.string().max(160), seoDescription: z.string().max(320) }).strict();
export const generationSchema = z
  .object({
    title: z.string().min(1).max(200),
    excerpt: z.string().max(500),
    blocks,
    seoTitle: z.string().max(160),
    seoDescription: z.string().max(320),
    keywords: z.array(z.string().max(100)).max(20),
  })
  .strict();
export const reportSchema = z
  .object({
    text: z.string().max(20000),
    keywords: z.array(z.string().max(100)).max(20),
    findings: z
      .array(
        z
          .object({
            text: z.string().max(2000),
            status: z.enum(["supported", "unresolved", "matching"]).nullable(),
            urls: z.array(z.string().max(2048)).max(10),
          })
          .strict(),
      )
      .max(50),
    seoTitle: z.string().max(160).nullable(),
    seoDescription: z.string().max(320).nullable(),
  })
  .strict();
export function outputSchema(operation: BlogRunRequest["operation"]) {
  return operation === "generate"
    ? generationSchema
    : operation === "rewrite"
      ? editToolSchema
      : operation === "chat"
        ? undefined
        : reportSchema;
}
export function blocksToNodes(input: z.infer<typeof blocks>): BlogNode[] {
  const paragraph = (text: string): BlogNode => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
  return input.map((block) => {
    if (block.type === "bulletList" || block.type === "orderedList")
      return {
        type: block.type,
        content: block.items.map((item) => ({ type: "listItem", content: [paragraph(item)] })),
      };
    if (block.type === "blockquote") return { type: "blockquote", content: [paragraph(block.text)] };
    if (block.type === "heading")
      return { type: "heading", attrs: { level: block.level ?? 2 }, content: paragraph(block.text).content };
    return { ...paragraph(block.text), type: block.type };
  });
}
export const emptyAssistantResult = (): BlogAssistantResult => ({
  text: "",
  keywords: [],
  findings: [],
  citations: [],
  proposals: [],
  searchStatus: "not_requested",
});
export function separateSeoProposals(proposal: BlogProposal): BlogProposal[] {
  if (proposal.type !== "seo") return [proposal];
  return [
    ...(proposal.seoTitle !== undefined
      ? [{ ...proposal, toolCallId: proposal.toolCallId + ":title", seoDescription: undefined }]
      : []),
    ...(proposal.seoDescription !== undefined
      ? [{ ...proposal, toolCallId: proposal.toolCallId + ":description", seoTitle: undefined }]
      : []),
  ];
}
export function validatedProposal(
  id: string,
  name: string,
  input: unknown,
  request: BlogRunRequest,
  prior: BlogProposal[] = [],
): BlogProposal {
  if (name === "proposeSeo") return { toolCallId: id, type: "seo", status: "pending", ...seoToolSchema.parse(input) };
  if (name !== "proposeEdit")
    throw new BlogAssistantError("INVALID_OUTPUT", "The assistant requested an unsupported tool.", 422);
  const section = request.operation === "rewrite" ? undefined : sectionEditToolSchema.safeParse(input);
  const value = section?.success ? section.data : editToolSchema.parse(input);
  const action = section?.success ? section.data.action : "replace";
  if (request.selectedText && value.originalText !== request.selectedText)
    throw new BlogAssistantError("INVALID_OUTPUT", "The suggestion did not match the selected text. Try again.", 422);
  if (request.operation !== "rewrite") {
    const body = request.editorJson;
    if (!body)
      throw new BlogAssistantError("INVALID_OUTPUT", "The suggestion has no article context. Send a new request.", 422);
    const empty = (body.content ?? []).every(
      (node) =>
        node?.type === "paragraph" &&
        (node.content ?? []).every((child) => child?.type === "text" && !child.text?.trim()),
    );
    const passages: string[] = [];
    const visit = (node: BlogNode) => {
      if (!node || !Array.isArray(node.content ?? []))
        throw new BlogAssistantError("INVALID_OUTPUT", "The article context is malformed. Send a new request.", 422);
      if (["paragraph", "heading", "codeBlock"].includes(node.type))
        passages.push((node.content ?? []).map((child) => (child?.type === "text" ? (child.text ?? "") : "")).join(""));
      else for (const child of node.content ?? []) visit(child);
    };
    visit(body);
    const text = passages.join("\n");
    const start = text.indexOf(value.originalText);
    if (
      value.originalText ? start < 0 || text.indexOf(value.originalText, start + 1) >= 0 : action !== "insert" || !empty
    )
      throw new BlogAssistantError(
        "INVALID_OUTPUT",
        "The suggestion must identify one exact passage in the article. Try again.",
        422,
      );
    if (
      action === "insert" &&
      value.originalText === "" &&
      prior.some((proposal) => proposal.type === "edit" && proposal.action === "insert" && proposal.originalText === "")
    )
      throw new BlogAssistantError(
        "INVALID_OUTPUT",
        "An empty article can receive only one insertion proposal. Include all new sections in that proposal.",
        422,
      );
  }
  let replacement: BlogNode[] | undefined;
  if (action === "delete") {
    if (value.blocks.length)
      throw new BlogAssistantError("INVALID_OUTPUT", "A section deletion cannot include replacement content.", 422);
  } else {
    replacement = blocksToNodes(value.blocks);
    const document = validateBlogDocument({
      ...createBlogDocument("Suggestion"),
      body: { type: "doc", content: replacement },
    });
    if (!blogDocumentText(document))
      throw new BlogAssistantError(
        "INVALID_OUTPUT",
        "The suggestion must contain replacement content. Try again.",
        422,
      );
  }
  return {
    toolCallId: id,
    type: "edit",
    status: "pending",
    ...(section?.success ? { action, title: section.data.title, placement: section.data.placement } : {}),
    originalText: value.originalText,
    ...(replacement ? { replacement } : {}),
  };
}
export function validateAssistantResult(
  result: AIResult,
  request: BlogRunRequest,
  prior: BlogProposal[] = [],
): { response: BlogAssistantResult; document?: BlogDocument } {
  const response = emptyAssistantResult();
  response.proposals = prior;
  response.citations = result.citations.flatMap((c) => {
    try {
      return [{ url: publicReference(c.url), title: c.title.slice(0, 300) || c.url }];
    } catch {
      return [];
    }
  });
  response.searchStatus =
    request.operation === "check_sources" || request.settings?.webSearch
      ? result.searchStatus === "completed"
        ? "completed"
        : "failed"
      : "not_requested";
  if (request.operation === "chat") {
    if (!result.text.trim() && !prior.length)
      throw new BlogAssistantError("INVALID_OUTPUT", "The assistant returned an empty response. Try again.", 422);
    response.text = result.text;
    return { response };
  }
  let value = result.output;
  if (value === null || value === undefined) {
    try {
      value = result.text ? JSON.parse(result.text) : null;
    } catch {
      throw new BlogAssistantError("INVALID_OUTPUT", "The assistant returned incomplete structured output.", 422);
    }
  }
  if (request.operation === "generate") {
    const article = generationSchema.parse(value);
    const document = validateBlogDocument({
      ...createBlogDocument(article.title),
      excerpt: article.excerpt,
      body: { type: "doc", content: blocksToNodes(article.blocks) },
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
    });
    if (!blogDocumentText(document))
      throw new BlogAssistantError("INVALID_OUTPUT", "Generated article was empty. Try again.", 422);
    response.text = "Draft generated. Review the article before publishing.";
    response.keywords = article.keywords;
    return { response, document };
  }
  if (request.operation === "rewrite") {
    response.proposals.push(validatedProposal("rewrite", "proposeEdit", value, request));
    response.text = "Review the suggested replacement before applying it.";
  } else {
    const report = reportSchema.parse(value);
    response.text = report.text;
    response.keywords = report.keywords;
    const urls = new Set(response.citations.map((c) => c.url));
    response.findings = report.findings.map((f) => {
      const evidence = f.urls.filter((url) => urls.has(url));
      return {
        text: f.text,
        status:
          (f.status === "supported" || f.status === "matching") &&
          (!evidence.length || response.searchStatus === "failed")
            ? "unresolved"
            : (f.status ?? undefined),
        urls: evidence,
      };
    });
    if (request.operation === "review" && (report.seoTitle || report.seoDescription))
      response.proposals.push(
        ...separateSeoProposals({
          toolCallId: "seo",
          type: "seo",
          status: "pending",
          seoTitle: report.seoTitle ?? undefined,
          seoDescription: report.seoDescription ?? undefined,
        }),
      );
  }
  return { response };
}
