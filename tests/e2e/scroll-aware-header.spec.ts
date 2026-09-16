import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let scratch: string;
let script: string;
let css: string;

test.beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "canopy-scroll-header-"));
  const root = resolve(import.meta.dirname, "../..");
  await writeFile(
    join(scratch, "fixture.tsx"),
    `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { ScrollAwareHeader } from ${JSON.stringify(join(root, "packages/ui/src/components/ScrollAwareHeader.tsx"))};
    let childRenders = 0;
    function Child() {
      childRenders += 1;
      return <output aria-label="Navigation child render count">{childRenders}</output>;
    }
    function Fixture() {
      const [open, setOpen] = useState(false);
      return <>
        <ScrollAwareHeader aria-label="Product navigation" className="bg-white" style={{ height: 80 }}>
          <a href="#content">SmartTools</a>
          <Child />
          <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>Account</button>
        </ScrollAwareHeader>
        <main id="content" style={{ height: 5000, padding: 24 }}>
          <h1>Tool workspace</h1>
          <button type="button" onClick={() => setOpen(false)}>Close account externally</button>
          <div role="region" aria-label="Scrollable editor" tabIndex={0} style={{ height: 200, overflow: "auto" }}>
            <div style={{ height: 1200 }}>Nested document</div>
          </div>
        </main>
      </>;
    }
    createRoot(document.getElementById("root")!).render(<Fixture />);
  `,
  );
  await writeFile(
    join(scratch, "loader.cjs"),
    `
    const { loadBindings, transform } = require(${JSON.stringify(join(root, "node_modules/next/dist/build/swc"))});
    module.exports = function(source) {
      const done = this.async();
      loadBindings().then(() => transform(source, { filename: this.resourcePath, jsc: {
        parser: { syntax: "typescript", tsx: true }, target: "es2020",
        transform: { react: { runtime: "automatic" } }
      }, module: { type: "es6" } })).then(result => done(null, result.code), done);
    };
  `,
  );
  await writeFile(
    join(scratch, "build.cjs"),
    `
    const { createRequire } = require("node:module");
    const requireRoot = createRequire(${JSON.stringify(join(root, "package.json"))});
    const { webpack } = requireRoot("next/dist/compiled/webpack/webpack");
    const compiler = webpack({ mode: "development", devtool: false,
      entry: ${JSON.stringify(join(scratch, "fixture.tsx"))},
      output: { path: ${JSON.stringify(scratch)}, filename: "fixture.js" },
      resolve: { extensions: [".tsx", ".ts", ".js"], modules: [${JSON.stringify(join(root, "node_modules"))}, "node_modules"] },
      module: { rules: [{ test: /\\.tsx?$/, use: ${JSON.stringify(join(scratch, "loader.cjs"))} }] }
    });
    compiler.run((error, stats) => compiler.close(() => {
      if (error || stats.hasErrors()) { console.error(error || stats.toString({ all: false, errors: true })); process.exitCode = 1; }
    }));
    requireRoot("postcss")([requireRoot("@tailwindcss/postcss")()])
      .process(${JSON.stringify(`@import "tailwindcss" source(none); @import "${join(root, "packages/ui/src/theme.css")}";`)}, { from: ${JSON.stringify(join(root, "scroll-fixture.css"))} })
      .then(result => require("node:fs").writeFileSync(${JSON.stringify(join(scratch, "fixture.css"))}, result.css));
  `,
  );
  execFileSync(process.execPath, [join(scratch, "build.cjs")], { cwd: root, timeout: 60_000 });
  [script, css] = await Promise.all([
    readFile(join(scratch, "fixture.js"), "utf8"),
    readFile(join(scratch, "fixture.css"), "utf8"),
  ]);
});

test.afterAll(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

test.beforeEach(async ({ page }) => {
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(page.getByRole("heading", { name: "Tool workspace" })).toBeVisible();
  await page.mouse.move(1000, 700);
});

async function scrollTo(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.waitForTimeout(100);
}

async function expectHeader(page: Page, shown: boolean) {
  const header = page.getByRole("banner", { name: "Product navigation" });
  await expect
    .poll(() =>
      header.evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        return bounds.bottom <= 1 ? "hidden" : bounds.top >= -1 ? "shown" : "moving";
      }),
    )
    .toBe(shown ? "shown" : "hidden");
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`navbar follows scroll direction without jumping or jitter at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await expectHeader(page, true);
    const renders = await page.getByLabel("Navigation child render count").textContent();
    await scrollTo(page, 3);
    await expectHeader(page, true);
    await scrollTo(page, 500);
    await expectHeader(page, false);
    await page.screenshot({ path: `/tmp/canopy-navbar-hidden-${viewport.width}.png` });
    await scrollTo(page, 498);
    await expectHeader(page, false);
    await scrollTo(page, 450);
    await expectHeader(page, true);
    await page.screenshot({ path: `/tmp/canopy-navbar-shown-${viewport.width}.png` });
    await scrollTo(page, 452);
    await expectHeader(page, true);
    await scrollTo(page, 472);
    await expectHeader(page, false);
    await scrollTo(page, 700);
    await expectHeader(page, false);
    await scrollTo(page, 100_000);
    await expectHeader(page, false);
    await page.evaluate(() => window.scrollBy(0, -70));
    await expectHeader(page, true);
    await scrollTo(page, 0);
    await expectHeader(page, true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByLabel("Navigation child render count")).toHaveText(renders!);
  });
}

test("focus and an open account menu keep navigation available; nested scroll is ignored", async ({ page }) => {
  const account = page.getByRole("button", { name: "Account", exact: true });
  await account.focus();
  await scrollTo(page, 500);
  await expectHeader(page, true);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await scrollTo(page, 700);
  await expectHeader(page, false);
  const scrollBeforeFocus = await page.evaluate(() => scrollY);
  await account.focus();
  await expectHeader(page, true);
  expect(await page.evaluate(() => scrollY)).toBe(scrollBeforeFocus);
  await account.click();
  await expect(account).toHaveAttribute("aria-expanded", "true");
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await scrollTo(page, 1000);
  await expectHeader(page, true);
  await page
    .getByRole("button", { name: "Close account externally" })
    .evaluate((node: HTMLButtonElement) => node.click());
  await scrollTo(page, 1200);
  await expectHeader(page, false);
  await scrollTo(page, 0);
  const editor = page.getByRole("region", { name: "Scrollable editor" });
  await editor.evaluate((node) => {
    node.scrollTop = 700;
  });
  await page.waitForTimeout(100);
  await expectHeader(page, true);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test("reduced motion keeps directional navigation without animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await scrollTo(page, 500);
  await expectHeader(page, false);
  expect(
    await page.getByRole("banner", { name: "Product navigation" }).evaluate(
      (node) =>
        getComputedStyle(node).transitionProperty === "none" ||
        getComputedStyle(node)
          .transitionDuration.split(",")
          .every((value) => parseFloat(value) === 0),
    ),
  ).toBe(true);
  await scrollTo(page, 400);
  await expectHeader(page, true);
});
