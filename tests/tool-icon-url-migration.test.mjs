import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

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
    const client = new pg.Client({ connectionString: process.env.TOOL_ICON_TEST_DATABASE_URL });
    async function setup({ cloud = "demo", withUrl = false } = {}) {
      await client.query("DROP TABLE IF EXISTS pg_temp.tool_icons");
      await client.query("DROP TABLE IF EXISTS pg_temp.managed_tools");
      await client.query("CREATE TEMP TABLE managed_tools (tool_id TEXT PRIMARY KEY)");
      if (withUrl) await client.query("ALTER TABLE managed_tools ADD COLUMN icon_url TEXT");
      await client.query(
        "CREATE TEMP TABLE tool_icons (tool_id TEXT PRIMARY KEY, public_id TEXT NOT NULL, version TEXT NOT NULL)",
      );
      await client.query("SELECT set_config('canopy.cloudinary_cloud_name', $1, false)", [cloud]);
    }
    async function migrate() {
      try {
        await client.query(migration);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    const url = (cloud, version, id) =>
      `https://res.cloudinary.com/${encodeURIComponent(cloud)}/image/upload/f_png,c_fill,w_256,h_256,q_auto/v${encodeURIComponent(version)}/${id.split("/").map(encodeURIComponent).join("/")}.png`;
    try {
      await client.connect();
      await t.test("backfills encoded delivery URLs, keeps assigned URLs and iconless tools, and reruns", async () => {
        await setup({ cloud: "demo cloud", withUrl: true });
        await client.query(
          "INSERT INTO managed_tools VALUES ('legacy', NULL), ('custom', 'https://example.com/custom.svg'), ('empty', NULL)",
        );
        const publicId = "icons/folder space/aé?#%!'()~*";
        await client.query("INSERT INTO tool_icons VALUES ('legacy', $1, '12 3'), ('custom', 'old/icon', '5')", [
          publicId,
        ]);
        await migrate();
        const expected = [
          { tool_id: "custom", icon_url: "https://example.com/custom.svg" },
          { tool_id: "empty", icon_url: null },
          { tool_id: "legacy", icon_url: url("demo cloud", "12 3", publicId) },
        ];
        assert.deepEqual((await client.query("SELECT * FROM managed_tools ORDER BY tool_id")).rows, expected);
        assert.equal(
          (await client.query("SELECT to_regclass('pg_temp.tool_icons') AS table_name")).rows[0].table_name,
          null,
        );
        await migrate();
        assert.deepEqual((await client.query("SELECT * FROM managed_tools ORDER BY tool_id")).rows, expected);
      });
      await t.test("missing cloud rolls back both column addition and legacy table removal", async () => {
        await setup({ cloud: "" });
        await client.query("INSERT INTO managed_tools VALUES ('legacy')");
        await client.query("INSERT INTO tool_icons VALUES ('legacy', 'icons/test', '1')");
        await assert.rejects(migrate(), /CLOUDINARY_CLOUD_NAME/);
        assert.deepEqual((await client.query("SELECT * FROM managed_tools")).rows, [{ tool_id: "legacy" }]);
        assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM tool_icons")).rows[0].count, 1);
        await client.query("SELECT set_config('canopy.cloudinary_cloud_name', 'demo', false)");
        await migrate();
        assert.equal(
          (await client.query("SELECT icon_url FROM managed_tools")).rows[0].icon_url,
          url("demo", "1", "icons/test"),
        );
      });
      await t.test("orphaned legacy rows prevent destructive table removal", async () => {
        await setup();
        await client.query("INSERT INTO tool_icons VALUES ('orphan', 'icons/test', '1')");
        await assert.rejects(migrate(), /backfill incomplete/);
        assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM tool_icons")).rows[0].count, 1);
      });
      await t.test("all baseline migrations followed by icon migration support a fresh database", async () => {
        await client.query("DROP TABLE IF EXISTS pg_temp.tool_icons");
        await client.query("DROP TABLE IF EXISTS pg_temp.managed_tools");
        const schema = `icon_migration_${process.pid}`;
        await client.query(`CREATE SCHEMA ${pg.escapeIdentifier(schema)}`);
        try {
          await client.query("SELECT set_config('search_path', $1, false)", [schema]);
          await client.query("SELECT set_config('canopy.cloudinary_cloud_name', '', false)");
          const directory = new URL("../packages/database/migration/0001-baseline/", import.meta.url);
          for (const file of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
            await client.query(await readFile(new URL(file, directory), "utf8"));
          }
          await migrate();
          const { rows } = await client.query("SELECT tool_id, icon_url FROM managed_tools");
          assert.ok(rows.length > 0);
          assert.ok(rows.every((row) => row.icon_url === null));
          assert.equal((await client.query("SELECT to_regclass('tool_icons') AS table_name")).rows[0].table_name, null);
        } finally {
          await client.query("SELECT set_config('search_path', 'public', false)");
          await client.query(`DROP SCHEMA ${pg.escapeIdentifier(schema)} CASCADE`);
        }
      });
      await t.test("empty baseline and already assigned icons do not require cloud configuration", async () => {
        await setup({ cloud: "" });
        await migrate();
        await client.query("INSERT INTO managed_tools VALUES ('new-tool', NULL)");
        assert.equal((await client.query("SELECT icon_url FROM managed_tools")).rows[0].icon_url, null);
        await setup({ cloud: "", withUrl: true });
        await client.query("INSERT INTO managed_tools VALUES ('custom', 'https://example.com/custom.png')");
        await client.query("INSERT INTO tool_icons VALUES ('custom', 'icons/old', '1')");
        await migrate();
        assert.equal(
          (await client.query("SELECT icon_url FROM managed_tools")).rows[0].icon_url,
          "https://example.com/custom.png",
        );
      });
    } finally {
      await client.end();
    }
  },
);
