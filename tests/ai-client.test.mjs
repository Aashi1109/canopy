import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { z } from "zod";

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { shortCircuit: true, url: "data:text/javascript,export {};" };
    if (specifier === "@/lib/config/config.ts")
      return next(new URL("../lib/config/config.ts", import.meta.url).href, context);
    return next(specifier, context);
  },
});
const { AIClient } = await import("../lib/ai/client.ts");
const { AIError, normalizeAIError } = await import("../lib/ai/errors.ts");
const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_MODEL;
const calls = [];
let responder;

function response(overrides = {}) {
  return {
    id: "resp_test",
    object: "response",
    model: "gpt-5.6-terra",
    created_at: 1,
    status: "completed",
    error: null,
    incomplete_details: null,
    output: [
      {
        type: "message",
        id: "msg_test",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: "A useful answer", annotations: [], logprobs: [] }],
      },
    ],
    metadata: { feature: "example", runId: "run-test" },
    usage: {
      input_tokens: 2,
      output_tokens: 3,
      total_tokens: 5,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    ...overrides,
  };
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
test.beforeEach(() => {
  process.env.OPENAI_API_KEY = "fixture-key";
  process.env.OPENAI_MODEL = "gpt-5.6-terra";
  calls.length = 0;
  responder = () => json(response());
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return responder(url, options);
  };
});
test.after(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of [
    ["OPENAI_API_KEY", originalKey],
    ["OPENAI_MODEL", originalModel],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  hooks.deregister();
});
const messages = [{ role: "user", content: "Explain a useful concept." }];

test("plain generation preserves literal JSON examples and uses a configured model without allowlists", async () => {
  process.env.OPENAI_MODEL = "configured-model";
  responder = () =>
    json(
      response({
        model: "actual-model",
        output: [
          {
            ...response().output[0],
            content: [{ type: "output_text", text: 'Here is JSON: {"text":"literal"}\nDone.', annotations: [] }],
          },
        ],
      }),
    );
  const result = await new AIClient("openai").generate({ messages });
  assert.equal(result.text, 'Here is JSON: {"text":"literal"}\nDone.');
  assert.equal(result.model, "actual-model");
  assert.equal(result.output, null);
  assert.deepEqual(result.usage, { inputTokens: 2, outputTokens: 3, totalTokens: 5 });
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "configured-model");
  assert.equal(body.store, false);
  assert.equal(body.background, undefined);
  assert.equal(body.max_output_tokens, undefined);
  assert.notEqual(body.text?.format?.type, "json_schema");
});

test("generation accepts system instructions and preserves all instruction text", async () => {
  const result = await new AIClient("openai").generate({
    messages: [
      { role: "system", content: "You assist an editor." },
      {
        role: "system",
        content: [
          { type: "text", text: "Never publish a draft." },
          { type: "text", text: "Reply in ordinary text." },
        ],
      },
      ...messages,
    ],
  });
  assert.equal(result.text, "A useful answer");
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(
    body.input.filter((item) => ["system", "developer"].includes(item.role)).map((item) => item.content),
    ["You assist an editor.", "Never publish a draft.\nReply in ordinary text."],
  );
});

test("structured generation validates its output and permits a per-request title model", async () => {
  responder = () =>
    json(
      response({
        output: [
          { ...response().output[0], content: [{ type: "output_text", text: '{"summary":"Done"}', annotations: [] }] },
        ],
      }),
    );
  const result = await new AIClient("openai").generate({
    messages,
    model: "configured-title-model",
    schema: z.object({ summary: z.string() }),
  });
  assert.deepEqual(result.output, { summary: "Done" });
  assert.equal(JSON.parse(calls[0].options.body).model, "configured-title-model");
  assert.equal(JSON.parse(calls[0].options.body).text.format.type, "json_schema");
});

test("validated tools execute once, continue with their result and aggregate step usage", async () => {
  let executed = 0;
  responder = () =>
    json(
      calls.length === 1
        ? response({
            id: "resp_first",
            output: [
              {
                type: "function_call",
                id: "fc_test",
                call_id: "call_1",
                name: "propose",
                arguments: '{"text":"Suggestion"}',
                status: "completed",
              },
            ],
          })
        : response(),
    );
  const result = await new AIClient("openai").generate({
    messages,
    tools: {
      propose: {
        description: "Propose",
        inputSchema: z.object({ text: z.string() }),
        execute: async (input, context) => {
          executed++;
          assert.equal(context.toolCallId, "call_1");
          return { proposal: input.text };
        },
      },
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(executed, 1);
  assert.equal(result.text, "A useful answer");
  assert.deepEqual(result.toolCalls[0].output, { proposal: "Suggestion" });
  assert.deepEqual(result.usage, { inputTokens: 4, outputTokens: 6, totalTokens: 10 });
  assert.deepEqual(
    result.details.responses.map((r) => r.id),
    ["resp_first", "resp_test"],
  );
});

test("tool loops stop after the bounded number of steps", async () => {
  responder = () =>
    json(
      response({
        id: `resp_${calls.length}`,
        output: [
          {
            type: "function_call",
            id: `fc_${calls.length}`,
            call_id: `call_${calls.length}`,
            name: "propose",
            arguments: '{"text":"Suggestion"}',
            status: "completed",
          },
        ],
      }),
    );
  const result = await new AIClient("openai").generate({
    messages,
    tools: {
      propose: { description: "Propose", inputSchema: z.object({ text: z.string() }), execute: async (input) => input },
    },
  });
  assert.equal(calls.length, 5);
  assert.equal(result.toolCalls.length, 5);
  assert.equal(result.usage.totalTokens, 25);
});

test("invalid tool arguments never execute", async () => {
  responder = () =>
    json(
      response({
        output: [
          {
            type: "function_call",
            id: "fc_test",
            call_id: "call_1",
            name: "propose",
            arguments: '{"text":42}',
            status: "completed",
          },
        ],
      }),
    );
  let executed = false;
  const result = await new AIClient("openai").generate({
    messages,
    tools: {
      propose: {
        description: "Propose",
        inputSchema: z.object({ text: z.string() }),
        execute: async () => {
          executed = true;
        },
      },
    },
  });
  assert.equal(executed, false);
  assert.equal(result.status, "failed");
});

test("missing credentials and invalid provider names fail before network access", async () => {
  assert.throws(
    () => new AIClient("toString"),
    (error) => error.code === "CAPABILITY",
  );
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(new AIClient("openai").generate({ messages }), (error) => error.code === "CONFIGURATION");
  assert.equal(calls.length, 0);
});

test("provider failures are not retried and never expose secrets", async () => {
  responder = () => {
    throw new Error("fixture-secret network failure");
  };
  await assert.rejects(
    new AIClient("openai").generate({ messages }),
    (error) => error.code === "PROVIDER" && error.retryable && !error.message.includes("fixture-secret"),
  );
  assert.equal(calls.length, 1);
  responder = () => json({ error: { message: "fixture-secret", type: "rate_limit_error" } }, 429);
  await assert.rejects(
    new AIClient("openai").generate({ messages }),
    (error) => error.code === "RATE_LIMIT" && !error.message.includes("fixture-secret"),
  );
  assert.equal(calls.length, 2);
});

test("pre-aborted requests are cancellation rather than ambiguous submissions", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    new AIClient("openai").generate({ messages, signal: controller.signal }),
    (error) => error.code === "CANCELLED",
  );
  assert.equal(calls.length, 0);
});

test("empty output and truncated responses never become completed answers", async () => {
  responder = () => json(response({ output: [] }));
  assert.equal((await new AIClient("openai").generate({ messages })).status, "failed");
  responder = () => json(response({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }));
  assert.equal((await new AIClient("openai").generate({ messages })).status, "failed");
});

test("file lifecycle returns a private handle with bounded retention and idempotent cleanup", async () => {
  responder = (_url, options) =>
    options?.method === "POST"
      ? json({ id: "file-test", filename: "image.png", bytes: 3, purpose: "user_data" })
      : json({ error: { message: "Already deleted" } }, 404);
  const ai = new AIClient("openai");
  const file = await ai.uploadFile({ filename: "image.png", mimeType: "image/png", data: new Uint8Array([1, 2, 3]) });
  assert.equal(file.id, "file-test");
  assert.equal(file.provider, "openai");
  const upload = calls.find((call) => call.options?.method === "POST");
  assert.equal(upload.options.body.get("purpose"), "user_data");
  assert.equal(upload.options.body.get("expires_after[seconds]"), "2592000");
  await ai.deleteFile("file-test");
  await ai.deleteResponse("resp_test");
});

test("SDK foreground streaming accepts system instructions and preserves response identity, text, and completion", async () => {
  const message = response().output[0];
  const part = message.content[0];
  const events = [
    { type: "response.created", response: response({ status: "in_progress", output: [] }) },
    { type: "response.output_item.added", output_index: 0, item: { ...message, status: "in_progress", content: [] } },
    {
      type: "response.content_part.added",
      output_index: 0,
      content_index: 0,
      item_id: "msg_test",
      part: { ...part, text: "" },
    },
    {
      type: "response.output_text.delta",
      output_index: 0,
      content_index: 0,
      item_id: "msg_test",
      delta: "A useful answer",
      logprobs: [],
    },
    {
      type: "response.output_text.done",
      output_index: 0,
      content_index: 0,
      item_id: "msg_test",
      text: "A useful answer",
      logprobs: [],
    },
    { type: "response.content_part.done", output_index: 0, content_index: 0, item_id: "msg_test", part },
    { type: "response.output_item.done", output_index: 0, item: message },
    { type: "response.completed", response: response() },
  ].map((event, sequence_number) => ({ ...event, sequence_number }));
  responder = () =>
    new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
      headers: { "content-type": "text/event-stream" },
    });
  const normalized = [];
  for await (const event of new AIClient("openai").stream({
    messages: [{ role: "system", content: "You assist an editor. Reply in ordinary text." }, ...messages],
  }))
    normalized.push(event);
  assert.equal(normalized[0].type, "response");
  assert.equal(normalized[0].response.id, "resp_test");
  assert.equal(
    normalized
      .filter((event) => event.type === "text-delta")
      .map((event) => event.text)
      .join(""),
    "A useful answer",
  );
  assert.equal(normalized.at(-1).result.text, "A useful answer");
});

test("search status needs successful hosted execution, not citations or a requested tool", async () => {
  const ai = new AIClient("openai");
  assert.equal((await ai.generate({ messages, webSearch: true })).searchStatus, "not_requested");
  for (const status of ["completed", "failed", "in_progress"]) {
    responder = () =>
      json(
        response({
          output: [
            {
              type: "web_search_call",
              id: "ws_test",
              status,
              action: {
                type: "search",
                query: "evidence",
                sources: [{ type: "url", url: "https://example.com/source" }],
              },
            },
            ...response().output,
          ],
        }),
      );
    const result = await ai.generate({ messages, webSearch: true });
    assert.equal(result.searchStatus, status === "completed" ? "completed" : "failed");
    assert.equal(result.citations[0].url, "https://example.com/source");
  }
});

test("structured streaming exposes parsed partial output before validated completion", async () => {
  const complete = response({
    output: [
      {
        ...response().output[0],
        content: [{ type: "output_text", text: '{"summary":"A useful answer"}', annotations: [], logprobs: [] }],
      },
    ],
  });
  const message = complete.output[0];
  const events = [
    { type: "response.created", response: response({ status: "in_progress", output: [] }) },
    { type: "response.output_item.added", output_index: 0, item: { ...message, status: "in_progress", content: [] } },
    {
      type: "response.content_part.added",
      output_index: 0,
      content_index: 0,
      item_id: "msg_test",
      part: { ...message.content[0], text: "" },
    },
    ...['{"summary":"A useful', ' answer"}'].map((delta) => ({
      type: "response.output_text.delta",
      output_index: 0,
      content_index: 0,
      item_id: "msg_test",
      delta,
      logprobs: [],
    })),
    { type: "response.output_item.done", output_index: 0, item: message },
    { type: "response.completed", response: complete },
  ];
  responder = () =>
    new Response(
      events.map((event, sequence_number) => `data: ${JSON.stringify({ ...event, sequence_number })}\n\n`).join(""),
      { headers: { "content-type": "text/event-stream" } },
    );
  const normalized = [];
  for await (const event of new AIClient("openai").stream({ messages, schema: z.object({ summary: z.string() }) }))
    normalized.push(event);
  const partials = normalized.filter((event) => event.type === "output");
  assert.ok(partials.length > 0);
  assert.ok(partials.every((event) => typeof event.output === "object"));
  assert.deepEqual(partials.at(-1).output, { summary: "A useful answer" });
  assert.equal(normalized.at(-1).type, "completed");
  assert.deepEqual(normalized.at(-1).result.output, { summary: "A useful answer" });
});

test("interrupted tool continuations preserve already reported usage", async () => {
  const controller = new AbortController();
  const call = {
    type: "function_call",
    id: "fc_test",
    call_id: "call_1",
    name: "propose",
    arguments: '{"text":"Suggestion"}',
    status: "completed",
  };
  const first = response({ output: [call] });
  responder = () => {
    if (calls.length > 1) {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    }
    const events = [
      { type: "response.created", response: { ...first, status: "in_progress", output: [] } },
      { type: "response.output_item.added", output_index: 0, item: { ...call, status: "in_progress", arguments: "" } },
      { type: "response.function_call_arguments.delta", item_id: "fc_test", output_index: 0, delta: call.arguments },
      { type: "response.output_item.done", output_index: 0, item: call },
      { type: "response.completed", response: first },
    ];
    return new Response(
      events.map((event, sequence_number) => `data: ${JSON.stringify({ ...event, sequence_number })}\n\n`).join(""),
      { headers: { "content-type": "text/event-stream" } },
    );
  };
  const events = [];
  await assert.rejects(
    async () => {
      for await (const event of new AIClient("openai").stream({
        messages,
        signal: controller.signal,
        tools: {
          propose: {
            description: "Propose",
            inputSchema: z.object({ text: z.string() }),
            execute: async (input) => input,
          },
        },
      }))
        events.push(event);
    },
    (error) => {
      assert.equal(error.code, "CANCELLED");
      assert.deepEqual(error.usage, { inputTokens: 2, outputTokens: 3, totalTokens: 5 });
      return true;
    },
  );
  assert.equal(calls.length, 2);
  assert.ok(events.some((event) => event.type === "tool-result"));
  assert.equal(
    events.some((event) => event.type === "completed"),
    false,
  );
});

test("closing the stream consumer aborts an unfinished provider stream", { timeout: 1000 }, async () => {
  let providerSignal;
  responder = (_url, options) => {
    providerSignal = options.signal;
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ type: "response.created", sequence_number: 0, response: response({ status: "in_progress", output: [] }) })}\n\n`,
            ),
          );
          for (const event of [
            { type: "response.output_item.added", output_index: 0, item: { ...response().output[0], content: [] } },
            {
              type: "response.output_text.delta",
              output_index: 0,
              content_index: 0,
              item_id: "msg_test",
              delta: "Hello",
              logprobs: [],
            },
          ])
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
          options.signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), {
            once: true,
          });
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  };
  for await (const event of new AIClient("openai").stream({ messages })) {
    assert.equal(event.type, "response");
    break;
  }
  assert.equal(providerSignal.aborted, true);
});

test("provider errors give retry guidance and retain a non-serialized diagnostic cause", () => {
  for (const cause of [
    new TypeError("fixture-secret connection failed"),
    Object.assign(new Error("fixture-secret upstream"), { statusCode: 503 }),
  ]) {
    const error = normalizeAIError(cause);
    assert.equal(error.code, "PROVIDER");
    assert.equal(error.message, "The AI request failed. Try again.");
    assert.equal(error.retryable, true);
    assert.equal(error.cause, cause);
    assert.doesNotMatch(JSON.stringify(error), /fixture-secret/);
    assert.equal(normalizeAIError(error), error);
  }
});

test("specific provider errors retain their classification and original diagnostics", () => {
  for (const [cause, code] of [
    [Object.assign(new Error("fixture-secret"), { status: 401 }), "CONFIGURATION"],
    [Object.assign(new Error("fixture-secret"), { statusCode: 429 }), "RATE_LIMIT"],
    [Object.assign(new Error("fixture-secret"), { status: 400 }), "VALIDATION"],
    [new DOMException("cancelled", "AbortError"), "CANCELLED"],
    [Object.assign(new Error("fixture-secret"), { name: "AI_NoOutputGeneratedError" }), "INVALID_OUTPUT"],
  ]) {
    const error = normalizeAIError(cause);
    assert.equal(error.code, code);
    assert.equal(error.cause, cause);
    assert.doesNotMatch(error.message, /fixture-secret|Check its status/);
  }
  const known = new AIError("PROVIDER", "Known provider error");
  assert.equal(normalizeAIError(known), known);
});

test("stream failure before the first provider response uses ordinary retryable failure", async () => {
  responder = () => json({ error: { message: "fixture-secret upstream failure", type: "server_error" } }, 503);
  await assert.rejects(
    async () => {
      for await (const _event of new AIClient("openai").stream({ messages })) {
        /* Consume the stream. */
      }
    },
    (error) => {
      assert.equal(error.code, "PROVIDER");
      assert.equal(error.message, "The AI request failed. Try again.");
      assert.equal(error.retryable, true);
      assert.ok(error.cause);
      assert.doesNotMatch(JSON.stringify(error), /fixture-secret/);
      return true;
    },
  );
  assert.equal(calls.length, 1);
});
