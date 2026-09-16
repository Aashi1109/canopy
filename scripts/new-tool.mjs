#!/usr/bin/env node
// Scaffolds tools/<key>/. There is no generator to run afterwards: the folder
// existing IS the registration, and the seed picks it up by walking the tree.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { TOOL_CATEGORIES } from "../lib/tool-framework/categories.ts";

const USAGE =
  "Usage: node scripts/new-tool.mjs <folder-name> --category <key> [--app devtools|media] [--worker|--server]";

const [key, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = rest.indexOf(`--${name}`);
  return at === -1 ? fallback : rest[at + 1];
};

const app = flag("app", "devtools");
const category = flag("category");
const runFile = rest.includes("--worker")
  ? "run.worker.ts"
  : rest.includes("--server")
    ? "run.server.ts"
    : "run.ts";

if (!key || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) throw new Error(USAGE);
if (TOOL_CATEGORIES[category]?.app !== app) {
  const valid = Object.keys(TOOL_CATEGORIES).filter((k) => TOOL_CATEGORIES[k].app === app);
  throw new Error(`--category for --app ${app} must be one of: ${valid.join(", ")}`);
}

const name = key
  .split("-")
  .map((word) => word[0].toUpperCase() + word.slice(1))
  .join(" ");

// Type-only imports and nothing else: this file is read by a plain Node
// filesystem walk at migrate time, where `@/` does not resolve. A value import
// would break that; `import type` is erased before Node ever resolves it.
const definition = `import type { ToolSpec } from "@/lib/tool-framework/spec";

export default {
  toolId: "${app}.${key}",
  app: "${app}",
  category: "${category}",
  keywords: [],
  name: "${name}",
  description: "TODO: one sentence describing what this tool does.",
  input: { kind: "text", label: "Input" },
  settings: { fields: {} },
  trigger: { mode: "live" },
  labels: {
    empty: "Paste input to begin.",
    ready: "Ready.",
    running: "Working…",
  },
  content: { howToUse: ["TODO: describe the first step."] },
} as const satisfies ToolSpec;
`;

const run = `import type { ToolRun } from "@/lib/tool-framework/run";

const run: ToolRun = (ctx) => ({ render: "text", text: ctx.input.text });

export default run;
`;

const dir = path.join(import.meta.dirname, "..", "tools", key);
await mkdir(dir);
await writeFile(path.join(dir, "definition.ts"), definition);
await writeFile(path.join(dir, runFile), run);

console.log(`Created tools/${key}/{definition.ts,${runFile}}`);
