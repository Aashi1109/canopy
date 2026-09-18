import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({
  options: { "icons-dir": { type: "string", default: path.join(root, "scripts/seed-assets/tool-icons") } },
});

function run(script, ...args) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed; fix the reported error and rerun pnpm db:seed.`);
}

run("db/scripts/seed.mjs");
const directory = await mkdtemp(path.join(tmpdir(), "canopy-icon-seed-"));
const manifest = path.join(directory, "icons.json");
console.log(`Icon upload manifest (retained on failure): ${manifest}`);
run("scripts/upload-tool-icons.mjs", "--dir", values["icons-dir"], "--output", manifest);
run("scripts/update-tool-icons.mjs", "--manifest", manifest, "--missing-only");
await rm(directory, { recursive: true, force: true });
