import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { seedTemplates } from "../lib/invoice-templates/index.ts";

const migrationUrl = new URL("../db/scripts/migrate.mjs", import.meta.url).href;
const seedUrl = new URL("../db/scripts/seed.mjs", import.meta.url).href;
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
    "0001-baseline": { "002.sql": "BASELINE TWO", "001.sql": "BASELINE ONE" },
    "0002-tool-icon-url": { "002.sql": "ICON TWO", "001.sql": "ICON ONE", "README.md": "ignore" },
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
        if (specifier === "pg") {
          return stub(
            "export default { Client: class Client { constructor() { return globalThis.__migrationSeedClient; } } };",
          );
        }
        if (specifier === "../../lib/cache/index.ts")
          return stub(`
          export const CACHE_NAMESPACES = { CATALOG: "catalog", ECOSYSTEM: "ecosystem" };
          export class Cache {
            constructor(namespace) { this.namespace = namespace; }
            async delete(key) { globalThis.__migrationSeedState.deleted.push(this.namespace + ":" + key); }
          }
          export const closeRedis = () => {};
        `);
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
    args = ["0001-baseline"],
    migrationFailure = null,
    script = migrationUrl,
  ) {
    process.argv = [...previousArgv.slice(0, 2), ...args];
    state = {
      rows: [],
      migrations: [],
      seeds: 0,
      connected: false,
      closed: false,
      transactions: [],
      deleted: [],
      cloudName: undefined,
    };
    globalThis.__migrationSeedState = state;
    globalThis.__migrationSeedClient = {
      async connect() {
        state.connected = true;
      },
      async query(query, values = []) {
        assert.equal(state.connected, true);
        const text = typeof query === "string" ? query : query.text;
        const command = text.trim().toLowerCase();
        if (["begin", "commit", "rollback"].includes(command)) {
          state.transactions.push(command);
          return { rows: [] };
        }
        if (text.includes("set_config")) {
          state.cloudName = values[0];
          return { rows: [] };
        }
        if (text.includes("SELECT COUNT(*)")) return { rows: [{ template_count: count }] };
        if (text.includes("INSERT INTO invoice_templates")) {
          if (failure) throw failure;
          state.rows.push(values);
          return { rows: [] };
        }
        state.migrations.push(text);
        if (migrationFailure) throw migrationFailure;
        return { rows: [] };
      },
      async end() {
        state.closed = true;
      },
    };
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
      assert.deepEqual(state.transactions, ["begin", "commit"]);
      assert.deepEqual(state.migrations, []);
      assert.equal(state.seeds, 1);
      assert.equal(state.closed, true);
    });
    await t.test("existing catalog is preserved", async () => {
      await run("populated", 1, null, [], null, seedUrl);
      assert.deepEqual(state.rows, []);
      assert.deepEqual(state.transactions, []);
      assert.equal(state.closed, true);
    });
    await t.test("insert failure propagates and closes the connection", async () => {
      const failure = new Error("Insert failed");
      await assert.rejects(
        run("failure", 0, failure, [], null, seedUrl),
        (error) => error === failure || error.cause === failure,
      );
      assert.deepEqual(state.transactions, ["begin", "rollback"]);
      assert.equal(state.closed, true);
    });
    await t.test("only the selected folder runs, in filename order, without seeding", async () => {
      await run("selected", 0, null, ["0002-tool-icon-url"]);
      assert.deepEqual(state.migrations, ["ICON ONE", "ICON TWO"]);
      assert.deepEqual(state.deleted, [], "migrations do not contact Redis for the process-local public catalog");
      assert.equal(
        state.cloudName,
        process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() || process.env.CLOUDINARY_CLOUD_NAME?.trim() || "",
      );
      assert.deepEqual(state.rows, []);
      assert.equal(state.seeds, 0);
      assert.equal(state.closed, true);
    });
    await t.test("baseline runs only its SQL without seeding", async () => {
      await run("0001-baseline");
      assert.deepEqual(state.migrations, ["BASELINE ONE", "BASELINE TWO"]);
      assert.deepEqual(state.rows, []);
      assert.equal(state.seeds, 0);
    });
    await t.test("missing, invalid, unknown and empty selections execute nothing", async () => {
      const cases = [
        [],
        ["../baseline"],
        ["/baseline"],
        ["0001-baseline", "0002-tool-icon-url"],
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
      await assert.rejects(run("sql-failure", 0, null, ["0002-tool-icon-url"], failure), (error) => error === failure);
      assert.deepEqual(state.migrations, ["ICON ONE"]);
      assert.deepEqual(state.deleted, []);
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
