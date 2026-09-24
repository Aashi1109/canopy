import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

// Root-relative "@/..." alias mirrors tsconfig paths so tests resolve app modules
// the same way the app does.
const root = fileURLToPath(new URL(".", import.meta.url));

// The tool framework dynamically imports tool modules by key without a file
// extension (e.g. import(`../../tools/${key}/definition`)), relying on the
// Next.js/webpack context-module bundler. Vite's dynamic-import-vars rewrites
// these into a build-time glob map, which bypasses vitest's module runner:
// vi.mock never applies and missing tools throw a Vite-specific message the
// worker cannot classify. Marking them @vite-ignore leaves the import for the
// runner to resolve, so vi.mock works and missing modules raise the Node-style
// "Cannot find module" the framework already handles. Test-only; app runtime
// is unchanged.
const toolDynamicImportExtensions: Plugin = {
  name: "canopy-tool-dynamic-import-runner",
  enforce: "pre",
  transform(code, id) {
    if (!/\.[cm]?tsx?$/.test(id) || !code.includes("/tools/") || !code.includes("import(`")) return null;
    const patched = code.replace(/import\((`[^`]*\/tools\/\$\{[^`]*`)\)/g, "import(/* @vite-ignore */ $1)");
    return patched === code ? null : { code: patched, map: null };
  },
};

export default defineConfig({
  plugins: [toolDynamicImportExtensions],
  resolve: {
    alias: { "@": root },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.mjs"],
    // Playwright specs run under their own runner; integration tests are opt-in.
    exclude: ["tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
    },
  },
});
