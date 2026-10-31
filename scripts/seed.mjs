import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { config as loadEnv } from "dotenv";
import config from "../lib/config/config.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({
  options: { "icons-dir": { type: "string", default: path.join(root, "scripts/seed-assets/tool-icons") } },
});
for (const file of [".env.local", ".env"]) {
  loadEnv({ path: path.join(root, file), quiet: true, override: false });
}

function run(script, ...args) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed; fix the reported error and rerun pnpm db:seed.`);
}

run("db/scripts/seed.mjs");
const manifest = path.join(root, `tmp/icons-${config.environment === "production" ? "prod" : "dev"}.json`);
console.log(`Reusable icon upload manifest: ${manifest}`);
run("scripts/upload-tool-icons.mjs", "--dir", values["icons-dir"], "--output", manifest, "--resume");
run("scripts/update-tool-icons.mjs", "--manifest", manifest, "--missing-only");
