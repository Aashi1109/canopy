import { type Access, type Role, hasPermission, mergeRoleAccess } from "../authorization/index.ts";
import { Cache, CACHE_NAMESPACES } from "../cache/index.ts";
import {
  assertDatabaseConfigured,
  and,
  authUser,
  db,
  eq,
  featureOverridesTable,
  invoiceTemplatesTable,
  isDatabaseConfigured,
  managedToolsTable,
  rolesTable,
  userRolesTable,
} from "../../db/index.ts";
import {
  DocumentTemplateSchema,
  seedTemplates,
  type DocumentTemplate,
  type DocumentType,
  validateAdvancedTemplateConfig,
} from "../invoice-templates/index.ts";
import {
  findAvailableToolBySlug,
  getEnabledTools,
  mergeToolManifest,
  type ResolvedTool,
  type ToolApp,
  type ToolManifestEntry,
} from "../tool-catalog/index.ts";
import { mergeFeatureOverrides, type FeatureManifestEntry, type ResolvedFeature } from "./featureFlags.ts";
import { getCachedUser } from "./users.ts";

export class AuthorizationError extends Error {
  readonly status = 403;
}

export const featureManifest: readonly FeatureManifestEntry[] = [];
const userRolesCache = new Cache(CACHE_NAMESPACES.USER_ROLES);

/**
 * Tools that exist in code, resolved against their stored rows.
 *
 * The manifest is the map, so a stored row named by no entry is dropped. That
 * is the right gate for a public surface and the wrong one for the admin
 * catalogue, which manages rows and must see them all — admin enumerates
 * `managed_tools` itself through `lib/tool-framework/manifest.ts`.
 */
export async function getManagedTools(manifest: readonly ToolManifestEntry[]): Promise<ResolvedTool[]> {
  if (!isDatabaseConfigured()) return mergeToolManifest([], manifest);
  return mergeToolManifest(await db.select().from(managedToolsTable), manifest);
}

export async function getAvailableTools(app: ToolApp, manifest: readonly ToolManifestEntry[]): Promise<ResolvedTool[]> {
  return getEnabledTools(await getManagedTools(manifest), app);
}

export async function getAvailableToolBySlug(
  app: ToolApp,
  slug: string,
  manifest: readonly ToolManifestEntry[],
): Promise<ResolvedTool | undefined> {
  return findAvailableToolBySlug(await getManagedTools(manifest), app, slug);
}

export async function getFeatures(
  manifest: readonly FeatureManifestEntry[] = featureManifest,
): Promise<ResolvedFeature[]> {
  try {
    assertDatabaseConfigured();
    return mergeFeatureOverrides(manifest, await db.select().from(featureOverridesTable));
  } catch {
    return mergeFeatureOverrides(manifest);
  }
}

function mapTemplate(row: typeof invoiceTemplatesTable.$inferSelect): DocumentTemplate | undefined {
  try {
    const template = {
      ...row,
      description: row.description ?? "",
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    } as DocumentTemplate;
    const result = DocumentTemplateSchema.safeParse(template);
    if (result.success) {
      const parsed = result.data as DocumentTemplate;
      if (
        parsed.layoutFamily === "advanced" &&
        !validateAdvancedTemplateConfig(
          parsed.config,
          parsed.documentType,
          (parsed.documentType === "invoice" || parsed.documentType === "receipt") &&
            row.config &&
            typeof row.config === "object" &&
            !Array.isArray(row.config) &&
            !("schemaVersion" in row.config)
            ? "draft"
            : "publish",
        ).valid
      ) {
        throw new Error("Published advanced template failed validation.");
      }
      return { ...template, ...parsed } as DocumentTemplate;
    }
  } catch {}
  console.error("Skipping invalid published document template", row.id);
  return undefined;
}

function filterTemplates(templates: DocumentTemplate[], documentType?: DocumentType): DocumentTemplate[] {
  return documentType ? templates.filter((template) => template.documentType === documentType) : templates;
}

export async function getPublishedTemplates(documentType?: DocumentType): Promise<DocumentTemplate[]> {
  try {
    assertDatabaseConfigured();
    const rows = await db
      .select()
      .from(invoiceTemplatesTable)
      .where(
        and(
          eq(invoiceTemplatesTable.status, "published"),
          documentType ? eq(invoiceTemplatesTable.documentType, documentType) : undefined,
        ),
      );
    return rows.flatMap((row) => mapTemplate(row) ?? []);
  } catch {
    return filterTemplates(
      seedTemplates.filter((template) => template.status === "published"),
      documentType,
    );
  }
}

export async function getUserAuthorization(userId: string): Promise<{
  roles: Role[];
  access: Access;
}> {
  assertDatabaseConfigured();
  const user = await getCachedUser(userId);
  if (!user || user.status !== "active") {
    throw new AuthorizationError("Access denied");
  }

  const roles = await userRolesCache.rememberGuarded(
    userId,
    async () => {
      const rows = await db
        .select({
          status: authUser.status,
          roleId: rolesTable.id,
          roleName: rolesTable.name,
          roleDescription: rolesTable.description,
          roleAccess: rolesTable.access,
          roleIsSystem: rolesTable.isSystem,
        })
        .from(authUser)
        .leftJoin(userRolesTable, eq(userRolesTable.userId, authUser.id))
        .leftJoin(rolesTable, eq(rolesTable.id, userRolesTable.roleId))
        .where(eq(authUser.id, userId));

      if (!rows.length || rows[0].status !== "active") {
        throw new AuthorizationError("Access denied");
      }

      return rows.flatMap((row) =>
        row.roleId && row.roleName && row.roleDescription && row.roleAccess && row.roleIsSystem !== null
          ? [
              {
                id: row.roleId,
                name: row.roleName,
                description: row.roleDescription,
                access: row.roleAccess,
                isSystem: row.roleIsSystem,
              },
            ]
          : [],
      );
    },
    24 * 60 * 60,
  );

  return { roles, access: mergeRoleAccess(roles) };
}

export async function requirePermission(userId: string, resource: string, action: string): Promise<void> {
  const { access } = await getUserAuthorization(userId);
  if (!hasPermission(access, resource, action)) {
    throw new AuthorizationError(`Missing permission: ${resource}.${action}`);
  }
}
