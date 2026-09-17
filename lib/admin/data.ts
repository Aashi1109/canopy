import {
  alias,
  and,
  auditEventsTable,
  authUser,
  count,
  db,
  desc,
  eq,
  ilike,
  invoiceTemplatesTable,
  or,
  rolesTable,
  sql,
  userRolesTable,
} from "@canopy/database";
import { Cache } from "@canopy/cache";

const rolesCache = new Cache("roles");
const auditActor = alias(authUser, "audit_actor");
const auditTargetUser = alias(authUser, "audit_target_user");
export async function listUsers(search = "") {
  const query = search.trim();
  const rows = await db
    .select({
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      image: authUser.image,
      status: authUser.status,
      roleId: userRolesTable.roleId,
    })
    .from(authUser)
    .leftJoin(userRolesTable, eq(userRolesTable.userId, authUser.id))
    .where(query ? or(ilike(authUser.name, `%${query}%`), ilike(authUser.email, `%${query}%`)) : undefined)
    .orderBy(authUser.email);

  const users = new Map<
    string,
    {
      id: string;
      name: string;
      email: string;
      image: string | null;
      status: "active" | "suspended";
      roles: string[];
    }
  >();
  for (const row of rows) {
    const user = users.get(row.id) ?? { ...row, roles: [] };
    if (row.roleId) user.roles.push(row.roleId);
    users.set(row.id, user);
  }
  return [...users.values()];
}

export async function listRoleUsers(roleId: string, assigned: boolean, search = "", offset = 0) {
  const query = search.trim().replace(/[\\%_]/g, "\\$&");
  const membership = sql`exists (select 1 from ${userRolesTable} where ${userRolesTable.userId} = ${authUser.id} and ${userRolesTable.roleId} = ${roleId})`;
  const filter = and(
    assigned ? membership : sql`not ${membership}`,
    query ? or(ilike(authUser.name, `%${query}%`), ilike(authUser.email, `%${query}%`)) : undefined,
  );
  const users = await db
    .select({
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      image: authUser.image,
      status: authUser.status,
    })
    .from(authUser)
    .where(filter)
    .orderBy(authUser.name, authUser.id)
    .limit(25)
    .offset(offset);
  const [total] = await db.select({ value: count() }).from(authUser).where(filter);
  return { users, total: total.value, hasMore: offset + users.length < total.value };
}

export type RoleUser = Awaited<ReturnType<typeof listRoleUsers>>["users"][number];
export type RoleUsersPage = Awaited<ReturnType<typeof listRoleUsers>>;

export async function listRoles() {
  const [roles, memberships] = await Promise.all([
    rolesCache.remember(
      "all",
      async () =>
        db
          .select({
            id: rolesTable.id,
            name: rolesTable.name,
            description: rolesTable.description,
            access: rolesTable.access,
            isSystem: rolesTable.isSystem,
          })
          .from(rolesTable)
          .orderBy(rolesTable.isSystem, rolesTable.name),
      24 * 60 * 60,
    ),
    db
      .select({ roleId: userRolesTable.roleId, assignedUsers: count(userRolesTable.userId) })
      .from(userRolesTable)
      .groupBy(userRolesTable.roleId),
  ]);
  const counts = new Map(memberships.map(({ roleId, assignedUsers }) => [roleId, assignedUsers]));
  return roles.map((role) => ({ ...role, assignedUsers: counts.get(role.id) ?? 0 }));
}

export async function getRole(roleId: string) {
  return (await listRoles()).find((role) => role.id === roleId);
}

export async function listTemplates() {
  return db.select().from(invoiceTemplatesTable).orderBy(desc(invoiceTemplatesTable.updatedAt));
}

export async function getTemplate(templateId: string) {
  const [template] = await db
    .select()
    .from(invoiceTemplatesTable)
    .where(eq(invoiceTemplatesTable.id, templateId))
    .limit(1);
  return template;
}

export async function listAuditEvents() {
  return db
    .select({
      id: auditEventsTable.id,
      actorUserId: auditEventsTable.actorUserId,
      actorName: auditActor.name,
      actorEmail: auditActor.email,
      action: auditEventsTable.action,
      targetType: auditEventsTable.targetType,
      targetId: auditEventsTable.targetId,
      targetUserName: auditTargetUser.name,
      targetUserEmail: auditTargetUser.email,
      metadata: auditEventsTable.metadata,
      createdAt: auditEventsTable.createdAt,
    })
    .from(auditEventsTable)
    .leftJoin(auditActor, eq(auditActor.id, auditEventsTable.actorUserId))
    .leftJoin(
      auditTargetUser,
      and(eq(auditEventsTable.targetType, "user"), eq(auditTargetUser.id, auditEventsTable.targetId)),
    )
    .orderBy(desc(auditEventsTable.createdAt))
    .limit(200);
}
