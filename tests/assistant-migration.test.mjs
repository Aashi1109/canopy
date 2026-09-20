import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";
import pg from "pg";

// Never fall back to the application's configured DATABASE_URL.
const url = process.env.ASSISTANT_TEST_DATABASE_URL;
const databaseOnly = { skip: url ? false : "set ASSISTANT_TEST_DATABASE_URL to a disposable PostgreSQL database" };
const migration = await readFile(
  new URL("../db/migration/0007-generic-assistant/0001_generic_assistant.sql", import.meta.url),
  "utf8",
);
async function withDatabase(callback, { legacy = "none" } = {}) {
  const client = new pg.Client({ connectionString: url });
  const schema = `assistant_migration_${randomUUID().replaceAll("-", "")}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(
      "CREATE TABLE auth_users(id text primary key); INSERT INTO auth_users VALUES ('owner'),('other')",
    );
    if (legacy !== "none") await createLegacyFixture(client, legacy);
    await callback(client, schema);
  } finally {
    await client.query("ROLLBACK");
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
}

// A small test-owned representation of legacy storage, not archived migrations.
// It retains the relationships and provider trigger that make dropping the tables nontrivial.
async function createLegacyFixture(client, layout = "current") {
  await client.query(`
    CREATE TABLE blog_posts(id text PRIMARY KEY, document jsonb NOT NULL);
    CREATE TABLE unrelated_records(id text PRIMARY KEY, post_id text REFERENCES blog_posts(id), value text);
    INSERT INTO blog_posts VALUES ('post','{"title":"Keep the Blog article"}'),('another-post','{"title":"Another article"}');
    INSERT INTO unrelated_records VALUES ('untouched','post','Keep unrelated application data');
    CREATE TABLE blog_threads(
      id text PRIMARY KEY, post_id text REFERENCES blog_posts(id), owner_id text REFERENCES auth_users(id),
      title text, settings jsonb DEFAULT '{}', UNIQUE(id,owner_id)
    );
    CREATE TABLE blog_runs(
      id text PRIMARY KEY, thread_id text REFERENCES blog_threads(id), post_id text REFERENCES blog_posts(id),
      owner_id text REFERENCES auth_users(id), provider text, model text, request jsonb, input_message_id text,
      UNIQUE(id,thread_id)
    );
    INSERT INTO blog_threads VALUES ('legacy-thread','post','owner','Private legacy discussion','{"composerDraft":"Discard old draft"}');
    INSERT INTO blog_runs VALUES ('legacy-run','legacy-thread','post','owner','fixture','old-model','{"message":"Discard old request"}',NULL);
    CREATE FUNCTION protect_blog_run_provider() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.provider IS DISTINCT FROM OLD.provider OR NEW.model IS DISTINCT FROM OLD.model THEN
        RAISE EXCEPTION 'A run provider and model cannot change';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER blog_run_provider_immutable BEFORE UPDATE ON blog_runs
      FOR EACH ROW EXECUTE FUNCTION protect_blog_run_provider();
  `);
  if (layout === "old") {
    await client.query(`
      CREATE TABLE blog_attachments(
        id text PRIMARY KEY, thread_id text, owner_id text, provider text, provider_file_id text,
        filename text, mime_type text, size_bytes integer, status text, expires_at timestamptz,
        FOREIGN KEY(thread_id,owner_id) REFERENCES blog_threads(id,owner_id)
      );
      INSERT INTO blog_attachments VALUES ('legacy-file','legacy-thread','owner','fixture','old-provider-handle','source.png','image/png',128,'ready',now()+interval '1 day');
    `);
    return;
  }
  await client.query(`
    CREATE TABLE blog_messages(
      id text PRIMARY KEY, thread_id text REFERENCES blog_threads(id), run_id text,
      parts jsonb, UNIQUE(id,thread_id), FOREIGN KEY(run_id,thread_id) REFERENCES blog_runs(id,thread_id)
    );
    ALTER TABLE blog_runs ADD CONSTRAINT legacy_input_scope_fk
      FOREIGN KEY(input_message_id,thread_id) REFERENCES blog_messages(id,thread_id);
    CREATE TABLE blog_attachments(
      id text PRIMARY KEY, thread_id text, message_id text, run_id text, owner_id text, data jsonb,
      FOREIGN KEY(thread_id,owner_id) REFERENCES blog_threads(id,owner_id),
      FOREIGN KEY(message_id,thread_id) REFERENCES blog_messages(id,thread_id),
      FOREIGN KEY(run_id,thread_id) REFERENCES blog_runs(id,thread_id)
    );
    INSERT INTO blog_messages VALUES ('legacy-input','legacy-thread',NULL,'[{"type":"text","text":"Old request"}]'),
      ('legacy-output','legacy-thread','legacy-run','[{"type":"text","text":"Old answer"}]');
    UPDATE blog_runs SET input_message_id='legacy-input' WHERE id='legacy-run';
    INSERT INTO blog_attachments VALUES ('legacy-file','legacy-thread','legacy-input',NULL,'owner','{"providerFileId":"old-file"}'),
      ('legacy-artifact','legacy-thread',NULL,'legacy-run','owner','{"artifact":{"summary":"Old report"}}');
  `);
}

async function assertLegacyRemoved(client) {
  for (const name of ["blog_threads", "blog_runs", "blog_messages", "blog_attachments"])
    assert.equal((await client.query("SELECT to_regclass($1) AS relation", [name])).rows[0].relation, null, name);
  assert.equal(
    (await client.query("SELECT to_regprocedure('protect_blog_run_provider()') AS function")).rows[0].function,
    null,
  );
}
async function unrelatedRecords(client) {
  return {
    users: (await client.query("SELECT * FROM auth_users ORDER BY id")).rows,
    posts: (await client.query("SELECT * FROM blog_posts ORDER BY id")).rows,
    unrelated: (await client.query("SELECT * FROM unrelated_records ORDER BY id")).rows,
  };
}

async function seedAssistantConversation(client) {
  await client.query(`
    INSERT INTO assistant_threads(id,integration_key,resource_id,owner_id,title,settings)
      VALUES ('thread','fixture','resource','owner','Conversation','{"composerDraft":"Keep this draft"}');
    INSERT INTO assistant_messages(id,thread_id,role,parts)
      VALUES ('input','thread','user','[{"type":"text","text":"Original request"}]');
    INSERT INTO assistant_runs(id,thread_id,integration_key,resource_id,owner_id,client_request_id,operation,execution_mode,provider,model,provider_response_id,status,request,input_message_id,response,continuation,usage,expires_at)
      VALUES ('chat','thread','fixture','resource','owner','chat-request','chat','conversational','openai','actual-model','response-handle','completed','{"schemaVersion":1,"operation":"chat","resourceId":"resource","threadId":"thread"}','input','{"text":"Saved answer","proposals":[],"citations":[]}','{"handles":["response-handle"]}','{"totalTokens":10}',now()+interval '1 day'),
             ('agent','thread','fixture','resource','owner','agent-request','analyze','standalone','openai','actual-model',NULL,'completed','{"schemaVersion":1,"operation":"analyze"}',NULL,'{"text":"Analysis","proposals":[],"citations":[]}','{}',NULL,now()+interval '1 day'),
             ('generation',NULL,'fixture','resource','owner','generate-request','generate','conversational','openai','actual-model',NULL,'failed','{"schemaVersion":1,"operation":"generate"}',NULL,NULL,'{}',NULL,now()+interval '1 day');
    INSERT INTO assistant_messages(id,thread_id,run_id,role,parts,meta)
      VALUES ('output','thread','chat','assistant','[{"type":"text","text":"Saved answer"}]','{"usage":{"totalTokens":10}}');
    INSERT INTO assistant_attachments(id,thread_id,message_id,run_id,owner_id,type,label,data,status,expires_at)
      VALUES ('source','thread','input',NULL,'owner','file','Source.png','{"provider":{"name":"openai","fileId":"provider-file"},"mimeType":"image/png","sizeBytes":128}','ready',now()+interval '1 day'),
             ('result','thread',NULL,'agent','owner','artifact','Analysis','{"artifact":{"schemaVersion":1,"agentVersion":1,"agentId":"fixture","summary":"Analysis","content":{"text":"Report"}}}','ready',now()+interval '1 day');
  `);
}

const names = ["threads", "runs", "messages", "attachments"];
async function readTables(client, prefix) {
  const result = {};
  for (const name of names) result[name] = (await client.query(`SELECT * FROM ${prefix}_${name} ORDER BY id`)).rows;
  return result;
}

test(
  "Assistant migration creates fresh storage without Blog tables and preserves populated reruns",
  databaseOnly,
  async () => {
    await withDatabase(async (client) => {
      await client.query(migration);
      assert.deepEqual(await readTables(client, "assistant"), { threads: [], runs: [], messages: [], attachments: [] });
      assert.equal(
        (await client.query("SELECT to_regclass('blog_threads') AS legacy_table")).rows[0].legacy_table,
        null,
      );
      await seedAssistantConversation(client);
      const before = await readTables(client, "assistant");
      await client.query(migration);
      assert.deepEqual(await readTables(client, "assistant"), before);
    });
  },
);

test(
  "Assistant migration drops populated legacy tables and their provider function without backfill",
  databaseOnly,
  async () => {
    await withDatabase(
      async (client) => {
        const before = await unrelatedRecords(client);
        await client.query(migration);
        await assertLegacyRemoved(client);
        assert.deepEqual(await readTables(client, "assistant"), {
          threads: [],
          runs: [],
          messages: [],
          attachments: [],
        });
        assert.deepEqual(await unrelatedRecords(client), before);
        await seedAssistantConversation(client);
        const assistant = await readTables(client, "assistant");
        await client.query(migration);
        await assertLegacyRemoved(client);
        assert.deepEqual(await readTables(client, "assistant"), assistant);
        assert.deepEqual(await unrelatedRecords(client), before);
      },
      { legacy: "current" },
    );
  },
);

test(
  "Assistant scope and idempotency remain enforced for non-Blog and null-resource threads",
  databaseOnly,
  async () => {
    await withDatabase(async (client) => {
      await client.query(migration);
      await client.query(`
      INSERT INTO assistant_threads(id,integration_key,resource_id,owner_id,title) VALUES
        ('paper','paperwork',NULL,'owner','No-resource conversation'),
        ('blog','blog',NULL,'owner','Blog conversation'),
        ('other','paperwork',NULL,'other','Private conversation'),
        ('bound','paperwork','invoice-1','owner','Invoice');
    `);
      const insertRun = (id, integration, thread, resource, owner = "owner", requestId = id) =>
        client.query(
          `
      INSERT INTO assistant_runs(id,integration_key,thread_id,resource_id,owner_id,client_request_id,operation,execution_mode,provider,model,status,request,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,'prepare_invoice','standalone','fixture','fixture-model','completed','{}',now()+interval '1 day')
    `,
          [id, integration, thread, resource, owner, requestId],
        );
      await insertRun("paper-run", "paperwork", "paper", null, "owner", "same-request");
      await insertRun("blog-run", "blog", "blog", null, "owner", "same-request");
      await assert.rejects(
        insertRun("duplicate", "paperwork", "paper", null, "owner", "same-request"),
        /unique constraint/i,
      );
      await assert.rejects(insertRun("cross-integration", "blog", "paper", null), /foreign key/i);
      await assert.rejects(insertRun("cross-owner", "paperwork", "other", null), /foreign key/i);
      await assert.rejects(insertRun("missing-thread", "paperwork", "missing", null), /foreign key/i);
      await assert.rejects(insertRun("wrong-resource", "paperwork", "bound", "invoice-2"), /foreign key/i);
      await insertRun("bound-run", "paperwork", "bound", "invoice-1");
      await assert.rejects(
        client.query("UPDATE assistant_runs SET execution_mode='editorial' WHERE id='paper-run'"),
        /check constraint/i,
      );
      await client.query(
        "INSERT INTO assistant_messages(id,thread_id,role) VALUES ('input','paper','user'),('foreign-input','blog','user')",
      );
      await assert.rejects(
        client.query("UPDATE assistant_runs SET input_message_id='foreign-input' WHERE id='paper-run'"),
        /foreign key/i,
      );
      await assert.rejects(
        client.query(
          "INSERT INTO assistant_messages(id,thread_id,run_id,role) VALUES ('foreign-output','blog','paper-run','assistant')",
        ),
        /foreign key/i,
      );
      await client.query(
        "INSERT INTO assistant_attachments(id,thread_id,message_id,run_id,owner_id,type,label,data,status) VALUES ('artifact','paper','input','paper-run','owner','artifact','Invoice report','{}','ready')",
      );
      await assert.rejects(
        client.query("UPDATE assistant_attachments SET owner_id='other' WHERE id='artifact'"),
        /foreign key/i,
      );
      await assert.rejects(
        client.query("UPDATE assistant_attachments SET message_id='foreign-input' WHERE id='artifact'"),
        /foreign key/i,
      );
      await assert.rejects(
        client.query("UPDATE assistant_attachments SET run_id='blog-run' WHERE id='artifact'"),
        /foreign key/i,
      );
      await client.query(`
      INSERT INTO assistant_runs(id,integration_key,resource_id,owner_id,client_request_id,operation,execution_mode,provider,model,status,request,created_at,expires_at)
      VALUES ('blog-generation','blog','shared-resource','owner','blog-generation','generate','conversational','fixture','fixture-model','completed','{}','2026-09-01',now()),
             ('paper-generation','paperwork','shared-resource','owner','paper-generation','generate','conversational','fixture','fixture-model','running','{}','2026-09-02',now());
    `);
      const generations = await client.query(
        "SELECT id,status FROM assistant_runs WHERE integration_key='blog' AND resource_id='shared-resource' AND operation='generate' ORDER BY created_at DESC LIMIT 1",
      );
      assert.deepEqual(generations.rows, [{ id: "blog-generation", status: "completed" }]);
    });
  },
);

test("Assistant clear ordering preserves cyclic reference protection and permits cleanup", databaseOnly, async () => {
  await withDatabase(async (client) => {
    await client.query(migration);
    await seedAssistantConversation(client);
    await assert.rejects(client.query("DELETE FROM assistant_messages WHERE thread_id='thread'"), /foreign key/i);
    await assert.rejects(client.query("DELETE FROM assistant_runs WHERE thread_id='thread'"), /foreign key/i);
    await client.query("BEGIN");
    await client.query("UPDATE assistant_runs SET input_message_id=NULL WHERE thread_id='thread'");
    await client.query("UPDATE assistant_attachments SET message_id=NULL,run_id=NULL WHERE thread_id='thread'");
    await client.query("DELETE FROM assistant_messages WHERE thread_id='thread'");
    await client.query("DELETE FROM assistant_attachments WHERE thread_id='thread'");
    await client.query("DELETE FROM assistant_runs WHERE thread_id='thread'");
    await client.query("DELETE FROM assistant_threads WHERE id='thread'");
    await client.query("COMMIT");
    const tables = await readTables(client, "assistant");
    assert.equal(tables.threads.length, 0);
    assert.equal(tables.messages.length, 0);
    assert.equal(tables.attachments.length, 0);
    assert.deepEqual(
      tables.runs.map((row) => row.id),
      ["generation"],
    );
  });
});

test(
  "Assistant migration removes the older uploaded-file layout and provider trigger without touching Blog content",
  databaseOnly,
  async () => {
    await withDatabase(
      async (client) => {
        const before = await unrelatedRecords(client);
        assert.equal(
          (
            await client.query(
              "SELECT count(*)::int n FROM blog_attachments WHERE provider_file_id='old-provider-handle'",
            )
          ).rows[0].n,
          1,
        );
        await assert.rejects(
          client.query("UPDATE blog_runs SET model='changed' WHERE id='legacy-run'"),
          /provider and model cannot change/,
        );
        await client.query(migration);
        await assertLegacyRemoved(client);
        assert.deepEqual(await readTables(client, "assistant"), {
          threads: [],
          runs: [],
          messages: [],
          attachments: [],
        });
        assert.deepEqual(await unrelatedRecords(client), before);
      },
      { legacy: "old" },
    );
  },
);

test(
  "an external legacy dependency aborts retirement without collateral changes or lost Assistant data",
  databaseOnly,
  async () => {
    await withDatabase(async (client) => {
      await client.query(migration);
      await seedAssistantConversation(client);
      await createLegacyFixture(client);
      await client.query(
        "CREATE TABLE external_legacy_reference(id text PRIMARY KEY, run_id text REFERENCES blog_runs(id)); INSERT INTO external_legacy_reference VALUES ('keep-me','legacy-run')",
      );
      const assistant = await readTables(client, "assistant");
      const legacy = await readTables(client, "blog");
      const unrelated = await unrelatedRecords(client);
      await assert.rejects(client.query(migration), { code: "2BP01" });
      await client.query("ROLLBACK");
      assert.deepEqual(await readTables(client, "assistant"), assistant);
      assert.deepEqual(await readTables(client, "blog"), legacy);
      assert.deepEqual(await unrelatedRecords(client), unrelated);
      assert.deepEqual((await client.query("SELECT * FROM external_legacy_reference")).rows, [
        { id: "keep-me", run_id: "legacy-run" },
      ]);
      assert.ok(
        (await client.query("SELECT to_regprocedure('protect_blog_run_provider()') AS function")).rows[0].function,
      );
      await assert.rejects(client.query("UPDATE external_legacy_reference SET run_id='missing'"), { code: "23503" });
      // Once the unrelated owner explicitly removes its dependency, a rerun can finish safely.
      await client.query("DROP TABLE external_legacy_reference");
      await client.query(migration);
      await assertLegacyRemoved(client);
      assert.deepEqual(await readTables(client, "assistant"), assistant);
      assert.deepEqual(await unrelatedRecords(client), unrelated);
    });
  },
);

test(
  "Assistant retention erases stale thread settings while preserving usage and cleanup retries",
  databaseOnly,
  async () => {
    const hooks = registerHooks({
      resolve(specifier, context, next) {
        if (specifier === "server-only") return { shortCircuit: true, url: "data:text/javascript,export {};" };
        if (specifier.startsWith("@/")) return next(new URL("../" + specifier.slice(2), import.meta.url).href, context);
        return next(specifier, context);
      },
    });
    try {
      const [{ cleanupAssistant }, { withDatabaseRequest }, { AIClient }] = await Promise.all([
        import("../lib/assistant/maintenance.ts"),
        import("../db/runtime.ts"),
        import("../lib/ai/client.ts"),
      ]);
      const originalDelete = AIClient.prototype.deleteResponse;
      const deletedResponses = [];
      let failProviderDeletion = true;
      AIClient.prototype.deleteResponse = async (id) => {
        deletedResponses.push(id);
        if (failProviderDeletion) throw new Error("Provider cleanup needs retry");
      };
      try {
        await withDatabase(async (client, schema) => {
          await client.query(migration);
          await client.query(`
          INSERT INTO assistant_threads(id,integration_key,owner_id,title,settings,updated_at) VALUES
            ('retained','fixture','owner','Retained metrics','{"composerDraft":"Private unsent text","composerState":{"attachmentIds":["private-id"]},"privateContext":"Sensitive setting"}',now()-interval '31 days'),
            ('recent','fixture','owner','Recent work','{"composerDraft":"Keep working","composerState":{"attachmentIds":[]},"language":"English"}',now()-interval '29 days'),
            ('empty','fixture','owner','Empty stale thread','{"composerDraft":"Old draft"}',now()-interval '31 days');
          INSERT INTO assistant_runs(id,thread_id,integration_key,owner_id,client_request_id,operation,execution_mode,provider,model,provider_response_id,status,request,response,continuation,usage,created_at,updated_at,completed_at,expires_at)
            VALUES ('retained-run','retained','fixture','owner','retained-request','custom_action','conversational','openai','fixture-model','opaque-response','completed','{"clientRequestId":"retained-request","operation":"custom_action","message":"Private sent text"}','{"text":"Private answer","proposals":[],"citations":[]}','{"handles":["opaque-response"]}','{"totalTokens":42}',now()-interval '40 days',now()-interval '31 days',now()-interval '31 days',now()-interval '1 day');
        `);
          const before = (await client.query("SELECT id,settings,updated_at FROM assistant_threads ORDER BY id")).rows;
          const target = new URL(url);
          target.searchParams.set("options", `-c search_path=${schema}`);
          const cleanup = async () => {
            const background = [];
            let counts;
            await withDatabaseRequest(
              async () => {
                counts = await cleanupAssistant();
                return new Response(null, { status: 204 });
              },
              (task) => background.push(task),
              target.href,
            );
            await Promise.all(background);
            return counts;
          };
          const first = await cleanup();
          assert.equal(first.failed, 1);
          assert.deepEqual(deletedResponses, ["opaque-response"]);
          const after = (await client.query("SELECT id,settings,updated_at FROM assistant_threads ORDER BY id")).rows;
          assert.deepEqual(
            after.map((row) => row.id),
            ["recent", "retained"],
          );
          assert.deepEqual(
            after.find((row) => row.id === "recent"),
            before.find((row) => row.id === "recent"),
          );
          assert.deepEqual(
            after.find((row) => row.id === "retained"),
            { ...before.find((row) => row.id === "retained"), settings: {} },
          );
          const pending = (
            await client.query(
              "SELECT usage,provider_response_id,continuation,request,response FROM assistant_runs WHERE id='retained-run'",
            )
          ).rows[0];
          assert.deepEqual(pending.usage, { totalTokens: 42 });
          assert.equal(pending.provider_response_id, "opaque-response");
          assert.deepEqual(pending.continuation.handles, ["opaque-response"]);
          assert.equal(pending.request.message, "Expired content");
          assert.equal(pending.response, null);

          failProviderDeletion = false;
          const second = await cleanup();
          assert.equal(second.failed, 0);
          assert.equal(second.runs, 1);
          assert.deepEqual(deletedResponses, ["opaque-response", "opaque-response"]);
          const cleaned = (
            await client.query(
              "SELECT usage,provider_response_id,continuation FROM assistant_runs WHERE id='retained-run'",
            )
          ).rows[0];
          assert.deepEqual(cleaned.usage, { totalTokens: 42 });
          assert.equal(cleaned.provider_response_id, null);
          assert.deepEqual(cleaned.continuation.handles, []);
          assert.equal(cleaned.continuation.providerDeleted, true);
          assert.deepEqual(
            (await client.query("SELECT settings FROM assistant_threads WHERE id='retained'")).rows[0].settings,
            {},
          );
        });
      } finally {
        AIClient.prototype.deleteResponse = originalDelete;
      }
    } finally {
      hooks.deregister();
    }
  },
);
