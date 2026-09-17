import { readFile, readdir } from "node:fs/promises";
import { config } from "dotenv";
import postgres from "postgres";

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
const sql = postgres(databaseUrl, { max: 1 });

try {
  for (const [name, migration] of migrations) {
    await sql.unsafe(migration);
    console.log(`Applied ${folder}/${name}`);
  }
} finally {
  await sql.end();
}
