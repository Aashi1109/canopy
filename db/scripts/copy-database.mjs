import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import pg from "pg";

// Copies the app's `public` schema (tables + data) from one Postgres database into another,
// replacing the target's `public` schema on confirmation. Other schemas (e.g. Supabase's auth,
// storage, extensions) are platform-owned and are neither copied nor touched.
// Usage: SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... pnpm db:copy
const source = process.env.SOURCE_DATABASE_URL;
const target = process.env.TARGET_DATABASE_URL;
if (!source || !target) throw new Error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL are required");
if (source === target) throw new Error("Source and target must be different databases");

// libpq looks for ~/.postgresql/root.crt when verifying certificates, while node-pg uses the
// system trust store. Point libpq at the system store too, only where verification is requested.
const libpqEnv = (url) =>
  /sslmode=verify-(full|ca)/.test(url) && !/sslrootcert=/.test(url) && !process.env.PGSSLROOTCERT
    ? { ...process.env, PGSSLROOTCERT: "system" }
    : process.env;

const exited = (child, command) =>
  new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`))));
  });

const run = (command, args, url) =>
  exited(spawn(command, args, { stdio: ["ignore", "ignore", "inherit"], env: libpqEnv(url) }), command);

const flags = ["--no-owner", "--no-acl"];
const directory = await mkdtemp(join(tmpdir(), "canopy-db-copy-"));
const dumpFile = join(directory, "source.dump");
try {
  // Everything that can fail runs before the target is touched.
  console.log("Dumping source...");
  await run("pg_dump", ["--format=custom", "--verbose", "--schema=public", ...flags, `--file=${dumpFile}`, `--dbname=${source}`], source);
  // pg_restore connects through libpq, whose SSL rules differ from node-pg's; check with libpq too.
  await run("psql", ["--no-psqlrc", "--quiet", "--command=SELECT 1", `--dbname=${target}`], target);
  await confirmTargetPublicReplacement();
  console.log("Restoring into target...");
  await restoreReplacingPublic();
  console.log("Copy complete. Restart running application instances against the new database.");
} finally {
  await rm(directory, { recursive: true, force: true });
}

// The dump recreates `public`, so the target's copy gets dropped. If it holds anything,
// the user must type the database name first.
async function confirmTargetPublicReplacement() {
  const client = new pg.Client({ connectionString: target, connectionTimeoutMillis: 30_000 });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT current_database() AS name,
              (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public') AS objects`,
    );
    const { name, objects } = rows[0];
    if (objects > 0) {
      if (!process.stdin.isTTY) throw new Error(`Target "${name}".public has ${objects} objects; run interactively`);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(
        `Target "${name}".public has ${objects} objects (tables, indexes, sequences). They will be permanently deleted.\nType the database name to confirm: `,
      );
      rl.close();
      if (answer.trim() !== name) throw new Error("Confirmation did not match; aborting");
    }
  } finally {
    await client.end();
  }
}

// Drop + restore run in one psql transaction: any failure rolls back and leaves the target as it was.
async function restoreReplacingPublic() {
  const restore = spawn("pg_restore", [...flags, "--file=-", dumpFile], { stdio: ["ignore", "pipe", "inherit"] });
  const psql = spawn(
    "psql",
    ["--no-psqlrc", "--quiet", "--single-transaction", "--set=ON_ERROR_STOP=1", `--dbname=${target}`],
    { stdio: ["pipe", "ignore", "inherit"], env: libpqEnv(target) },
  );
  psql.stdin.write("DROP SCHEMA IF EXISTS public CASCADE;\n");
  restore.stdout.pipe(psql.stdin);
  await Promise.all([exited(restore, "pg_restore"), exited(psql, "psql")]);
}
