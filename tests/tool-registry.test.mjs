import { expect, test } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as catalog from "../lib/tool-catalog/index.ts";
import { TOOL_CATEGORIES } from "../lib/tool-framework/categories.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS_DIR = path.join(ROOT, "tools");

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx"]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

/**
 * Paperwork predates this architecture and is explicitly excluded from it
 * (`tools/AGENTS.md`: "Paperwork is separate and must not depend on this
 * architecture"). Its `componentKey === "invoice-generator"` branches are not
 * tool-folder dispatch and are not scheduled for deletion, so they are out of
 * scope rather than allowlisted.
 */
const OUT_OF_SCOPE = ["app/paperwork"];

/**
 * KNOWN-LEGACY LEAKS — THIS LIST MUST SHRINK TO EMPTY.
 *
 * Every file here hard-codes tool identities in shared code, and every file
 * here is deleted (or has its tool-name branch deleted) by the folder-contract
 * migration. A shared file that is NOT listed here and names a tool fails
 * immediately — that is the ratchet. Never add an entry to make a test green;
 * the only legal edit to this list is removal.
 */
const LEGACY_TOOL_NAME_LEAKS = new Set([]);

/**
 * KNOWN-LEGACY IDENTITY DISPATCH — THIS LIST MUST SHRINK TO EMPTY.
 * Same rules as above.
 */
const LEGACY_IDENTITY_DISPATCH = new Set([]);

async function walk(dir, accumulated = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return accumulated;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      await walk(full, accumulated);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      accumulated.push(full);
    }
  }
  return accumulated;
}

const relative = (file) => path.relative(ROOT, file).split(path.sep).join("/");

async function sharedSourceFiles() {
  const files = [];
  for (const dir of ["lib", "components", "app", "packages"]) {
    files.push(...(await walk(path.join(ROOT, dir))));
  }
  // Shared modules that sit directly in `tools/`, outside any tool folder.
  for (const entry of await readdir(TOOLS_DIR, { withFileTypes: true })) {
    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(TOOLS_DIR, entry.name));
    }
  }
  return files
    .map(relative)
    .filter((file) => !OUT_OF_SCOPE.some((prefix) => file.startsWith(`${prefix}/`)))
    .sort();
}

const toolFolders = (await readdir(TOOLS_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const RUN_FILENAMES = ["run.ts", "run.worker.ts", "run.server.ts"];

async function readIfPresent(file) {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * A folder counts as migrated once its `definition.ts` default-exports a spec.
 * Folders still on the old named-export shape are skipped by every
 * new-contract assertion so the suite is meaningful mid-migration.
 */
const folders = await Promise.all(
  toolFolders.map(async (name) => {
    const dir = path.join(TOOLS_DIR, name);
    const definitionPath = path.join(dir, "definition.ts");
    const definitionSource = await readIfPresent(definitionPath);
    const runFiles = [];
    for (const runFile of RUN_FILENAMES) {
      if ((await readIfPresent(path.join(dir, runFile))) !== null) runFiles.push(runFile);
    }
    return {
      name,
      dir,
      definitionPath,
      definitionSource,
      runFiles,
      migrated: definitionSource !== null && /^\s*export\s+default\b/m.test(definitionSource),
    };
  }),
);

const migrated = folders.filter((folder) => folder.migrated);
const unmigrated = folders.filter((folder) => !folder.migrated);

// A definition that cannot be loaded by a plain Node import is reported as a
// test failure, never as a suite-level crash.
const loaded = await Promise.all(
  migrated.map(async (folder) => {
    try {
      return { folder, spec: (await import(folder.definitionPath)).default };
    } catch (error) {
      return { folder, spec: null, error };
    }
  }),
);
const specs = loaded.filter((entry) => entry.spec !== null);

test("every migrated definition.ts loads standalone", () => {
  expect(
    loaded.filter((entry) => entry.error).map((entry) => `${entry.folder.name}: ${entry.error.message}`),
    "definition.ts must load without a bundler (type-only imports, no aliased values)",
  ).toEqual([]);
  expect(
    loaded
      .filter((entry) => !entry.error && (entry.spec === null || typeof entry.spec !== "object"))
      .map((entry) => entry.folder.name),
    "definition.ts must default-export a spec object",
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// The central invariant.
// ---------------------------------------------------------------------------

/**
 * Word-boundary-ish matching: a tool key may not be preceded or followed by
 * another identifier character or a hyphen. Tool folder names are kebab-case,
 * so `-` has to count as a boundary character in both directions — otherwise
 * `merge-pdf` would report a hit inside `auto-merge-pdfs` and `crop-pdf` inside
 * `crop-pdf-pages`. Lookaround (rather than \b) is what makes the hyphen
 * boundary expressible at all: `\bcrop-pdf\b` matches inside `crop-pdf-pages`.
 * Path separators, quotes and whitespace all remain boundaries, so genuine
 * leaks such as `"/media/merge-pdf"` are still caught.
 */
function keyPattern(key) {
  return new RegExp(`(?<![A-Za-z0-9-])${key.replaceAll("-", "\\-")}(?![A-Za-z0-9-])`);
}

const KEY_PATTERNS = toolFolders.map((key) => [key, keyPattern(key)]);

/**
 * Dispatch on tool identity. Narrower than a bare `key === "..."` scan on
 * purpose: `key`, `slug` and `operation` are ordinary words, and matching them
 * against any literal flags settings loops and auth navigation that have
 * nothing to do with tools. A comparison is tool dispatch when the field is
 * tool-identity-specific (`componentKey` / `definitionKey`) or when the literal
 * is an actual tool folder name — which is exactly the thing that must vanish.
 */
const IDENTITY_DISPATCH = new RegExp(
  String.raw`\b(?:componentKey|definitionKey)\s*===\s*["']` +
    "|" +
    String.raw`\b(?:componentKey|definitionKey|slug|operation|key)\s*===\s*["'](?:` +
    toolFolders.join("|") +
    String.raw`)["']`,
);

function scan(source, matches) {
  const hits = [];
  source.split("\n").forEach((line, index) => {
    for (const hit of matches(line)) hits.push({ line: index + 1, hit });
  });
  return hits;
}

const sharedFiles = await sharedSourceFiles();
const leaksByFile = new Map();
const dispatchByFile = new Map();

for (const file of sharedFiles) {
  const source = await readFile(path.join(ROOT, file), "utf8");
  const leaks = scan(source, (line) => KEY_PATTERNS.filter(([, pattern]) => pattern.test(line)).map(([key]) => key));
  if (leaks.length > 0) leaksByFile.set(file, leaks);
  const dispatch = scan(source, (line) => (IDENTITY_DISPATCH.test(line) ? [line.trim().slice(0, 80)] : []));
  if (dispatch.length > 0) dispatchByFile.set(file, dispatch);
}

function report(byFile) {
  return [...byFile]
    .sort((a, b) => b[1].length - a[1].length)
    .map(
      ([file, hits]) => `  ${file} (${hits.length})\n${hits.map((h) => `    ${file}:${h.line}: ${h.hit}`).join("\n")}`,
    )
    .join("\n");
}

test("shared code never names a tool", () => {
  const totalHits = [...leaksByFile.values()].reduce((sum, hits) => sum + hits.length, 0);
  console.log(
    `[tool-name leak scan] ${sharedFiles.length} shared files, ${leaksByFile.size} leaking, ${totalHits} hits\n${report(leaksByFile)}`,
  );

  const unexpected = [...leaksByFile.keys()].filter((file) => !LEGACY_TOOL_NAME_LEAKS.has(file));
  expect(
    unexpected,
    `shared files must resolve tools by folder name as a module path, never by naming one:\n${report(
      new Map(unexpected.map((file) => [file, leaksByFile.get(file)])),
    )}`,
  ).toEqual([]);
});

test("shared code never dispatches on a tool identity", () => {
  console.log(`[identity dispatch scan] ${dispatchByFile.size} files\n${report(dispatchByFile)}`);
  const unexpected = [...dispatchByFile.keys()].filter((file) => !LEGACY_IDENTITY_DISPATCH.has(file));
  expect(
    unexpected,
    `tool dispatch must be a module path, not a comparison:\n${report(
      new Map(unexpected.map((file) => [file, dispatchByFile.get(file)])),
    )}`,
  ).toEqual([]);
});

test("the legacy allowlists only shrink", () => {
  const stale = [];
  for (const [name, allowlist, byFile] of [
    ["tool-name leak", LEGACY_TOOL_NAME_LEAKS, leaksByFile],
    ["identity dispatch", LEGACY_IDENTITY_DISPATCH, dispatchByFile],
  ]) {
    for (const file of allowlist) {
      // A deleted file is progress, not staleness; only a surviving-but-clean
      // file means the allowlist entry was left behind.
      if (sharedFiles.includes(file) && !byFile.has(file)) {
        stale.push(`${name}: ${file}`);
      }
    }
  }
  expect(stale, "remove these cleaned-up files from the allowlist").toEqual([]);
});

// ---------------------------------------------------------------------------
// The folder contract, applied to migrated folders only.
// ---------------------------------------------------------------------------

// Prefer the exported pattern; fall back to the catalogue's own literal while
// `TOOL_SLUG_PATTERN` is still module-private (see report).
const TOOL_SLUG_PATTERN = catalog.TOOL_SLUG_PATTERN ?? /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

test("migration progress", () => {
  console.log(
    `[folder contract] ${folders.length} folders: ${migrated.length} migrated, ${unmigrated.length} unmigrated\n  unmigrated: ${unmigrated
      .map((folder) => folder.name)
      .join(", ")}`,
  );
});

test("folder name, spec and toolId are one bijection", () => {
  for (const { folder, spec } of specs) {
    expect(spec && typeof spec === "object", `${folder.name}: default export must be a spec`).toBeTruthy();
    expect(spec.toolId, `${folder.name}: toolId must be "<app>.<folderName>"`).toBe(`${spec.app}.${folder.name}`);
  }
  const toolIds = specs.map(({ spec }) => spec.toolId);
  expect(new Set(toolIds).size, "toolIds must be unique").toBe(toolIds.length);
  expect(new Set(toolFolders).size, "folder names must be unique").toBe(toolFolders.length);
});

test("folder names are valid tool slugs", () => {
  for (const folder of toolFolders) {
    expect(folder, `${folder} is not a valid tool slug`).toMatch(TOOL_SLUG_PATTERN);
  }
});

test("no definition re-declares a derived field", () => {
  // definitionKey is the folder name, runtime is the run filename, iconKey is
  // uploaded data. Declaring any of them creates a second source of truth.
  for (const { folder, spec } of specs) {
    for (const derived of ["definitionKey", "runtime", "iconKey"]) {
      expect(Object.hasOwn(spec, derived), `${folder.name}: "${derived}" is derived and must not be declared`).toBe(
        false,
      );
      expect(
        folder.definitionSource,
        `${folder.name}: definition.ts mentions the derived field "${derived}"`,
      ).not.toMatch(new RegExp(`\\b${derived}\\b`));
    }
  }
});

test("every migrated folder declares exactly one execution host", () => {
  for (const folder of migrated) {
    expect(
      folder.runFiles.length,
      `${folder.name}: expected exactly one of ${RUN_FILENAMES.join(" / ")}, found [${folder.runFiles.join(", ")}]`,
    ).toEqual(1);
  }
});

test("every spec declares a known category", () => {
  for (const { folder, spec } of specs) {
    expect(
      Object.hasOwn(TOOL_CATEGORIES, spec.category),
      `${folder.name}: unknown category "${spec.category}"`,
    ).toBeTruthy();
    expect(
      TOOL_CATEGORIES[spec.category].app,
      `${folder.name}: category "${spec.category}" belongs to another app`,
    ).toBe(spec.app);
  }
});

test("a declared slug is valid and unreserved", () => {
  for (const { folder, spec } of specs) {
    if (spec.slug === undefined) continue;
    expect(spec.slug, `${folder.name}: invalid slug`).toMatch(TOOL_SLUG_PATTERN);
    expect(
      catalog.isValidToolSlug(spec.app, spec.slug),
      `${folder.name}: slug "${spec.slug}" is reserved for app "${spec.app}"`,
    ).toBeTruthy();
  }
});

test("definition.ts has no value imports", () => {
  // The migrate-time filesystem walk loads these without a bundler, so `@/`
  // aliases do not resolve. A type-only import is erased; a value import is not.
  for (const folder of folders) {
    if (folder.definitionSource === null) continue;
    const source = folder.definitionSource;
    const valueImports = source
      .split("\n")
      .map((line, index) => [index + 1, line])
      .filter(
        ([, line]) =>
          /^\s*import\s+(?!type\b)/.test(line) ||
          /^\s*export\s+(?!type\b)[^;]*\bfrom\b/.test(line) ||
          /\bimport\s*\(/.test(line) ||
          /\brequire\s*\(/.test(line),
      );
    if (!folder.migrated && valueImports.length > 0) continue; // pre-migration shape
    expect(
      valueImports.map(([line, text]) => `${folder.name}/definition.ts:${line}: ${text.trim()}`),
      `${folder.name}: definition.ts must use type-only imports`,
    ).toEqual([]);
  }
});

test("hooks live in hooks.ts and never reach the media graph", async () => {
  // `hooks.ts` is called from the main thread, so it is held to the same
  // discipline as `definition.ts`. `media/pdfRender.ts` is the sole owner of
  // `pdfjs-dist` and is worker-only, so a hook that imports anything under
  // `media/` — or that stays in a run file which does — puts the vendor chunk
  // back on the main thread. Module specifiers only; a mention in a comment is
  // not an edge in the import graph.
  const MEDIA_IMPORT = /(?:from|import)\s*\(?\s*["'][^"']*tool-framework\/media\//;
  const RUN_HOOK_EXPORT =
    /^\s*export\s+(?:const|function|async\s+function)\s+(?:validate|onPagesInspected|onSettingsChanged)\b/m;
  const offenders = [];
  for (const folder of folders) {
    const hooksSource = await readIfPresent(path.join(folder.dir, "hooks.ts"));
    if (hooksSource !== null && MEDIA_IMPORT.test(hooksSource)) {
      offenders.push(`${folder.name}/hooks.ts imports lib/tool-framework/media/`);
    }
    for (const runFile of folder.runFiles) {
      const runSource = await readIfPresent(path.join(folder.dir, runFile));
      if (runSource !== null && RUN_HOOK_EXPORT.test(runSource)) {
        offenders.push(`${folder.name}/${runFile} exports a hook — move it to hooks.ts`);
      }
    }
  }
  expect(offenders, "hooks must live in hooks.ts and stay off the worker-only media graph").toEqual([]);
});

test("no client or worker module imports a server run module", async () => {
  // Cheaper inverse of the import-graph walk: nothing in the shared framework
  // or component layer may statically reach a `run.server` module, so a
  // server-only run can never be pulled into a client or worker bundle.
  const clientSide = [
    ...(await walk(path.join(ROOT, "lib/tool-framework"))),
    ...(await walk(path.join(ROOT, "components"))),
  ];
  const offenders = [];
  for (const file of clientSide) {
    const source = await readFile(file, "utf8");
    // Module specifiers only — a `run.server.ts` mention in a comment is not
    // an edge in the import graph.
    if (/(?:from|import)\s*\(?\s*["'][^"']*run\.server\b/.test(source)) {
      offenders.push(relative(file));
    }
  }
  expect(offenders, "run.server modules must stay off the client graph").toEqual([]);
});
