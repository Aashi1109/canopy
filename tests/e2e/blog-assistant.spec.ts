import { test, expect as baseExpect } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";

const expect = baseExpect.configure({ timeout: 15_000 });

test("generated draft, private conversations, proposals, review and sources work together", async ({ page }) => {
  test.skip(process.env.BLOG_AI_E2E_FIXTURE !== "1", "Requires a disposable database and mocked provider server.");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/auth?returnTo=/admin/blog/new");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(E2E_ACCOUNTS.admin.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/blog\/new$/);
  await page.getByRole("button", { name: "Generate with AI", exact: true }).click();
  await page
    .getByLabel("What would you like to write about?")
    .fill("A practical guide to organizing freelance projects.");
  await expect(page.getByRole("button", { name: "Generate blog", exact: true })).toBeEnabled();
  await page.screenshot({ path: "/tmp/blog-full-generation-1366.png" });
  await page.getByRole("button", { name: "Generate blog", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/blog\/[a-f0-9-]+\?review=1/);
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  const assistant = page.getByRole("complementary", { name: "Blog assistant" });
  await expect(assistant.getByRole("tab", { name: "Review", exact: true })).toHaveAttribute("data-state", "active");
  await expect(body).toContainText("Start with a clear outcome");
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await expect(assistant).toContainText("freelance projects");
  await expect(assistant.getByRole("button", { name: "Analyze with AI", exact: true })).toBeEnabled();
  await page.screenshot({ path: "/tmp/blog-full-generated-1366.png" });
  await assistant.getByRole("tab", { name: "Chat", exact: true }).click();
  const settingsButton = assistant.getByRole("button", { name: "Assistant settings", exact: true });
  const historyButton = assistant.getByRole("button", { name: "History", exact: true });
  const history = assistant.getByRole("region", { name: "Conversation history" });
  async function openSettings() {
    await settingsButton.click();
    await expect(page.getByText("For your next message", { exact: true })).toBeVisible();
  }
  async function closeSettings() {
    await page.keyboard.press("Escape");
    await expect(page.getByText("For your next message", { exact: true })).toBeHidden();
  }
  async function chooseThread(name: string) {
    await historyButton.click();
    await expect(history).toBeVisible();
    await history
      .getByRole("button")
      .filter({ has: page.getByText(name, { exact: true }) })
      .click();
    await expect(history).toBeHidden();
  }
  await historyButton.click();
  const initialThread = (await history.locator('button[aria-current="true"] > span').first().textContent())!;
  await assistant.getByRole("button", { name: "Back to chat", exact: true }).click();
  await assistant.getByRole("button", { name: "New thread", exact: true }).click();
  await expect(assistant.getByRole("heading", { name: "What should we work on?", exact: true })).toBeVisible();
  await assistant.getByRole("button", { name: "Plan & write", exact: true }).click();
  await expect(assistant.getByRole("textbox", { name: "Message to assistant" })).toBeFocused();
  await expect(assistant.getByRole("textbox", { name: "Message to assistant" })).toHaveValue("Help me plan and write ");
  await assistant.getByRole("button", { name: "Remove draft context", exact: true }).click();
  await expect(assistant.getByRole("button", { name: "Audit the whole blog", exact: true })).toBeDisabled();
  await openSettings();
  await page.getByRole("switch", { name: "Include current draft", exact: true }).click();
  await closeSettings();
  await expect(assistant.getByRole("button", { name: "Remove draft context", exact: true })).toBeVisible();
  await assistant.getByRole("textbox", { name: "Message to assistant" }).fill("");
  await page.getByRole("heading", { name: "A practical guide to freelance projects", exact: true }).click();
  await page.screenshot({ path: "/tmp/blog-assistant-empty-1366.png" });
  await assistant.screenshot({ path: "/tmp/blog-assistant-empty-aside-1366.png" });
  async function logGeometry(viewport: string) {
    console.log(
      `Assistant geometry ${viewport}`,
      JSON.stringify(
        await assistant.evaluate((aside) => {
          const rect = (element: Element | null | undefined) => {
            if (!element) return null;
            const { x, y, width, height } = element.getBoundingClientRect();
            return { x, y, width, height };
          };
          const textarea =
            aside.querySelector('textarea[aria-label="Message to assistant"]') ??
            aside.querySelector("#blog-assistant-message");
          const heading = aside.querySelector("h2");
          return {
            aside: rect(aside),
            title: rect(heading),
            header: rect(heading?.parentElement),
            tabs: rect(aside.querySelector('[role="tablist"]')),
            tabTriggers: Array.from(aside.querySelectorAll('[role="tab"]')).map((element) => ({
              name: element.textContent,
              ...rect(element),
            })),
            scope: rect(
              Array.from(aside.querySelectorAll("p")).find((element) => element.textContent?.startsWith("WHOLE BLOG")),
            ),
            composer: rect(textarea?.parentElement),
            textarea: rect(textarea),
            attach: rect(aside.querySelector('[aria-label="Attach files or links"]')),
            settings: rect(aside.querySelector('[aria-label="Assistant settings"]')),
            send: rect(aside.querySelector('[aria-label="Send message"]')),
          };
        }),
      ),
    );
  }
  await logGeometry("1366x768");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: "/tmp/blog-assistant-empty-1280.png" });
  await assistant.screenshot({ path: "/tmp/blog-assistant-empty-aside-1280.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/blog-assistant-empty-mobile.png" });
  await assistant.screenshot({ path: "/tmp/blog-assistant-empty-aside-mobile.png" });
  await logGeometry("390x844");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openSettings();
  await page.screenshot({ path: "/tmp/blog-assistant-settings-1366.png" });
  await closeSettings();
  await assistant.getByRole("button", { name: "Attach files or links", exact: true }).click();
  await page.screenshot({ path: "/tmp/blog-assistant-attachments-1366.png" });
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  await page.getByRole("textbox", { name: "URL", exact: true }).fill("https://www.pmi.org/learning/library");
  await page.screenshot({ path: "/tmp/blog-assistant-links-1366.png" });
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  const composer = assistant.getByRole("textbox", { name: "Message to assistant" });
  await composer.fill("What should I work on first?");
  await assistant.getByRole("button", { name: "Remove draft context", exact: true }).click();
  const contextlessRequest = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/api/admin/blog/ai/runs"),
  );
  await assistant.getByRole("button", { name: "Send message", exact: true }).click();
  expect((await contextlessRequest).postDataJSON().editorJson).toEqual({
    type: "doc",
    content: [{ type: "paragraph" }],
  });
  await chooseThread(initialThread);
  await expect(assistant).not.toContainText("What should I work on first?");
  await chooseThread("What should I work on first?");
  await expect(assistant).toContainText("Start with one clear outcome");
  const namedThread = "What should I work on first?";
  await page.screenshot({ path: "/tmp/blog-assistant-conversation-1366.png" });
  await composer.fill("Keep this unsent message.");
  await chooseThread(initialThread);
  await chooseThread(namedThread);
  await expect(composer).toHaveValue("Keep this unsent message.");
  await assistant.getByRole("button", { name: "Attach files or links", exact: true }).click();
  const choosingFile = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  await (
    await choosingFile
  ).setFiles({
    name: "reference.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(assistant.getByRole("button", { name: /^reference\.png/ })).toHaveAttribute("aria-pressed", "true");
  await chooseThread(initialThread);
  await expect(assistant.getByRole("button", { name: /^reference\.png/ })).toHaveCount(0);
  await chooseThread(namedThread);
  await assistant.getByRole("button", { name: "Remove attachment reference.png", exact: true }).click();
  await expect(assistant.getByRole("button", { name: /^reference\.png/ })).toHaveCount(0);
  await composer.fill("Cancel this request before completion.");
  await assistant.getByRole("button", { name: "Send message", exact: true }).click();
  await assistant.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(assistant).toContainText("Request stopped in this tab");
  await assistant.getByRole("button", { name: "Refresh history", exact: true }).click();
  await expect(assistant.getByRole("status").filter({ hasText: "Request stopped" })).toBeVisible();
  await expect(assistant.getByRole("button", { name: "Try again", exact: true })).toBeEnabled();
  await page.screenshot({ path: "/tmp/blog-full-cancelled-1366.png" });
  const original = await body.textContent();
  await body
    .locator("p")
    .first()
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      (element.closest('[contenteditable="true"]') as HTMLElement).focus();
    });
  await page.keyboard.press("Alt+F10");
  const toolbar = page.getByRole("toolbar", { name: "Selected text formatting" });
  await toolbar.getByRole("button", { name: "Improve selected text" }).click();
  const inlineRequest = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/api/admin/blog/ai/runs"),
  );
  await page.getByRole("menuitem", { name: "Simplify text", exact: true }).click();
  const inlinePayload = (await inlineRequest).postDataJSON();
  expect(inlinePayload).not.toHaveProperty("threadId");
  expect(inlinePayload).not.toHaveProperty("document");
  expect(inlinePayload).not.toHaveProperty("version");
  expect(inlinePayload).not.toHaveProperty("selection");
  expect(inlinePayload.selectedText).toBeTruthy();
  const inline = page.getByRole("dialog", { name: "Improve selected text", exact: true });
  await expect(inline.getByRole("button", { name: "Accept", exact: true })).toBeEnabled();
  expect(await body.textContent()).toBe(original);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(inline.getByRole("button", { name: "Accept", exact: true })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: "/tmp/blog-full-proposal-1280.png" });
  await inline.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(body).toContainText("Begin with a clear goal and specific deliverables.");
  await body.press("ControlOrMeta+z");
  await expect(body).toHaveText(original ?? "");
  await assistant.getByRole("tab", { name: "Review", exact: true }).click();
  await assistant.getByLabel("Target keyword (optional)").fill("project");
  await assistant.getByRole("button", { name: "Analyze with AI", exact: true }).click();
  await assistant.getByRole("button", { name: "Show full change", exact: true }).click();
  await expect(assistant.getByRole("button", { name: "Apply title", exact: true })).toBeEnabled();
  await assistant.getByRole("button", { name: "Apply title", exact: true }).click();
  await assistant.getByRole("button", { name: "Apply description", exact: true }).click();
  await page.screenshot({ path: "/tmp/blog-full-review-1280.png" });
  await assistant.getByRole("tab", { name: "Sources", exact: true }).click();
  await assistant.getByRole("button", { name: "Check sources", exact: true }).click();
  await expect(assistant.getByRole("link", { name: "Project Management Institute", exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/blog-full-sources-1280.png" });
  const closeToast = page.getByRole("button", { name: "Close toast", exact: true });
  while (await closeToast.count()) await closeToast.first().click();
  await expect(page.locator('[data-slot="toast"]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/blog-full-assistant-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await page.screenshot({ path: "/tmp/blog-full-write-mobile.png" });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
});
