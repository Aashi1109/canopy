import { test, expect, onTestFinished } from "vitest";
import { sql } from "drizzle-orm";
import { createDatabase, sqlClient } from "../db/runtime.ts";
import config from "../lib/config/config.ts";

const enabled = process.env.CANOPY_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

test.skipIf(!enabled)(
  "a bounded database pool completes concurrent reads and releases failed transactions",
  async (context) => {
    onTestFinished(() => sqlClient.end());
    const db = createDatabase({});
    const pair = async (database) => {
      const [plain, parameterized] = await Promise.all([
        database.execute(sql`select 1 as value`),
        database.execute(sql`select ${2}::int as value`),
      ]);
      expect(plain.rows[0].value).toBe(1);
      expect(parameterized.rows[0].value).toBe(2);
    };

    for (let i = 0; i < 5; i++) await pair(db);
    expect(sqlClient.totalCount > 0 && sqlClient.totalCount <= config.databasePoolMax).toBeTruthy();
    await db.transaction(
      async (tx) => {
        await pair(tx);
        await expect(
          tx.transaction(async (savepoint) => {
            await pair(savepoint);
            savepoint.rollback();
          }),
        ).rejects.toThrow(/rollback/i);
        await pair(tx);
      },
      { accessMode: "read only" },
    );
    await expect(
      db.transaction(
        async (tx) => {
          await pair(tx);
          tx.rollback();
        },
        { accessMode: "read only" },
      ),
    ).rejects.toThrow(/rollback/i);
    await pair(db);
    expect(sqlClient.idleCount).toBe(sqlClient.totalCount);
  },
);
