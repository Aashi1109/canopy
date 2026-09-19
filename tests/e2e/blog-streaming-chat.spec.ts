import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("wrangler/package.json"))("esbuild") as {
  build(options: Record<string, unknown>): Promise<{ outputFiles: { path: string; text: string }[] }>;
};
let html: string;
test.beforeAll(async () => {
  const root = process.cwd();
  const directory = await mkdtemp(resolve(tmpdir(), "canopy-chat-stream-"));
  const entry = resolve(directory, "entry.tsx");
  await writeFile(
    entry,
    `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {EditorContent,useEditor} from '@tiptap/react'; import StarterKit from '@tiptap/starter-kit';
    import {BlogAssistantPanel} from '${root}/app/admin/(protected)/blog/components/BlogAssistantPanel.tsx';
    import {BlogEditorShell} from '${root}/app/admin/(protected)/blog/components/BlogEditorShell.tsx';
    import {Toaster} from '${root}/components/ui/index.tsx';
    const document={schemaVersion:1,title:'A practical invoicing guide',excerpt:'',authorName:'Editor',coverImage:null,category:null,tags:[],seoTitle:null,seoDescription:null,body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'A clear introduction helps readers understand the article.'}]}]}};
    document.body = (window as Window & {proposalDocument?: typeof document.body}).proposalDocument ?? document.body;
    function App(){const editor=useEditor({extensions:[StarterKit],content:document.body,editorProps:{attributes:{role:'textbox','aria-label':'Article body'}}});return <main className="platform-shell" style={{height:'100vh'}}><BlogEditorShell title={document.title} initialAssistantOpen status="Draft" saveState="saved" canEdit toolbar={null} settings={null} onSave={()=>{}} onPreview={()=>{}} onReview={()=>{}} assistant={(onClose)=><BlogAssistantPanel postId="post" ownerId="owner" editor={editor} document={document} onMetadata={()=>{}} onClose={onClose}/>}><h2 className="text-heading-1">{document.title}</h2><EditorContent editor={editor}/></BlogEditorShell><Toaster/></main>};createRoot(window.document.getElementById('root')).render(<App/>);
  `,
  );
  const bundle = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    outdir: directory,
    absWorkingDir: root,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    nodePaths: [resolve(root, "node_modules")],
    tsconfig: resolve(root, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".png": "dataurl", ".svg": "dataurl", ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl" },
  });
  const javascript = bundle.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  const css = bundle.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
  const globals = await postcss([tailwind({ base: root })]).process(
    await readFile(resolve(root, "app/globals.css"), "utf8"),
    { from: resolve(root, "app/globals.css") },
  );
  let fonts = "";
  try {
    const chunks = resolve(root, ".next/dev/static/chunks");
    const fontStylesheet = (await readdir(chunks)).find(
      (name) =>
        name.startsWith("[next]_internal_font_google_geist_") && !name.includes("geist_mono") && name.endsWith(".css"),
    );
    if (fontStylesheet) {
      fonts = await readFile(resolve(chunks, fontStylesheet), "utf8");
      for (const match of fonts.matchAll(/url\("(\.\.\/media\/[^" ]+\.woff2)"\)/g)) {
        const data = (await readFile(resolve(chunks, match[1]))).toString("base64");
        fonts = fonts.replace(match[0], `url("data:font/woff2;base64,${data}")`);
      }
    }
  } catch {
    /* The harness also runs without Next's optional local font cache. */
  }
  html = `<!doctype html><html><head><style>${fonts}\n${globals.css}\n${css}</style></head><body><div id="root"></div><script>${javascript.replaceAll("</script", "<\\/script")}</script></body></html>`;
});

test("chat streams through collapse, confirms new threads, and aborts when leaving the page", async ({ page }) => {
  page.on("pageerror", (error) => console.log("CHAT HARNESS ERROR", error.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    const config = {
      enabled: true,
      provider: "fixture",
      capabilities: { images: true, structuredOutput: true, webSearch: false, urlRetrieval: false },
    };
    const threads = [
      {
        id: "thread-1",
        postId: "post",
        title: "New thread",
        type: "chat",
        settings: {},
        composerDraft: "",
        createdAt: now,
        updatedAt: now,
      },
    ];
    const runs: Record<string, unknown>[] = [],
      messages: Record<string, unknown>[] = [],
      attachments: Record<string, unknown>[] = [];
    const fixture = {
      starts: 0,
      aborts: 0,
      threads: 1,
      titles: [] as string[],
      complete: (_withProposal?: boolean) => {},
    };
    Object.assign(window, { fixture, process: { env: { NODE_ENV: "production" } } });
    window.fetch = async (input, options) => {
      const url = String(input),
        method = options?.method ?? "GET";
      const body = typeof options?.body === "string" ? JSON.parse(options.body) : {};
      if (url === "/api/admin/blog/ai") return Response.json(config);
      if (url.endsWith("/threads")) {
        if (method === "POST") {
          const thread = { ...threads[0], id: `thread-${threads.length + 1}`, title: body.title ?? "New thread" };
          threads.push(thread);
          fixture.titles.push(thread.title);
          fixture.threads = threads.length;
          return Response.json({ thread });
        }
        return Response.json({ threads });
      }
      if (/\/threads\/[^/]+\/attachments$/.test(url) && method === "POST") {
        const file = options?.body instanceof FormData ? (options.body.get("file") as File) : null;
        const attachment = {
          id: `attachment-${attachments.length + 1}`,
          threadId: url.split("/").at(-2),
          messageId: null,
          type: file ? "file" : "link",
          label: file?.name ?? body.label ?? body.url,
          data: file ? { mimeType: file.type, sizeBytes: file.size } : { url: body.url },
          status: "ready",
          expiresAt: null,
          createdAt: now,
          updatedAt: now,
        };
        attachments.push(attachment);
        return Response.json({ attachment });
      }
      if (/\/threads\/[^/]+$/.test(url)) {
        const thread = threads.find((entry) => entry.id === url.split("/").at(-1))!;
        if (method === "PATCH") {
          Object.assign(thread, body);
          return Response.json({ thread });
        }
        return Response.json({
          ...config,
          thread,
          runs: runs.filter((run) => run.threadId === thread.id),
          messages: messages.filter((message) => message.threadId === thread.id),
          attachments: attachments.filter((attachment) => attachment.threadId === thread.id),
        });
      }
      if (url.includes("/proposals/") && method === "PATCH") return Response.json({ status: body.status });
      if (url === "/api/admin/blog/ai/runs") {
        fixture.starts++;
        const run = {
          id: `run-${fixture.starts}`,
          threadId: body.threadId,
          postId: "post",
          operation: "chat",
          status: "running",
          provider: "fixture",
          model: "fixture",
          inputMessageId: `user-${fixture.starts}`,
          assistantMessageId: `assistant-${fixture.starts}`,
          request: body,
          response: null,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        };
        runs.push(run);
        for (const attachment of attachments)
          if (body.attachmentIds?.includes(attachment.id)) attachment.messageId = run.inputMessageId;
        messages.push({
          id: run.inputMessageId,
          threadId: body.threadId,
          runId: null,
          role: "user",
          parts: [
            { type: "text", text: body.message },
            ...(body.attachmentIds ?? []).map((attachmentId: string) => ({ type: "attachment", attachmentId })),
          ],
          meta: {},
          createdAt: now,
          updatedAt: now,
        });
        messages.push({
          id: run.assistantMessageId,
          threadId: body.threadId,
          runId: run.id,
          role: "assistant",
          parts: [],
          meta: {},
          createdAt: now,
          updatedAt: now,
        });
        return new Response(
          new ReadableStream({
            start(controller) {
              const emit = (event: unknown) =>
                controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
              emit({ type: "run", run });
              emit({
                type: "text-delta",
                text: "**Start with a clear outline**, then explain each step using a practical example.\n\n- First step\n- Second step\n\n[Reference](https://example.com)\n\n```js\nconst amount = 42;\n```\n\n| Item | Value |\n| --- | --- |\n| Total | 42 |",
              });
              fixture.complete = (withProposal = false) => {
                run.status = "completed";
                const response = {
                  text: "**Use the attached example** to make each invoicing step concrete.",
                  keywords: [],
                  findings: [],
                  citations: [],
                  proposals: withProposal
                    ? [
                        {
                          toolCallId: "edit-1",
                          type: "edit",
                          status: "pending",
                          originalText: "A clear introduction helps readers understand the article.",
                          replacement: [
                            {
                              type: "paragraph",
                              content: [
                                {
                                  type: "text",
                                  text: "Start with a concrete invoicing example that readers can follow.",
                                },
                              ],
                            },
                          ],
                        },
                      ]
                    : [],
                  searchStatus: "not_requested",
                };
                Object.assign(run, { response, completedAt: now });
                const message = messages.find((entry) => entry.id === run.assistantMessageId)!;
                message.parts = [
                  { type: "text", text: response.text },
                  ...response.proposals.map((proposal) => ({ type: "proposal", proposal })),
                ];
                emit({ type: "completed", run });
                controller.close();
              };
              options?.signal?.addEventListener(
                "abort",
                () => {
                  fixture.aborts++;
                  run.status = "cancelled";
                  controller.error(new DOMException("Aborted", "AbortError"));
                },
                { once: true },
              );
            },
          }),
          { headers: { "Content-Type": "application/x-ndjson" } },
        );
      }
      throw new Error(`Unexpected fixture request: ${method} ${url}`);
    };
  });
  await page.route("https://chat-stream-harness.test/", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("https://chat-stream-harness.test/");
  const assistant = page.getByRole("complementary", { name: "Blog assistant" });
  const composer = assistant.getByRole("textbox", { name: "Message to assistant" });
  async function finishTransitions() {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation instanceof CSSTransition)
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
  }
  async function captureGeometry(viewport: string) {
    const geometry = await assistant.evaluate((aside) => {
      function bounds(element: Element | null) {
        if (!element) return null;
        const { x, y, width, height } = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          x,
          y,
          width,
          height,
          font: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          padding: style.padding,
          background: style.backgroundColor,
          color: style.color,
          accentText: style.getPropertyValue("--color-accent-text"),
          accentForeground: style.getPropertyValue("--accent-foreground"),
          border: style.border,
          borderRadius: style.borderRadius,
        };
      }
      const textbox = aside.querySelector("textarea");
      return {
        aside: bounds(aside),
        heading: bounds(aside.querySelector("h2")),
        header: bounds(aside.querySelector("h2")?.parentElement ?? null),
        textarea: bounds(textbox),
        buttons: Array.from(aside.querySelectorAll("button[aria-label]")).map((element) => ({
          label: element.getAttribute("aria-label"),
          ...bounds(element),
        })),
        tabs: Array.from(aside.querySelectorAll('[role="tab"]')).map(bounds),
        composer: bounds(textbox?.closest('[role="tabpanel"]') ?? null),
        rows: Array.from(aside.querySelectorAll('section[aria-label="Conversation history"] button')).map(bounds),
        messageText: Array.from(aside.querySelectorAll("article p")).map(bounds),
        overflow: aside.scrollWidth > aside.clientWidth,
      };
    });
    await writeFile(`/tmp/blog-assistant-nv2sj-geometry-${viewport}.json`, JSON.stringify(geometry, null, 2));
  }
  await expect(composer).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "/tmp/blog-assistant-nv2sj-idle-1366.png" });
  await assistant.screenshot({ path: "/tmp/blog-assistant-nv2sj-idle-aside-1366.png" });
  await captureGeometry("idle-1366");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: "/tmp/blog-assistant-nv2sj-idle-1280.png" });
  await captureGeometry("idle-1280");
  await page.setViewportSize({ width: 1366, height: 768 });
  await assistant.getByRole("button", { name: "Assistant settings", exact: true }).click();
  await page.screenshot({ path: "/tmp/blog-assistant-nv2sj-settings-1366.png" });
  await page.keyboard.press("Escape");
  await composer.fill("Help improve this introduction");
  await assistant.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(assistant.getByText("Start with a clear outline", { exact: false })).toBeVisible();
  await expect(assistant.locator("strong").getByText("Start with a clear outline", { exact: true })).toBeVisible();
  await expect(assistant.getByRole("listitem").filter({ hasText: "First step" })).toBeVisible();
  await expect(assistant.getByRole("link", { name: "Reference", exact: true })).toHaveAttribute("target", "_blank");
  await expect(assistant.locator("pre code")).toHaveText("const amount = 42;");
  await expect(assistant.getByRole("columnheader", { name: "Value", exact: true })).toBeVisible();
  await composer.press("Enter");
  expect(await page.evaluate("window.fixture.starts")).toBe(1);
  await expect(assistant.locator("article").getByText("Help improve this introduction", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/blog-chat-streaming-1366.png" });
  await captureGeometry("streaming-1366");
  const history = assistant.getByRole("button", { name: "History", exact: true });
  await history.click();
  await expect(assistant.getByRole("region", { name: "Conversation history" })).toBeVisible();
  await expect(assistant.getByText("Responding", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/blog-assistant-nv2sj-history-1366.png" });
  await captureGeometry("history-1366");
  await assistant.locator('section[aria-label="Conversation history"] button[aria-current="true"]').hover();
  await finishTransitions();
  await captureGeometry("history-hover-1366");
  await page.keyboard.press("Escape");
  await expect(history).toBeFocused();
  await expect(assistant.getByRole("region", { name: "Conversation history" })).toBeHidden();
  expect(await page.evaluate("window.fixture.aborts")).toBe(0);
  await assistant.getByRole("button", { name: "Close assistant", exact: true }).click();
  await expect(assistant).toBeHidden();
  expect(await page.evaluate("window.fixture.aborts")).toBe(0);
  await page.getByRole("button", { name: "Assistant", exact: true }).filter({ visible: true }).click();
  await expect(assistant.getByText("Start with a clear outline", { exact: false })).toBeVisible();
  await assistant.getByRole("button", { name: "New thread", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.screenshot({ path: "/tmp/blog-chat-new-thread-confirmation-1366.png" });
  await page.getByRole("button", { name: "Keep generating", exact: true }).click();
  expect(await page.evaluate("window.fixture.aborts")).toBe(0);
  expect(await page.evaluate("window.fixture.threads")).toBe(1);
  await assistant.getByRole("button", { name: "New thread", exact: true }).click();
  await page.getByRole("button", { name: "Stop and create thread", exact: true }).click();
  await expect.poll(() => page.evaluate("window.fixture.aborts")).toBe(1);
  expect(await page.evaluate("window.fixture.threads")).toBe(1);
  await expect(assistant.getByRole("heading", { name: "What should we work on?", exact: true })).toBeVisible();
  await expect(composer).toBeFocused();
  await page.screenshot({ path: "/tmp/blog-assistant-nv2sj-new-thread-1366.png" });
  await captureGeometry("new-thread-1366");
  await composer.fill("My first question");
  await assistant.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(() => page.evaluate("window.fixture.threads")).toBe(2);
  expect(await page.evaluate("window.fixture.titles")).toEqual(["My first question"]);
  await expect(assistant.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate("window.fixture.starts")).toBe(2);
  await page.evaluate("window.fixture.complete()");
  await expect(assistant.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  await expect(assistant.locator("strong").getByText("Use the attached example", { exact: true })).toBeVisible();
  await assistant.getByRole("button", { name: "Attach files or links", exact: true }).click();
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  await page.getByRole("textbox", { name: "URL", exact: true }).fill("http://example.com");
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "URL", exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("textbox", { name: "URL", exact: true }).fill("https://www.irs.gov/");
  await page.screenshot({ path: "/tmp/blog-assistant-nv2sj-add-link-1366.png" });
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  await expect(assistant.getByText("www.irs.gov", { exact: true })).toBeVisible();
  await assistant.getByRole("button", { name: "Remove reference https://www.irs.gov/", exact: true }).click();
  await expect(assistant.getByText("www.irs.gov", { exact: true })).toBeHidden();
  await assistant.getByRole("button", { name: "Attach files or links", exact: true }).click();
  const choosingFile = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  await (
    await choosingFile
  ).setFiles({
    name: "invoice-reference.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(
    assistant.getByRole("button", { name: "invoice-reference.png Image · Ready to send", exact: true }),
  ).toBeVisible();
  await composer.fill("Use this reference for the example.");
  await page.screenshot({ path: "/tmp/blog-assistant-nv2sj-attachment-ready-1366.png" });
  await assistant.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(assistant.getByText("Start with a clear outline", { exact: false })).toBeVisible();
  await page.evaluate("window.fixture.complete()");
  expect(await page.evaluate("window.fixture.threads")).toBe(2);
  expect(await page.evaluate("window.fixture.titles")).toEqual(["My first question"]);
  await expect(assistant.getByText("Image · Sent with your message", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/blog-assistant-nv2sj-attachment-sent-1366.png" });
  await captureGeometry("sent-1366");
  const article = page.getByRole("textbox", { name: "Article body", exact: true });
  const original = await article.textContent();
  await composer.fill("Suggest a stronger introduction");
  await assistant.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(assistant.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.evaluate("window.fixture.complete(true)");
  await expect(assistant.getByRole("button", { name: "Show full change", exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/blog-assistant-nv2sj-proposal-card-1366.png" });
  await assistant.getByRole("button", { name: "Show full change", exact: true }).click();
  await expect(assistant.getByRole("button", { name: "Apply edit", exact: true })).toBeEnabled();
  expect(await article.textContent()).toBe(original);
  await expect(assistant.getByRole("button", { name: "Apply edit", exact: true })).toBeInViewport({ ratio: 1 });
  await finishTransitions();
  await page.screenshot({ path: "/tmp/blog-assistant-nv2sj-proposal-preview-1366.png" });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(assistant.getByRole("button", { name: "Apply edit", exact: true })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: "/tmp/blog-assistant-nv2sj-proposal-preview-1280.png" });
  await page.setViewportSize({ width: 1366, height: 768 });
  await assistant.getByRole("button", { name: "Apply edit", exact: true }).click();
  await expect(article).toHaveText("Start with a concrete invoicing example that readers can follow.");
  await page.screenshot({ path: "/tmp/blog-assistant-nv2sj-proposal-applied-1366.png" });
  await expect(assistant.getByRole("button", { name: "Apply edit", exact: true })).toHaveCount(0);
  await expect(assistant.getByRole("button", { name: "Discard proposal", exact: true })).toHaveCount(0);
  await assistant.getByRole("button", { name: "Hide", exact: true }).click();
  await expect(
    assistant.locator("article").getByText("Suggest a stronger introduction", { exact: true }),
  ).toBeVisible();
  await expect(composer).toBeVisible();
  await assistant.getByRole("tab", { name: "Review", exact: true }).click();
  await expect(assistant.getByRole("button", { name: "Analyze with AI", exact: true })).toBeVisible();
  await finishTransitions();
  await page.screenshot({ path: "/tmp/blog-assistant-nv2sj-review-1366.png" });
  await assistant.getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(assistant.getByText("References & claims", { exact: true })).toBeVisible();
  await expect(assistant.getByRole("button", { name: "Check sources", exact: true })).toBeDisabled();
  await expect(
    assistant.getByText(
      "Source checking is unavailable with the current AI configuration. You can still add and open reference links.",
      { exact: true },
    ),
  ).toBeVisible();
  await finishTransitions();
  await page.screenshot({ path: "/tmp/blog-assistant-nv2sj-sources-1366.png" });
  await assistant.getByRole("tab", { name: "Chat", exact: true }).click();
  await composer.fill("Another request");
  await assistant.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(assistant.getByText("Start with a clear outline", { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/blog-chat-streaming-390.png" });
  await captureGeometry("streaming-390");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  await expect.poll(() => page.evaluate("window.fixture.aborts")).toBe(2);
});

type SectionProposalFixture = {
  toolCallId: string;
  type: "edit";
  action?: "insert" | "replace" | "delete";
  status: "pending";
  title: string;
  placement: string;
  originalText: string;
  replacement?: { type: string; attrs?: { level: number }; content: { type: string; text: string }[] }[];
};

const introductionText = "A clear introduction helps readers understand the article.";
const revisedIntroduction = "Start with a concrete invoicing example that readers can follow.";
const resourcesText = "Keep your payment records together.";
const obsoleteText = "Print every invoice in triplicate.";
const sectionProposals: SectionProposalFixture[] = [
  {
    toolCallId: "insert-section",
    type: "edit",
    action: "insert",
    status: "pending",
    title: "Add a practical payment checklist",
    placement: "After Resources",
    originalText: `Resources\n${resourcesText}`,
    replacement: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Payment checklist" }] },
      { type: "paragraph", content: [{ type: "text", text: "Confirm the amount and payment date before sending." }] },
    ],
  },
  {
    toolCallId: "replace-section",
    type: "edit",
    action: "replace",
    status: "pending",
    title: "Make the introduction more concrete",
    placement: "Introduction",
    originalText: `Introduction\n${introductionText}`,
    replacement: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Introduction" }] },
      { type: "paragraph", content: [{ type: "text", text: revisedIntroduction }] },
    ],
  },
  {
    toolCallId: "delete-section",
    type: "edit",
    action: "delete",
    status: "pending",
    title: "Remove the outdated printing section",
    placement: "Paper copies",
    originalText: `Paper copies\n${obsoleteText}`,
  },
];

async function sectionProposalHarness(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    ({ introductionText, resourcesText, obsoleteText }) => {
      const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
      const heading = (text: string) => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] });
      Object.assign(window, {
        process: { env: { NODE_ENV: "production" } },
        proposalDocument: {
          type: "doc",
          content: [
            heading("Introduction"),
            paragraph(introductionText),
            heading("Resources"),
            paragraph(resourcesText),
            heading("Paper copies"),
            paragraph(obsoleteText),
            heading("Next steps"),
            paragraph("Send the invoice and keep a digital copy."),
          ],
        },
      });
    },
    { introductionText, resourcesText, obsoleteText },
  );
  const now = new Date().toISOString();
  const config = {
    enabled: true,
    provider: "fixture",
    capabilities: { images: true, structuredOutput: true, webSearch: false, urlRetrieval: false },
  };
  const threads = ["Section suggestions", "Other conversation"].map((title, index) => ({
    id: `section-thread-${index + 1}`,
    postId: "post",
    title,
    type: "chat",
    settings: {},
    composerDraft: "",
    createdAt: now,
    updatedAt: now,
  }));
  const runs: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];
  const state = {
    proposals: sectionProposals,
    outcomePatches: [] as string[],
    unexpectedRequests: [] as string[],
    errors,
  };
  await page.route("https://section-proposals.test/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/") return route.fulfill({ contentType: "text/html", body: html });
    if (path === "/api/admin/blog/ai") return route.fulfill({ json: config });
    if (path === "/api/admin/blog/post/threads") return route.fulfill({ json: { threads } });
    if (path.includes("/proposals/")) {
      state.outcomePatches.push(`${method} ${path}`);
      return route.fulfill({ status: 500, json: { error: "Chat proposal outcomes must stay local." } });
    }
    const thread = threads.find((candidate) => path.endsWith(`/threads/${candidate.id}`));
    if (thread) {
      if (method === "PATCH") {
        Object.assign(thread, request.postDataJSON());
        return route.fulfill({ json: { thread } });
      }
      return route.fulfill({
        json: {
          ...config,
          thread,
          runs: runs.filter((run) => run.threadId === thread.id),
          messages: messages.filter((message) => message.threadId === thread.id),
          attachments: [],
        },
      });
    }
    if (path === "/api/admin/blog/ai/runs" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      const index = runs.length + 1;
      const response = {
        text: "Here are three focused section changes to make the article more useful.",
        keywords: [],
        findings: [],
        citations: [],
        proposals: state.proposals,
        searchStatus: "not_requested",
      };
      const run = {
        id: `section-run-${index}`,
        threadId: body.threadId,
        postId: "post",
        operation: "chat",
        status: "completed",
        provider: "fixture",
        model: "fixture",
        inputMessageId: `section-user-${index}`,
        assistantMessageId: `section-assistant-${index}`,
        request: body,
        response,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      };
      runs.push(run);
      messages.push(
        {
          id: run.inputMessageId,
          threadId: body.threadId,
          runId: null,
          role: "user",
          parts: [{ type: "text", text: body.message }],
          meta: {},
          createdAt: now,
          updatedAt: now,
        },
        {
          id: run.assistantMessageId,
          threadId: body.threadId,
          runId: run.id,
          role: "assistant",
          parts: [
            { type: "text", text: response.text },
            ...state.proposals.map((proposal) => ({ type: "proposal", proposal })),
          ],
          meta: {},
          createdAt: now,
          updatedAt: now,
        },
      );
      return route.fulfill({
        contentType: "application/x-ndjson",
        body:
          [
            { type: "run", run: { ...run, status: "running", response: null, completedAt: null } },
            { type: "completed", run },
          ]
            .map((event) => JSON.stringify(event))
            .join("\n") + "\n",
      });
    }
    state.unexpectedRequests.push(`${method} ${path}`);
    return route.fulfill({ status: 404, json: { error: "Unexpected fixture request" } });
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("https://section-proposals.test/");
  const assistant = page.getByRole("complementary", { name: "Blog assistant" });
  const composer = assistant.getByRole("textbox", { name: "Message to assistant" });
  await expect(composer).toBeEnabled();
  async function send(message = "Improve these sections") {
    const proposals = assistant.getByRole("region", { name: state.proposals[0].title, exact: true });
    const previousCount = await proposals.count();
    await composer.fill(message);
    await assistant.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(proposals).toHaveCount(previousCount + 1);
    await expect(proposals.last()).toBeVisible();
  }
  return {
    state,
    assistant,
    composer,
    send,
    article: page.getByRole("textbox", { name: "Article body", exact: true }),
  };
}

test("section proposals toggle inline independently and apply insert, edit, and delete to their captured sections", async ({
  page,
}) => {
  const { state, assistant, composer, send, article } = await sectionProposalHarness(page);
  await send();
  const [insert, edit, remove] = sectionProposals.map((proposal) =>
    assistant.getByRole("region", { name: proposal.title, exact: true }),
  );
  for (const card of [insert, edit, remove]) {
    await expect(card.getByRole("button", { name: "Show change", exact: true })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(card.getByRole("button", { name: "Discard proposal", exact: true })).toBeEnabled();
  }
  await expect(insert.getByText("Confirm the amount and payment date before sending.", { exact: false })).toBeHidden();
  await expect(edit.getByText(revisedIntroduction, { exact: false })).toBeHidden();
  await expect(remove.getByText(obsoleteText, { exact: false })).toBeHidden();
  for (const [width, height] of [
    [1366, 768],
    [1280, 720],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(composer).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `/tmp/blog-section-proposals-collapsed-${width}.png` });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  const original = await article.textContent();
  await insert.getByRole("button", { name: "Show change", exact: true }).click();
  await expect(insert.getByText("Confirm the amount and payment date before sending.", { exact: false })).toBeVisible();
  await edit.getByRole("button", { name: "Show change", exact: true }).click();
  await expect(insert.getByRole("button", { name: "Hide", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(edit.getByText(revisedIntroduction, { exact: false })).toBeVisible();
  await expect(edit.getByText(introductionText, { exact: false })).toBeVisible();
  expect(await article.textContent()).toBe(original);
  await edit.getByRole("button", { name: "Hide", exact: true }).click();
  await insert.getByRole("button", { name: "Hide", exact: true }).click();
  for (const card of [insert, edit, remove]) {
    await card.getByRole("button", { name: "Show change", exact: true }).click();
    for (const [width, height] of [
      [1366, 768],
      [1280, 720],
    ]) {
      await page.setViewportSize({ width, height });
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByRole("button", { name: "Hide", exact: true })).toBeInViewport({ ratio: 1 });
      await page.screenshot({
        path: `/tmp/blog-section-proposal-${await card.getAttribute("aria-label")}-${width}.png`,
      });
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await card.getByRole("button", { name: "Hide", exact: true }).click();
  }
  // Move the cursor into an unrelated section: each action must still use its captured target.
  await article.getByText("Send the invoice and keep a digital copy.", { exact: true }).click();
  await insert.getByRole("button", { name: "Insert section", exact: true }).click();
  await expect(article.locator(":scope > *")).toHaveText([
    "Introduction",
    introductionText,
    "Resources",
    resourcesText,
    "Payment checklist",
    "Confirm the amount and payment date before sending.",
    "Paper copies",
    obsoleteText,
    "Next steps",
    "Send the invoice and keep a digital copy.",
  ]);
  await expect(insert.getByRole("button", { name: "Insert section", exact: true })).toHaveCount(0);
  await expect(insert.getByRole("button", { name: "Discard proposal", exact: true })).toHaveCount(0);
  await edit.getByRole("button", { name: "Apply edit", exact: true }).click();
  await expect(article).toContainText(revisedIntroduction);
  await expect(article).not.toContainText(introductionText);
  await expect(edit.getByRole("button", { name: "Apply edit", exact: true })).toHaveCount(0);
  await expect(edit.getByRole("button", { name: "Discard proposal", exact: true })).toHaveCount(0);
  await remove.getByRole("button", { name: "Delete section", exact: true }).click();
  await expect(article.locator(":scope > *")).toHaveText([
    "Introduction",
    revisedIntroduction,
    "Resources",
    resourcesText,
    "Payment checklist",
    "Confirm the amount and payment date before sending.",
    "Next steps",
    "Send the invoice and keep a digital copy.",
  ]);
  await expect(remove.getByRole("button", { name: "Delete section", exact: true })).toHaveCount(0);
  await expect(remove.getByRole("button", { name: "Discard proposal", exact: true })).toHaveCount(0);
  await remove.getByRole("button", { name: "Show change", exact: true }).click();
  await expect(remove.getByText(obsoleteText, { exact: false })).toBeVisible();
  await expect(composer).toBeVisible();
  expect(state.outcomePatches).toEqual([]);
  expect(state.unexpectedRequests).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("discard hides both actions, preserves the change preview, and never writes proposal outcomes", async ({
  page,
}) => {
  const { state, assistant, send, article } = await sectionProposalHarness(page);
  await send();
  const edit = assistant.getByRole("region", { name: sectionProposals[1].title, exact: true });
  const original = await article.textContent();
  await edit.getByRole("button", { name: "Discard proposal", exact: true }).click();
  await expect(edit.getByRole("button", { name: "Apply edit", exact: true })).toHaveCount(0);
  await expect(edit.getByRole("button", { name: "Discard proposal", exact: true })).toHaveCount(0);
  await expect(edit).toContainText(sectionProposals[1].title);
  await edit.getByRole("button", { name: "Show change", exact: true }).click();
  await expect(edit.getByText(revisedIntroduction, { exact: false })).toBeVisible();
  expect(await article.textContent()).toBe(original);
  // Dismissing one suggestion does not dismiss another suggestion in the same response.
  await expect(assistant.getByRole("button", { name: "Insert section", exact: true })).toBeEnabled();
  await expect(assistant.getByRole("button", { name: "Delete section", exact: true })).toBeEnabled();
  expect(state.outcomePatches).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("loaded conversation history and page reload keep previews but never restore proposal actions", async ({
  page,
}) => {
  const { state, assistant, send } = await sectionProposalHarness(page);
  await send();
  await expect(assistant.getByRole("button", { name: "Apply edit", exact: true })).toBeEnabled();
  async function chooseThread(name: string) {
    await assistant.getByRole("button", { name: "History", exact: true }).click();
    await assistant
      .getByRole("region", { name: "Conversation history" })
      .getByRole("button", { name: new RegExp(name) })
      .click();
  }
  await chooseThread("Other conversation");
  await chooseThread("Section suggestions");
  await expect(assistant.getByRole("button", { name: "Apply edit", exact: true })).toHaveCount(0);
  await expect(assistant.getByRole("button", { name: "Insert section", exact: true })).toHaveCount(0);
  await expect(assistant.getByRole("button", { name: "Delete section", exact: true })).toHaveCount(0);
  await expect(assistant.getByRole("button", { name: "Discard proposal", exact: true })).toHaveCount(0);
  const edit = assistant.getByRole("region", { name: sectionProposals[1].title, exact: true });
  await edit.getByRole("button", { name: "Show change", exact: true }).click();
  await expect(edit.getByText(revisedIntroduction, { exact: false })).toBeVisible();
  await page.reload();
  await expect(edit).toBeVisible();
  await expect(assistant.getByRole("button", { name: "Discard proposal", exact: true })).toHaveCount(0);
  await expect(assistant.getByRole("button", { name: "Apply edit", exact: true })).toHaveCount(0);
  await edit.getByRole("button", { name: "Show change", exact: true }).click();
  await expect(edit.getByText(revisedIntroduction, { exact: false })).toBeVisible();
  await send("Suggest those improvements again");
  await expect(assistant.getByRole("button", { name: "Apply edit", exact: true })).toHaveCount(1);
  await expect(assistant.getByRole("button", { name: "Discard proposal", exact: true })).toHaveCount(3);
  expect(state.outcomePatches).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("changed proposal targets remain untouched and a new request can recover", async ({ page }) => {
  const { state, assistant, send, article } = await sectionProposalHarness(page);
  state.proposals = [sectionProposals[1]];
  await send();
  const changedIntroduction = "The writer has already revised this introduction.";
  await article.locator("p").first().fill(changedIntroduction);
  const edit = assistant.getByRole("region", { name: sectionProposals[1].title, exact: true }).first();
  const apply = edit.getByRole("button", { name: "Apply edit", exact: true });
  // Disabled controls or an explanatory error on activation are both safe recovery paths.
  if (await apply.isEnabled()) await apply.click();
  await expect(article).toContainText(changedIntroduction);
  await expect(article).not.toContainText(revisedIntroduction);
  await expect(
    page
      .getByText(/changed|new suggestion|fresh suggestion|ask again/i)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  state.proposals = [
    { ...sectionProposals[1], toolCallId: "recovered-edit", originalText: `Introduction\n${changedIntroduction}` },
  ];
  await send("Please update the revised introduction");
  const recovered = assistant.getByRole("region", { name: sectionProposals[1].title, exact: true }).last();
  await recovered.getByRole("button", { name: "Apply edit", exact: true }).click();
  await expect(article).toContainText(revisedIntroduction);
  await expect(recovered.getByRole("button", { name: "Apply edit", exact: true })).toHaveCount(0);
  expect(state.outcomePatches).toEqual([]);
  expect(state.errors).toEqual([]);
});

async function historyStateHarness(page: import("@playwright/test").Page, cached = false) {
  page.on("pageerror", (error) => console.log("HISTORY HARNESS ERROR", error.message));
  await page.addInitScript(() => {
    Object.assign(window, { process: { env: { NODE_ENV: "production" } } });
  });
  const config = {
    enabled: true,
    provider: "fixture",
    capabilities: { images: true, webSearch: true, structuredOutput: true, urlRetrieval: false },
  };
  const now = new Date().toISOString();
  const thread = {
    id: "history-thread",
    postId: "post",
    title: "Invoice ideas",
    settings: {},
    composerDraft: "",
    createdAt: now,
    updatedAt: now,
  };
  const state = { fail: !cached, hold: false, failDetail: cached, threads: cached ? [thread] : [], release: () => {} };
  await page.route("https://chat-harness.test/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: html });
    if (path === "/api/admin/blog/ai") return route.fulfill({ json: config });
    if (path === "/api/admin/blog/post/threads") {
      if (request.method() === "POST") {
        state.threads = [thread];
        state.failDetail = false;
        return route.fulfill({ json: { thread } });
      }
      if (state.hold)
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
      return state.fail
        ? route.fulfill({ status: 503, json: { error: "History temporarily unavailable" } })
        : route.fulfill({ json: { threads: state.threads } });
    }
    if (path.endsWith("/history-thread")) {
      if (state.failDetail) return route.fulfill({ status: 503, json: { error: "Conversation unavailable" } });
      return route.fulfill({ json: { ...config, thread, runs: [], messages: [], attachments: [] } });
    }
    return route.fulfill({ status: 404, json: { error: "Unexpected fixture request" } });
  });
  await page.goto("https://chat-harness.test/");
  return state;
}

test("history failure retries through loading to the designed empty state and starts a thread", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const state = await historyStateHarness(page);
  await page.getByRole("button", { name: "History", exact: true }).click();
  const history = page.getByRole("region", { name: "Conversation history" });
  await expect(history.getByText("Couldn’t load history", { exact: true })).toBeVisible();
  await expect(history.getByText("No conversations yet", { exact: true })).toHaveCount(0);
  await expect(history.getByRole("button", { name: "Back to chat" })).toHaveCount(0);
  for (const [width, height] of [
    [1366, 768],
    [1280, 720],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `/tmp/blog-history-error-${width}.png` });
  }
  state.hold = true;
  await history.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(history.getByText("Loading conversations…", { exact: true })).toBeVisible();
  await expect(history.getByText("No conversations yet", { exact: true })).toHaveCount(0);
  state.fail = false;
  state.hold = false;
  state.release();
  await expect(history.getByText("No conversations yet", { exact: true })).toBeVisible();
  await expect(history.getByText("Couldn’t load history", { exact: true })).toHaveCount(0);
  await expect(history.getByText("Recent conversations", { exact: true })).toHaveCount(0);
  for (const [width, height] of [
    [1366, 768],
    [1280, 720],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `/tmp/blog-history-empty-${width}.png` });
    console.log(
      "HISTORY STATE GEOMETRY",
      await history.locator('[data-slot="empty"]').evaluate((node) => {
        const title = getComputedStyle(node.querySelector('[data-slot="empty-title"]')!);
        const button = getComputedStyle(node.querySelector("button")!);
        return {
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
          titleFont: title.fontFamily,
          titleWeight: title.fontWeight,
          titleSize: title.fontSize,
          buttonSize: button.fontSize,
        };
      }),
    );
  }
  await history.getByRole("button", { name: "New thread", exact: true }).click();
  await expect(history).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message to assistant" })).toBeFocused();
});

test("a failed history refresh keeps cached conversations instead of showing empty or error cards", async ({
  page,
}) => {
  const state = await historyStateHarness(page, true);
  await expect(page.getByText("Conversation unavailable", { exact: true })).toBeVisible();
  state.fail = true;
  await page.getByRole("button", { name: "Refresh history", exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const history = page.getByRole("region", { name: "Conversation history" });
  await expect(history.getByRole("button", { name: /Invoice ideas/ })).toBeVisible();
  await expect(history.getByText("No conversations yet", { exact: true })).toHaveCount(0);
  await expect(history.getByText("Couldn’t load history", { exact: true })).toHaveCount(0);
  await expect(
    page.locator('[data-slot="toast-title"]').filter({ hasText: "History temporarily unavailable" }),
  ).toBeVisible();
});

for (const scenario of [
  { tab: "Review", operation: "review", idle: "Analyze with AI", completed: "Analyze again", otherTab: "Sources" },
  { tab: "Sources", operation: "check_sources", idle: "Check sources", completed: "Check sources", otherTab: "Review" },
]) {
  test(`${scenario.tab} primary action stops its stream and resets after cancellation or completion`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.addInitScript(() => {
      const now = new Date().toISOString();
      const config = {
        enabled: true,
        provider: "fixture",
        capabilities: { images: true, structuredOutput: true, webSearch: true, urlRetrieval: false },
      };
      const thread = {
        id: "action-thread",
        postId: "post",
        title: "Draft review",
        type: "chat",
        settings: {},
        composerDraft: "",
        createdAt: now,
        updatedAt: now,
      };
      const runs: Record<string, unknown>[] = [];
      const fixture = { starts: 0, aborts: 0, operation: "", complete: () => {} };
      Object.assign(window, { actionFixture: fixture, process: { env: { NODE_ENV: "production" } } });
      window.fetch = async (input, options) => {
        const url = String(input);
        const body = typeof options?.body === "string" ? JSON.parse(options.body) : {};
        if (url === "/api/admin/blog/ai") return Response.json(config);
        if (url.endsWith("/threads"))
          return Response.json(options?.method === "POST" ? { thread } : { threads: [thread] });
        if (url.endsWith("/action-thread")) {
          if (options?.method === "PATCH") return Response.json({ thread: Object.assign(thread, body) });
          return Response.json({ ...config, thread, runs, messages: [], attachments: [] });
        }
        if (url === "/api/admin/blog/ai/runs") {
          fixture.starts++;
          fixture.operation = body.operation;
          const run = {
            id: `action-${fixture.starts}`,
            threadId: thread.id,
            postId: "post",
            operation: body.operation,
            status: "running",
            provider: "fixture",
            model: "fixture",
            inputMessageId: null,
            assistantMessageId: null,
            request: body,
            response: null as Record<string, unknown> | null,
            errorMessage: null,
            createdAt: now,
            updatedAt: now,
            completedAt: null as string | null,
          };
          runs.push(run);
          return new Response(
            new ReadableStream({
              start(controller) {
                const emit = (event: unknown) =>
                  controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
                emit({ type: "run", run });
                fixture.complete = () => {
                  run.status = "completed";
                  run.completedAt = now;
                  run.response = {
                    text: "Draft checked.",
                    keywords: [],
                    findings: [],
                    citations: [],
                    proposals: [],
                    searchStatus: "completed",
                  };
                  emit({ type: "completed", run });
                  controller.close();
                };
                options?.signal?.addEventListener(
                  "abort",
                  () => {
                    fixture.aborts++;
                    run.status = "cancelled";
                    controller.error(new DOMException("Aborted", "AbortError"));
                  },
                  { once: true },
                );
              },
            }),
            { headers: { "Content-Type": "application/x-ndjson" } },
          );
        }
        throw new Error(`Unexpected fixture request: ${url}`);
      };
    });
    await page.route("https://chat-actions-harness.test/", (route) =>
      route.fulfill({ contentType: "text/html", body: html }),
    );
    await page.goto("https://chat-actions-harness.test/");
    const assistant = page.getByRole("complementary", { name: "Blog assistant" });
    await assistant.getByRole("tab", { name: scenario.tab, exact: true }).click();
    await assistant.getByRole("button", { name: scenario.idle, exact: true }).click();
    const stop = assistant.getByRole("button", { name: "Stop request", exact: true });
    await expect(stop).toHaveCount(1);
    await expect(stop).toBeEnabled();
    await expect(stop).toHaveAttribute("aria-busy", "true");
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { actionFixture: { operation: string } }).actionFixture.operation),
      )
      .toBe(scenario.operation);
    await page.screenshot({ path: `/tmp/blog-${scenario.operation}-primary-busy.png` });
    await assistant.getByRole("tab", { name: scenario.otherTab, exact: true }).click();
    await expect(stop).toHaveCount(1);
    await expect(stop).toBeEnabled();
    await stop.click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { actionFixture: { aborts: number } }).actionFixture.aborts),
      )
      .toBe(1);
    await expect(stop).toHaveCount(0);
    await assistant.getByRole("tab", { name: scenario.tab, exact: true }).click();
    await assistant.getByRole("button", { name: scenario.idle, exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { actionFixture: { starts: number } }).actionFixture.starts),
      )
      .toBe(2);
    await page.evaluate(() => (window as unknown as { actionFixture: { complete(): void } }).actionFixture.complete());
    const again = assistant.getByRole("button", { name: scenario.completed, exact: true });
    await expect(again).toBeEnabled();
    await expect(again).toHaveAttribute("aria-busy", "false");
    await expect(stop).toHaveCount(0);
    await again.click();
    await expect(stop).toHaveCount(1);
    await stop.click();
    await expect(again).toBeEnabled();
  });
}
