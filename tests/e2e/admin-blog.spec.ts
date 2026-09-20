import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";
import { AuthPage } from "./pages/AuthPage";

async function createPost(page: Page, baseURL: string | undefined, title: string) {
  await new AuthPage(page).signIn(E2E_ACCOUNTS.admin.email, E2E_PASSWORD, new URL("/admin/blog", baseURL).href);
  await page.getByRole("link", { name: "New post", exact: true }).click();
  const titleField = page.getByRole("textbox", { name: "TITLE", exact: true });
  await titleField.fill(title);
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await titleField.press("Enter");
  await expect(page).toHaveURL(/\/admin\/blog\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("textbox", { name: "Article body", exact: true })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  return page.url();
}

async function trashPost(page: Page, title: string) {
  await page.goto(`/admin/blog?${new URLSearchParams({ search: title })}`);
  await page.getByRole("button", { name: `Move to trash: ${title}`, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to trash", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
}

test("recovery toast waits for a choice and preserves both draft recovery actions", async ({ page, baseURL }) => {
  const title = `E2E Recovery ${randomUUID()}`;
  await createPost(page, baseURL, title);
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  const recover = page.getByRole("button", { name: "Recover local draft", exact: true });
  const keep = page.getByRole("button", { name: "Keep saved draft", exact: true });
  try {
    await body.fill("Recover this local edit.");
    await page.reload();
    await expect(recover).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
    await recover.focus();
    await page.keyboard.press("Escape");
    await expect(recover).toBeVisible();
    await expect(page.getByRole("button", { name: "Close toast", exact: true })).toHaveCount(0);
    await recover.click();
    await expect(body).toHaveText("Recover this local edit.");
    await expect(recover).toBeHidden();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("All changes saved");
    await body.fill("Discard only this local edit.");
    await page.reload();
    await expect(keep).toBeVisible();
    await keep.click();
    await expect(body).toHaveText("Recover this local edit.");
    await expect(keep).toBeHidden();
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();
  } finally {
    await trashPost(page, title);
  }
});

test("post actions support keyboard navigation without closing the assistant or changing the draft", async ({
  page,
  baseURL,
}) => {
  const title = `E2E Toolbar ${randomUUID()}`;
  const url = await createPost(page, baseURL, title);
  try {
    const body = page.getByRole("textbox", { name: "Article body", exact: true });
    await body.fill("Keep this draft while inspecting post actions.");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("All changes saved");
    await page.getByRole("button", { name: "Assistant", exact: true }).click();
    const trigger = page.getByRole("button", { name: "Preview and post actions", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Preview draft", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Duplicate", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.getByRole("complementary", { name: "Assistant", exact: true })).toBeVisible();
    await expect(body).toHaveText("Keep this draft while inspecting post actions.");
    await expect(page).toHaveURL(url);
  } finally {
    await trashPost(page, title);
  }
});

test("raw Markdown paste becomes editable article content and survives saving", async ({ page, baseURL }) => {
  const title = `E2E Markdown ${randomUUID()}`;
  await createPost(page, baseURL, title);
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  const markdown =
    "# Section\n\n**Bold** and *italic*\n\n- First\n- Second\n\n- [x] Done\n\n```js\nconst n = 1;\n```\n\n| Name | Value |\n| --- | --- |\n| A | B |";
  const paste = () =>
    body.evaluate((element, text) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
    }, markdown);
  await body.click();
  await paste();
  await expect(body.locator("h2")).toHaveText("Section");
  await body.press("ControlOrMeta+z");
  await expect(body).toHaveText("");
  await paste();
  const checkbox = body.getByRole("checkbox", { name: "Mark item complete" }).last();
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
  await checkbox.press("Space");
  await expect(checkbox).toBeChecked();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await page.reload();
  await expect(body.locator("h2")).toHaveText("Section");
  await expect(body.locator("strong")).toHaveText("Bold");
  await expect(body.locator("em")).toHaveText("italic");
  await expect(body.getByRole("checkbox", { name: "Mark item complete" }).last()).toBeChecked();
  await expect(body.locator("pre code")).toHaveText("const n = 1;");
  await expect(body.locator("th").first()).toHaveText("Name");
  await trashPost(page, title);
});

test("a saved article survives reload, previews privately, and guards unsaved navigation", async ({
  page,
  baseURL,
}) => {
  const title = `E2E Blog ${randomUUID()}`;
  const url = await createPost(page, baseURL, title);
  await page.getByRole("button", { name: "Post settings", exact: true }).click();
  await page.getByRole("textbox", { name: "Public byline", exact: true }).fill("E2E Editorial Team");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Post settings", exact: true })).toBeFocused();
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await body.fill("A persisted article body.");
  await body.selectText();
  const toolbar = page.getByRole("toolbar", { name: "Article formatting" });
  if (!(await toolbar.getByRole("button", { name: "Highlight text", exact: true }).isVisible())) {
    await toolbar.getByRole("button", { name: "More formatting", exact: true }).click();
  }
  await toolbar.getByRole("button", { name: "Highlight text", exact: true }).click();
  await toolbar.getByRole("button", { name: "Align center", exact: true }).click();
  await page.getByRole("button", { name: "Add a block", exact: true }).click();
  await page.getByRole("button", { name: "Insert table", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Article body", exact: true })).toContainText(
    "A persisted article body.",
  );
  await expect(page.getByRole("table")).toBeVisible();
  await expect(body.locator("mark")).toHaveText("A persisted article body.");
  await expect(body.locator("p").first()).toHaveCSS("text-align", "center");
  await page.getByRole("button", { name: "Preview and post actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Preview draft", exact: true }).click();
  await expect(page).toHaveURL(`${url}/preview`);
  await expect(page.getByText("A persisted article body.", { exact: true })).toBeVisible();
  await expect(page.getByText(/E2E Editorial Team/)).toBeVisible();
  await page.getByRole("link", { name: "Back to editor", exact: false }).click();
  await page.getByRole("textbox", { name: "TITLE", exact: true }).fill(`${title} unsaved`);
  await page.getByRole("link", { name: "Back to posts", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Leave unsaved changes?");
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("textbox", { name: "TITLE", exact: true })).toHaveValue(`${title} unsaved`);
  await page.getByRole("link", { name: "Back to posts", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/blog$/);
  await trashPost(page, title);
});

test("concurrent saves keep the second editor's work and offer a downloadable recovery copy", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Concurrent editing runs once.");
  const title = `E2E Conflict ${randomUUID()}`;
  const url = await createPost(page, baseURL, title);
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByRole("textbox", { name: "Article body", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Article body", exact: true }).fill("The first editor's saved work.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await other.getByRole("textbox", { name: "Article body", exact: true }).fill("The second editor's local work.");
  await other.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(other.getByRole("button", { name: "Download local draft", exact: true })).toBeVisible();
  await expect(other.getByRole("textbox", { name: "Article body", exact: true })).toHaveText(
    "The second editor's local work.",
  );
  await other.getByRole("button", { name: "Preview and post actions", exact: true }).click();
  await expect(other.getByRole("menuitem", { name: "Preview draft", exact: true })).toBeDisabled();
  await other.keyboard.press("Escape");
  const download = other.waitForEvent("download");
  await other.getByRole("button", { name: "Download local draft", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/-draft\.json$/);
  await other.close();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Article body", exact: true })).toHaveText(
    "The first editor's saved work.",
  );
  await trashPost(page, title);
});
