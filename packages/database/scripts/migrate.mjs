import { readFile, readdir } from "node:fs/promises";
import { config } from "dotenv";
import pg from "pg";
import { Cache, CACHE_NAMESPACES, closeRedis } from "@canopy/cache";

const [folder, ...extra] = process.argv.slice(2);
if (!folder || extra.length || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(folder)) {
  throw new Error("Usage: pnpm db:migrate <folder>");
}
const root = new URL("../migration/", import.meta.url);
const folders = await readdir(root, { withFileTypes: true });
if (!folders.some((entry) => entry.name === folder && entry.isDirectory())) {
  throw new Error(`Unknown migration folder: ${folder}`);
}
const directory = new URL(`${folder}/`, root);
const names = (await readdir(directory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => entry.name)
  .sort();
if (!names.length) throw new Error(`No SQL migrations in folder: ${folder}`);
const migrations = await Promise.all(
  names.map(async (name) => [name, await readFile(new URL(encodeURIComponent(name), directory), "utf8")]),
);

// Plain Node needs dotenv; shell variables take precedence over local files.
for (const file of [".env.local", ".env"]) {
  config({ path: new URL(`../../../${file}`, import.meta.url), override: false });
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 30_000 });

try {
  await client.connect();
  const cloudName =
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() || process.env.CLOUDINARY_CLOUD_NAME?.trim() || "";
  await client.query("SELECT set_config('canopy.cloudinary_cloud_name', $1, false)", [cloudName]);
  for (const [name, migration] of migrations) {
    await client.query(migration);
    console.log(`Applied ${folder}/${name}`);
  }
  await Promise.all([
    new Cache(CACHE_NAMESPACES.CATALOG).delete("all"),
    new Cache(CACHE_NAMESPACES.ECOSYSTEM).delete("all"),
  ]);
} finally {
  closeRedis();
  await client.end();
}
