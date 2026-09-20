import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("wrangler/package.json"))("esbuild") as {
  build(options: Record<string, unknown>): Promise<{ outputFiles: { path: string; text: string }[] }>;
};
const source =
  '# A reusable preview\n\nFirst line\nSecond line\n\n![Useful image](./picture.svg)\n\n![Unsafe image](javascript:alert%281%29)\n\n<img src=x onerror="window.injected=true">\n\n- [x] Completed task\n- [ ] Next task\n\n```js\nconst answer = 42;\n```';
let html: string;

test.beforeAll(async () => {
  const root = process.cwd();
  const directory = await mkdtemp(resolve(tmpdir(), "canopy-markdown-component-"));
  const entry = resolve(directory, "entry.tsx");
  await writeFile(
    entry,
    `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {MarkdownPreview} from '${root}/components/content/MarkdownPreview.tsx';
    function App() {
      const [markdown,setMarkdown]=useState(${JSON.stringify(source)});
      return <main style={{maxWidth:900,margin:'auto',padding:24}}>
        <label>Preview source<textarea aria-label="Preview source" style={{display:'block',width:'100%',height:100}} value={markdown} onChange={event=>setMarkdown(event.target.value)}/></label>
        <section aria-label="Standalone preview"><MarkdownPreview markdown={markdown}/></section>
        <section aria-label="Configured preview"><MarkdownPreview markdown={'# Host heading\\n\\nFirst line\\nSecond line'} minimumHeadingLevel={2} breaks/></section>
      </main>;
    }
    createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
  `,
  );
  const bundle = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    outdir: directory,
    absWorkingDir: root,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    nodePaths: [resolve(root, "node_modules")],
    tsconfig: resolve(root, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    loader: { ".png": "dataurl", ".svg": "dataurl", ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl" },
  });
  const javascript = bundle.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  await writeFile("/tmp/canopy-markdown-component.js", javascript);
  const css = bundle.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
  const globals = await postcss([tailwind({ base: root })]).process(
    await readFile(resolve(root, "app/globals.css"), "utf8"),
    { from: resolve(root, "app/globals.css") },
  );
  html = `<!doctype html><html><head><style>${globals.css}\n${css}</style></head><body><div id="root"></div><script>${javascript.replaceAll("</script", "<\\/script")}</script></body></html>`;
});

test("standalone Markdown supports images, safe rendering, multiple instances and streamed replacements", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  const unexpectedRequests: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.stack);
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://markdown.test" });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
    if (url.pathname === "/picture.svg")
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="100"><rect width="2400" height="100" fill="green"/></svg>',
      });
    unexpectedRequests.push(url.pathname);
    return route.abort();
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("https://markdown.test");
  const preview = page.getByRole("region", { name: "Standalone preview" });
  const configured = page.getByRole("region", { name: "Configured preview" });
  await expect(preview.getByRole("heading", { level: 1 })).toHaveText("A reusable preview");
  await expect(configured.getByRole("heading", { level: 2 })).toHaveText("Host heading");
  await expect(configured.locator("br")).toHaveCount(1);
  await expect(preview.getByAltText("Useful image")).toBeVisible();
  await expect(preview.locator("img")).toHaveCount(1);
  await expect(preview).toContainText("Unsafe image");
  await expect(preview).toContainText('<img src=x onerror="window.injected=true">');
  expect(await page.evaluate(() => (window as Window & { injected?: boolean }).injected)).toBeUndefined();
  await expect(preview.getByRole("checkbox")).toHaveCount(2);
  await preview.getByRole("checkbox", { name: "Completed", exact: true }).click();
  await expect(preview.getByRole("checkbox", { name: "Completed", exact: true })).toBeChecked();
  const copy = preview.getByRole("button", { name: "Copy code", exact: true });
  await copy.focus();
  await copy.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("const answer = 42;");
  await page.screenshot({ path: "/tmp/canopy-markdown-preview-1366.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(
    await preview
      .getByAltText("Useful image")
      .evaluate((image) => image.getBoundingClientRect().width <= image.parentElement!.getBoundingClientRect().width),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/canopy-markdown-preview-1280.png", fullPage: true });
  await page
    .getByRole("textbox", { name: "Preview source" })
    .fill("```mermaid\nflowchart LR\n A[Input] --> B[Preview]\n```");
  await preview.getByRole("button", { name: "Open Mermaid diagram preview" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "100%", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const markdown of [
    "An **unfinished",
    "## Updated\n\n- [ ] Updated task\n\n```js\nlet changed = 1;\n```",
    "Plain response",
  ]) {
    await page.getByRole("textbox", { name: "Preview source" }).fill(markdown);
    if (markdown === "Plain response") {
      await expect(preview).toHaveText("Plain response");
      await expect(preview.getByRole("checkbox")).toHaveCount(0);
      await expect(preview.getByRole("button")).toHaveCount(0);
    }
  }
  await expect(configured.getByRole("heading", { level: 2 })).toHaveText("Host heading");
  expect(unexpectedRequests).toEqual([]);
  expect(errors).toEqual([]);
});
