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
} from "../../db/index.ts";
import { Cache, CACHE_NAMESPACES } from "../cache/index.ts";

const rolesCache = new Cache(CACHE_NAMESPACES.ROLES);
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

function auditEventsQuery() {
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
    );
}

export async function listAuditEvents() {
  return auditEventsQuery().orderBy(desc(auditEventsTable.createdAt)).limit(200);
}

export async function listAuditEventsPage({
  page: requestedPage,
  pageSize: requestedPageSize,
  query,
  action,
  cutoff,
}: {
  page: number;
  pageSize: number;
  query: string;
  action: string;
  cutoff: Date | null;
}) {
  const pageSize = Number.isFinite(requestedPageSize) ? Math.min(200, Math.max(1, Math.floor(requestedPageSize))) : 25;
  const search = query.trim().replace(/[\\%_]/g, "\\$&");
  const filter = and(
    action ? eq(auditEventsTable.action, action) : undefined,
    cutoff ? sql`${auditEventsTable.createdAt} >= ${cutoff.toISOString()}` : undefined,
    search
      ? or(
          ilike(auditActor.name, `%${search}%`),
          ilike(auditActor.email, `%${search}%`),
          ilike(auditEventsTable.action, `%${search}%`),
          ilike(auditEventsTable.targetType, `%${search}%`),
          ilike(auditEventsTable.targetId, `%${search}%`),
          ilike(auditTargetUser.name, `%${search}%`),
          ilike(auditTargetUser.email, `%${search}%`),
          ilike(sql`${auditEventsTable.metadata}::text`, `%${search}%`),
        )
      : undefined,
  );
  const [[matched], actionRows] = await Promise.all([
    db
      .select({ total: count() })
      .from(auditEventsTable)
      .leftJoin(auditActor, eq(auditActor.id, auditEventsTable.actorUserId))
      .leftJoin(
        auditTargetUser,
        and(eq(auditEventsTable.targetType, "user"), eq(auditTargetUser.id, auditEventsTable.targetId)),
      )
      .where(filter),
    db.selectDistinct({ action: auditEventsTable.action }).from(auditEventsTable).orderBy(auditEventsTable.action),
  ]);
  const total = matched.total;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Number.isFinite(requestedPage) ? Math.min(pageCount, Math.max(1, Math.floor(requestedPage))) : 1;
  const events = await auditEventsQuery()
    .where(filter)
    .orderBy(desc(auditEventsTable.createdAt), desc(auditEventsTable.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { events, total, page, pageCount, actions: actionRows.map(({ action }) => action) };
}
