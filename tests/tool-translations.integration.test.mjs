import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = process.env.INTL_TEST_DATABASE_URL;
describe.skipIf(!testDatabase)("tool translation publication in PostgreSQL", () => {
  let database, sql, client, saveToolTranslation, resolveToolPage, getPublicTools;
  let original;
  let toolTable, eq;
  const actor = "intl-integration-editor";
  const toolId = "devtools.json-formatter";

  beforeAll(async () => {
    if (!["127.0.0.1", "localhost", "::1"].includes(new URL(testDatabase).hostname))
      throw new Error("Use a disposable local database for this test.");
    process.env.DATABASE_URL = testDatabase;
    const module = await import("../db/index.ts");
    database = module.db;
    sql = module.sql;
    client = module.sqlClient;
    ({ saveToolTranslation } = await import("../lib/admin/adminMutations.ts"));
    ({ resolveToolPage, getPublicTools } = await import("../lib/tool-framework/catalog.ts"));
    toolTable = module.managedToolsTable;
    eq = module.eq;
    [original] = await database.select().from(toolTable).where(eq(toolTable.toolId, toolId));
    await database.execute(
      sql`INSERT INTO auth_users (id,name,email,email_verified) VALUES (${actor},'Intl test','intl-editor-test@example.test',true) ON CONFLICT DO NOTHING`,
    );
    await database.execute(
      sql`INSERT INTO roles(id,name,description,access) VALUES ('intl-test-role','Intl test role','Disposable integration fixture','{"admin":{"enter":true},"tools":{"view":true,"edit":true,"toggle":true}}'::jsonb) ON CONFLICT DO NOTHING`,
    );
    await database.execute(
      sql`INSERT INTO user_roles (user_id,role_id) VALUES (${actor},'intl-test-role') ON CONFLICT DO NOTHING`,
    );
  });

  afterAll(async () => {
    if (original)
      await database
        .update(toolTable)
        .set({
          translations: original.translations,
          name: original.name,
          description: original.description,
          updatedAt: original.updatedAt,
        })
        .where(eq(toolTable.toolId, toolId));
    if (database) await database.execute(sql`DELETE FROM auth_users WHERE id=${actor}`);
    await client?.end();
  });

  it("publishes admin edits without stale catalog data, rejects stale saves, and hides drafts", async () => {
    const english = await resolveToolPage("devtools", original.slug, "en");
    expect(english).not.toBeNull();
    const messages = { ...original.translations.en.messages, name: "JSON परीक्षण", "input.label": "स्रोत" };
    const draft = await saveToolTranslation(actor, toolId, {
      locale: "hi",
      status: "draft",
      messages,
      updatedAt: original.updatedAt.toISOString(),
    });
    expect(await resolveToolPage("devtools", original.slug, "hi")).toBeNull();
    const fallback = (await getPublicTools("hi")).find((tool) => tool.toolId === toolId);
    expect(fallback.locale).toBe("en");
    expect(fallback.href).toBe(`/devtools/${original.slug}`);
    const published = await saveToolTranslation(actor, toolId, {
      locale: "hi",
      status: "published",
      messages,
      updatedAt: draft.updatedAt,
    });
    const hindi = await resolveToolPage("devtools", original.slug, "hi");
    expect(hindi.name).toBe("JSON परीक्षण");
    expect(hindi.spec.input.label).toBe("स्रोत");
    expect(hindi.href).toBe(`/hi/devtools/${original.slug}`);
    expect(hindi.spec.content.examples).toEqual(english.spec.content.examples);
    expect((await resolveToolPage("devtools", original.slug, "en")).name).toBe(english.name);
    await expect(
      saveToolTranslation(actor, toolId, { locale: "hi", status: "draft", messages, updatedAt: draft.updatedAt }),
    ).rejects.toThrow(/changed|reload/i);
    await saveToolTranslation(actor, toolId, {
      locale: "hi",
      status: "draft",
      messages,
      updatedAt: published.updatedAt,
    });
    expect(await resolveToolPage("devtools", original.slug, "hi")).toBeNull();
  });
});
