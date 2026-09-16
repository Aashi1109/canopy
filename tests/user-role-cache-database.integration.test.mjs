import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import postgres from "postgres";

const enabled = process.env.SMARTTOOLS_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

test(
  "authorization changes advance only affected user cache keys and roll back atomically",
  {
    skip: enabled ? false : "set SMARTTOOLS_INTEGRATION=1 with a disposable DATABASE_URL",
  },
  async (context) => {
    const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice() {} });
    context.after(() => sql.end());
    const schema = `user_role_cache_test_${randomUUID().replaceAll("-", "")}`;
    const migration = await readFile(
      new URL("../packages/database/drizzle/0007_user_role_cache.sql", import.meta.url),
      "utf8",
    );
    const rollback = new Error("roll back isolated test schema");

    await assert.rejects(
      sql.begin(async (transaction) => {
        await transaction.unsafe(`CREATE SCHEMA ${schema}`);
        // No public fallback: every migration object and table stays in this schema.
        await transaction.unsafe(`SET LOCAL search_path TO ${schema}`);
        await transaction.unsafe(`
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
        await transaction.unsafe(migration);
        await transaction`INSERT INTO auth_users (id) VALUES ('a'), ('b'), ('c'), ('d')`;
        await transaction`INSERT INTO roles (id, name) VALUES ('viewer', 'Viewer'), ('editor', 'Editor'), ('free', 'Free')`;

        const timestamps = async () =>
          Object.fromEntries(
            (
              await transaction`
      SELECT id, updated_at FROM auth_users ORDER BY id
    `
            ).map(({ id, updated_at }) => [id, updated_at.toISOString()]),
          );
        async function changesOnly(ids, change) {
          const before = await timestamps();
          await change();
          const after = await timestamps();
          for (const id of Object.keys(before)) {
            if (ids.includes(id)) assert.ok(after[id] > before[id], `${id} gets a distinct millisecond cache key`);
            else assert.equal(after[id], before[id], `${id} is unaffected`);
          }
        }

        await changesOnly(["a"], () => transaction`INSERT INTO user_roles VALUES ('a', 'free')`);
        await changesOnly(["a"], () => transaction`DELETE FROM user_roles WHERE user_id = 'a'`);
        await changesOnly(
          ["a", "b"],
          () => transaction`INSERT INTO user_roles VALUES ('a', 'viewer'), ('b', 'viewer')`,
        );
        await changesOnly(["a", "c"], () => transaction`UPDATE user_roles SET user_id = 'c' WHERE user_id = 'a'`);
        await changesOnly(["c"], () => transaction`UPDATE user_roles SET role_id = 'editor' WHERE user_id = 'c'`);
        await changesOnly(
          ["b"],
          () => transaction`UPDATE roles SET access = '{"admin":{"enter":true}}' WHERE id = 'viewer'`,
        );
        await changesOnly(["c"], () => transaction`UPDATE roles SET name = 'Renamed editor' WHERE id = 'editor'`);
        await changesOnly([], () => transaction`UPDATE roles SET name = 'Unused' WHERE id = 'free'`);
        await changesOnly(["d"], () => transaction`UPDATE auth_users SET status = 'suspended' WHERE id = 'd'`);
        await changesOnly(["c"], () => transaction`DELETE FROM roles WHERE id = 'editor'`);
        assert.equal((await transaction`SELECT * FROM user_roles WHERE user_id = 'c'`).length, 0);
        await changesOnly(["b"], () => transaction`DELETE FROM user_roles WHERE role_id = 'viewer'`);

        const beforeRollback = await timestamps();
        const cancel = new Error("cancel authorization update");
        await assert.rejects(
          transaction.savepoint(async (savepoint) => {
            await savepoint`INSERT INTO user_roles VALUES ('a', 'free')`;
            await savepoint`UPDATE auth_users SET status = 'suspended' WHERE id = 'b'`;
            throw cancel;
          }),
          (error) => error === cancel,
        );
        assert.deepEqual(await timestamps(), beforeRollback);
        assert.equal((await transaction`SELECT * FROM user_roles`).length, 0);

        // Future seed timestamps force the monotonic millisecond branch even when
        // several writes share one transaction and complete in the same millisecond.
        const keys = new Set([(await timestamps()).d]);
        for (let index = 0; index < 10; index++) {
          await transaction`UPDATE auth_users SET status = 'active' WHERE id = 'd'`;
          keys.add((await timestamps()).d);
        }
        assert.equal(keys.size, 11);
        throw rollback;
      }),
      (error) => error === rollback,
    );
    assert.equal((await sql`SELECT 1 FROM pg_namespace WHERE nspname = ${schema}`).length, 0);
  },
);

test(
  "concurrent role edits and assignments cannot leave a stale user cache key",
  {
    skip: enabled ? false : "set SMARTTOOLS_INTEGRATION=1 with a disposable DATABASE_URL",
  },
  async (context) => {
    const schema = `user_role_cache_test_${randomUUID().replaceAll("-", "")}`;
    const admin = postgres(process.env.DATABASE_URL, { max: 1, onnotice() {} });
    const clients = [];
    context.after(async () => {
      await Promise.all(
        clients.map(async (client) => {
          await client`ROLLBACK`;
          await client.end();
        }),
      );
      await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    });
    // Concurrent connections need committed fixtures; cleanup removes only this
    // random schema, and every connection explicitly excludes public.
    await admin.begin(async (sql) => {
      await sql.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
      await sql.unsafe(`
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
      await sql.unsafe(
        await readFile(new URL("../packages/database/drizzle/0007_user_role_cache.sql", import.meta.url), "utf8"),
      );
    });
    const roleWriter = postgres(process.env.DATABASE_URL, {
      max: 1,
      connection: { search_path: schema },
      onnotice() {},
    });
    const assignmentWriter = postgres(process.env.DATABASE_URL, {
      max: 1,
      connection: { search_path: schema },
      onnotice() {},
    });
    clients.push(roleWriter, assignmentWriter);
    const [{ pid: rolePid }] = await roleWriter`SELECT pg_backend_pid() AS pid`;
    const [{ pid: assignmentPid }] = await assignmentWriter`SELECT pg_backend_pid() AS pid`;
    async function waitsFor(waiter, blocker) {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const [{ waiting }] = await admin`SELECT ${blocker} = ANY(pg_blocking_pids(${waiter})) AS waiting`;
        if (waiting) return;
        await setTimeout(10);
      }
      assert.fail("concurrent authorization mutation must wait for the other transaction");
    }

    await roleWriter`BEGIN`;
    await assignmentWriter`BEGIN`;
    await roleWriter`UPDATE roles SET access = '{"admin":{"enter":true}}' WHERE id = 'editor'`;
    const assignment = assignmentWriter`INSERT INTO user_roles VALUES ('role-first', 'editor')`.execute();
    await waitsFor(assignmentPid, rolePid);
    await roleWriter`COMMIT`;
    await assignment;
    const [visibleRole] = await assignmentWriter`SELECT access FROM roles WHERE id = 'editor'`;
    assert.deepEqual(visibleRole.access, { admin: { enter: true } });
    await assignmentWriter`COMMIT`;

    await roleWriter`BEGIN`;
    await assignmentWriter`BEGIN`;
    await assignmentWriter`INSERT INTO user_roles VALUES ('assignment-first', 'editor')`;
    const [{ updated_at: before }] =
      await assignmentWriter`SELECT updated_at FROM auth_users WHERE id = 'assignment-first'`;
    const roleUpdate = roleWriter`UPDATE roles SET access = '{}' WHERE id = 'editor'`.execute();
    await waitsFor(rolePid, assignmentPid);
    await assignmentWriter`COMMIT`;
    await roleUpdate;
    await roleWriter`COMMIT`;
    const [{ updated_at: after }] =
      await assignmentWriter`SELECT updated_at FROM auth_users WHERE id = 'assignment-first'`;
    assert.ok(
      after.toISOString() > before.toISOString(),
      "role update invalidates the just-committed assignment's cache key",
    );
  },
);
