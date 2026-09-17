import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import postgres from "postgres";
import { seedTemplates } from "../packages/invoice-templates/src/index.ts";

const migrationUrl = new URL("../packages/database/scripts/migrate.mjs", import.meta.url).href;
const seedUrl = new URL("../packages/database/scripts/seed.mjs", import.meta.url).href;
const stub = (source) => ({
  shortCircuit: true,
  url: `data:text/javascript,${encodeURIComponent(source)}`,
});

test("selected migrations and separate seeding", async (t) => {
  const previousUrl = process.env.DATABASE_URL;
  const previousArgv = process.argv;
  process.env.DATABASE_URL = "postgres://test:test@localhost:1/test";
  let state;
  const folders = {
    baseline: { "002.sql": "BASELINE TWO", "001.sql": "BASELINE ONE" },
    "icon-url": { "002.sql": "ICON TWO", "001.sql": "ICON ONE", "README.md": "ignore" },
    empty: {},
  };
  const entry = (name, directory = false) => ({ name, isDirectory: () => directory, isFile: () => !directory });
  globalThis.__migrationFiles = {
    readdir: async (url) => {
      const folder = new URL(url).pathname.split("/").filter(Boolean).at(-1);
      return folder === "migration"
        ? [...Object.keys(folders).map((name) => entry(name, true)), entry("outside-link")]
        : [...Object.keys(folders[folder]).map((name) => entry(name)), entry("nested.sql", true)];
    },
    readFile: async (url) => {
      const [folder, name] = new URL(url).pathname.split("/").slice(-2);
      return folders[folder][name];
    },
  };
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.startsWith(migrationUrl) || context.parentURL?.startsWith(seedUrl)) {
        if (specifier === "postgres") {
          return stub("export default () => globalThis.__migrationSeedClient;");
        }
        if (specifier === "dotenv") return stub("export const config = () => {};");
        if (specifier === "node:fs/promises") {
          return stub("export const { readFile, readdir } = globalThis.__migrationFiles;");
        }
        if (specifier.endsWith("/seedManagedTools.ts")) {
          return stub("export const seedManagedTools = async () => { globalThis.__migrationSeedState.seeds++; };");
        }
      }
      return next(specifier, context);
    },
  });

  async function run(
    name,
    count = 0,
    failure = null,
    args = ["baseline"],
    migrationFailure = null,
    script = migrationUrl,
  ) {
    process.argv = [...previousArgv.slice(0, 2), ...args];
    const client = postgres(process.env.DATABASE_URL, { max: 1 });
    state = { rows: [], migrations: [], seeds: 0, closed: false, transactions: 0 };
    globalThis.__migrationSeedState = state;
    const sql = async (strings, ...values) => {
      if (strings.join("").includes("SELECT COUNT(*)")) return [{ template_count: count }];
      if (failure) throw failure;
      // Use the installed driver's serializers after real drizzle(sql) configures them.
      // These are the types described by PostgreSQL for invoice_templates columns.
      const types = [25, 25, 25, 25, 25, 25, 16, 23, 25, 25, 3802, 16, 25, 1184, 1184];
      const row = values.map((value, index) => {
        if (value === null) return null;
        const parameter = value && typeof value === "object" && "type" in value && "value" in value;
        const type = parameter ? value.type : types[index];
        const raw = parameter ? value.value : value;
        const encoded = client.options.serializers[type]?.(raw) ?? String(raw);
        Buffer.byteLength(encoded);
        return encoded;
      });
      state.rows.push(row);
      return [];
    };
    sql.options = client.options;
    sql.json = client.json;
    sql.unsafe = async (migration) => {
      state.migrations.push(migration);
      if (migrationFailure) throw migrationFailure;
      return [];
    };
    sql.begin = async (callback) => {
      state.transactions += 1;
      return callback(sql);
    };
    sql.end = async () => {
      state.closed = true;
      await client.end();
    };
    globalThis.__migrationSeedClient = sql;
    await import(`${script}?test=${name}`);
  }

  try {
    await t.test("empty catalog receives every seed with JSON and dates intact", async () => {
      await run("empty", 0, null, [], null, seedUrl);
      assert.ok(seedTemplates.length > 0);
      assert.equal(state.rows.length, seedTemplates.length);
      for (const [index, template] of seedTemplates.entries()) {
        const row = state.rows[index];
        assert.equal(row[0], template.id);
        assert.deepEqual(JSON.parse(row[10]), template.config);
        assert.equal(row[13], new Date(template.createdAt).toISOString());
        assert.equal(row[14], new Date(template.updatedAt).toISOString());
      }
      assert.equal(state.transactions, 1);
      assert.deepEqual(state.migrations, []);
      assert.equal(state.seeds, 1);
      assert.equal(state.closed, true);
    });
    await t.test("existing catalog is preserved", async () => {
      await run("populated", 1, null, [], null, seedUrl);
      assert.deepEqual(state.rows, []);
      assert.equal(state.transactions, 0);
      assert.equal(state.closed, true);
    });
    await t.test("insert failure propagates and closes the connection", async () => {
      const failure = new Error("Insert failed");
      await assert.rejects(run("failure", 0, failure, [], null, seedUrl), (error) => error === failure);
      assert.equal(state.closed, true);
    });
    await t.test("only the selected folder runs, in filename order, without seeding", async () => {
      await run("selected", 0, null, ["icon-url"]);
      assert.deepEqual(state.migrations, ["ICON ONE", "ICON TWO"]);
      assert.deepEqual(state.rows, []);
      assert.equal(state.seeds, 0);
      assert.equal(state.closed, true);
    });
    await t.test("baseline runs only its SQL without seeding", async () => {
      await run("baseline");
      assert.deepEqual(state.migrations, ["BASELINE ONE", "BASELINE TWO"]);
      assert.deepEqual(state.rows, []);
      assert.equal(state.seeds, 0);
    });
    await t.test("missing, invalid, unknown and empty selections execute nothing", async () => {
      const cases = [
        [],
        ["../baseline"],
        ["/baseline"],
        ["baseline", "icon-url"],
        ["missing"],
        ["empty"],
        ["outside-link"],
      ];
      for (const [index, args] of cases.entries()) {
        await assert.rejects(run(`invalid-${index}`, 0, null, args), /folder|Usage|SQL/);
        assert.deepEqual(state.migrations, []);
        assert.equal(state.seeds, 0);
      }
    });
    await t.test("SQL failure stops the folder and closes the connection", async () => {
      const failure = new Error("SQL failed");
      await assert.rejects(run("sql-failure", 0, null, ["icon-url"], failure), (error) => error === failure);
      assert.deepEqual(state.migrations, ["ICON ONE"]);
      assert.equal(state.seeds, 0);
      assert.equal(state.closed, true);
    });
  } finally {
    hooks.deregister();
    delete globalThis.__migrationSeedClient;
    delete globalThis.__migrationSeedState;
    delete globalThis.__migrationFiles;
    process.argv = previousArgv;
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});
