import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";
import type { Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/auth?returnTo=/admin/blog");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(E2E_ACCOUNTS.admin.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/blog$/);
}

test("article outline follows live headings and scrolls only the article", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const title = `E2E Outline ${randomUUID()}`;
  await signIn(page);
  const availability = page.waitForResponse((response) => response.url().endsWith("/api/admin/blog/ai"));
  await page.getByRole("link", { name: "New post", exact: true }).first().click();
  await availability;
  const titleField = page.getByRole("textbox", { name: "TITLE", exact: true });
  await titleField.fill(title);
  await titleField.press("Enter");
  await expect(page).toHaveURL(/\/admin\/blog\/[0-9a-f-]{36}$/, { timeout: 15000 });

  try {
    const body = page.getByRole("textbox", { name: "Article body", exact: true });
    const trigger = page.getByRole("button", { name: "Article outline", exact: true });
    const outline = page.getByRole("navigation", { name: "Article sections" });
    await expect(body).toBeVisible();
    await expect(trigger).toBeHidden();

    const filler = Array.from(
      { length: 18 },
      (_, index) => `Paragraph ${index + 1}. ${"Article content. ".repeat(20)}`,
    ).join("\n\n");
    const markdown = `## Repeated section\n\n${filler}\n\n### Nested section\n\nText.\n\n## Repeated section\n\n${filler}`;
    await body.click();
    await body.evaluate((element, text) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
    }, markdown);
    await expect(body.locator("h2")).toHaveCount(2);
    await expect(body.locator("h3")).toHaveText("Nested section");

    await trigger.hover();
    await expect(outline).toBeVisible();
    await expect(outline.getByRole("button", { name: "Repeated section", exact: true })).toHaveCount(2);
    await expect(outline.getByRole("button", { name: title, exact: true })).toBeVisible();
    await trigger.click();
    await page.screenshot({ path: "/tmp/blog-full-outline-1366.png" });
    await page.getByRole("heading", { name: title, exact: true }).hover();
    await expect(outline).toBeVisible();

    const outerScroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    await outline.getByRole("button", { name: "Repeated section", exact: true }).last().click();
    await expect(outline).toBeHidden();
    await expect(trigger).toBeFocused();
    const article = page.locator("[data-blog-editor-scroll]");
    await expect.poll(() => article.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(outerScroll);

    await trigger.click();
    await expect(outline.getByRole("button", { name: "Repeated section", exact: true }).last()).toHaveAttribute(
      "aria-current",
      "location",
    );
    await page.keyboard.press("Escape");
    await expect(outline).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await outline.getByRole("button", { name: title, exact: true }).click();
    await expect.poll(() => article.evaluate((element) => element.scrollTop)).toBe(0);
    await body.click();
    await body.press("ControlOrMeta+z");
    await expect(body.locator("h2")).toHaveCount(0);
    await expect(trigger).toBeHidden();
    await body.press("ControlOrMeta+Shift+z");
    await expect(body.locator("h2")).toHaveCount(2);
    await expect(trigger).toBeVisible();

    await body.focus();
    await body
      .locator("h2")
      .first()
      .evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      });
    await page.keyboard.insertText("Updated section");
    await trigger.click();
    await expect(outline.getByRole("button", { name: "Updated section", exact: true })).toBeVisible();
    await expect(outline.getByRole("button", { name: "Repeated section", exact: true })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  } finally {
    await page.goto(`/admin/blog?${new URLSearchParams({ search: title })}`);
    await page.getByRole("button", { name: `Move to trash: ${title}`, exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Move to trash", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
  }
});

test("selection tools format text and prepare an improvement without changing the article", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.route("**/api/admin/blog/ai", (route) =>
    route.fulfill({
      json: {
        enabled: false,
        provider: "openai",
        capabilities: { images: false, webSearch: false },
        reason: "AI assistance is not configured.",
      },
    }),
  );
  const title = `E2E Selection ${randomUUID()}`;
  await signIn(page);
  const availability = page.waitForResponse((response) => response.url().endsWith("/api/admin/blog/ai"));
  await page.getByRole("link", { name: "New post", exact: true }).first().click();
  await availability;
  await page.getByRole("textbox", { name: "TITLE", exact: true }).fill(title);
  await page.getByRole("textbox", { name: "TITLE", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/admin\/blog\/[0-9a-f-]{36}$/, { timeout: 15000 });
  try {
    const body = page.getByRole("textbox", { name: "Article body", exact: true });
    const text = "A clear introduction helps readers understand the article.";
    await body.fill(text);
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
    const toolbar = page.getByRole("toolbar", { name: "Selected text formatting" });
    await expect(toolbar).toBeVisible();
    await page.screenshot({ path: "/tmp/blog-full-selection-1366.png" });
    await body.press("Alt+F10");
    await expect(toolbar.getByRole("button", { name: "Improve selected text", exact: true })).toBeFocused();
    await toolbar.getByRole("button", { name: "Bold", exact: true }).click();
    await expect(body.locator("strong")).toHaveText(text);
    await body.press("ControlOrMeta+z");
    await expect(body.locator("strong")).toHaveCount(0);
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
    await toolbar.getByRole("button", { name: "Improve selected text", exact: true }).click();
    await page.route("**/api/admin/blog/ai/runs", (route) =>
      route.fulfill({ status: 503, json: { error: "AI assistance is not configured." } }),
    );
    await page.getByRole("menuitem", { name: "Simplify text", exact: true }).click();
    const inline = page.getByRole("dialog", { name: "Improve selected text", exact: true });
    await expect(inline.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await expect(body).toHaveText(text);
    const assistant = page.getByRole("complementary", { name: "Blog assistant" });
    await expect(assistant).toBeHidden();
    await inline.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Assistant", exact: true }).click();
    const message = assistant.getByRole("textbox", { name: "Message to assistant" });
    await message.fill("Keep this request while I check the settings.");
    await page.getByRole("button", { name: "Post settings", exact: true }).click();
    await page.getByRole("button", { name: "Assistant", exact: true }).click();
    await expect(message).toHaveValue("Keep this request while I check the settings.");
    await page.getByRole("button", { name: "Close assistant", exact: true }).click();
    await expect(page.getByRole("button", { name: "Assistant", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  } finally {
    await page.goto(`/admin/blog?${new URLSearchParams({ search: title })}`);
    await page.getByRole("button", { name: `Move to trash: ${title}`, exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Move to trash", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
  }
});
