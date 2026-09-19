import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const url = process.env.BLOG_TEST_DATABASE_URL;
test(
  "development messages schema enforces relationships and permits parallel runs",
  { skip: url ? false : "set BLOG_TEST_DATABASE_URL to a disposable PostgreSQL database" },
  async () => {
    const client = new pg.Client({ connectionString: url });
    const schema = `blog_messages_${randomUUID().replaceAll("-", "")}`;
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      await client.query("CREATE TABLE auth_users(id text primary key); CREATE TABLE blog_posts(id text primary key)");
      for (const path of [
        "0003-blog-assistant/0001_blog_assistant.sql",
        "0004-inline-blog-rewrites/0001_inline_blog_rewrites.sql",
        "0005-blog-messages/0001_blog_messages.sql",
        "0006-blog-agent-artifacts/0001_blog_agent_artifacts.sql",
      ])
        await client.query(await readFile(new URL(`../db/migration/${path}`, import.meta.url), "utf8"));
      await client.query("INSERT INTO auth_users VALUES ('owner'),('other'); INSERT INTO blog_posts VALUES ('post')");
      const unscoped = await client.query(`
        INSERT INTO blog_runs(id,owner_id,client_request_id,operation,provider,model,status,request,expires_at)
        SELECT operation,'owner',operation,operation,'openai','configured','completed','{}',now()+interval '1 day'
        FROM unnest(ARRAY['generate','rewrite','chat','review','check_sources','agent']) operation
        RETURNING thread_id,post_id
      `);
      assert.equal(unscoped.rowCount, 6);
      assert.ok(unscoped.rows.every((row) => row.thread_id === null && row.post_id === null));
      await client.query(
        "INSERT INTO blog_threads(id,post_id,owner_id,title) VALUES ('thread','post','owner','Chat'),('private','post','other','Private')",
      );
      await client.query(
        "INSERT INTO blog_messages(id,thread_id,role) VALUES ('input','thread','user'),('foreign-input','private','user')",
      );
      await client.query(`INSERT INTO blog_runs(id,thread_id,post_id,owner_id,input_message_id,client_request_id,operation,provider,model,status,request,expires_at)
      SELECT id,'thread','post','owner','input',id,'chat','openai','configured','running','{}',now()+interval '1 day' FROM unnest(ARRAY['parallel-1','parallel-2']) id`);
      await client.query(
        "INSERT INTO blog_messages(id,thread_id,run_id,role,parts,meta) VALUES ('output','thread','parallel-1','assistant','[{\"type\":\"text\",\"text\":\"Answer\"}]','{\"usage\":{\"totalTokens\":12}}')",
      );
      await client.query(
        "INSERT INTO blog_attachments(id,thread_id,message_id,owner_id,type,label,data,status) VALUES ('link','thread','input','owner','link','Reference','{\"url\":\"https://openai.com\"}','ready')",
      );
      await assert.rejects(
        client.query("UPDATE blog_attachments SET thread_id='private' WHERE id='link'"),
        /foreign key/i,
      );
      await assert.rejects(
        client.query("UPDATE blog_runs SET input_message_id='foreign-input' WHERE id='parallel-1'"),
        /foreign key/i,
      );
      await assert.rejects(
        client.query("UPDATE blog_messages SET role='system' WHERE id='output'"),
        /check constraint/i,
      );
      await assert.rejects(client.query("UPDATE blog_messages SET parts='{}' WHERE id='output'"), /check constraint/i);
      await assert.rejects(
        client.query(
          "INSERT INTO blog_messages(id,thread_id,run_id,role) VALUES ('duplicate','thread','parallel-1','assistant')",
        ),
        /unique constraint/i,
      );
      await client.query("UPDATE blog_runs SET model='actual-model' WHERE id='parallel-1'");
      assert.equal((await client.query("SELECT count(*)::int n FROM blog_runs WHERE status='running'")).rows[0].n, 2);
      assert.deepEqual((await client.query("SELECT meta FROM blog_messages WHERE id='output'")).rows[0].meta.usage, {
        totalTokens: 12,
      });
    } finally {
      await client.query("ROLLBACK");
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    }
  },
);
