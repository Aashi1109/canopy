import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import postgres from "postgres";
import { seedTemplates } from "../packages/invoice-templates/src/index.ts";

const migrationUrl = new URL("../packages/database/scripts/migrate.mjs", import.meta.url).href;
const stub = (source) => ({
  shortCircuit: true,
  url: `data:text/javascript,${encodeURIComponent(source)}`,
});

test("migration seeds JSON and timestamps through the Drizzle-configured Postgres client", async (t) => {
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://test:test@localhost:1/test";
  let state;
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.startsWith(migrationUrl)) {
        if (specifier === "postgres") {
          return stub("export default () => globalThis.__migrationSeedClient;");
        }
        if (specifier === "dotenv") return stub("export const config = () => {};");
        if (specifier.endsWith("/seedManagedTools.ts")) {
          return stub("export const seedManagedTools = async () => {};");
        }
      }
      return next(specifier, context);
    },
  });

  async function run(name, count = 0, failure = null) {
    const client = postgres(process.env.DATABASE_URL, { max: 1 });
    state = { rows: [], closed: false, transactions: 0 };
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
    sql.unsafe = async () => [];
    sql.begin = async (callback) => {
      state.transactions += 1;
      return callback(sql);
    };
    sql.end = async () => {
      state.closed = true;
      await client.end();
    };
    globalThis.__migrationSeedClient = sql;
    await import(`${migrationUrl}?test=${name}`);
  }

  try {
    await t.test("empty catalog receives every seed with JSON and dates intact", async () => {
      await run("empty");
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
      assert.equal(state.closed, true);
    });
    await t.test("existing catalog is preserved", async () => {
      await run("populated", 1);
      assert.deepEqual(state.rows, []);
      assert.equal(state.transactions, 0);
      assert.equal(state.closed, true);
    });
    await t.test("insert failure propagates and closes the connection", async () => {
      const failure = new Error("Insert failed");
      await assert.rejects(run("failure", 0, failure), (error) => error === failure);
      assert.equal(state.closed, true);
    });
  } finally {
    hooks.deregister();
    delete globalThis.__migrationSeedClient;
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});
