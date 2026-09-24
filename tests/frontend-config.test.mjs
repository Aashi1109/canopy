import { test, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

async function readText(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the root-owned frontend has one manifest and merged Next.js configuration", async () => {
  const [baseTypescript, theme, packageJson, nextConfig, postcssConfig, tsconfig] = await Promise.all([
    readJson("tsconfig.base.json"),
    readText("components/ui/theme.css"),
    readJson("package.json"),
    readText("next.config.ts"),
    readText("postcss.config.mjs"),
    readJson("tsconfig.json"),
  ]);

  expect(packageJson.name).toBe("canopy");
  expect(packageJson.private).toBe(true);
  expect(baseTypescript.compilerOptions.strict).toBe(true);
  expect(theme).toMatch(/@source\s+["']\.["'];/);
  expect(theme).toMatch(/@theme\s*\{/);

  for (const dependency of [
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
    expect(typeof packageJson.dependencies[dependency], `${dependency} must belong to the root application`).toBe(
      "string",
    );
  }
  for (const dependency of ["@tailwindcss/postcss", "postcss", "tailwindcss", "typescript"]) {
    expect(typeof packageJson.devDependencies[dependency], `${dependency} must belong to the root application`).toBe(
      "string",
    );
  }

  expect(nextConfig).toMatch(/output:\s*["']standalone["']/);
  expect(nextConfig).toMatch(/outputFileTracingRoot:\s*appRoot/);
  expect(nextConfig).toMatch(/reactStrictMode:\s*true/);
  expect(nextConfig).not.toMatch(/next\.config\.shared/);
  expect(nextConfig).toMatch(/bodySizeLimit:\s*["']6mb["']/);
  expect(nextConfig).toMatch(/module:\s*\{\s*browser:/);
  expect(nextConfig).toMatch(/transpilePackages:\s*\[/);
  for (const dependency of ["@jsquash/jpeg", "heic-to", "pdfjs-dist", "qpdf-wasm"]) {
    expect(nextConfig).toMatch(new RegExp(`["']${dependency}["']`));
  }
  expect(nextConfig).toMatch(/source:\s*["']\/media\/:path\*["']/);
  expect(nextConfig).not.toMatch(/source:\s*["']\/\(\.\*\)["']/);

  expect(postcssConfig).toMatch(/["']@tailwindcss\/postcss["']/);
  expect(tsconfig.extends).toBe("./tsconfig.base.json");
  expect(tsconfig.compilerOptions).toEqual({
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
  const theme = await readText("components/ui/theme.css");

  expect(rootStyles).toBeTruthy();
  expect(rootStyles.source).toMatch(/^@import "tailwindcss";\n@import "\.\.\/components\/ui\/theme\.css";/);
  expect(
    stylesheets.reduce((count, { source }) => count + (source.match(/@import ["']tailwindcss["'];/g) ?? []).length, 0),
  ).toBe(1);
  expect(
    stylesheets.reduce(
      (count, { source }) => count + (source.match(/@import ["']\.\.\/components\/ui\/theme\.css["'];/g) ?? []).length,
      0,
    ),
  ).toBe(1);
  expect(layout).toMatch(/import ["']\.\/globals\.css["']/);
  expect(layout).toMatch(/\bGeist_Mono\b/);
  expect(layout).toMatch(/variable:\s*["']--font-geist-mono["']/);
  expect(layout).toMatch(/\bgeistMono\.variable\b/);
  expect(theme).toMatch(/--font-mono:\s*var\(--font-geist-mono,\s*["']Geist Mono["']\),\s*ui-monospace,\s*monospace;/);
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

  expect(environment).toMatch(/^APP_URL=http:\/\/localhost:3000$/m);
  expect(environment).not.toMatch(/(?:PLATFORM|PAPERWORK|DEVTOOLS|MEDIA)_URL=/);
  for (const source of [platformPage, authPage]) {
    expect(source).not.toMatch(/http:\/\/localhost:300[1-9]/);
  }
  for (const path of ["/paperwork", "/devtools", "/media"]) {
    expect(platformPage).toMatch(new RegExp(`["']${path}["']`));
    expect(authPage).toMatch(new RegExp(`["']${path}["']`));
  }
  expect(adminTools).toMatch(/app:\s*["']media["']/);
  expect(devtoolsPage).toMatch(/Web & Markup Tools/);
  expect(devtoolsPage).not.toMatch(/PDF & Document Tools/);
  expect(playwright).toMatch(/APP_URL:\s*["']http:\/\/localhost:3000["']/);
  expect(playwright).toMatch(/webServer:\s*\{/);
  expect(playwright).toMatch(/command:\s*["']pnpm dev["']/);
  expect(playwright).not.toMatch(/@canopy\/platform/);
  expect(playwright).not.toMatch(/localhost:300[1-9]/);
});

test("Media HEIC dependency and corresponding-source notice stay in sync", async () => {
  const [packageJson, notice] = await Promise.all([
    readJson("package.json"),
    readText("public/media/licenses/heic-to-NOTICE.txt"),
  ]);
  const version = packageJson.dependencies["heic-to"];

  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(notice).toMatch(new RegExp(`heic-to ${version.replaceAll(".", "\\.")}`));
  expect(notice).toMatch(new RegExp(`heic-to-${version.replaceAll(".", "\\.")}\\.tgz`));
  expect(notice).toMatch(new RegExp(`/tree/v${version.replaceAll(".", "\\.")}`));
});
