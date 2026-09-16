import { notFound } from "next/navigation";
import { requirePagePermission } from "../../../../../lib/admin/access";
import { getRole, listRoleUsers } from "../../../../../lib/admin/data";
import { getUserAuthorization } from "@smarttools/control-plane";
import { hasPermission } from "@smarttools/authorization";
import RoleEditor from "./RoleEditor";

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePagePermission("roles", "view");
  const role = await getRole((await params).id);
  if (!role || role.isSystem) notFound();
  const { access } = await getUserAuthorization(session.user.id);
  const members = hasPermission(access, "users", "view")
    ? await listRoleUsers(role.id, true)
    : undefined;
  return (
    <RoleEditor
      key={role.id}
      role={role}
      members={members}
      canAssign={hasPermission(access, "users", "assignRoles")}
    />
  );
}
