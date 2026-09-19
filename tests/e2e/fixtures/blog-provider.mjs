// Explicitly opt-in mock for the disposable blog assistant browser test server.
import { randomUUID } from "node:crypto";
const originalFetch = globalThis.fetch;
const json = (value) => Response.json(value);
function completed(body, id) {
  let context;
  for (const item of body.input ?? [])
    for (const part of item.content ?? [])
      if (part.type === "input_text") {
        try {
          const value = JSON.parse(part.text);
          if (value.instruction) context = value;
        } catch {}
      }
  context ??= {};
  const properties = body.text?.format?.schema?.properties ?? {};
  context.operation =
    body.metadata?.feature === "blog-title"
      ? "title"
      : properties.blocks && properties.title
        ? "generate"
        : properties.originalText
          ? "rewrite"
          : properties.findings
            ? body.tools?.some((tool) => tool.type.startsWith("web_search"))
              ? "check_sources"
              : "review"
            : "chat";
  const block = (text) => ({ type: "paragraph", level: null, text, items: [] });
  const heading = (text) => ({ type: "heading", level: 2, text, items: [] });
  const article = {
    title: "A practical guide to freelance projects",
    excerpt: "Plan a manageable project from an idea to a clear handoff.",
    blocks: [
      heading("Define the project"),
      block("Start with a clear outcome and a short list of deliverables."),
      heading("Plan the work"),
      block("Break the project into small tasks and review the next milestone."),
      heading("Review and deliver"),
      block("Review each deliverable and agree on the final handoff."),
    ],
    seoTitle: "Freelance project planning guide",
    seoDescription: "A practical guide to planning, reviewing, and delivering freelance projects.",
    keywords: ["freelance projects", "project planning"],
  };
  const report = {
    text: "Review the draft and verify the supporting evidence.",
    keywords: ["freelance projects"],
    findings: [
      {
        text: "Use clear headings to describe each step.",
        status: context.operation === "check_sources" ? "supported" : null,
        urls: context.operation === "check_sources" ? ["https://www.pmi.org/learning/library"] : [],
      },
    ],
    seoTitle: "Plan freelance projects with clear milestones",
    seoDescription: "Learn how to scope work, track milestones, and deliver a freelance project.",
  };
  const output =
    context.operation === "generate"
      ? article
      : context.operation === "rewrite"
        ? {
            originalText: context.selectedText,
            blocks: [block("Begin with a clear goal and specific deliverables.")],
          }
        : context.operation === "review" || context.operation === "check_sources"
          ? report
          : context.operation === "title"
            ? "A practical guide to freelance projects"
            : "Start with one clear outcome, then work through the next milestone.";
  return {
    id,
    object: "response",
    created_at: 1,
    model: body.model,
    status: "completed",
    error: null,
    incomplete_details: null,
    metadata: body.metadata,
    text: { format: { type: "json_schema" } },
    output: [
      ...(context.operation === "check_sources"
        ? [
            {
              type: "web_search_call",
              id: "ws_fixture",
              status: "completed",
              action: {
                type: "search",
                queries: ["project management"],
                sources: [
                  { type: "url", url: "https://www.pmi.org/learning/library", title: "Project Management Institute" },
                ],
              },
            },
          ]
        : []),
      {
        type: "message",
        role: "assistant",
        id: "msg_" + id,
        status: "completed",
        content: [
          {
            type: "output_text",
            text: typeof output === "string" ? output : JSON.stringify(output),
            logprobs: [],
            annotations:
              context.operation === "check_sources"
                ? [
                    {
                      type: "url_citation",
                      url: "https://www.pmi.org/learning/library",
                      title: "Project Management Institute",
                      start_index: 0,
                      end_index: 6,
                    },
                  ]
                : [],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 10,
      output_tokens: 20,
      total_tokens: 30,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
}
if (process.env.BLOG_AI_E2E_FIXTURE === "1")
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://api.resend.com/")) return json({ id: randomUUID() });
    if (!url.startsWith("https://api.openai.com/")) return originalFetch(input, init);
    const method = init?.method ?? "GET";
    if (url.endsWith("/responses") && method === "POST") {
      const body = JSON.parse(init.body);
      const id = "resp_" + randomUUID();
      const result = completed(body, id);
      if (!body.stream) return json(result);
      const message = result.output.find((item) => item.type === "message");
      const part = message.content[0];
      const output_index = result.output.indexOf(message);
      const position = { output_index, content_index: 0, item_id: message.id };
      const events = [
        { type: "response.created", response: { ...result, status: "in_progress", output: [] } },
        { type: "response.output_item.added", output_index, item: { ...message, status: "in_progress", content: [] } },
        { type: "response.content_part.added", ...position, part: { ...part, text: "" } },
        ...[part.text.slice(0, Math.ceil(part.text.length / 2)), part.text.slice(Math.ceil(part.text.length / 2))].map(
          (delta) => ({ type: "response.output_text.delta", ...position, delta, logprobs: [] }),
        ),
        { type: "response.output_text.done", ...position, text: part.text, logprobs: [] },
        { type: "response.content_part.done", ...position, part },
        { type: "response.output_item.done", output_index, item: message },
        { type: "response.completed", response: result },
      ];
      const signal = init?.signal;
      const encoder = new TextEncoder();
      const pending = JSON.stringify(body).includes("Cancel this request before completion.");
      let timer;
      let stop;
      return new Response(
        new ReadableStream({
          start(controller) {
            let closed = false;
            stop = () => {
              if (closed) return;
              closed = true;
              clearTimeout(timer);
              signal?.removeEventListener("abort", stop);
              controller.close();
            };
            signal?.addEventListener("abort", stop, { once: true });
            if (signal?.aborted) return stop();
            let sequence = 0;
            const emit = () => {
              if (closed) return;
              const event = events[sequence];
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ ...event, sequence_number: sequence })}\n\n`),
              );
              sequence++;
              if (sequence === events.length) stop();
              else if (!pending || sequence < 4) timer = setTimeout(emit, 60);
            };
            emit();
          },
          cancel() {
            stop();
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }
    if (url.includes("/responses/") && method === "DELETE") return json({ id: url.split("/").at(-1), deleted: true });
    if (url.endsWith("/files") && method === "POST")
      return json({
        id: "file_" + randomUUID(),
        object: "file",
        bytes: 100,
        created_at: 1,
        filename: "test.png",
        purpose: "vision",
        status: "processed",
      });
    if (url.includes("/files/") && method === "DELETE") return json({ id: url.split("/").at(-1), deleted: true });
    throw new Error("Unexpected fixture provider request");
  };
