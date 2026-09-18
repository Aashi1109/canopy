import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import pg from "pg";

const run = promisify(execFile);
const enabled = process.env.CANOPY_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

test(
  "admin promotion preserves eligibility, audit writes and transaction rollback",
  {
    skip: enabled ? false : "set CANOPY_INTEGRATION=1 with a disposable DATABASE_URL",
  },
  async () => {
    const schema = `promote_test_${randomUUID().replaceAll("-", "")}`;
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set("options", `-c search_path=${schema}`);
    const promote = (email) =>
      run(
        process.execPath,
        [fileURLToPath(new URL("../packages/database/scripts/promote-admin.mjs", import.meta.url)), email],
        { env: { ...process.env, DATABASE_URL: url.href, REDIS_URL: "" }, timeout: 10_000 },
      );
    try {
      await client.connect();
      await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
      CREATE TABLE auth_users (id text PRIMARY KEY, email text, email_verified boolean, status text);
      CREATE TABLE user_roles (user_id text, role_id text, PRIMARY KEY (user_id, role_id));
      CREATE TABLE audit_events (id text, actor_user_id text, action text, target_type text, target_id text, metadata jsonb);
      INSERT INTO auth_users VALUES
        ('verified', 'verified@example.test', true, 'active'),
        ('unverified', 'unverified@example.test', false, 'active'),
        ('suspended', 'suspended@example.test', true, 'suspended'),
        ('rollback', 'rollback@example.test', true, 'active');
    `);
      await promote("  VERIFIED@example.test  ");
      await promote("verified@example.test");
      assert.deepEqual((await client.query("SELECT * FROM user_roles")).rows, [
        { user_id: "verified", role_id: "admin" },
      ]);
      const { rows: audits } = await client.query(
        "SELECT actor_user_id, action, target_type, target_id, metadata FROM audit_events",
      );
      assert.equal(audits.length, 2);
      for (const row of audits)
        assert.deepEqual(row, {
          actor_user_id: "verified",
          action: "user.promote_admin",
          target_type: "user",
          target_id: "verified",
          metadata: { source: "cli" },
        });
      for (const [email, error] of [
        ["missing@example.test", /Account not found/],
        ["unverified@example.test", /not verified/],
        ["suspended@example.test", /suspended/],
        ["verified@example.test' OR '1'='1", /Account not found/],
      ])
        await assert.rejects(promote(email), error);
      await client.query("ALTER TABLE audit_events ADD CHECK (actor_user_id <> 'rollback')");
      await assert.rejects(promote("rollback@example.test"), /check constraint/);
      assert.equal((await client.query("SELECT * FROM user_roles")).rowCount, 1);
      assert.equal((await client.query("SELECT * FROM audit_events")).rowCount, 2);
    } finally {
      try {
        await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        await client.end();
      }
    }
  },
);
