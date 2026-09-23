import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { createDatabase, sqlClient } from "../db/runtime.ts";
import config from "../lib/config/config.ts";

const enabled = process.env.CANOPY_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

test(
  "a bounded database pool completes concurrent reads and releases failed transactions",
  { skip: enabled ? false : "set CANOPY_INTEGRATION=1 and DATABASE_URL; this test only reads", timeout: 15_000 },
  async (context) => {
    context.after(() => sqlClient.end());
    const db = createDatabase({});
    const pair = async (database) => {
      const [plain, parameterized] = await Promise.all([
        database.execute(sql`select 1 as value`),
        database.execute(sql`select ${2}::int as value`),
      ]);
      assert.equal(plain.rows[0].value, 1);
      assert.equal(parameterized.rows[0].value, 2);
    };

    for (let i = 0; i < 5; i++) await pair(db);
    assert.ok(sqlClient.totalCount > 0 && sqlClient.totalCount <= config.databasePoolMax);
    await db.transaction(
      async (tx) => {
        await pair(tx);
        await assert.rejects(
          tx.transaction(async (savepoint) => {
            await pair(savepoint);
            savepoint.rollback();
          }),
          /rollback/i,
        );
        await pair(tx);
      },
      { accessMode: "read only" },
    );
    await assert.rejects(
      db.transaction(
        async (tx) => {
          await pair(tx);
          tx.rollback();
        },
        { accessMode: "read only" },
      ),
      /rollback/i,
    );
    await pair(db);
    assert.equal(sqlClient.idleCount, sqlClient.totalCount);
  },
);
