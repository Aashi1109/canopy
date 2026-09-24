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
