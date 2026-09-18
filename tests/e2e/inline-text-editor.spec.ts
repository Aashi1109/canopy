import { expect, test, type Locator } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let scratch: string;
let script: string;
let css: string;

test.beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "canopy-inline-editor-"));
  const root = resolve(import.meta.dirname, "../..");
  await writeFile(
    join(scratch, "fixture.tsx"),
    `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { InlineTextEditor } from ${JSON.stringify(join(root, "components/ui/components/InlineTextEditor.tsx"))};
    function Fixture() {
      const [name, setName] = useState("Initial role");
      const [description, setDescription] = useState("Short description");
      const [saves, setSaves] = useState(0);
      const [saved, setSaved] = useState("");
      return <main style={{ padding: 20, paddingTop: 72, maxWidth: 640 }}>
        <form onSubmit={event => {
          event.preventDefault();
          setSaves(count => count + 1);
          setSaved(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))));
        }}>
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="description" value={description} />
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 32, lineHeight: "40px", fontWeight: 700, letterSpacing: "1.2px" }}>
            <InlineTextEditor label="Role name" value={name} onChange={setName} required maxLength={40} />
          </h2>
          <p style={{ fontFamily: "Arial, sans-serif", fontSize: 17, lineHeight: "25px", fontWeight: 400, letterSpacing: ".3px" }}>
            <InlineTextEditor label="Description" value={description} onChange={setDescription} multiline maxLength={1000} />
          </p>
          <InlineTextEditor label="Read only" value="Locked content" onChange={() => { throw Error("Disabled editor changed"); }} disabled />
          <button type="button">Outside field</button>
          <button type="submit">Save role</button>
        </form>
        <output aria-label="Live role name">{name}</output>
        <output aria-label="Live description">{description}</output>
        <output aria-label="Save count">{saves}</output>
        <output aria-label="Saved values">{saved}</output>
      </main>;
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
      .process(${JSON.stringify(`@import "tailwindcss" source(none); @import "${join(root, "components/ui/theme.css")}";`)}, { from: ${JSON.stringify(join(root, "inline-fixture.css"))} })
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
  await expect(page.getByRole("heading", { name: /Initial role/ })).toBeVisible();
});

async function typography(element: Locator) {
  return element.evaluate((node) => {
    const style = getComputedStyle(node);
    return [style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight, style.letterSpacing];
  });
}

async function expectBelow(lower: Locator, upper: Locator) {
  const upperBox = (await upper.boundingBox())!;
  const lowerBox = (await lower.boundingBox())!;
  expect(lowerBox.y).toBeGreaterThanOrEqual(upperBox.y + upperBox.height - 1);
}

test("inline editing inherits typography, updates live, and leaves saving to the parent", async ({ page }) => {
  const heading = page.getByRole("heading", { name: /Initial role/ });
  const originalTypography = await typography(heading);
  const displayedName = heading.getByText("Initial role", { exact: true });
  await displayedName.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Double-click text or use the pencil to edit");
  const textRight = await displayedName.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect().right;
  });
  const pencilLeft = (await page.getByRole("button", { name: "Edit Role name", exact: true }).boundingBox())!.x;
  expect(pencilLeft - textRight).toBeGreaterThanOrEqual(0);
  expect(pencilLeft - textRight).toBeLessThanOrEqual(12);
  await page.screenshot({ path: "/tmp/canopy-inline-idle.png" });
  await displayedName.dblclick();
  const name = page.getByRole("textbox", { name: "Role name", exact: true });
  await expect(name).toBeFocused();
  expect(await typography(name)).toEqual(originalTypography);
  await name.fill("Hi");
  const shortWidth = (await name.boundingBox())!.width;
  expect(shortWidth).toBeLessThan((await name.locator("..").boundingBox())!.width / 2);
  await name.fill("Updated role");
  expect((await name.boundingBox())!.width).toBeGreaterThan(shortWidth);
  await expect(page.getByLabel("Live role name")).toHaveText("Updated role");
  const nameHint = page.getByText("Enter to finish · Esc to cancel", { exact: true });
  await expectBelow(nameHint, name);
  await expectBelow(page.locator("form").getByText("Short description", { exact: true }), nameHint);
  await page.screenshot({ path: "/tmp/canopy-inline-title-editing.png" });
  await name.press("Enter");
  await expect(name).toBeHidden();
  await expect(page.getByLabel("Save count")).toHaveText("0");
  const edit = page.getByRole("button", { name: "Edit Role name", exact: true });
  await expect(edit).not.toBeFocused();
  await expect(edit.locator("../..")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(edit).toBeFocused();
  await edit.press("Space");
  await name.fill("Discard this");
  await name.press("Escape");
  await expect(page.getByLabel("Live role name")).toHaveText("Updated role");
  await edit.press("Enter");
  await name.fill("Saved from focus");
  await page.getByRole("button", { name: "Save role", exact: true }).click();
  await expect(page.getByLabel("Save count")).toHaveText("1");
  await expect(page.getByLabel("Saved values")).toContainText('"name":"Saved from focus"');
  await expect(name).toBeHidden();
  await edit.click();
  await name.fill("Second discarded edit");
  await name.press("Escape");
  await expect(page.getByLabel("Live role name")).toHaveText("Saved from focus");
  await edit.click();
  await name.fill("Held pointer save");
  const saveBox = (await page.getByRole("button", { name: "Save role", exact: true }).boundingBox())!;
  await page.mouse.move(saveBox.x + saveBox.width / 2, saveBox.y + saveBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await expect(name).toBeVisible();
  await page.mouse.up();
  await expect(page.getByLabel("Save count")).toHaveText("2");
  await expect(page.getByLabel("Saved values")).toContainText('"name":"Held pointer save"');
  await expect(name).toBeHidden();
});

test("validation, native length limits, IME input, and disabled fields remain safe", async ({ page }) => {
  const edit = page.getByRole("button", { name: "Edit Role name", exact: true });
  await edit.click();
  const name = page.getByRole("textbox", { name: "Role name", exact: true });
  await name.fill("   ");
  await name.press("Enter");
  await expect(name).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription("Role name is required.");
  await page.screenshot({ path: "/tmp/canopy-inline-required-error.png" });
  await page.getByRole("button", { name: "Outside field", exact: true }).click();
  await expect(name).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("Role name is required.");
  await name.fill("");
  await name.pressSequentially("x".repeat(50));
  await expect(name).toHaveValue("x".repeat(40));
  await page.setViewportSize({ width: 320, height: 812 });
  const cappedName = (await name.boundingBox())!;
  expect(cappedName.width).toBeLessThanOrEqual((await name.locator("..").boundingBox())!.width);
  expect(cappedName.x + cappedName.width).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 1000, height: 900 });
  await name.fill("Composition draft");
  await name.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
    bubbles: true,
  });
  await expect(name).toBeVisible();
  await expect(page.getByLabel("Save count")).toHaveText("0");
  await name.press("Escape");
  await expect(page.getByLabel("Live role name")).toHaveText("Initial role");
  await page.getByText("Locked content", { exact: true }).dblclick();
  await expect(page.getByRole("textbox", { name: "Read only", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Read only", exact: true })).toHaveCount(0);
});

test("multiline edits grow with content and viewport changes and support keyboard completion", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  const edit = page.getByRole("button", { name: "Edit Description", exact: true });
  const parentTypography = await typography(edit.locator("../.."));
  await edit.hover();
  await page.screenshot({ path: "/tmp/canopy-inline-description-idle.png" });
  await edit.click();
  const description = page.getByRole("textbox", { name: "Description", exact: true });
  expect(await typography(description)).toEqual(parentTypography);
  const descriptionHint = page.getByText("Enter to finish · Shift+Enter for new line · Esc to cancel", { exact: true });
  await expectBelow(description, page.getByRole("heading", { name: /Initial role/ }));
  await expectBelow(descriptionHint, description);
  const initialHeight = (await description.boundingBox())!.height;
  await description.fill("A longer description that should wrap across several lines. ".repeat(7));
  await expect.poll(async () => (await description.boundingBox())!.height).toBeGreaterThan(initialHeight);
  await page.screenshot({ path: "/tmp/canopy-inline-multiline-editing.png" });
  const wideHeight = (await description.boundingBox())!.height;
  await page.setViewportSize({ width: 320, height: 812 });
  await expect.poll(async () => (await description.boundingBox())!.height).toBeGreaterThan(wideHeight);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await description.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  await expectBelow(descriptionHint, description);
  await page.screenshot({ path: "/tmp/canopy-inline-mobile.png" });
  await description.fill("First line");
  await description.press("End");
  await description.press("Shift+Enter");
  await description.pressSequentially("Second line");
  await expect(description).toHaveValue("First line\nSecond line");
  await description.press("Enter");
  await expect(description).toBeHidden();
  await expect(edit).not.toBeFocused();
  await expect(edit.locator("../..")).toBeFocused();
  await expect(page.getByLabel("Save count")).toHaveText("0");
  await edit.click();
  await description.fill("Command finished");
  await description.press("Meta+Enter");
  await expect(description).toBeHidden();
  await expect(edit).not.toBeFocused();
  await expect(edit.locator("../..")).toBeFocused();
  await edit.click();
  await description.fill("Blur finished");
  await page.getByRole("button", { name: "Outside field", exact: true }).click();
  await expect(description).toBeHidden();
  await expect(page.getByLabel("Live description")).toHaveText("Blur finished");
});

test("Enter clears the pencil highlight until deliberate pointer or keyboard interaction", async ({ page }) => {
  for (const label of ["Role name", "Description"]) {
    const pencil = page.getByRole("button", { name: `Edit ${label}`, exact: true });
    const field = page.getByRole("textbox", { name: label, exact: true });
    await pencil.click();
    await expect(field).toBeFocused();
    await page.keyboard.down("Enter");
    await expect(field).toBeHidden();
    await page.waitForTimeout(300);
    await expect(pencil).not.toBeFocused();
    expect(await pencil.evaluate((node) => node.matches(":active"))).toBe(false);
    await expect(pencil).toHaveCSS("opacity", "0");
    await expect(pencil).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page.keyboard.up("Enter");
    await expect(pencil).toHaveCSS("opacity", "0");
    await page.screenshot({
      path: `/tmp/canopy-inline-enter-${label === "Role name" ? "title" : "description"}.png`,
    });

    const pencilBox = (await pencil.boundingBox())!;
    await page.mouse.move(pencilBox.x + pencilBox.width / 2 + 2, pencilBox.y + pencilBox.height / 2);
    await expect(pencil).toHaveCSS("opacity", "1");
    await page.mouse.move(900, 800);
    await page.keyboard.press("Tab");
    await expect(pencil).toBeFocused();
    await expect(pencil).toHaveCSS("opacity", "1");
    await pencil.press("Enter");
    await expect(field).toBeFocused();
    await field.press("Enter");
    await expect(field).toBeHidden();
    await expect(pencil).not.toBeFocused();
    await expect(pencil).toHaveCSS("opacity", "0");
  }
  await expect(page.getByLabel("Save count")).toHaveText("0");
});
