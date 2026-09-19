import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

const PREVIEW = 'iframe[title="Generated HTML preview"]';
const DESTINATION = "https://markdown-links.test";

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Markdown document", exact: true });
}

function preview(page: Page) {
  return page.frameLocator(PREVIEW);
}

async function loadDocument(page: Page, markdown: string) {
  await page.goto("/devtools/markdown-previewer");
  await expect(page.getByRole("button", { name: "Paste into Markdown document", exact: true })).toBeEnabled();
  await editor(page).fill(markdown);
  await expect(preview(page).getByRole("heading", { name: "Link preview", exact: true })).toBeVisible();
}

async function expectSeparateTab(
  page: Page,
  context: BrowserContext,
  link: Locator,
  path: string,
  activate: (link: Locator) => Promise<void> = (target) => target.click(),
) {
  const workspaceUrl = page.url();
  const opened = context.waitForEvent("page", { timeout: 10_000 });
  await activate(link);
  const destination = await opened;
  await expect(destination).toHaveURL(`${DESTINATION}${path}`);
  await destination.waitForLoadState("domcontentloaded");
  expect(await destination.evaluate(() => window.opener === null)).toBe(true);
  await destination.close();
  await expect(page).toHaveURL(workspaceUrl);
  await expect(preview(page).getByRole("heading", { name: "Link preview", exact: true })).toBeVisible();
}

async function expectPreviewEditable(page: Page) {
  await editor(page).fill("# Link preview\n\nStill editable after following the link.");
  await expect(preview(page).getByText("Still editable after following the link.", { exact: true })).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.route(`${DESTINATION}/**`, (route) => {
    if (new URL(route.request().url()).pathname === "/thumbnail.svg") {
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="blue"/></svg>',
      });
    }
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><h1>Link destination</h1>" });
  });
});

test("clicking a linked Markdown image opens a separate tab and preserves the preview", async ({ page, context }) => {
  await loadDocument(
    page,
    `# Link preview\n\n[![Example image](${DESTINATION}/thumbnail.svg)](${DESTINATION}/image-details)`,
  );
  const image = preview(page).getByRole("img", { name: "Example image", exact: true });
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(80);
  await expectSeparateTab(page, context, image, "/image-details");
  await expectPreviewEditable(page);
});

test("text links support pointer, keyboard, and middle-click activation without replacing the preview", async ({
  page,
  context,
}) => {
  await loadDocument(page, `# Link preview\n\n[Read documentation](${DESTINATION}/docs)`);
  const link = preview(page).getByRole("link", { name: "Read documentation", exact: true });
  for (const activate of [
    (target: Locator) => target.click(),
    (target: Locator) => target.press("Enter"),
    (target: Locator) => target.click({ button: "middle" }),
  ]) {
    await expectSeparateTab(page, context, link, "/docs", activate);
  }
  await expectPreviewEditable(page);
});

test("raw HTML link targets cannot replace the preview or application", async ({ page, context }) => {
  await loadDocument(
    page,
    `# Link preview\n\n<a href="${DESTINATION}/self" target="_self">Self target</a>\n\n<a href="${DESTINATION}/top" target="_top">Top target</a>`,
  );
  await expectSeparateTab(page, context, preview(page).getByRole("link", { name: "Self target" }), "/self");
  await expectSeparateTab(page, context, preview(page).getByRole("link", { name: "Top target" }), "/top");
  await expectPreviewEditable(page);
});

test("local fragment links scroll within the current Markdown preview", async ({ page, context }) => {
  const paragraphs = Array.from({ length: 30 }, (_, index) => `Paragraph ${index + 1} before the target.`).join("\n\n");
  await loadDocument(
    page,
    `# Link preview\n\n[Jump to details](#details)\n\n${paragraphs}\n\n<h2 id="details">Details</h2>`,
  );
  const workspaceUrl = page.url();
  const pageCount = context.pages().length;
  await preview(page).getByRole("link", { name: "Jump to details" }).click();
  await expect
    .poll(() =>
      preview(page)
        .locator("html")
        .evaluate((node) => node.ownerDocument.scrollingElement!.scrollTop),
    )
    .toBeGreaterThan(500);
  await expect(preview(page).getByRole("heading", { name: "Details", exact: true })).toBeInViewport();
  await expect(page).toHaveURL(workspaceUrl);
  expect(context.pages()).toHaveLength(pageCount);
  await expectPreviewEditable(page);
});

test("unsafe links cannot execute code or navigate the Markdown preview", async ({ page, context }) => {
  await loadDocument(
    page,
    `# Link preview\n\n<a href="javascript:document.documentElement.dataset.linkExecuted='yes'">Script link</a>\n\n<a href="data:text/html,%3Ch1%3EReplaced%3C%2Fh1%3E">Data link</a>`,
  );
  const workspaceUrl = page.url();
  const pageCount = context.pages().length;
  for (const name of ["Script link", "Data link"]) {
    await preview(page).getByRole("link", { name, exact: true }).click();
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(workspaceUrl);
    await expect(preview(page).getByRole("heading", { name: "Link preview", exact: true })).toBeVisible();
    expect(await preview(page).locator("html").getAttribute("data-link-executed")).toBeNull();
    expect(await page.locator("html").getAttribute("data-link-executed")).toBeNull();
    expect(context.pages()).toHaveLength(pageCount);
  }
  await expectPreviewEditable(page);
});
