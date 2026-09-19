import { expect, test, type Locator, type Page } from "@playwright/test";

const PREVIEW_SELECTOR = 'iframe[title="Generated HTML preview"]';
const LONG_MARKDOWN = Array.from(
  { length: 40 },
  (_, index) => `## Section ${index + 1}

Paragraph ${index + 1} contains **important details**, an [example link](https://example.com), and enough text to wrap naturally in the editor and rendered document. Each pane has a different content height.

- Review the first item.
- Check the second item.

\`\`\`js
const section = ${index + 1};
console.log(section);
\`\`\`
`,
).join("\n");

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Markdown document", exact: true });
}

function previewDocument(page: Page) {
  return page.frameLocator(PREVIEW_SELECTOR).locator("html");
}

async function scrollFraction(surface: Locator, isDocument = false) {
  return surface.evaluate((node, documentScroll) => {
    const scroller = documentScroll ? node.ownerDocument.scrollingElement! : node;
    const range = scroller.scrollHeight - scroller.clientHeight;
    return range > 0 ? scroller.scrollTop / range : 0;
  }, isDocument);
}

async function setScrollFraction(surface: Locator, fraction: number, isDocument = false) {
  await surface.evaluate(
    (node, { position, documentScroll }) => {
      const scroller = documentScroll ? node.ownerDocument.scrollingElement! : node;
      scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * position;
    },
    { position: fraction, documentScroll: isDocument },
  );
}

async function expectScrollFraction(surface: Locator, fraction: number, isDocument = false) {
  await expect.poll(async () => Math.abs((await scrollFraction(surface, isDocument)) - fraction)).toBeLessThan(0.015);
}

async function waitForPreview(page: Page) {
  await expect(page.getByTestId("tool-status-line")).toContainText("Rendered preview is current");
  await expect(page.locator(PREVIEW_SELECTOR)).toBeAttached();
  await expect(page.getByRole("region", { name: "Preview", exact: true, includeHidden: true })).toHaveAttribute(
    "data-state",
    "ready",
  );
}

async function nextPaint(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

async function loadDocument(page: Page, markdown: string) {
  await page.goto("/devtools/markdown-previewer");
  await expect(editor(page)).toBeEditable();
  await expect(page.getByRole("button", { name: "Paste into Markdown document", exact: true })).toBeEnabled();
  await editor(page).fill(markdown);
  await expect(editor(page)).toHaveValue(markdown);
  await waitForPreview(page);
}

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
]) {
  test(`Markdown editor and preview scroll together in both directions at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await loadDocument(page, LONG_MARKDOWN);
    const input = editor(page);
    const preview = previewDocument(page);
    await expect(preview.getByRole("heading", { name: "Section 40", exact: true })).toHaveCount(1);
    for (const [surface, isDocument] of [
      [input, false],
      [preview, true],
    ] as const) {
      expect(
        await surface.evaluate((node, documentScroll) => {
          const scroller = documentScroll ? node.ownerDocument.scrollingElement! : node;
          return scroller.scrollHeight - scroller.clientHeight;
        }, isDocument),
      ).toBeGreaterThan(1000);
    }

    await setScrollFraction(input, 0.35);
    await expectScrollFraction(preview, 0.35, true);
    await setScrollFraction(preview, 0.7, true);
    await expectScrollFraction(input, 0.7);
    await setScrollFraction(input, 1);
    await expectScrollFraction(preview, 1, true);
    await setScrollFraction(preview, 0, true);
    await expectScrollFraction(input, 0);
    await setScrollFraction(preview, 1, true);
    await expectScrollFraction(input, 1);
    await setScrollFraction(input, 0);
    await expectScrollFraction(preview, 0, true);

    await page.getByRole("button", { name: "Restore settings panel", exact: true }).click();
    const syncScroll = page.getByRole("switch", { name: "Sync scroll", exact: true });
    await expect(syncScroll).toBeChecked();
    await syncScroll.uncheck();
    await waitForPreview(page);
    await page.getByRole("button", { name: "Collapse settings panel", exact: true }).click();
    await expect(syncScroll).toBeHidden();

    await setScrollFraction(input, 0.6);
    await expectScrollFraction(input, 0.6);
    // Wait through several animation frames so an accidental feedback loop is observable.
    await nextPaint(page);
    await expectScrollFraction(preview, 0, true);
    await setScrollFraction(preview, 0.25, true);
    await expectScrollFraction(preview, 0.25, true);
    await nextPaint(page);
    await expectScrollFraction(input, 0.6);

    await page.getByRole("button", { name: "Restore settings panel", exact: true }).click();
    await syncScroll.check();
    await waitForPreview(page);
    await page.getByRole("button", { name: "Collapse settings panel", exact: true }).click();
    await setScrollFraction(input, 0.45);
    await expectScrollFraction(preview, 0.45, true);
  });
}

test("Markdown keeps the reading position when editing and resizing its panes", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await loadDocument(page, LONG_MARKDOWN);
  const input = editor(page);
  const preview = previewDocument(page);
  await setScrollFraction(input, 0.45);
  await expectScrollFraction(preview, 0.45, true);

  await input.click({ position: { x: 160, y: 90 } });
  const readingPosition = await scrollFraction(input);
  await page.keyboard.insertText("retained-reading-position ");
  await expect(preview).toContainText("retained-reading-position");
  await waitForPreview(page);
  await expectScrollFraction(input, readingPosition);
  await expectScrollFraction(preview, readingPosition, true);

  const initialWidth = (await input.boundingBox())!.width;
  const divider = page.getByRole("separator", { name: "Resize workspace panels", exact: true }).first();
  await divider.focus();
  await divider.press("ArrowRight");
  await expect.poll(async () => (await input.boundingBox())!.width).toBeGreaterThan(initialWidth + 10);
  await expectScrollFraction(input, readingPosition);
  await expectScrollFraction(preview, readingPosition, true);
  await setScrollFraction(preview, 0.75, true);
  await expectScrollFraction(input, 0.75);
});

test("Markdown preserves synchronized reading positions when switching mobile tabs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadDocument(page, LONG_MARKDOWN);
  const input = editor(page);
  const preview = previewDocument(page);
  await expect(input).toBeVisible();
  await setScrollFraction(input, 0.4);
  await expectScrollFraction(input, 0.4);
  await page.getByRole("tab", { name: "Result", exact: true }).click();
  await expect(page.locator(PREVIEW_SELECTOR)).toBeVisible();
  await expectScrollFraction(preview, 0.4, true);
  await setScrollFraction(preview, 0.7, true);
  await expectScrollFraction(preview, 0.7, true);
  await page.getByRole("tab", { name: "Input", exact: true }).click();
  await expect(input).toBeVisible();
  await expectScrollFraction(input, 0.7);
  await page.getByRole("tab", { name: "Result", exact: true }).click();
  await expectScrollFraction(preview, 0.7, true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("short Markdown stays at the top and synchronized scrolling recovers for a longer document", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await loadDocument(page, "# Short document\n\nA single paragraph.");
  const input = editor(page);
  const preview = previewDocument(page);
  for (const [surface, isDocument] of [
    [input, false],
    [preview, true],
  ] as const) {
    expect(
      await surface.evaluate((node, documentScroll) => {
        const scroller = documentScroll ? node.ownerDocument.scrollingElement! : node;
        return scroller.scrollHeight - scroller.clientHeight;
      }, isDocument),
    ).toBe(0);
    await setScrollFraction(surface, 1, isDocument);
    await surface.dispatchEvent("scroll");
    await expectScrollFraction(surface, 0, isDocument);
  }
  await input.fill(LONG_MARKDOWN);
  await expect(preview.getByRole("heading", { name: "Section 40", exact: true })).toHaveCount(1);
  await waitForPreview(page);
  await setScrollFraction(input, 0.5);
  await expectScrollFraction(preview, 0.5, true);
  await setScrollFraction(preview, 0.8, true);
  await expectScrollFraction(input, 0.8);
});

test("wide Markdown content stays inside the preview and exports the generated HTML", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route("https://example.com/diagram.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="blue"/></svg>',
    }),
  );
  const columns = Array.from({ length: 12 }, (_, index) => `Column ${index + 1}`);
  const markdown = `# Release notes

A **formatted** document with a [reference](https://example.com).

![Example diagram](https://example.com/diagram.svg)

| ${columns.join(" | ")} |
| ${columns.map(() => "---").join(" | ")} |
| ${columns.map(() => "A detailed table value").join(" | ")} |

\`\`\`js
const longValue = "${"a".repeat(250)}";
\`\`\`
`;
  await loadDocument(page, markdown);
  const preview = previewDocument(page);
  await expect(preview.getByRole("heading", { name: "Release notes", exact: true })).toBeVisible();
  const diagram = preview.getByRole("img", { name: "Example diagram", exact: true });
  await expect(diagram).toBeVisible();
  await expect.poll(() => diagram.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(40);
  await expect(preview.locator("table")).toContainText("Column 12");
  await expect(preview.locator("pre")).toContainText("const longValue");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await preview.evaluate(
      (node) => node.ownerDocument.documentElement.scrollWidth <= node.ownerDocument.defaultView!.innerWidth,
    ),
  ).toBe(true);

  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download .html", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("preview.html");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const html = Buffer.concat(chunks).toString("utf8");
  expect(html).toContain("<h1>Release notes</h1>");
  expect(html).toContain("<strong>formatted</strong>");
  expect(html).toContain("<table>");
  const exportedCode = await page.evaluate(
    (content) => new DOMParser().parseFromString(content, "text/html").querySelector("pre > code")?.textContent,
    html,
  );
  expect(exportedCode).toBe(`const longValue = "${"a".repeat(250)}";\n`);
});

test("raw Markdown HTML cannot execute scripts or event handlers in the preview", async ({ page }) => {
  await loadDocument(
    page,
    `# Safe preview

<script>document.documentElement.dataset.previewExecuted = "script"; parent.document.documentElement.dataset.previewExecuted = "script";</script>
<img src="data:image/png;base64,invalid" onerror="document.documentElement.dataset.previewExecuted = 'event'">
<button onclick="document.documentElement.dataset.previewExecuted = 'click'">Untrusted button</button>
`,
  );
  const preview = previewDocument(page);
  await expect(preview.getByRole("heading", { name: "Safe preview", exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Untrusted button", exact: true }).click();
  await expect(preview).not.toHaveAttribute("data-preview-executed");
  await expect(page.locator("html")).not.toHaveAttribute("data-preview-executed");
  await expect(editor(page)).toBeEditable();
});

test("Markdown uses the blog body viewer's code-copy and Mermaid preview controls", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await loadDocument(
    page,
    "# Shared viewer\n\n```js\nconst answer = 42;\n```\n\n```mermaid\ngraph TD\n  A[Write] --> B[Preview]\n```\n",
  );
  const preview = previewDocument(page);
  await preview.locator("pre").first().hover();
  await preview.getByRole("button", { name: "Copy code", exact: true }).click();
  await expect(preview.getByRole("status")).toContainText("Code copied to clipboard.");
  expect((await page.evaluate(() => navigator.clipboard.readText())).trim()).toBe("const answer = 42;");

  await preview.getByRole("button", { name: "Open Mermaid diagram preview", exact: true }).click();
  const diagram = page.getByRole("dialog", { name: "Mermaid diagram", exact: true });
  await expect(diagram).toBeVisible();
  await expect(diagram.getByRole("button", { name: "Zoom in", exact: true })).toBeVisible();
  await expect(diagram.getByRole("button", { name: "Download", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(diagram).toBeHidden();
  await expect(editor(page)).toBeEditable();
});

test("code highlighting is visible by default and can be toggled off and on", async ({ page }) => {
  await loadDocument(page, '# Python example\n\n```python\ndef convert_pdf(filename):\n    return "done"\n```');
  const preview = previewDocument(page);
  const code = preview.locator("pre > code");
  const keyword = code.getByText("def", { exact: true });
  await expect(keyword).toBeVisible();
  const textColor = await code.evaluate((node) => getComputedStyle(node).color);
  await expect.poll(() => keyword.evaluate((node) => getComputedStyle(node).color)).not.toBe(textColor);

  await page.getByRole("button", { name: "Restore settings panel", exact: true }).click();
  const highlighting = page.getByRole("switch", { name: "Syntax highlighting", exact: true });
  await expect(highlighting).toBeChecked();
  await highlighting.uncheck();
  await expect(keyword).toHaveCount(0);
  await expect(code).toHaveText('def convert_pdf(filename):\n    return "done"\n');
  await highlighting.check();
  await expect(keyword).toBeVisible();
  await expect.poll(() => keyword.evaluate((node) => getComputedStyle(node).color)).not.toBe(textColor);
});

test("task lists retain checked state and remain read-only in the shared viewer", async ({ page }) => {
  await loadDocument(
    page,
    "# Checklist\n\n- [x] Completed task\n- [ ] Pending task\n  - [x] Nested task\n- Ordinary list item\n\n## Loose list\n\n- [ ] Loose task\n\n  More detail.\n\n- [x] Another task\n\n" +
      '<ul data-type="taskList"><li data-type="taskItem"><span data-task-checkbox="true">☑</span><div><p>Blog task markup</p></div></li></ul>',
  );
  const preview = previewDocument(page);
  await expect(preview.getByRole("checkbox")).toHaveCount(6);
  const completed = preview.getByRole("checkbox", { name: "Completed", exact: true });
  const pending = preview.getByRole("checkbox", { name: "Not completed", exact: true });
  await expect(completed).toHaveCount(4);
  await expect(pending).toHaveCount(2);
  await expect(completed.first()).toBeChecked();
  await expect(pending.first()).not.toBeChecked();
  await pending.first().click();
  await expect(pending.first()).not.toBeChecked();
  await expect(preview.getByText("Ordinary list item", { exact: true })).toBeVisible();

  await editor(page).fill("# Checklist\n\n- [x] Updated task");
  await expect(preview.getByRole("checkbox")).toHaveCount(1);
  await expect(preview.getByRole("checkbox", { name: "Completed", exact: true })).toBeChecked();
  await expect(preview.getByText("Updated task", { exact: true })).toBeVisible();
});
