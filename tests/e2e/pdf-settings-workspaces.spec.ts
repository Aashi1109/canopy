import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const postMessage = Worker.prototype.postMessage;
    let hold = false;
    let release: (() => void) | undefined;
    window.addEventListener("test:hold-pdf-run", () => {
      hold = true;
    });
    window.addEventListener("test:release-pdf-run", () => {
      hold = false;
      release?.();
      release = undefined;
    });
    Worker.prototype.postMessage = function (
      message: unknown,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const dispatch = () => Reflect.apply(postMessage, this, [message, options]);
      if (
        hold &&
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "run"
      ) {
        release = dispatch;
        return;
      }
      dispatch();
    };
  });
});

async function sourcePdf(name = "source.pdf") {
  const pdf = await PDFDocument.create();
  for (let number = 1; number <= 2; number++)
    pdf.addPage([220, 300]).drawText(`Source page ${number}`, { x: 20, y: 150, size: 16 });
  return { name, mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) };
}

async function screenshot(page: Page, tool: string, state: string, project: string) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
  });
  if (page.viewportSize()!.width < 600 && (state.includes("completed") || state === "preserved")) {
    await page.getByRole("button", { name: /^Download .*\.pdf$/ }).scrollIntoViewIfNeeded();
  } else {
    await page.getByRole("region", { name: "Source PDF", exact: true }).scrollIntoViewIfNeeded();
  }
  await page.screenshot({ path: `/tmp/${tool}-${state}-${project}.png`, animations: "disabled" });
}

async function attach(
  page: Page,
  tool: string,
  optionsTitle: string,
  action: string,
  project: string,
) {
  await page.goto(`/media/${tool}`);
  await page.waitForLoadState("networkidle");
  const source = page.getByRole("region", { name: "Source PDF", exact: true });
  const settings = page.getByRole("region", { name: optionsTitle, exact: true });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("button", { name: action, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: action, exact: true })).toHaveCount(1);
  await screenshot(page, tool, "empty", project);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(await sourcePdf());
  await expect(
    source.getByRole("spinbutton", { name: "Current page", exact: true }),
  ).toHaveAttribute("max", "2", { timeout: 60_000 });
  const image = source.getByRole("img", { name: "PDF page 1", exact: true });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBeGreaterThan(0);
  await screenshot(page, tool, "uploaded", project);
  return { source, settings };
}

async function runAndDownload(page: Page, settings: Locator, action: string, name: string) {
  await page.evaluate(() => window.dispatchEvent(new Event("test:hold-pdf-run")));
  await settings.getByRole("button", { name: action, exact: true }).click();
  await expect(settings.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event("test:release-pdf-run")));
  const download = settings.getByRole("button", { name: `Download ${name}`, exact: true });
  await expect(download).toBeVisible({ timeout: 60_000 });
  if (page.viewportSize()!.width < 600) {
    expect((await download.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      (await settings.getByRole("button", { name: action, exact: true }).boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
  }
  const event = page.waitForEvent("download");
  await download.click();
  const artifact = await event;
  expect(artifact.suggestedFilename()).toBe(name);
  await expect(page.getByRole("region", { name: "Processed output", exact: true })).toHaveCount(0);
  return readFile((await artifact.path())!);
}

async function contents(bytes: Buffer) {
  const loadingTask = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const document = await loadingTask.promise;
  try {
    const pages = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const text = await page.getTextContent();
      const operators = await page.getOperatorList();
      let fillColor = "#000000";
      const savedColors: string[] = [];
      const paintedText: { text: string; color: string }[] = [];
      operators.fnArray.forEach((operation, index) => {
        const args: readonly unknown[] = operators.argsArray[index] ?? [];
        if (operation === OPS.save) savedColors.push(fillColor);
        if (operation === OPS.restore) fillColor = savedColors.pop() ?? "#000000";
        if (operation === OPS.setFillRGBColor && typeof args[0] === "string") fillColor = args[0];
        if (operation === OPS.showText) {
          const glyphs: readonly unknown[] = Array.isArray(args[0]) ? args[0] : [];
          const value = glyphs
            .map((glyph) =>
              glyph &&
              typeof glyph === "object" &&
              "unicode" in glyph &&
              typeof glyph.unicode === "string"
                ? glyph.unicode
                : "",
            )
            .join("");
          paintedText.push({ text: value, color: fillColor });
        }
      });
      pages.push({
        text: text.items.map((item) => ("str" in item ? item.str : "")).join(" "),
        hasImage: operators.fnArray.includes(OPS.paintImageXObject),
        paintedText,
      });
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

test("Compress PDF keeps preservation and acknowledged strong compression in its settings panel", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const { source, settings } = await attach(
    page,
    "compress-pdf",
    "Compression settings",
    "Compress PDF",
    testInfo.project.name,
  );
  const preserved = await runAndDownload(page, settings, "Compress PDF", "source-compressed.pdf");
  expect((await contents(preserved)).map((page) => page.text)).toEqual([
    "Source page 1",
    "Source page 2",
  ]);
  await screenshot(page, "compress-pdf", "preserved", testInfo.project.name);
  await settings.getByRole("combobox", { name: "Compression mode", exact: true }).click();
  await page.getByRole("option", { name: "Strong Compression", exact: true }).click();
  await expect(settings.getByRole("button", { name: "Compress PDF", exact: true })).toBeDisabled();
  await expect(
    settings.getByRole("button", { name: "Download source-compressed.pdf", exact: true }),
  ).toHaveCount(0);
  const acknowledge = settings.getByRole("switch", {
    name: "I understand document content will be flattened",
    exact: true,
  });
  await expect(acknowledge).not.toBeChecked();
  await acknowledge.click();
  const strong = await runAndDownload(
    page,
    settings,
    "Compress PDF",
    "source-strong-compressed.pdf",
  );
  const flattened = await contents(strong);
  expect(flattened).toHaveLength(2);
  expect(flattened.every((page) => page.hasImage && !page.text.includes("Source page"))).toBe(true);
  await expect(
    source.getByRole("spinbutton", { name: "Current page", exact: true }),
  ).toHaveAttribute("max", "2");
  await screenshot(page, "compress-pdf", "completed", testInfo.project.name);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(settings.getByRole("button", { name: /^Download / })).toHaveCount(0);
});

test("Watermark PDF supports text and replaceable images while preserving the image on PDF replacement", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const { source, settings } = await attach(
    page,
    "watermark-pdf",
    "Watermark settings",
    "Apply watermark",
    testInfo.project.name,
  );
  await settings.getByRole("textbox", { name: "Text", exact: true }).fill("REVIEW COPY");
  await settings.getByRole("spinbutton", { name: "Size", exact: true }).fill("16");
  await settings.getByRole("spinbutton", { name: "Rotation", exact: true }).fill("0");
  const pageMode = settings.getByRole("combobox", { name: "Pages", exact: true });
  const pages = settings.getByRole("textbox", { name: "Page ranges", exact: true });
  const select = (scope: Locator, number: number) =>
    scope.getByRole("button", { name: new RegExp(`^(Select|Deselect) page ${number}$`) });
  await expect(pageMode).toHaveText("All pages");
  await expect(pages).toHaveCount(0);
  await pageMode.click();
  await expect(page.getByRole("option", { name: "Custom ranges", exact: true })).toBeVisible();
  await page.screenshot({
    path: `/tmp/watermark-pdf-pages-dropdown-${testInfo.project.name}.png`,
    animations: "disabled",
  });
  await page.getByRole("option", { name: "Odd pages", exact: true }).click();
  await expect(select(source, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(select(source, 2)).toHaveAttribute("aria-pressed", "false");
  await pageMode.click();
  await page.getByRole("option", { name: "Even pages", exact: true }).click();
  await expect(select(source, 1)).toHaveAttribute("aria-pressed", "false");
  await expect(select(source, 2)).toHaveAttribute("aria-pressed", "true");
  await pageMode.click();
  await page.getByRole("option", { name: "Custom ranges", exact: true }).click();
  await expect(pages).toHaveValue("");
  await expect(
    settings.getByRole("button", { name: "Apply watermark", exact: true }),
  ).toBeDisabled();
  await expect(settings.getByRole("alert")).toBeVisible();
  await expect(select(source, 1)).toHaveAttribute("aria-pressed", "false");
  await expect(select(source, 2)).toHaveAttribute("aria-pressed", "false");
  await pages.fill("1-2");
  await expect(select(source, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(select(source, 2)).toHaveAttribute("aria-pressed", "true");
  await expect(
    settings.getByRole("button", { name: "Apply watermark", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: `/tmp/watermark-pdf-pages-custom-${testInfo.project.name}.png`,
    animations: "disabled",
  });
  await pageMode.click();
  await page.getByRole("option", { name: "All pages", exact: true }).click();
  await expect(pages).toHaveCount(0);
  await expect(select(source, 1)).toHaveAttribute("aria-pressed", "true");
  await select(source, 1).click();
  await expect(pageMode).toHaveText("Custom ranges");
  await expect(pages).toHaveValue("2");
  await expect(select(source, 1)).toHaveAttribute("aria-pressed", "false");
  await expect(
    select(source, 1).locator("..").getByText("REVIEW COPY", { exact: true }),
  ).toHaveCount(0);
  await screenshot(page, "watermark-pdf", "unselected", testInfo.project.name);
  await select(source, 2).focus();
  await select(source, 2).press("Enter");
  await expect(pages).toHaveValue("");
  await expect(
    settings.getByRole("button", { name: "Apply watermark", exact: true }),
  ).toBeDisabled();
  await expect(settings.getByRole("alert")).toBeVisible();
  await select(source, 2).press("Space");
  await expect(pages).toHaveValue("2");
  await expect(
    settings.getByRole("button", { name: "Apply watermark", exact: true }),
  ).toBeEnabled();
  await expect(
    select(source, 2).locator("..").getByText("REVIEW COPY", { exact: true }),
  ).toBeVisible();
  await screenshot(page, "watermark-pdf", "selected", testInfo.project.name);
  if (page.viewportSize()!.width < 600) {
    expect((await select(source, 2).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  const expand = source.getByRole("button", { name: "Expand preview", exact: true });
  await expand.click();
  const dialog = page.getByRole("dialog");
  await select(dialog, 2).click();
  await expect(
    select(dialog, 2).locator("..").getByText("REVIEW COPY", { exact: true }),
  ).toHaveCount(0);
  await select(dialog, 1).click();
  await expect(select(dialog, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(
    select(dialog, 1).locator("..").getByText("REVIEW COPY", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `/tmp/watermark-pdf-fullscreen-selected-${testInfo.project.name}.png`,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(expand).toBeFocused();
  await expect(pages).toHaveValue("1");
  await expect(select(source, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(select(source, 2)).toHaveAttribute("aria-pressed", "false");
  const selectedText = await runAndDownload(
    page,
    settings,
    "Apply watermark",
    "source-watermarked.pdf",
  );
  expect((await contents(selectedText)).map((page) => page.text.includes("REVIEW COPY"))).toEqual([
    true,
    false,
  ]);
  await select(source, 2).click();
  await expect(
    settings.getByRole("button", { name: "Download source-watermarked.pdf", exact: true }),
  ).toHaveCount(0);
  const textResult = await runAndDownload(
    page,
    settings,
    "Apply watermark",
    "source-watermarked.pdf",
  );
  expect((await contents(textResult)).every((page) => page.text.includes("REVIEW COPY"))).toBe(
    true,
  );
  await screenshot(page, "watermark-pdf", "text-completed", testInfo.project.name);
  await settings.getByRole("combobox", { name: "Watermark", exact: true }).click();
  await page.getByRole("option", { name: "JPG or PNG image", exact: true }).click();
  await expect(
    settings.getByRole("button", { name: "Apply watermark", exact: true }),
  ).toBeDisabled();
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 40;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#e53535";
    context.fillRect(0, 0, 40, 40);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const logo = { name: "logo.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") };
  await settings.getByLabel("Watermark image", { exact: true }).setInputFiles(logo);
  const imageResult = await runAndDownload(
    page,
    settings,
    "Apply watermark",
    "source-watermarked.pdf",
  );
  expect((await contents(imageResult)).every((page) => page.hasImage)).toBe(true);
  await settings
    .getByLabel("Replace watermark image", { exact: true })
    .setInputFiles({ ...logo, name: "replacement-logo.png" });
  await expect(settings.getByText("replacement-logo.png", { exact: true })).toBeVisible();
  await expect(
    settings.getByRole("button", { name: "Download source-watermarked.pdf", exact: true }),
  ).toHaveCount(0);
  const chooser = page.waitForEvent("filechooser");
  await source.getByRole("button", { name: "Replace PDF", exact: true }).click();
  await (await chooser).setFiles(await sourcePdf("replacement.pdf"));
  await expect(
    source.getByRole("button", { name: "Remove replacement.pdf", exact: true }),
  ).toBeVisible();
  await expect(settings.getByText("replacement-logo.png", { exact: true })).toBeVisible();
  const replacementResult = await runAndDownload(
    page,
    settings,
    "Apply watermark",
    "replacement-watermarked.pdf",
  );
  expect((await contents(replacementResult)).every((page) => page.hasImage)).toBe(true);
  await screenshot(page, "watermark-pdf", "completed", testInfo.project.name);
  await settings.getByRole("button", { name: "Remove image", exact: true }).click();
  await expect(
    settings.getByRole("button", { name: "Apply watermark", exact: true }),
  ).toBeDisabled();
  await expect(settings.getByRole("button", { name: /^Download / })).toHaveCount(0);
  await expect(
    source.getByRole("button", { name: "Remove replacement.pdf", exact: true }),
  ).toBeVisible();
});

test("Add Page Numbers produces real numbering from the configured starting number", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const { source, settings } = await attach(
    page,
    "add-page-numbers",
    "Page number settings",
    "Add page numbers",
    testInfo.project.name,
  );
  await settings.getByRole("combobox", { name: "Format", exact: true }).click();
  await page.getByRole("option", { name: "Page 1", exact: true }).click();
  await settings.getByRole("spinbutton", { name: "Start at", exact: true }).fill("7");
  const color = settings.getByRole("textbox", { name: "Text color value", exact: true });
  await expect(color).toHaveValue("#1a1a1a");
  for (const invalid of ["red", "#12", "", "#f00", "#ff000080"]) {
    await color.fill(invalid);
    await expect(
      settings.getByRole("button", { name: "Add page numbers", exact: true }),
    ).toBeDisabled();
    await expect(settings.getByRole("alert")).toContainText(
      "Enter a six-digit hex text color, such as #1a1a1a.",
    );
  }
  await color.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `/tmp/add-page-numbers-invalid-color-${testInfo.project.name}.png`,
    animations: "disabled",
  });
  await color.fill("#ff0000");
  await expect(
    settings.getByRole("button", { name: "Add page numbers", exact: true }),
  ).toBeEnabled();
  await expect(settings.getByRole("alert")).toHaveCount(0);
  await expect(settings.getByRole("radiogroup", { name: "Position", exact: true })).toBeVisible();
  await color.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `/tmp/add-page-numbers-text-color-${testInfo.project.name}.png`,
    animations: "disabled",
  });
  await settings.screenshot({
    path: `/tmp/add-page-numbers-settings-color-${testInfo.project.name}.png`,
    animations: "disabled",
  });
  const numbered = await runAndDownload(page, settings, "Add page numbers", "source-numbered.pdf");
  const output = await contents(numbered);
  expect(output).toHaveLength(2);
  expect(output[0].text).toContain("Page 7");
  expect(output[1].text).toContain("Page 8");
  expect(
    output.map(
      (page, index) => page.paintedText.find((entry) => entry.text === `Page ${index + 7}`)?.color,
    ),
  ).toEqual(["#ff0000", "#ff0000"]);
  await color.fill("#0000ff");
  await expect(
    settings.getByRole("button", { name: "Download source-numbered.pdf", exact: true }),
  ).toHaveCount(0);
  const blueNumbered = await runAndDownload(
    page,
    settings,
    "Add page numbers",
    "source-numbered.pdf",
  );
  expect(
    (await contents(blueNumbered)).map(
      (page, index) => page.paintedText.find((entry) => entry.text === `Page ${index + 7}`)?.color,
    ),
  ).toEqual(["#0000ff", "#0000ff"]);
  await expect(
    source.getByRole("spinbutton", { name: "Current page", exact: true }),
  ).toHaveAttribute("max", "2");
  await screenshot(page, "add-page-numbers", "completed", testInfo.project.name);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(settings.getByRole("button", { name: /^Download / })).toHaveCount(0);
  await expect(
    settings.getByRole("button", { name: "Add page numbers", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
