import {
  Caption,
  Overline,
  Strong,
  Text,
  Avatar,
  AvatarFallback,
  AvatarImage,
  EmptyState,
  StatusBadge,
  ToolPageHeader,
} from "@canopy/ui";
import { AdminFilters } from "../components/AdminFilters";
import { SearchX, Users } from "lucide-react";
import { requirePagePermission } from "../../../../lib/admin/access";
import { listRoles, listUsers } from "../../../../lib/admin/data";
import { ManageUserDialog } from "./components/ManageUserDialog";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U"
  );
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; role?: string | string[] }>;
}) {
  await requirePagePermission("users", "view");
  const params = await searchParams;
  const queryValue = Array.isArray(params.q) ? params.q[0] : params.q;
  const roleValue = Array.isArray(params.role) ? params.role[0] : params.role;
  const query = queryValue ?? "";
  const [allUsers, roles] = await Promise.all([listUsers(query), listRoles()]);
  const selectedRole = roleValue && roles.some((role) => role.id === roleValue) ? roleValue : "all";
  const users = selectedRole === "all" ? allUsers : allUsers.filter((user) => user.roles.includes(selectedRole));
  const roleNames = new Map(roles.map((role) => [role.id, role.name] as const));

  return (
    <div className="flex min-h-full flex-col gap-5">
      <ToolPageHeader
        className="mb-0 border-b-0 pb-0"
        description="Search people and assign the right level of access."
        title="Users"
      />

      <AdminFilters
        search={{ key: "q", label: "Search", placeholder: "Name or email…" }}
        selects={[
          {
            key: "role",
            label: "Role",
            options: [
              { value: "all", label: "All roles" },
              ...roles.map((role) => ({ value: role.id, label: role.name })),
            ],
          },
        ]}
      />

      {users.length ? (
        <section aria-label="User accounts" className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,1fr)_220px_150px] items-center gap-4 border-b border-border bg-muted px-5 py-3 md:grid">
            {["User", "Role", "Status"].map((heading) => (
              <Overline className="text-muted-foreground" key={heading}>
                {heading}
              </Overline>
            ))}
          </div>
          <div className="divide-y divide-border">
            {users.map((user) => {
              const assignedRoleNames = user.roles
                .filter((roleId) => roleId !== "user")
                .map((roleId) => roleNames.get(roleId) ?? roleId);
              const roleLabel = assignedRoleNames.length ? assignedRoleNames.join(", ") : "User";

              return (
                <ManageUserDialog
                  key={user.id}
                  user={user}
                  roles={roles.map(({ id, name, description }) => ({ id, name, description }))}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-9 shrink-0">
                      {user.image ? <AvatarImage alt="" src={user.image} /> : null}
                      <AvatarFallback className="bg-accent text-primary">{initials(user.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <Strong className="block truncate text-foreground">{user.name}</Strong>
                      <Caption className="mt-0.5 block truncate text-muted-foreground">{user.email}</Caption>
                    </span>
                  </span>
                  <Text
                    className={`min-w-0 truncate ${assignedRoleNames.length ? "text-foreground" : "text-status-warning"}`}
                  >
                    {roleLabel}
                  </Text>
                  <StatusBadge className="justify-self-start" variant={user.status === "active" ? "success" : "danger"}>
                    {user.status === "active" ? "Active" : "Suspended"}
                  </StatusBadge>
                </ManageUserDialog>
              );
            })}
          </div>
          <div className="border-t border-border px-5 py-3 text-muted-foreground">
            <Text>{users.length}</Text> <Text>{users.length === 1 ? "user" : "users"}</Text>
          </div>
        </section>
      ) : (
        <EmptyState
          description={
            query || selectedRole !== "all"
              ? "No users match these filters. Clear the filters or try another search."
              : "Accounts appear here after registration."
          }
          icon={query || selectedRole !== "all" ? <SearchX aria-hidden="true" /> : <Users aria-hidden="true" />}
          title={query || selectedRole !== "all" ? "No users matched" : "No users found"}
        />
      )}
    </div>
  );
}
