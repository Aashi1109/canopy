import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import postgres from "postgres";

const migration = await readFile(
  new URL("../packages/database/migration/0002-tool-icon-url/0001_tool_icon_url.sql", import.meta.url),
  "utf8",
);

test(
  "tool icon migration preserves data atomically and supports reruns",
  {
    skip: process.env.TOOL_ICON_TEST_DATABASE_URL
      ? false
      : "set TOOL_ICON_TEST_DATABASE_URL to a disposable PostgreSQL database",
  },
  async (t) => {
    const sql = postgres(process.env.TOOL_ICON_TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
    async function setup({ cloud = "demo", withUrl = false } = {}) {
      await sql`DROP TABLE IF EXISTS pg_temp.tool_icons`;
      await sql`DROP TABLE IF EXISTS pg_temp.managed_tools`;
      await sql`CREATE TEMP TABLE managed_tools (tool_id TEXT PRIMARY KEY)`;
      if (withUrl) await sql`ALTER TABLE managed_tools ADD COLUMN icon_url TEXT`;
      await sql`CREATE TEMP TABLE tool_icons (tool_id TEXT PRIMARY KEY, public_id TEXT NOT NULL, version TEXT NOT NULL)`;
      await sql`SELECT set_config('canopy.cloudinary_cloud_name', ${cloud}, false)`;
    }
    async function migrate() {
      try {
        await sql.unsafe(migration);
      } catch (error) {
        await sql`ROLLBACK`;
        throw error;
      }
    }
    const url = (cloud, version, id) =>
      `https://res.cloudinary.com/${encodeURIComponent(cloud)}/image/upload/f_png,c_fill,w_256,h_256,q_auto/v${encodeURIComponent(version)}/${id.split("/").map(encodeURIComponent).join("/")}.png`;
    try {
      await t.test("backfills encoded delivery URLs, keeps assigned URLs and iconless tools, and reruns", async () => {
        await setup({ cloud: "demo cloud", withUrl: true });
        await sql`INSERT INTO managed_tools VALUES ('legacy', NULL), ('custom', 'https://example.com/custom.svg'), ('empty', NULL)`;
        const publicId = "icons/folder space/aé?#%!'()~*";
        await sql`INSERT INTO tool_icons VALUES ('legacy', ${publicId}, '12 3'), ('custom', 'old/icon', '5')`;
        await migrate();
        const expected = [
          { tool_id: "custom", icon_url: "https://example.com/custom.svg" },
          { tool_id: "empty", icon_url: null },
          { tool_id: "legacy", icon_url: url("demo cloud", "12 3", publicId) },
        ];
        assert.deepEqual(Array.from(await sql`SELECT * FROM managed_tools ORDER BY tool_id`), expected);
        assert.equal((await sql`SELECT to_regclass('pg_temp.tool_icons') AS table_name`)[0].table_name, null);
        await migrate();
        assert.deepEqual(Array.from(await sql`SELECT * FROM managed_tools ORDER BY tool_id`), expected);
      });
      await t.test("missing cloud rolls back both column addition and legacy table removal", async () => {
        await setup({ cloud: "" });
        await sql`INSERT INTO managed_tools VALUES ('legacy')`;
        await sql`INSERT INTO tool_icons VALUES ('legacy', 'icons/test', '1')`;
        await assert.rejects(migrate(), /CLOUDINARY_CLOUD_NAME/);
        assert.deepEqual(Array.from(await sql`SELECT * FROM managed_tools`), [{ tool_id: "legacy" }]);
        assert.equal((await sql`SELECT COUNT(*)::int AS count FROM tool_icons`)[0].count, 1);
        await sql`SELECT set_config('canopy.cloudinary_cloud_name', 'demo', false)`;
        await migrate();
        assert.equal((await sql`SELECT icon_url FROM managed_tools`)[0].icon_url, url("demo", "1", "icons/test"));
      });
      await t.test("orphaned legacy rows prevent destructive table removal", async () => {
        await setup();
        await sql`INSERT INTO tool_icons VALUES ('orphan', 'icons/test', '1')`;
        await assert.rejects(migrate(), /backfill incomplete/);
        assert.equal((await sql`SELECT COUNT(*)::int AS count FROM tool_icons`)[0].count, 1);
      });
      await t.test("all baseline migrations followed by icon migration support a fresh database", async () => {
        await sql`DROP TABLE IF EXISTS pg_temp.tool_icons`;
        await sql`DROP TABLE IF EXISTS pg_temp.managed_tools`;
        const schema = `icon_migration_${process.pid}`;
        await sql`CREATE SCHEMA ${sql(schema)}`;
        try {
          await sql`SELECT set_config('search_path', ${schema}, false)`;
          await sql`SELECT set_config('canopy.cloudinary_cloud_name', '', false)`;
          const directory = new URL("../packages/database/migration/0001-baseline/", import.meta.url);
          for (const file of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
            await sql.unsafe(await readFile(new URL(file, directory), "utf8"));
          }
          await migrate();
          const rows = await sql`SELECT tool_id, icon_url FROM managed_tools`;
          assert.ok(rows.length > 0);
          assert.ok(rows.every((row) => row.icon_url === null));
          assert.equal((await sql`SELECT to_regclass('tool_icons') AS table_name`)[0].table_name, null);
        } finally {
          await sql`SELECT set_config('search_path', 'public', false)`;
          await sql`DROP SCHEMA ${sql(schema)} CASCADE`;
        }
      });
      await t.test("empty baseline and already assigned icons do not require cloud configuration", async () => {
        await setup({ cloud: "" });
        await migrate();
        await sql`INSERT INTO managed_tools VALUES ('new-tool', NULL)`;
        assert.equal((await sql`SELECT icon_url FROM managed_tools`)[0].icon_url, null);
        await setup({ cloud: "", withUrl: true });
        await sql`INSERT INTO managed_tools VALUES ('custom', 'https://example.com/custom.png')`;
        await sql`INSERT INTO tool_icons VALUES ('custom', 'icons/old', '1')`;
        await migrate();
        assert.equal((await sql`SELECT icon_url FROM managed_tools`)[0].icon_url, "https://example.com/custom.png");
      });
    } finally {
      await sql.end();
    }
  },
);
