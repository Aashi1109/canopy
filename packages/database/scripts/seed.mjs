import { seedTemplates } from "../../invoice-templates/src/index.ts";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { seedManagedTools } from "../src/seedManagedTools.ts";
import * as schema from "../src/schema.ts";

// Shell variables win over local files, matching the migration command.
for (const file of [".env.local", ".env"]) {
  config({ path: new URL(`../../../${file}`, import.meta.url), override: false });
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl, { max: 1 });
const db = drizzle(sql, { schema });

try {
  await seedManagedTools(db);

  const [{ template_count }] = await sql`
    SELECT COUNT(*)::integer AS template_count FROM invoice_templates
  `;

  if (template_count === 0) {
    await sql.begin(async (transaction) => {
      for (const template of seedTemplates) {
        // Drizzle disables the client's JSON/date serializers; bind strings in raw SQL.
        await transaction`
          INSERT INTO invoice_templates (
            id, name, slug, description, category, status, is_default,
            version, document_type, layout_family, config, is_premium,
            required_plan, created_at, updated_at
          ) VALUES (
            ${template.id}, ${template.name}, ${template.slug},
            ${template.description}, ${template.category}, ${template.status},
            ${template.isDefault}, ${template.version}, ${template.documentType},
            ${template.layoutFamily}, ${JSON.stringify(template.config)}::jsonb,
            ${template.isPremium ?? false}, ${template.requiredPlan ?? "free"},
            ${new Date(template.createdAt).toISOString()}, ${new Date(template.updatedAt).toISOString()}
          )
        `;
      }
    });
    console.log(`Seeded ${seedTemplates.length} invoice templates`);
  }
} finally {
  await sql.end();
}
