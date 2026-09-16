import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

async function readText(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the root-owned frontend has one manifest and merged Next.js configuration", async () => {
  const [baseTypescript, uiPackage, theme, packageJson, nextConfig, postcssConfig, tsconfig] = await Promise.all([
    readJson("tsconfig.base.json"),
    readJson("packages/ui/package.json"),
    readText("packages/ui/src/theme.css"),
    readJson("package.json"),
    readText("next.config.ts"),
    readText("postcss.config.mjs"),
    readJson("tsconfig.json"),
  ]);

  assert.equal(packageJson.name, "smarttools");
  assert.equal(packageJson.private, true);
  assert.equal(baseTypescript.compilerOptions.strict, true);
  assert.equal(uiPackage.exports["./theme.css"], "./src/theme.css");
  assert.match(theme, /@source\s+["']\.["'];/);
  assert.match(theme, /@theme\s*\{/);

  for (const dependency of [
    "@smarttools/auth",
    "@smarttools/authorization",
    "@smarttools/control-plane",
    "@smarttools/database",
    "@smarttools/invoice-templates",
    "@smarttools/tool-catalog",
    "@smarttools/ui",
    "@jsquash/jpeg",
    "@pdfme/generator",
    "@react-pdf/renderer",
    "@uiw/react-codemirror",
    "better-auth",
    "heic-to",
    "next",
    "pdfjs-dist",
    "qpdf-wasm",
    "react",
    "react-dom",
  ]) {
    assert.equal(
      typeof packageJson.dependencies[dependency],
      "string",
      `${dependency} must belong to the root application`,
    );
  }
  for (const dependency of ["@tailwindcss/postcss", "postcss", "tailwindcss", "typescript"]) {
    assert.equal(
      typeof packageJson.devDependencies[dependency],
      "string",
      `${dependency} must belong to the root application`,
    );
  }

  assert.match(nextConfig, /output:\s*["']standalone["']/);
  assert.match(nextConfig, /outputFileTracingRoot:\s*appRoot/);
  assert.match(nextConfig, /reactStrictMode:\s*true/);
  assert.doesNotMatch(nextConfig, /next\.config\.shared/);
  assert.match(nextConfig, /bodySizeLimit:\s*["']6mb["']/);
  assert.match(nextConfig, /module:\s*\{\s*browser:/);
  assert.match(nextConfig, /transpilePackages:\s*\[/);
  for (const dependency of [
    "@smarttools/auth",
    "@smarttools/ui",
    "@jsquash/jpeg",
    "heic-to",
    "pdfjs-dist",
    "qpdf-wasm",
  ]) {
    assert.match(nextConfig, new RegExp(`["']${dependency}["']`));
  }
  assert.match(nextConfig, /source:\s*["']\/media\/:path\*["']/);
  assert.doesNotMatch(nextConfig, /source:\s*["']\/\(\.\*\)["']/);

  assert.match(postcssConfig, /["']@tailwindcss\/postcss["']/);
  assert.equal(tsconfig.extends, "./tsconfig.base.json");
  assert.deepEqual(tsconfig.compilerOptions, {
    paths: {
      "@/*": ["./*"],
    },
  });
});

test("Tailwind and the shared theme are imported once at the root layout", async () => {
  const stylesheetPaths = (await readdir(new URL("app/", root), { recursive: true })).filter((path) =>
    path.endsWith(".css"),
  );
  const stylesheets = await Promise.all(
    stylesheetPaths.map(async (path) => ({
      path,
      source: await readText(`app/${path}`),
    })),
  );
  const rootStyles = stylesheets.find(({ path }) => path === "globals.css");
  const layout = await readText("app/layout.tsx");
  const theme = await readText("packages/ui/src/theme.css");

  assert.ok(rootStyles);
  assert.match(rootStyles.source, /^@import "tailwindcss";\n@import "@smarttools\/ui\/theme\.css";/);
  assert.equal(
    stylesheets.reduce((count, { source }) => count + (source.match(/@import ["']tailwindcss["'];/g) ?? []).length, 0),
    1,
  );
  assert.equal(
    stylesheets.reduce(
      (count, { source }) => count + (source.match(/@import ["']@smarttools\/ui\/theme\.css["'];/g) ?? []).length,
      0,
    ),
    1,
  );
  assert.match(layout, /import ["']\.\/globals\.css["']/);
  assert.match(layout, /\bGeist_Mono\b/);
  assert.match(layout, /variable:\s*["']--font-geist-mono["']/);
  assert.match(layout, /\bgeistMono\.variable\b/);
  assert.match(theme, /--font-mono:\s*var\(--font-geist-mono,\s*["']Geist Mono["']\),\s*ui-monospace,\s*monospace;/);
});

test("frontend navigation and browser tests use one origin with scoped paths", async () => {
  const [environment, platformPage, authPage, adminTools, devtoolsPage, playwright] = await Promise.all([
    readText(".env.example"),
    readText("app/page.tsx"),
    readText("app/auth/page.tsx"),
    readText("app/admin/(protected)/tools/components/ToolList.tsx"),
    // Category labels moved out of the catalogue page into the one registry —
    // now the single source, so there is no second copy left to cross-check.
    readText("lib/tool-framework/categories.ts"),
    readText("playwright.config.ts"),
  ]);

  assert.match(environment, /^APP_URL=http:\/\/localhost:3000$/m);
  assert.doesNotMatch(environment, /(?:PLATFORM|PAPERWORK|DEVTOOLS|MEDIA)_URL=/);
  for (const source of [platformPage, authPage]) {
    assert.doesNotMatch(source, /http:\/\/localhost:300[1-9]/);
  }
  for (const path of ["/paperwork", "/devtools", "/media"]) {
    assert.match(platformPage, new RegExp(`["']${path}["']`));
    assert.match(authPage, new RegExp(`["']${path}["']`));
  }
  assert.match(adminTools, /app:\s*["']media["']/);
  assert.match(devtoolsPage, /Web & Markup Tools/);
  assert.doesNotMatch(devtoolsPage, /PDF & Document Tools/);
  assert.match(playwright, /APP_URL:\s*["']http:\/\/localhost:3000["']/);
  assert.match(playwright, /webServer:\s*\{/);
  assert.match(playwright, /command:\s*["']pnpm dev["']/);
  assert.doesNotMatch(playwright, /@smarttools\/platform/);
  assert.doesNotMatch(playwright, /localhost:300[1-9]/);
});

test("Media HEIC dependency and corresponding-source notice stay in sync", async () => {
  const [packageJson, notice] = await Promise.all([
    readJson("package.json"),
    readText("public/media/licenses/heic-to-NOTICE.txt"),
  ]);
  const version = packageJson.dependencies["heic-to"];

  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.match(notice, new RegExp(`heic-to ${version.replaceAll(".", "\\.")}`));
  assert.match(notice, new RegExp(`heic-to-${version.replaceAll(".", "\\.")}\\.tgz`));
  assert.match(notice, new RegExp(`/tree/v${version.replaceAll(".", "\\.")}`));
});
