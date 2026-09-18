import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  assignUserRoles,
  createCustomRole,
  createInvoiceTemplate,
  deleteCustomRole,
  publishInvoiceTemplate,
  setDefaultInvoiceTemplate,
  setManagedToolEnabled,
  setUserStatus,
  updateCustomRole,
} from "../lib/admin/adminMutations.ts";
import { getAvailableToolBySlug, getUserAuthorization } from "../packages/control-plane/src/queries.ts";
import { db, sql, sqlClient } from "../packages/database/src/index.ts";
import { seedTemplates } from "../packages/invoice-templates/src/index.ts";

/**
 * The manifest, enumerated from `managed_tools` — the same source
 * `lib/tool-framework/manifest.ts` uses, without pulling React into a plain
 * Node test.
 */
async function toolManifest() {
  const rows = (
    await db.execute(sql`
    SELECT tool_id, app, name, description FROM managed_tools
  `)
  ).rows;
  return rows.map((row) => ({
    id: row.tool_id,
    app: row.app,
    componentKey: row.tool_id.split(".")[1],
    defaultName: row.name,
    defaultDescription: row.description,
  }));
}

const enabled = process.env.CANOPY_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

test(
  "PostgreSQL enforces live roles, Admin safeguards, tools, templates, and audit writes",
  {
    skip: enabled ? false : "set CANOPY_INTEGRATION=1 with a migrated disposable DATABASE_URL",
  },
  async (context) => {
    context.after(async () => sqlClient.end());

    const suffix = randomUUID();
    const actorId = `integration-actor-${suffix}`;
    const targetId = `integration-target-${suffix}`;

    const [catalog] = (
      await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::integer FROM roles WHERE id IN ('user', 'admin')) AS role_count,
        (SELECT COUNT(*)::integer FROM managed_tools) AS tool_count,
        (SELECT COUNT(*)::integer FROM invoice_templates) AS template_count,
        (SELECT COUNT(*)::integer FROM invoice_templates WHERE status = 'published' AND is_default) AS default_count
    `)
    ).rows;
    assert.equal(catalog.role_count, 2);
    assert.ok(catalog.tool_count >= 8);
    assert.ok(catalog.template_count >= 6);
    assert.equal(catalog.default_count, 1);

    await db.execute(sql`
      INSERT INTO auth_users (id, name, email, email_verified, status)
      VALUES
        (${actorId}, 'Integration Admin', ${`${actorId}@example.test`}, true, 'active'),
        (${targetId}, 'Integration User', ${`${targetId}@example.test`}, true, 'active')
    `);
    const defaultAssignments = (
      await db.execute(sql`
      SELECT user_id FROM user_roles
      WHERE role_id = 'user' AND user_id IN (${actorId}, ${targetId})
    `)
    ).rows;
    assert.equal(defaultAssignments.length, 2);

    await db.execute(sql`
      INSERT INTO user_roles (user_id, role_id) VALUES (${actorId}, 'admin')
    `);
    const authorization = await getUserAuthorization(actorId);
    assert.equal(authorization.access.admin?.enter, true);

    const role = await createCustomRole(actorId, {
      name: `Integration editor ${suffix}`,
      description: "Edits invoice templates during the PostgreSQL integration test.",
    });
    assert.deepEqual(role.access, {});
    await updateCustomRole(actorId, role.id, {
      access: { templates: { view: true, edit: true } },
    });
    await assignUserRoles(actorId, targetId, [role.id]);
    await assert.rejects(() => deleteCustomRole(actorId, role.id), /assigned to users/i);
    await assignUserRoles(actorId, targetId, ["user"]);
    await deleteCustomRole(actorId, role.id);

    await db.execute(sql`
      INSERT INTO auth_sessions (id, expires_at, token, user_id)
      VALUES (${randomUUID()}, NOW() + INTERVAL '1 hour', ${randomUUID()}, ${targetId})
    `);
    await setUserStatus(actorId, targetId, "suspended");
    const [sessionCount] = (
      await db.execute(sql`
      SELECT COUNT(*)::integer AS count FROM auth_sessions WHERE user_id = ${targetId}
    `)
    ).rows;
    assert.equal(sessionCount.count, 0);
    await setUserStatus(actorId, targetId, "active");

    await setManagedToolEnabled(actorId, "devtools.json-formatter", false);
    assert.equal(await getAvailableToolBySlug("devtools", "json-formatter", await toolManifest()), undefined);
    await setManagedToolEnabled(actorId, "devtools.json-formatter", true);
    assert.ok(await getAvailableToolBySlug("devtools", "json-formatter", await toolManifest()));

    const seed = seedTemplates[0];
    const template = await createInvoiceTemplate(actorId, {
      name: `Integration template ${suffix}`,
      slug: `integration-${suffix}`,
      description: "A disposable template used for PostgreSQL integration coverage.",
      category: seed.category,
      layoutFamily: seed.layoutFamily,
      config: structuredClone(seed.config),
    });
    await publishInvoiceTemplate(actorId, template.id);
    await setDefaultInvoiceTemplate(actorId, template.id);
    const [defaultCount] = (
      await db.execute(sql`
      SELECT COUNT(*)::integer AS count
      FROM invoice_templates
      WHERE status = 'published' AND is_default
    `)
    ).rows;
    assert.equal(defaultCount.count, 1);

    await assert.rejects(() => assignUserRoles(actorId, actorId, ["user"]), /final Admin/i);
    await assert.rejects(() => setUserStatus(actorId, actorId, "suspended"), /final Admin/i);
    await assert.rejects(
      () => db.execute(sql`DELETE FROM user_roles WHERE user_id = ${actorId} AND role_id = 'admin'`),
      (error) => /final Admin/i.test(error.cause?.message ?? error.message),
    );
    await assert.rejects(
      () => db.execute(sql`UPDATE roles SET name = 'Changed' WHERE id = 'admin'`),
      (error) => /System roles are protected/i.test(error.cause?.message ?? error.message),
    );

    const [auditCount] = (
      await db.execute(sql`
      SELECT COUNT(*)::integer AS count FROM audit_events WHERE actor_user_id = ${actorId}
    `)
    ).rows;
    assert.ok(auditCount.count >= 10);
  },
);
