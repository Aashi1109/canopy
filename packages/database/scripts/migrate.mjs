import { readFile } from "node:fs/promises";
import { seedTemplates } from "../../invoice-templates/src/index.ts";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { seedManagedTools } from "../src/seedManagedTools.ts";
import * as schema from "../src/schema.ts";

// Next loads `.env.local` for the app, but this is a plain Node script, so
// nothing populates `process.env` for it. Without this, `pnpm db:migrate`
// fails with "DATABASE_URL is required" for anyone who has not exported the
// variable into their shell by hand.
//
// `override: false` is the point: a variable already set in the environment
// wins, so CI and deploy pipelines that inject DATABASE_URL directly are
// unaffected, and a stale local file cannot silently retarget a migration.
for (const file of [".env.local", ".env"]) {
  config({ path: new URL(`../../../${file}`, import.meta.url), override: false });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const migrations = await Promise.all(
  [
    "0001_auth_control_plane.sql",
    "0002_media_tools.sql",
    "0003_document_template_kinds.sql",
    "0004_tool_content.sql",
    "0005_backfill_managed_tools.sql",
    "0006_blogs.sql",
    "0007_user_role_cache.sql",
  ].map(async (name) => [
    name,
    await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8"),
  ]),
);
const sql = postgres(databaseUrl, { max: 1 });
const db = drizzle(sql, { schema });

try {
  for (const [name, migration] of migrations) {
    await sql.unsafe(migration);
    console.log(`Applied ${name}`);
  }

  await seedManagedTools(db);

  const [{ template_count }] = await sql`
    SELECT COUNT(*)::integer AS template_count FROM invoice_templates
  `;

  if (template_count === 0) {
    await sql.begin(async (transaction) => {
      for (const template of seedTemplates) {
        await transaction`
          INSERT INTO invoice_templates (
            id, name, slug, description, category, status, is_default,
            version, document_type, layout_family, config, is_premium,
            required_plan, created_at, updated_at
          ) VALUES (
            ${template.id}, ${template.name}, ${template.slug},
            ${template.description}, ${template.category}, ${template.status},
            ${template.isDefault}, ${template.version}, ${template.documentType},
            ${template.layoutFamily}, ${transaction.json(template.config)},
            ${template.isPremium ?? false}, ${template.requiredPlan ?? "free"},
            ${new Date(template.createdAt)}, ${new Date(template.updatedAt)}
          )
        `;
      }
    });
    console.log(`Seeded ${seedTemplates.length} invoice templates`);
  }
} finally {
  await sql.end();
}
