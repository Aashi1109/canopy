"use server";

import { measureServerAction } from "../../../../../lib/observability/sentry.ts";
import { requirePermission } from "@/lib/admin/index.ts";
import { revalidatePath } from "next/cache";
import { getActorUserId } from "@/lib/admin/access";
import { assignRoleToUsers } from "@/lib/admin/adminMutations";
import { getRole, listRoleUsers } from "@/lib/admin/data";

export async function searchRoleUsersAction(roleId: string, assigned: boolean, search: string, offset: number) {
  return measureServerAction("admin.roles.searchRoleUsersAction", async () => {
    if (
      typeof roleId !== "string" ||
      !roleId.trim() ||
      roleId.length > 200 ||
      typeof assigned !== "boolean" ||
      typeof search !== "string" ||
      search.length > 200 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100_000
    ) {
      throw new Error("Invalid user search.");
    }
    const actor = await getActorUserId();
    await requirePermission(actor, "roles", "view");
    await requirePermission(actor, "users", assigned ? "view" : "assignRoles");
    const role = await getRole(roleId);
    if (!role || role.isSystem) throw new Error("Custom role not found.");
    return listRoleUsers(roleId, assigned, search, offset);
  });
}

export async function assignRoleMembersAction(roleId: string, userIds: string[]) {
  return measureServerAction("admin.roles.assignRoleMembersAction", async () => {
    await assignRoleToUsers(await getActorUserId(), roleId, userIds);
    revalidatePath(`/admin/roles/${encodeURIComponent(roleId)}`);
    revalidatePath("/admin/roles");
    revalidatePath("/admin/users");
  });
}
