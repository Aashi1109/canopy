import { writeFile } from "node:fs/promises";

// OpenNext bundles .env files as runtime fallbacks. Production must use Worker
// secrets; local `wrangler dev` loads .env.local without putting it in the bundle.
await writeFile(
  new URL("../.open-next/cloudflare/next-env.mjs", import.meta.url),
  "export const production = {};\nexport const development = {};\nexport const test = {};\n",
);
