import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { TOOL_SLUG_PATTERN } from "../packages/tool-catalog/src/index.ts";

const migrationDirectoryUrl = new URL("../packages/database/migration/0001-baseline/", import.meta.url);

/**
 * Every `managed_tools` seed row across every migration, in applied order.
 *
 * Seeds are append-only across files, so the shape that matters is the union
 * a fully migrated database ends up holding — not the contents of any one
 * file, and not a count. Tuples are one per line, and only the first three
 * columns (`tool_id`, `app`, `slug`) are read, so an apostrophe inside a
 * later `name`/`description` column cannot confuse the parse.
 */
async function seededManagedTools() {
  const files = (await readdir(migrationDirectoryUrl)).filter((file) => file.endsWith(".sql")).sort();
  const rows = [];

  for (const file of files) {
    const sql = await readFile(new URL(file, migrationDirectoryUrl), "utf8");
    for (const statement of sql.split(";")) {
      if (!/INSERT INTO managed_tools\b/i.test(statement)) continue;
      for (const line of statement.split("\n")) {
        const tuple = /^\s*\(\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',/.exec(line);
        if (tuple) {
          rows.push({ file, toolId: tuple[1], app: tuple[2], slug: tuple[3] });
        }
      }
    }
  }

  return rows;
}

const migrationUrl = new URL(
  "../packages/database/migration/0001-baseline/0001_auth_control_plane.sql",
  import.meta.url,
);
const mediaMigrationUrl = new URL("../packages/database/migration/0001-baseline/0002_media_tools.sql", import.meta.url);
const documentTemplateMigrationUrl = new URL(
  "../packages/database/migration/0001-baseline/0003_document_template_kinds.sql",
  import.meta.url,
);
const schemaUrl = new URL("../packages/database/src/schema.ts", import.meta.url);

test("the control-plane migration keeps anonymous users separate from auth accounts", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  for (const table of [
    "auth_users",
    "auth_sessions",
    "auth_accounts",
    "auth_verifications",
    "roles",
    "user_roles",
    "managed_tools",
    "feature_overrides",
    "audit_events",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i"));
  }

  assert.match(sql, /UNIQUE\s*\(app,\s*slug\)/i);
  assert.match(sql, /CREATE UNIQUE INDEX[^;]+invoice_templates[^;]+is_default/is);
  assert.match(sql, /prevent_system_role_changes/i);
  assert.match(sql, /assign_default_user_role/i);
  assert.match(sql, /prevent_saved_tool_slug_change/i);
  assert.match(sql, /prevent_final_admin_assignment_removal/i);
  assert.match(
    sql,
    /prevent_final_admin_assignment_removal[\s\S]+status = 'active'[\s\S]+COUNT\(\*\)[\s\S]+status = 'active'/i,
  );
  assert.match(sql, /prevent_final_active_admin_suspension/i);
  assert.doesNotMatch(sql, /DROP TABLE\s+users\b/i);
});

test("every applied managed_tools seed forms one consistent catalogue", async () => {
  const rows = await seededManagedTools();
  assert.ok(rows.length > 0, "no managed_tools seed rows were parsed");

  const byToolId = new Map();
  const byAppSlug = new Map();
  const duplicateToolIds = [];
  const duplicateAppSlugs = [];
  const invalidSlugs = [];

  for (const row of rows) {
    const appSlug = `${row.app}/${row.slug}`;
    const where = `${row.file}: ${row.toolId}`;
    if (byToolId.has(row.toolId)) {
      duplicateToolIds.push(`${where} (first seeded in ${byToolId.get(row.toolId)})`);
    }
    if (byAppSlug.has(appSlug)) {
      duplicateAppSlugs.push(`${where} -> ${appSlug} (first seeded in ${byAppSlug.get(appSlug)})`);
    }
    if (!TOOL_SLUG_PATTERN.test(row.slug)) invalidSlugs.push(`${where} -> ${row.slug}`);
    byToolId.set(row.toolId, row.file);
    byAppSlug.set(appSlug, row.file);
  }

  assert.deepEqual(duplicateToolIds, [], "managed_tools.tool_id is the primary key");
  assert.deepEqual(duplicateAppSlugs, [], "managed_tools carries UNIQUE (app, slug)");
  assert.deepEqual(invalidSlugs, [], "every seeded slug must be a routable slug");
});

test("the Media migration expands only managed tool ownership", async () => {
  const [sql, schema] = await Promise.all([readFile(mediaMigrationUrl, "utf8"), readFile(schemaUrl, "utf8")]);

  assert.match(sql, /DROP CONSTRAINT IF EXISTS managed_tools_app_check/i);
  assert.match(sql, /ADD CONSTRAINT managed_tools_app_check[\s\S]+app IN \('paperwork', 'devtools', 'media'\)/i);
  assert.match(sql, /ON CONFLICT \(tool_id\) DO NOTHING/i);

  assert.match(schema, /managedToolsTable[\s\S]+\$type<"paperwork" \| "devtools" \| "media">\(\)/);
  assert.match(schema, /featureOverridesTable[\s\S]+\$type<"paperwork" \| "devtools">\(\)/);
});

test("document template kinds are constrained without rewriting existing rows", async () => {
  const [sql, schema] = await Promise.all([
    readFile(documentTemplateMigrationUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
  ]);
  const documentTypes = [
    "invoice",
    "receipt",
    "expense-report",
    "mileage-log",
    "quarterly-tax-estimator",
    "w9-request",
    "1099-nec-tracker",
  ];

  for (const documentType of documentTypes) {
    assert.match(sql, new RegExp(`'${documentType}'`));
    assert.match(schema, new RegExp(`"${documentType}"`));
  }
  assert.match(sql, /ADD CONSTRAINT invoice_templates_document_type_check[\s\S]+NOT VALID/i);
  assert.match(
    sql,
    /ADD CONSTRAINT invoice_templates_advanced_document_type_check[\s\S]+layout_family = 'advanced'[\s\S]+document_type = 'invoice'[\s\S]+NOT VALID/i,
  );
  assert.match(
    sql,
    /ADD CONSTRAINT invoice_templates_default_published_check[\s\S]+is_default = FALSE[\s\S]+status = 'published'[\s\S]+NOT VALID/i,
  );
  assert.match(sql, /IF EXISTS[\s\S]+FROM invoice_templates/i);
  for (const constraint of [
    "invoice_templates_document_type_check",
    "invoice_templates_advanced_document_type_check",
    "invoice_templates_default_published_check",
  ]) {
    assert.match(sql, new RegExp(`VALIDATE CONSTRAINT ${constraint}`, "i"));
  }

  const replacementIndex = sql.indexOf("invoice_templates_published_default_by_document_type_unique");
  const oldIndexDrop = sql.indexOf("DROP INDEX IF EXISTS invoice_templates_published_default_unique");
  assert.notEqual(replacementIndex, -1);
  assert.ok(oldIndexDrop > replacementIndex);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS invoice_templates_published_default_by_document_type_unique[\s\S]+ON invoice_templates\s*\(\s*document_type\s*\)[\s\S]+WHERE is_default = TRUE AND status = 'published'/i,
  );
  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS invoice_templates_published_document_type_updated_idx[\s\S]+ON invoice_templates\s*\(\s*document_type\s*,\s*updated_at DESC\s*\)[\s\S]+WHERE status = 'published'/i,
  );
  assert.match(
    schema,
    /uniqueIndex\(\s*"invoice_templates_published_default_by_document_type_unique",?\s*\)[\s\S]+\.on\(table\.documentType\)/,
  );
  assert.match(
    schema,
    /index\("invoice_templates_published_document_type_updated_idx"\)[\s\S]+table\.documentType[\s\S]+table\.updatedAt\.desc\(\)/,
  );
});
