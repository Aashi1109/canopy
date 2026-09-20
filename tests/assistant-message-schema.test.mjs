import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const url = process.env.ASSISTANT_TEST_DATABASE_URL;
test(
  "Assistant message storage enforces relationships and permits parallel runs",
  { skip: url ? false : "set ASSISTANT_TEST_DATABASE_URL to a disposable PostgreSQL database" },
  async () => {
    const client = new pg.Client({ connectionString: url });
    const schema = `assistant_messages_${randomUUID().replaceAll("-", "")}`;
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      await client.query(
        "CREATE TABLE auth_users(id text primary key); INSERT INTO auth_users VALUES ('owner'),('other')",
      );
      await client.query(
        await readFile(
          new URL("../db/migration/0007-generic-assistant/0001_generic_assistant.sql", import.meta.url),
          "utf8",
        ),
      );
      const unscoped = await client.query(`
        INSERT INTO assistant_runs(id,integration_key,owner_id,client_request_id,operation,execution_mode,provider,model,status,request,expires_at)
        SELECT operation,'fixture','owner',operation,operation,'standalone','openai','configured','completed','{}',now()+interval '1 day'
        FROM unnest(ARRAY['compose','extract','summarize']) operation
        RETURNING thread_id,resource_id
      `);
      assert.equal(unscoped.rowCount, 3);
      assert.ok(unscoped.rows.every((row) => row.thread_id === null && row.resource_id === null));
      await client.query(
        "INSERT INTO assistant_threads(id,integration_key,resource_id,owner_id,title) VALUES ('thread','fixture','resource','owner','Chat'),('private','fixture','resource','other','Private')",
      );
      await client.query(
        "INSERT INTO assistant_messages(id,thread_id,role) VALUES ('input','thread','user'),('foreign-input','private','user')",
      );
      await client.query(`INSERT INTO assistant_runs(id,thread_id,integration_key,resource_id,owner_id,input_message_id,client_request_id,operation,execution_mode,provider,model,status,request,expires_at)
        SELECT id,'thread','fixture','resource','owner','input',id,'compose','conversational','openai','configured','running','{}',now()+interval '1 day'
        FROM unnest(ARRAY['parallel-1','parallel-2']) id`);
      await client.query(
        "INSERT INTO assistant_messages(id,thread_id,run_id,role,parts,meta) VALUES ('output','thread','parallel-1','assistant','[{\"type\":\"text\",\"text\":\"Answer\"}]','{\"usage\":{\"totalTokens\":12}}')",
      );
      await client.query(
        "INSERT INTO assistant_attachments(id,thread_id,message_id,owner_id,type,label,data,status) VALUES ('link','thread','input','owner','link','Reference','{\"url\":\"https://openai.com\"}','ready')",
      );
      await assert.rejects(
        client.query("UPDATE assistant_attachments SET thread_id='private' WHERE id='link'"),
        /foreign key/i,
      );
      await assert.rejects(
        client.query("UPDATE assistant_runs SET input_message_id='foreign-input' WHERE id='parallel-1'"),
        /foreign key/i,
      );
      await assert.rejects(
        client.query("UPDATE assistant_messages SET role='system' WHERE id='output'"),
        /check constraint/i,
      );
      await assert.rejects(
        client.query("UPDATE assistant_messages SET parts='{}' WHERE id='output'"),
        /check constraint/i,
      );
      await assert.rejects(
        client.query("UPDATE assistant_messages SET meta='[]' WHERE id='output'"),
        /check constraint/i,
      );
      await assert.rejects(
        client.query(
          "INSERT INTO assistant_messages(id,thread_id,run_id,role) VALUES ('duplicate','thread','parallel-1','assistant')",
        ),
        /unique constraint/i,
      );
      await client.query("UPDATE assistant_runs SET model='actual-model' WHERE id='parallel-1'");
      assert.equal(
        (await client.query("SELECT count(*)::int n FROM assistant_runs WHERE status='running'")).rows[0].n,
        2,
      );
      assert.deepEqual(
        (await client.query("SELECT meta FROM assistant_messages WHERE id='output'")).rows[0].meta.usage,
        {
          totalTokens: 12,
        },
      );
    } finally {
      await client.query("ROLLBACK");
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    }
  },
);
