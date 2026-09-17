import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postgres from "postgres";

const enabled = process.env.CANOPY_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
test(
  "user preferences isolate keys/users, enforce uniqueness, and cascade account deletion",
  {
    skip: enabled ? false : "set CANOPY_INTEGRATION=1 with a disposable DATABASE_URL",
  },
  async (context) => {
    const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice() {} });
    context.after(() => sql.end());
    const schema = `preferences_test_${randomUUID().replaceAll("-", "")}`;
    const migration = await readFile(
      new URL("../packages/database/migration/0001-baseline/0008_user_preferences.sql", import.meta.url),
      "utf8",
    );
    const rollback = new Error("rollback isolated schema");
    await assert.rejects(
      sql.begin(async (tx) => {
        await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
        await tx.unsafe("CREATE TABLE auth_users (id text PRIMARY KEY)");
        await tx.unsafe(migration);
        await tx.unsafe(migration);
        await tx`INSERT INTO auth_users VALUES ('a'), ('b')`;
        await tx`INSERT INTO user_preferences (user_id,key,value) VALUES ('a','saved_tools','["devtools.json-formatter"]'),('a','theme','"light"'),('b','saved_tools','[]')`;
        await tx`UPDATE user_preferences SET value='["media.merge-pdf"]' WHERE user_id='a' AND key='saved_tools'`;
        assert.deepEqual(
          (await tx`SELECT value FROM user_preferences WHERE user_id='a' AND key='theme'`)[0].value,
          "light",
        );
        assert.deepEqual(
          (await tx`SELECT value FROM user_preferences WHERE user_id='b' AND key='saved_tools'`)[0].value,
          [],
        );
        await assert.rejects(
          tx.savepoint((s) => s`INSERT INTO user_preferences (user_id,key,value) VALUES ('a','saved_tools','[]')`),
          (e) => e.code === "23505",
        );
        await assert.rejects(
          tx.savepoint(
            (s) => s`INSERT INTO user_preferences (user_id,key,value) VALUES ('missing','saved_tools','[]')`,
          ),
          (e) => e.code === "23503",
        );
        await tx`DELETE FROM auth_users WHERE id='a'`;
        assert.equal((await tx`SELECT * FROM user_preferences WHERE user_id='a'`).length, 0);
        assert.equal((await tx`SELECT * FROM user_preferences WHERE user_id='b'`).length, 1);
        throw rollback;
      }),
      (error) => error === rollback,
    );
  },
);
