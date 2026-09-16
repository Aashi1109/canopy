import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";
import { AuthPage } from "./pages/AuthPage";

async function tickWidths(scrubber: Locator) {
  return scrubber.getByRole("option").evaluateAll((options) =>
    options.map((option) => {
      const tick = option.querySelector("span");
      return tick ? tick.getBoundingClientRect().width : 0;
    }),
  );
}

async function expectOutlineWidth(viewer: Locator) {
  const outlinePanel = viewer.getByRole("complementary");
  await expect(outlinePanel).toBeVisible();
  await expect
    .poll(() =>
      outlinePanel.evaluate((panel) =>
        Math.abs(
          panel.getBoundingClientRect().width -
            Math.min(panel.scrollWidth, panel.parentElement!.getBoundingClientRect().width * 0.35),
        ),
      ),
    )
    .toBeLessThan(1);
  const width = (await outlinePanel.boundingBox())!.width;
  const viewerWidth = await outlinePanel.evaluate(
    (panel) => panel.parentElement!.getBoundingClientRect().width,
  );
  expect(width).toBeGreaterThan(0);
  expect(width).toBeLessThanOrEqual(viewerWidth * 0.35 + 1);
}

async function captureViewer(viewer: Locator, path: string) {
  await viewer.evaluate((node) =>
    window.scrollTo(0, Math.max(0, window.scrollY + node.getBoundingClientRect().top - 120)),
  );
  await viewer.screenshot({ path });
}

async function toggleOutlineWithMotion(
  viewer: Locator,
  label: "Show outline" | "Hide outline",
  animated = true,
) {
  await expect(viewer.getByRole("button", { name: label, exact: true })).toBeEnabled();
  const samples = await viewer.evaluate(async (node, toggleLabel) => {
    const toggle = node.querySelector<HTMLButtonElement>(`button[aria-label="${toggleLabel}"]`)!;
    const pages = node.querySelector<HTMLElement>('[aria-label="PDF pages"]')!;
    const sample = () => ({
      outline: node.querySelector("aside")?.getBoundingClientRect().width ?? 0,
      content: node.querySelector("aside")?.firstElementChild?.getBoundingClientRect().width ?? 0,
      pages: pages.getBoundingClientRect().width,
    });
    const widths = [sample()];
    toggle.click();
    const started = performance.now();
    await new Promise<void>((resolve) => {
      function frame(now: number) {
        widths.push(sample());
        if (now - started < 500) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
    return widths;
  }, label);
  await writeFile(
    `/tmp/canopy-pdf-outline-${animated ? "animated" : "reduced"}-${label === "Show outline" ? "open" : "close"}.json`,
    JSON.stringify(samples),
  );
  const first = samples[0];
  const last = samples[samples.length - 1];
  for (const key of ["outline", "pages"] as const) {
    const min = Math.min(first[key], last[key]);
    const max = Math.max(first[key], last[key]);
    expect(max - min).toBeGreaterThan(20);
    expect(samples.some((sample) => sample[key] > min + 2 && sample[key] < max - 2)).toBe(animated);
  }
  const viewerWidth = (await viewer.boundingBox())!.width;
  for (const sample of samples) {
    expect(Math.abs(sample.content - first.content)).toBeLessThanOrEqual(1);
    expect(sample.outline).toBeLessThanOrEqual(viewerWidth * 0.35 + 1);
    expect(
      Math.abs(sample.outline + sample.pages - first.outline - first.pages),
    ).toBeLessThanOrEqual(3);
  }
}

async function selectThroughPreview(
  page: Page,
  scrubber: Locator,
  target: Locator,
  preview: Locator,
) {
  const tickBox = await target.boundingBox();
  const cardBox = await preview.boundingBox();
  if (!tickBox || !cardBox) throw new Error("Scrubber preview is not visible");
  const activeId = await target.getAttribute("id");
  if (!activeId) throw new Error("Scrubber option has no accessible ID");
  const opensRight = cardBox.x > tickBox.x;
  const gapX = opensRight
    ? (tickBox.x + tickBox.width + cardBox.x) / 2
    : (cardBox.x + cardBox.width + tickBox.x) / 2;

  await page.mouse.move(gapX, tickBox.y + tickBox.height / 2, {
    steps: Math.max(1, Math.ceil(Math.abs(gapX - tickBox.x - tickBox.width / 2))),
  });
  await expect(preview).toHaveCSS("opacity", "1");
  await expect(scrubber).toHaveAttribute("aria-activedescendant", activeId);
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2, {
    steps: Math.max(
      1,
      Math.ceil(
        Math.hypot(
          cardBox.x + cardBox.width / 2 - gapX,
          cardBox.y + cardBox.height / 2 - tickBox.y - tickBox.height / 2,
        ),
      ),
    ),
  });
  await expect(preview).toHaveCSS("opacity", "1");
  await expect(scrubber).toHaveAttribute("aria-activedescendant", activeId);
  await preview.click();
  await expect(target).toHaveAttribute("aria-selected", "true");
}

async function expectWaveWidths(
  scrubber: Locator,
  {
    centerIndex,
    hoverLengthMultiplier,
    radius,
    restLength,
  }: {
    centerIndex: number;
    hoverLengthMultiplier: number;
    radius: number;
    restLength: number;
  },
) {
  const peakLength = restLength * hoverLengthMultiplier;
  await expect
    .poll(async () => Math.max(...(await tickWidths(scrubber))))
    .toBeGreaterThan(peakLength - 1);

  const widths = await tickWidths(scrubber);
  widths.forEach((width, index) => {
    const distance = Math.abs(index - centerIndex);
    const standardDeviation = radius / 2.25;
    const wave = distance >= radius ? 0 : Math.exp(-0.5 * (distance / standardDeviation) ** 2);
    const expectedWidth = restLength + wave * (peakLength - restLength);
    expect(width).toBeCloseTo(expectedWidth, 1);
  });
}

test("shared scrubbers render their wave and preview at runtime", async ({ page }) => {
  await new AuthPage(page).signIn(
    E2E_ACCOUNTS.admin.email,
    E2E_PASSWORD,
    "http://localhost:3000/admin/design-system",
  );

  const sharedScrubber = page.getByRole("listbox", {
    name: "Tool workflow chapters",
  });
  const sharedTarget = sharedScrubber.getByRole("option", {
    name: "Validate inputs. Resolve any unsupported files or missing requirements.",
  });

  await expect(sharedScrubber).toBeVisible();
  const restingWidths = await tickWidths(sharedScrubber);
  restingWidths.forEach((width) => expect(width).toBeCloseTo(14, 1));

  await sharedTarget.hover();

  await expectWaveWidths(sharedScrubber, {
    centerIndex: 3,
    hoverLengthMultiplier: 52 / 14,
    radius: 4.5,
    restLength: 14,
  });
  await expect(sharedTarget.locator("span")).toHaveCSS("background-color", "rgb(26, 26, 26)");
  await expect(sharedTarget.locator("span")).toHaveCSS("height", "2px");
  const sharedPreview = sharedScrubber
    .locator("xpath=..")
    .getByRole("button", { name: "Go to Validate inputs", exact: true });
  await expect(sharedPreview).toHaveCSS("opacity", "1");
  await expect(sharedPreview).toContainText("Validate inputs");
  await selectThroughPreview(page, sharedScrubber, sharedTarget, sharedPreview);
  await expect(page.getByText("Current · Validate inputs", { exact: true })).toBeVisible();

  await page.mouse.move(0, 0);
  await sharedTarget.focus();
  await sharedTarget.press("ArrowUp");
  const keyboardTarget = sharedScrubber.getByRole("option", {
    name: "Adjust settings. Choose only the options needed for this output.",
  });
  await expect(keyboardTarget).toBeFocused();
  const keyboardPreview = sharedScrubber
    .locator("xpath=..")
    .getByRole("button", { name: "Go to Adjust settings", exact: true });
  await expect(keyboardPreview).toBeVisible();
  await keyboardTarget.press("Tab");
  await expect(keyboardPreview).toBeFocused();
  await keyboardPreview.press("Enter");
  await expect(keyboardTarget).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Current · Adjust settings", { exact: true })).toBeVisible();
  await keyboardPreview.press("Escape");
  await expect(keyboardPreview).toBeHidden();
  await expect(keyboardTarget).toHaveAttribute("aria-selected", "true");

  const pageScrubber = page.getByRole("listbox", { name: "Page scrubber" });
  const pageTarget = pageScrubber.getByRole("option", { name: "Page 10" });

  await expect(pageScrubber).toBeVisible();
  await pageTarget.hover();

  await expectWaveWidths(pageScrubber, {
    centerIndex: 9,
    hoverLengthMultiplier: 2.5,
    radius: 4.5,
    restLength: 8,
  });
  await expect(pageTarget.locator("span")).toHaveCSS("height", "2px");

  const pagePreview = pageScrubber
    .locator("xpath=..")
    .getByRole("button", { name: "Go to Page 10", exact: true });
  await expect(pagePreview).toHaveCSS("opacity", "1");
  await expect(pagePreview).toHaveCSS("width", "178px");
  await expect(pagePreview).toContainText("Page 10 · Review & approve");
  await selectThroughPreview(page, pageScrubber, pageTarget, pagePreview);
});

test("PDF preview stays clickable across the scrubber gap", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const pdfDocument = await PDFDocument.create();
  for (let index = 1; index <= 12; index++) {
    pdfDocument.addPage([200, 300]).drawText(`Page ${index}`, { x: 20, y: 250, size: 16 });
  }
  const buffer = Buffer.from(await pdfDocument.save());
  await page.goto("/media/merge-pdf");
  await page.waitForLoadState("networkidle");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([
      { name: "scrubber-pages.pdf", mimeType: "application/pdf", buffer },
      { name: "more-pages.pdf", mimeType: "application/pdf", buffer },
    ]);
  await page.getByRole("button", { name: "Merge PDFs", exact: true }).click();
  const viewer = page.getByRole("region", { name: "Generated PDF", exact: true });
  await expect(viewer.getByRole("spinbutton", { name: "Current page" })).toHaveValue("1", {
    timeout: 60_000,
  });
  const outline = viewer.getByRole("listbox", { name: "Document outline", exact: true });
  await expect(outline).toBeHidden();
  const pages = viewer.getByRole("region", { name: "PDF pages", exact: true });
  const closedWidth = (await pages.boundingBox())!.width;
  await captureViewer(viewer, "/tmp/canopy-pdf-viewer-closed.png");
  await toggleOutlineWithMotion(viewer, "Show outline");
  await expect(outline).toBeVisible();
  const search = viewer.getByRole("searchbox", { name: "Search document outline", exact: true });
  await expect(search).toBeFocused();
  await search.press("Escape");
  await expect(outline).toBeHidden();
  await expect(viewer.getByRole("button", { name: "Show outline", exact: true })).toBeFocused();
  await viewer.getByRole("button", { name: "Show outline", exact: true }).click();
  await expect(outline).toBeVisible();
  await expect(search).toBeFocused();
  expect((await pages.boundingBox())!.width).toBeLessThan(closedWidth);
  await expectOutlineWidth(viewer);
  await toggleOutlineWithMotion(viewer, "Hide outline");
  await viewer
    .getByRole("button", { name: "Show outline", exact: true })
    .evaluate(async (toggle) => {
      for (let index = 0; index < 3; index++) {
        (toggle as HTMLButtonElement).click();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    });
  await expect(viewer.getByRole("complementary")).toHaveCount(1);
  await expect(search).toBeFocused();
  await expectOutlineWidth(viewer);
  await captureViewer(viewer, "/tmp/canopy-pdf-viewer-open.png");
  await search.fill("Page 12");
  await outline.getByRole("option").click();
  await expect(viewer.getByRole("spinbutton", { name: "Current page" })).toHaveValue("12");
  await viewer.getByRole("button", { name: "Hide outline", exact: true }).click();
  await expect(outline).toBeHidden();
  await expect(viewer.getByRole("spinbutton", { name: "Current page" })).toHaveValue("12");
  await expect.poll(async () => (await pages.boundingBox())!.width).toBeCloseTo(closedWidth, 0);
  const scrubber = viewer.getByRole("listbox", { name: "Page scrubber", exact: true });
  const target = scrubber.getByRole("option", { name: "Page 10", exact: true });
  await target.hover();
  const preview = scrubber
    .locator("xpath=..")
    .getByRole("button", { name: "Go to Page 10", exact: true });
  await expect(preview).toHaveCSS("opacity", "1");
  await captureViewer(viewer, "/tmp/canopy-pdf-viewer-preview.png");
  await selectThroughPreview(page, scrubber, target, preview);
  await expect(viewer.getByRole("spinbutton", { name: "Current page" })).toHaveValue("10");
  await page.mouse.move(0, 0);
  await target.focus();
  await target.press("ArrowDown");
  const nextTarget = scrubber.getByRole("option", { name: "Page 11", exact: true });
  const nextPreview = scrubber
    .locator("xpath=..")
    .getByRole("button", { name: "Go to Page 11", exact: true });
  await expect(nextPreview).toBeVisible();
  await nextTarget.press("Tab");
  await expect(nextPreview).toBeFocused();
  await nextPreview.press("Enter");
  await expect(viewer.getByRole("spinbutton", { name: "Current page" })).toHaveValue("11");
  await nextPreview.press("Escape");
  await expect(nextPreview).toBeHidden();
  await expect(viewer.getByRole("spinbutton", { name: "Current page" })).toHaveValue("11");
  await viewer.getByRole("button", { name: "Expand preview", exact: true }).click();
  const expanded = page.getByRole("dialog");
  const expandedPageNumber = expanded.getByRole("spinbutton", { name: "Current page" });
  await expandedPageNumber.fill("1");
  await expandedPageNumber.press("Enter");
  const expandedPage = expanded.getByRole("img", { name: "Generated PDF page 1", exact: true });
  await expect(expandedPage).toBeVisible();
  const expandedPages = expanded.getByRole("region", { name: "PDF pages", exact: true });
  const availableWidth = await expandedPages.evaluate((node) => node.clientWidth);
  const fullWidth = (await expandedPage.boundingBox())!.width;
  expect(Math.abs(fullWidth - availableWidth)).toBeLessThanOrEqual(2);
  await expanded.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(expanded.getByLabel("Zoom level")).toHaveText("110%");
  await expect
    .poll(async () => (await expandedPage.boundingBox())!.width)
    .toBeGreaterThan(fullWidth * 1.09);
  await expanded.getByRole("button", { name: "Fit page", exact: true }).click();
  await expect(expanded.getByLabel("Zoom level")).toHaveText("100%");
  expect(Math.abs((await expandedPage.boundingBox())!.width - fullWidth)).toBeLessThanOrEqual(2);
  await expanded.screenshot({ path: "/tmp/canopy-pdf-viewer-full-width.png" });
  await expanded.getByRole("button", { name: "Show outline", exact: true }).click();
  await expectOutlineWidth(expanded);
  const expandedSearch = expanded.getByRole("searchbox", {
    name: "Search document outline",
    exact: true,
  });
  await expect(expandedSearch).toBeFocused();
  await expect(expandedPageNumber).toHaveValue("1");
  await expanded.screenshot({ path: "/tmp/canopy-pdf-viewer-full-width-open.png" });
  await expandedSearch.press("Escape");
  await expect(
    expanded.getByRole("listbox", { name: "Document outline", exact: true }),
  ).toBeHidden();
  await expect(expanded.getByRole("button", { name: "Show outline", exact: true })).toBeFocused();
  await expect(expandedPageNumber).toHaveValue("1");
  await page.keyboard.press("Escape");
  await expect(expanded).toBeHidden();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([
      { name: "scrubber-pages.pdf", mimeType: "application/pdf", buffer },
      { name: "more-pages.pdf", mimeType: "application/pdf", buffer },
    ]);
  await page.getByRole("button", { name: "Merge PDFs", exact: true }).click();
  await expect(viewer.getByRole("spinbutton", { name: "Current page" })).toHaveValue("1", {
    timeout: 60_000,
  });
  await toggleOutlineWithMotion(viewer, "Show outline", false);
  await expect(search).toBeFocused();
  await search.press("Escape");
  await expect(outline).toBeHidden();
  await expect(viewer.getByRole("button", { name: "Show outline", exact: true })).toBeFocused();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const mobileCurrentPage = await viewer
    .getByRole("spinbutton", { name: "Current page" })
    .inputValue();
  await viewer.getByRole("button", { name: "Show outline", exact: true }).click();
  await expect(outline).toBeVisible();
  await expect(search).toBeFocused();
  await expect(viewer.getByRole("spinbutton", { name: "Current page" })).toHaveValue(
    mobileCurrentPage,
  );
  await expectOutlineWidth(viewer);
  await captureViewer(viewer, "/tmp/canopy-pdf-viewer-mobile-open.png");
  await search.press("Escape");
  await expect(outline).toBeHidden();
  await expect(viewer.getByRole("button", { name: "Show outline", exact: true })).toBeFocused();
  await expect(viewer.getByRole("spinbutton", { name: "Current page" })).toHaveValue(
    mobileCurrentPage,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await captureViewer(viewer, "/tmp/canopy-pdf-viewer-mobile.png");
});
