import { chromium } from "@playwright/test";
import { expect, test } from "vitest";

const baseURL = process.env.CANOPY_E2E_BASE_URL;

async function settleWorkspace(page) {
  await page.locator('[data-slot="workbench-shell"]').evaluate(async (element) => {
    await new Promise(requestAnimationFrame);
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
}

test.skipIf(!baseURL)(
  "workspace layout preferences restore independently for each tool",
  { timeout: 90000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
      const stacked = page.getByRole("button", { name: "Stacked layout", exact: true });
      const sideBySide = page.getByRole("button", { name: "Side-by-side layout", exact: true });
      await page.goto(`${baseURL}/devtools/base64-encoder`);
      await sideBySide.click();
      await page.getByRole("button", { name: "Expand workspace", exact: true }).click();
      await page.getByRole("tab", { name: "Preview", exact: true }).click();
      await page.reload();
      await expect.poll(() => sideBySide.getAttribute("aria-pressed")).toBe("true");
      await page.getByRole("button", { name: "Expand workspace", exact: true }).click();
      expect(await page.getByRole("tab", { name: "Split", exact: true }).getAttribute("aria-selected")).toBe("true");
      await page.getByRole("button", { name: "Exit focus mode", exact: true }).click();

      await page.goto(`${baseURL}/devtools/base64-decoder`);
      await sideBySide.click();
      await page.reload();
      await expect.poll(() => sideBySide.getAttribute("aria-pressed")).toBe("true");
      await stacked.click();
      await page.reload();
      await expect.poll(() => stacked.getAttribute("aria-pressed")).toBe("true");
      await page.goto(`${baseURL}/devtools/base64-encoder`);
      await expect.poll(() => sideBySide.getAttribute("aria-pressed")).toBe("true");
      await page.goto(`${baseURL}/devtools/base64-decoder`);
      await expect.poll(() => stacked.getAttribute("aria-pressed")).toBe("true");
    } finally {
      await browser.close();
    }
  },
);

test.skipIf(!baseURL)(
  "workspace layout handles invalid preferences and unavailable storage",
  { timeout: 90000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      for (const failure of ["invalid", "read", "write", "access"]) {
        const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
        await page.goto(`${baseURL}/devtools/base64-encoder`);
        const defaultButton = page
          .getByRole("group", { name: "Workspace layout", exact: true })
          .getByRole("button", { pressed: true });
        await defaultButton.waitFor();
        const defaultName = await defaultButton.getAttribute("aria-label");
        const nextName = defaultName === "Stacked layout" ? "Side-by-side layout" : "Stacked layout";
        await page.addInitScript(
          ({ failure, storedLayout }) => {
            const key = "canopy:workbench-layout:base64-encoder";
            if (failure === "invalid") localStorage.setItem(key, "invalid-layout");
            if (failure === "read") localStorage.setItem(key, storedLayout);
            if (failure === "read" || failure === "write") {
              const method = failure === "read" ? "getItem" : "setItem";
              const original = Storage.prototype[method];
              Storage.prototype[method] = function (storageKey, ...args) {
                if (storageKey === key) throw new DOMException("Storage is unavailable", "SecurityError");
                return original.call(this, storageKey, ...args);
              };
            }
            if (failure === "access") {
              Object.defineProperty(window, "localStorage", {
                get() {
                  throw new DOMException("Storage is unavailable", "SecurityError");
                },
              });
            }
          },
          { failure, storedLayout: nextName === "Stacked layout" ? "stacked" : "side-by-side" },
        );
        await page.reload();
        await expect
          .poll(() => page.getByRole("button", { name: defaultName, exact: true }).getAttribute("aria-pressed"))
          .toBe("true");
        await page.getByRole("button", { name: nextName, exact: true }).click();
        await expect
          .poll(() => page.getByRole("button", { name: nextName, exact: true }).getAttribute("aria-pressed"))
          .toBe("true");
        await page.close();
      }
    } finally {
      await browser.close();
    }
  },
);

test.skipIf(!baseURL)(
  "layout switching preserves editors, undo history and completed output",
  { timeout: 90000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
      const undo = process.platform === "darwin" ? "Meta+z" : "Control+z";
      await page.goto(`${baseURL}/devtools/markdown-previewer`);
      const editor = page.getByRole("textbox", { name: "Markdown document", exact: true });
      await editor.fill("# Layout draft");
      await editor.press("End");
      await page.keyboard.type(" preserved");
      const preview = page.frameLocator('iframe[title="Generated HTML preview"]');
      await preview.getByRole("heading", { name: "Layout draft preserved", exact: true }).waitFor();
      const editorNode = await editor.elementHandle();
      const previewNode = await page.locator('iframe[title="Generated HTML preview"]').elementHandle();
      for (const layout of ["Stacked layout", "Side-by-side layout"]) {
        await page.getByRole("button", { name: layout, exact: true }).click();
        await settleWorkspace(page);
        expect(await editor.evaluate((element, original) => element === original, editorNode)).toBe(true);
        expect(await previewNode.evaluate((element) => element.isConnected)).toBe(true);
        expect((await editor.locator(".cm-line").allTextContents()).join("\n")).toBe("# Layout draft preserved");
        expect(await preview.getByRole("heading", { name: "Layout draft preserved", exact: true }).isVisible()).toBe(
          true,
        );
      }
      await editor.press(undo);
      await expect
        .poll(async () => (await editor.locator(".cm-line").allTextContents()).join("\n"))
        .toBe("# Layout draft");

      await page.goto(`${baseURL}/devtools/base64-encoder`);
      const text = page.getByRole("textbox", { name: "Text input", exact: true });
      await text.fill("Layout draft");
      await page.getByRole("button", { name: "Encode", exact: true }).click();
      await text.press("End");
      await page.keyboard.insertText(" preserved");
      await page.getByRole("button", { name: "Encode", exact: true }).click();
      const result = page.getByText(Buffer.from("Layout draft preserved").toString("base64"), { exact: true }).first();
      await result.waitFor();
      const textNode = await text.elementHandle();
      for (const layout of ["Side-by-side layout", "Stacked layout"]) {
        await page.getByRole("button", { name: layout, exact: true }).click();
        await settleWorkspace(page);
        expect(await text.evaluate((element, original) => element === original, textNode)).toBe(true);
        expect(await text.inputValue()).toBe("Layout draft preserved");
        expect(await result.isVisible()).toBe(true);
      }
      await text.press(undo);
      await expect.poll(() => text.inputValue()).toBe("Layout draft");

      for (const route of ["regex-tester", "hash-compare", "uuid-generator"]) {
        await page.goto(`${baseURL}/devtools/${route}`);
        await page.getByRole("button", { name: "Expand workspace", exact: true }).waitFor();
        expect(await page.getByRole("button", { name: "Stacked layout", exact: true }).count()).toBe(0);
        expect(await page.getByRole("button", { name: "Side-by-side layout", exact: true }).count()).toBe(0);
      }
    } finally {
      await browser.close();
    }
  },
);

test.skipIf(!baseURL)(
  "cURL layout switching preserves editors, settings and output and restores the saved layout",
  { timeout: 60000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
      await page.goto(`${baseURL}/devtools/curl-to-axios`);
      const input = page.getByRole("textbox", { name: "cURL command", exact: true });
      const output = page.getByRole("textbox", { name: "Result code", exact: true });
      const source = "curl https://example.com/original";
      await input.fill(source);
      await page.getByRole("button", { name: "Restore settings panel", exact: true }).click();
      const moduleFormat = page.getByRole("combobox", { name: "Module format", exact: true });
      await moduleFormat.click();
      await page.getByRole("option", { name: "ES module import", exact: true }).click();
      await input.press("End");
      await page.keyboard.type("?keep=1");
      await expect
        .poll(async () => (await output.locator(".cm-line").allTextContents()).join("\n"))
        .toContain("?keep=1");
      const generated = (await output.locator(".cm-line").allTextContents()).join("\n");
      expect(generated).toContain('import axios from "axios";');
      const inputNode = await input.elementHandle();
      const outputNode = await output.elementHandle();
      const settingsNode = await moduleFormat.elementHandle();
      for (const layout of ["Side-by-side layout", "Stacked layout", "Side-by-side layout"]) {
        const control = page.getByRole("button", { name: layout, exact: true });
        await control.click({ timeout: 5000 });
        await settleWorkspace(page);
        expect(await control.getAttribute("aria-pressed")).toBe("true");
        expect(await input.evaluate((element, original) => element === original, inputNode)).toBe(true);
        expect(await output.evaluate((element, original) => element === original, outputNode)).toBe(true);
        expect(await moduleFormat.evaluate((element, original) => element === original, settingsNode)).toBe(true);
        expect((await input.locator(".cm-line").allTextContents()).join("\n")).toBe(`${source}?keep=1`);
        expect((await output.locator(".cm-line").allTextContents()).join("\n")).toBe(generated);
        expect(await moduleFormat.isVisible()).toBe(true);
        expect(await moduleFormat.textContent()).toContain("ES module import");
      }
      await input.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
      await expect.poll(async () => (await input.locator(".cm-line").allTextContents()).join("\n")).toBe(source);
      expect(await page.evaluate(() => localStorage.getItem("canopy:workbench-layout:curl-to-axios"))).toBe(
        "side-by-side",
      );
      await page.reload();
      await expect
        .poll(() => page.getByRole("button", { name: "Side-by-side layout", exact: true }).getAttribute("aria-pressed"))
        .toBe("true");
      expect(await page.getByRole("button", { name: "Restore settings panel", exact: true }).isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  },
);

test.skipIf(!baseURL)(
  "focus mode preserves Markdown edits, pane state, settings and keyboard recovery",
  { timeout: 60000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
      await page.goto(`${baseURL}/devtools/markdown-previewer`);
      const input = page.getByRole("textbox", { name: "Markdown document", exact: true });
      await input.fill("# My draft\n\nKeep this text.");
      await page.getByRole("button", { name: "Expand workspace", exact: true }).click();
      const workspace = page.locator('[data-slot="workbench-shell"]');
      expect(await page.getByRole("button", { name: "Sign in", exact: true }).isVisible()).toBe(false);
      await page.getByRole("tab", { name: "Preview", exact: true }).click();
      await page.getByRole("tab", { name: "Input", exact: true }).click();
      expect((await input.locator(".cm-line").allTextContents()).join("\n")).toBe("# My draft\n\nKeep this text.");
      await input.click();
      await page.keyboard.press("End");
      await page.keyboard.type(" Extra");
      await page.getByRole("tab", { name: "Split", exact: true }).click();
      await input.click();
      await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
      expect((await input.locator(".cm-line").allTextContents()).join("\n")).toBe("# My draft\n\nKeep this text.");
      await page.getByRole("button", { name: "Restore settings panel", exact: true }).click();
      await page.getByRole("combobox", { name: "Preview mode", exact: true }).click();
      await page.keyboard.press("Escape");
      expect(await workspace.getAttribute("data-focus-mode")).toBe("true");
      await page.keyboard.press("Escape");
      await expect.poll(() => workspace.getAttribute("data-focus-mode")).toBe("false");
      expect((await input.locator(".cm-line").allTextContents()).join("\n")).toBe("# My draft\n\nKeep this text.");
      expect(
        await page
          .getByRole("button", { name: "Expand workspace", exact: true })
          .evaluate((el) => el === document.activeElement),
      ).toBe(true);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.getByRole("button", { name: "Expand workspace", exact: true }).click();
      await settleWorkspace(page);
      const rect = await workspace.boundingBox();
      expect(rect.width).toBe(1280);
      expect(rect.height).toBe(720);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await browser.close();
    }
  },
);

test.skipIf(!baseURL)(
  "shared focus mode is available on JSON, generator and Media tools",
  { timeout: 60000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      for (const route of ["devtools/json-viewer", "devtools/uuid-generator", "media/merge-pdf"]) {
        await page.goto(`${baseURL}/${route}`);
        await page.getByRole("button", { name: "Expand workspace", exact: true }).click();
        expect(await page.locator('[data-slot="workbench-shell"]').getAttribute("data-focus-mode")).toBe("true");
        await page.getByRole("button", { name: "Exit focus mode", exact: true }).click();
        await expect
          .poll(() => page.locator('[data-slot="workbench-shell"]').getAttribute("data-focus-mode"))
          .toBe("false");
      }
    } finally {
      await browser.close();
    }
  },
);

test.skipIf(!baseURL)(
  "published Paperwork routes support focus views without losing form values",
  { timeout: 120000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      for (const route of [
        "invoice-generator",
        "receipt-generator",
        "expense-report",
        "mileage-log",
        "quarterly-tax-estimator",
        "1099-nec-tracker",
      ]) {
        await page.goto(`${baseURL}/paperwork/${route}`);
        const field = page.locator('input[type="text"]:visible').first();
        const value = (await field.count()) ? await field.inputValue() : null;
        await page.getByRole("button", { name: "Expand workspace", exact: true }).click();
        await page.getByRole("tab", { name: "Preview", exact: true }).click();
        await page.getByRole("tab", { name: "Input", exact: true }).click();
        await page.getByRole("button", { name: "Exit focus mode", exact: true }).click();
        if (value !== null) expect(await field.inputValue()).toBe(value);
        await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
      }
    } finally {
      await browser.close();
    }
  },
);

test.skipIf(!baseURL)(
  "mobile exposes one pane at a time and Escape works inside the document preview",
  { timeout: 60000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`${baseURL}/devtools/markdown-previewer`);
      await page.getByRole("button", { name: "Example", exact: true }).click();
      await page.getByRole("button", { name: "Expand workspace", exact: true }).click();
      expect(await page.getByRole("tab", { name: "Split", exact: true }).count()).toBe(0);
      await page.getByRole("tab", { name: "Preview", exact: true }).click();
      const preview = page.frameLocator('iframe[title="Generated HTML preview"]').locator("body");
      await preview.click();
      await preview.press("Escape");
      await expect
        .poll(() => page.locator('[data-slot="workbench-shell"]').getAttribute("data-focus-mode"))
        .toBe("false");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await browser.close();
    }
  },
);

test.skipIf(!baseURL)("view switching restores the user's split proportion", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.goto(`${baseURL}/devtools/markdown-previewer`);
    await page.getByRole("button", { name: "Expand workspace", exact: true }).click();
    const handle = page.getByRole("separator", { name: "Resize workspace panels", exact: true }).first();
    await settleWorkspace(page);
    const rect = await handle.boundingBox();
    await page.mouse.move(rect.x, rect.y + 100);
    await page.mouse.down();
    await page.mouse.move(rect.x - 120, rect.y + 100, { steps: 10 });
    await page.mouse.up();
    const proportion = Number(await handle.getAttribute("aria-valuenow"));
    expect(proportion).toBeLessThan(48);
    await page.getByRole("tab", { name: "Preview", exact: true }).click();
    await page.getByRole("tab", { name: "Split", exact: true }).click();
    await settleWorkspace(page);
    expect(Math.abs(Number(await handle.getAttribute("aria-valuenow")) - proportion)).toBeLessThan(1);
  } finally {
    await browser.close();
  }
});

test.skipIf(!baseURL)("reduced motion skips workspace and pane animations", { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });
    await page.goto(`${baseURL}/devtools/markdown-previewer`);
    await page.getByRole("button", { name: "Expand workspace", exact: true }).click();
    await page.getByRole("tab", { name: "Preview", exact: true }).click();
    const workspace = page.locator('[data-slot="workbench-shell"]');
    expect(
      await workspace.evaluate(
        (element) =>
          element.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length,
      ),
    ).toBe(0);
    expect((await workspace.boundingBox()).width).toBe(1366);
    await page.getByRole("button", { name: "Exit focus mode", exact: true }).click();
    expect(await workspace.getAttribute("data-focus-mode")).toBe("false");
  } finally {
    await browser.close();
  }
});

test.skipIf(!baseURL)(
  "focus resizes continuously without scaling text or snapping back on close",
  { timeout: 60000 },
  async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`${baseURL}/devtools/markdown-previewer`);
      await page.getByRole("button", { name: "Expand workspace", exact: true }).waitFor();
      for (const opening of [true, false]) {
        const frames = await page.locator('[data-slot="workbench-shell"]').evaluate(async (element) => {
          element.querySelector("[data-workbench-focus-trigger]").click();
          const samples = [];
          const start = performance.now();
          while (performance.now() - start < 500) {
            await new Promise(requestAnimationFrame);
            samples.push({ top: element.getBoundingClientRect().top, transform: getComputedStyle(element).transform });
          }
          return samples;
        });
        expect(frames.every((frame) => frame.transform === "none")).toBe(true);
        expect(new Set(frames.map((frame) => Math.round(frame.top))).size).toBeGreaterThan(3);
        for (let index = 1; index < frames.length; index++) {
          const movement = frames[index].top - frames[index - 1].top;
          expect(opening ? movement : -movement).toBeLessThanOrEqual(1);
        }
      }
    } finally {
      await browser.close();
    }
  },
);
