import { appHref } from "@/lib/routing/subdomains.ts";
import { AdminPageHeader } from "@/app/admin/(protected)/components/AdminPageHeader";
import { SubmitButton } from "@/app/admin/(protected)/components/SubmitButton";
import { H3, Caption, Strong, Card, Field, Input, StatusBadge, Textarea } from "@/components/ui/index.tsx";
import {
  ChevronRight,
  CreditCard,
  Eye,
  Headphones,
  Inbox,
  KeyRound,
  LockKeyhole,
  Shield,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { requirePagePermission } from "../../../../lib/admin/access";
import { listRoles } from "../../../../lib/admin/data";
import { createRoleAction } from "../../actions";

function roleIcon(name: string): LucideIcon {
  const normalized = name.toLowerCase();
  if (normalized.includes("billing")) return CreditCard;
  if (normalized.includes("support")) return Headphones;
  if (normalized.includes("viewer") || normalized.includes("read")) return Eye;
  if (normalized.includes("admin")) return Shield;
  return KeyRound;
}

function RoleRow({ role }: { role: Awaited<ReturnType<typeof listRoles>>[number] }) {
  const Icon = roleIcon(role.name);
  const content = (
    <Card className="flex-row items-center gap-3.5 p-[18px] shadow-none transition-colors hover:border-primary/30 hover:bg-muted/30">
      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-primary">
        <Icon aria-hidden="true" className="size-[22px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <Strong className="text-foreground">{role.name}</Strong>
          <StatusBadge variant={role.isSystem ? "neutral" : "info"}>{role.isSystem ? "System" : "Custom"}</StatusBadge>
        </span>
        <Caption className="mt-1 block text-muted-foreground">{role.description}</Caption>
      </span>
      <Caption className="shrink-0 text-muted-foreground">
        {Number(role.assignedUsers)} {Number(role.assignedUsers) === 1 ? "user" : "users"}
      </Caption>
      {role.isSystem ? (
        <LockKeyhole aria-label="Protected system role" className="size-[17px] shrink-0 text-muted-foreground" />
      ) : (
        <ChevronRight aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
      )}
    </Card>
  );

  return role.isSystem ? (
    <div>{content}</div>
  ) : (
    <Link
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      href={appHref(`/admin/roles/${role.id}`)}
    >
      {content}
    </Link>
  );
}

export default async function RolesPage() {
  await requirePagePermission("roles", "view");
  const roles = await listRoles();
  const systemCount = roles.filter((role) => role.isSystem).length;
  const customCount = roles.length - systemCount;

  return (
    <div className="flex min-h-full flex-col gap-[22px]">
      <AdminPageHeader
        className="mb-0 shrink-0"
        description="Start with a system role or create one for your team’s workflow."
        title="Roles"
      />
      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="available-roles-heading" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-4">
            <H3 id="available-roles-heading">Available roles</H3>
            <Caption className="block text-muted-foreground">
              {systemCount} system · {customCount} custom
            </Caption>
          </div>
          <div className="grid gap-3">
            {roles.map((role) => (
              <RoleRow key={role.id} role={role} />
            ))}
          </div>
        </section>
        <aside className="rounded-xl bg-surface-ink p-6 text-on-ink xl:sticky xl:top-0 xl:min-h-[560px] xl:self-start">
          <form action={createRoleAction} className="flex h-full flex-col gap-[18px]">
            <div>
              <H3>Create a custom role</H3>
              <Caption className="block mt-2 text-on-ink-muted">
                Define a role now, then choose granular permissions on its detail page.
              </Caption>
            </div>
            <Field
              className="[&_[data-slot=field-label]]:text-on-ink-muted"
              htmlFor="new-role-name"
              label="Role name"
              required
            >
              <Input
                className="border-white/15 bg-white/[0.07] text-on-ink placeholder:text-on-ink-muted focus-visible:border-primary"
                maxLength={80}
                name="name"
                placeholder="Operations manager"
                required
              />
            </Field>
            <Field
              className="[&_[data-slot=field-label]]:text-on-ink-muted"
              htmlFor="new-role-description"
              label="Description"
              required
            >
              <Textarea
                className="min-h-[88px] border-white/15 bg-white/[0.07] text-on-ink placeholder:text-on-ink-muted focus-visible:border-primary"
                maxLength={500}
                name="description"
                placeholder="Manages daily documents and customer operations."
                required
              />
            </Field>
            <div className="min-h-4 flex-1" />
            <SubmitButton className="w-full" size="lg" type="submit">
              Create role
            </SubmitButton>
            <Caption className="block flex items-start gap-2 text-on-ink-muted">
              <Inbox aria-hidden="true" className="mt-px size-[15px] shrink-0" />
              {customCount
                ? `${customCount} custom ${customCount === 1 ? "role is" : "roles are"} currently configured.`
                : "No custom roles yet — create the first one here."}
            </Caption>
          </form>
        </aside>
      </div>
    </div>
  );
}
