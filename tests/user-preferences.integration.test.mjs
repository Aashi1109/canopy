import { expect, test, onTestFinished } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const enabled = process.env.CANOPY_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
test(
  "user preferences isolate keys/users, enforce uniqueness, and cascade account deletion",
  {
    skip: enabled ? false : "set CANOPY_INTEGRATION=1 with a disposable DATABASE_URL",
  },
  async (context) => {
    const tx = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await tx.connect();
    onTestFinished(() => tx.end());
    const schema = `preferences_test_${randomUUID().replaceAll("-", "")}`;
    const migration = await readFile(
      new URL("../db/migration/0001-baseline/0008_user_preferences.sql", import.meta.url),
      "utf8",
    );
    await tx.query("BEGIN");
    try {
      await tx.query(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
      await tx.query("CREATE TABLE auth_users (id text PRIMARY KEY)");
      await tx.query(migration);
      await tx.query(migration);
      await tx.query("INSERT INTO auth_users VALUES ('a'), ('b')");
      await tx.query(
        "INSERT INTO user_preferences (user_id,key,value) VALUES ('a','saved_tools','[\"devtools.json-formatter\"]'),('a','theme','\"light\"'),('b','saved_tools','[]')",
      );
      await tx.query(
        "UPDATE user_preferences SET value='[\"media.merge-pdf\"]' WHERE user_id='a' AND key='saved_tools'",
      );
      expect(
        (await tx.query("SELECT value FROM user_preferences WHERE user_id='a' AND key='theme'")).rows[0].value,
      ).toEqual("light");
      expect(
        (await tx.query("SELECT value FROM user_preferences WHERE user_id='b' AND key='saved_tools'")).rows[0].value,
      ).toEqual([]);
      await tx.query("SAVEPOINT constraint_check");
      await (async () => {
        let __err;
        try {
          await tx.query("INSERT INTO user_preferences (user_id,key,value) VALUES ('a','saved_tools','[]')");
        } catch (__e) {
          __err = __e;
        }
        expect(__err).toBeDefined();
        expect(((e) => e.code === "23505")(__err)).toBe(true);
      })();
      await tx.query("ROLLBACK TO SAVEPOINT constraint_check");
      await tx.query("RELEASE SAVEPOINT constraint_check");
      await tx.query("SAVEPOINT constraint_check");
      await (async () => {
        let __err;
        try {
          await tx.query("INSERT INTO user_preferences (user_id,key,value) VALUES ('missing','saved_tools','[]')");
        } catch (__e) {
          __err = __e;
        }
        expect(__err).toBeDefined();
        expect(((e) => e.code === "23503")(__err)).toBe(true);
      })();
      await tx.query("ROLLBACK TO SAVEPOINT constraint_check");
      await tx.query("RELEASE SAVEPOINT constraint_check");
      await tx.query("DELETE FROM auth_users WHERE id='a'");
      expect((await tx.query("SELECT * FROM user_preferences WHERE user_id='a'")).rows.length).toBe(0);
      expect((await tx.query("SELECT * FROM user_preferences WHERE user_id='b'")).rows.length).toBe(1);
    } finally {
      await tx.query("ROLLBACK");
    }
    expect((await tx.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [schema])).rows.length).toBe(0);
  },
);
