import { expect, test, onTestFinished } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import pg from "pg";

const enabled = process.env.CANOPY_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

test(
  "authorization changes advance only affected user cache keys and roll back atomically",
  {
    skip: enabled ? false : "set CANOPY_INTEGRATION=1 with a disposable DATABASE_URL",
  },
  async (context) => {
    const transaction = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await transaction.connect();
    onTestFinished(() => transaction.end());
    const schema = `user_role_cache_test_${randomUUID().replaceAll("-", "")}`;
    const migration = await readFile(
      new URL("../db/migration/0001-baseline/0007_user_role_cache.sql", import.meta.url),
      "utf8",
    );
    await transaction.query("BEGIN");
    try {
      await transaction.query(`CREATE SCHEMA ${schema}`);
      // No public fallback: every migration object and table stays in this schema.
      await transaction.query(`SET LOCAL search_path TO ${schema}`);
      await transaction.query(`
      CREATE TABLE auth_users (
        id text PRIMARY KEY,
        status text NOT NULL DEFAULT 'active',
        updated_at timestamp NOT NULL DEFAULT '2099-01-01'
      );
      CREATE TABLE roles (id text PRIMARY KEY, name text NOT NULL, access jsonb NOT NULL DEFAULT '{}');
      CREATE TABLE user_roles (
        user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        role_id text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_id)
      );
    `);
      await transaction.query(migration);
      await transaction.query("INSERT INTO auth_users (id) VALUES ('a'), ('b'), ('c'), ('d')");
      await transaction.query(
        "INSERT INTO roles (id, name) VALUES ('viewer', 'Viewer'), ('editor', 'Editor'), ('free', 'Free')",
      );

      const timestamps = async () =>
        Object.fromEntries(
          (await transaction.query("\n      SELECT id, updated_at FROM auth_users ORDER BY id\n    ")).rows.map(
            ({ id, updated_at }) => [id, updated_at.toISOString()],
          ),
        );
      async function changesOnly(ids, change) {
        const before = await timestamps();
        await change();
        const after = await timestamps();
        for (const id of Object.keys(before)) {
          if (ids.includes(id))
            expect(after[id] > before[id], `${id} gets a distinct millisecond cache key`).toBeTruthy();
          else expect(after[id], `${id} is unaffected`).toBe(before[id]);
        }
      }

      await changesOnly(["a"], () => transaction.query("INSERT INTO user_roles VALUES ('a', 'free')"));
      await changesOnly(["a"], () => transaction.query("DELETE FROM user_roles WHERE user_id = 'a'"));
      await changesOnly(["a", "b"], () =>
        transaction.query("INSERT INTO user_roles VALUES ('a', 'viewer'), ('b', 'viewer')"),
      );
      await changesOnly(["a", "c"], () => transaction.query("UPDATE user_roles SET user_id = 'c' WHERE user_id = 'a'"));
      await changesOnly(["c"], () => transaction.query("UPDATE user_roles SET role_id = 'editor' WHERE user_id = 'c'"));
      await changesOnly(["b"], () =>
        transaction.query("UPDATE roles SET access = '{\"admin\":{\"enter\":true}}' WHERE id = 'viewer'"),
      );
      await changesOnly(["c"], () => transaction.query("UPDATE roles SET name = 'Renamed editor' WHERE id = 'editor'"));
      await changesOnly([], () => transaction.query("UPDATE roles SET name = 'Unused' WHERE id = 'free'"));
      await changesOnly(["d"], () => transaction.query("UPDATE auth_users SET status = 'suspended' WHERE id = 'd'"));
      await changesOnly(["c"], () => transaction.query("DELETE FROM roles WHERE id = 'editor'"));
      expect((await transaction.query("SELECT * FROM user_roles WHERE user_id = 'c'")).rows.length).toBe(0);
      await changesOnly(["b"], () => transaction.query("DELETE FROM user_roles WHERE role_id = 'viewer'"));

      const beforeRollback = await timestamps();
      await transaction.query("SAVEPOINT authorization_update");
      try {
        await transaction.query("INSERT INTO user_roles VALUES ('a', 'free')");
        await transaction.query("UPDATE auth_users SET status = 'suspended' WHERE id = 'b'");
      } finally {
        await transaction.query("ROLLBACK TO SAVEPOINT authorization_update");
        await transaction.query("RELEASE SAVEPOINT authorization_update");
      }
      expect(await timestamps()).toEqual(beforeRollback);
      expect((await transaction.query("SELECT * FROM user_roles")).rows.length).toBe(0);

      // Future seed timestamps force the monotonic millisecond branch even when
      // several writes share one transaction and complete in the same millisecond.
      const keys = new Set([(await timestamps()).d]);
      for (let index = 0; index < 10; index++) {
        await transaction.query("UPDATE auth_users SET status = 'active' WHERE id = 'd'");
        keys.add((await timestamps()).d);
      }
      expect(keys.size).toBe(11);
    } finally {
      await transaction.query("ROLLBACK");
    }
    expect((await transaction.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [schema])).rows.length).toBe(0);
  },
);

test(
  "concurrent role edits and assignments cannot leave a stale user cache key",
  {
    skip: enabled ? false : "set CANOPY_INTEGRATION=1 with a disposable DATABASE_URL",
  },
  async (context) => {
    const schema = `user_role_cache_test_${randomUUID().replaceAll("-", "")}`;
    const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    const clients = [];
    onTestFinished(async () => {
      await Promise.all(
        clients.map(async (client) => {
          await client.query("ROLLBACK");
          await client.end();
        }),
      );
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    });
    // Concurrent connections need committed fixtures; cleanup removes only this
    // random schema, and every connection explicitly excludes public.
    await admin.query("BEGIN");
    try {
      await admin.query(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
      await admin.query(`
      CREATE TABLE auth_users (id text PRIMARY KEY, updated_at timestamp NOT NULL DEFAULT '2099-01-01');
      CREATE TABLE roles (id text PRIMARY KEY, name text NOT NULL, access jsonb NOT NULL DEFAULT '{}');
      CREATE TABLE user_roles (
        user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        role_id text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_id)
      );
      INSERT INTO auth_users (id) VALUES ('role-first'), ('assignment-first');
      INSERT INTO roles (id, name) VALUES ('editor', 'Editor');
    `);
      await admin.query(
        await readFile(new URL("../db/migration/0001-baseline/0007_user_role_cache.sql", import.meta.url), "utf8"),
      );
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK");
      throw error;
    }
    const roleWriter = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    });
    const assignmentWriter = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    });
    clients.push(roleWriter, assignmentWriter);
    await Promise.all(clients.map((client) => client.connect()));
    const [{ pid: rolePid }] = (await roleWriter.query("SELECT pg_backend_pid() AS pid")).rows;
    const [{ pid: assignmentPid }] = (await assignmentWriter.query("SELECT pg_backend_pid() AS pid")).rows;
    async function waitsFor(waiter, blocker) {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const [{ waiting }] = (await admin.query("SELECT $1 = ANY(pg_blocking_pids($2)) AS waiting", [blocker, waiter]))
          .rows;
        if (waiting) return;
        await setTimeout(10);
      }
      expect.fail("concurrent authorization mutation must wait for the other transaction");
    }

    await roleWriter.query("BEGIN");
    await assignmentWriter.query("BEGIN");
    await roleWriter.query("UPDATE roles SET access = '{\"admin\":{\"enter\":true}}' WHERE id = 'editor'");
    const assignment = assignmentWriter.query("INSERT INTO user_roles VALUES ('role-first', 'editor')");
    await waitsFor(assignmentPid, rolePid);
    await roleWriter.query("COMMIT");
    await assignment;
    const [visibleRole] = (await assignmentWriter.query("SELECT access FROM roles WHERE id = 'editor'")).rows;
    expect(visibleRole.access).toEqual({ admin: { enter: true } });
    await assignmentWriter.query("COMMIT");

    await roleWriter.query("BEGIN");
    await assignmentWriter.query("BEGIN");
    await assignmentWriter.query("INSERT INTO user_roles VALUES ('assignment-first', 'editor')");
    const [{ updated_at: before }] = (
      await assignmentWriter.query("SELECT updated_at FROM auth_users WHERE id = 'assignment-first'")
    ).rows;
    const roleUpdate = roleWriter.query("UPDATE roles SET access = '{}' WHERE id = 'editor'");
    await waitsFor(rolePid, assignmentPid);
    await assignmentWriter.query("COMMIT");
    await roleUpdate;
    await roleWriter.query("COMMIT");
    const [{ updated_at: after }] = (
      await assignmentWriter.query("SELECT updated_at FROM auth_users WHERE id = 'assignment-first'")
    ).rows;
    expect(
      after.toISOString() > before.toISOString(),
      "role update invalidates the just-committed assignment's cache key",
    ).toBeTruthy();
  },
);
