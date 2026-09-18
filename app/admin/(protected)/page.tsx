import {
  H3,
  Caption,
  Metric,
  Strong,
  Text,
  TextLink,
  Card,
  EmptyState,
  ToolPageHeader,
  buttonVariants,
} from "@/components/ui/index.tsx";
import {
  Activity,
  BadgePlus,
  History,
  Inbox,
  KeyRound,
  ScrollText,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { requirePagePermission } from "../../../lib/admin/access";
import { listAuditEvents, listRoles, listUsers } from "../../../lib/admin/data";
import { auditEventPresentation } from "./audit/eventPresentation";

function relativeTime(date: Date) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function eventDetail(event: Awaited<ReturnType<typeof listAuditEvents>>[number]) {
  const actor = event.actorName ?? event.actorEmail ?? "An administrator";
  const target = event.targetUserName ?? event.targetUserEmail ?? `${event.targetType} ${event.targetId}`;
  return `${actor} changed ${target}`;
}

export default async function HomePage() {
  await requirePagePermission("admin", "enter");
  const [users, roles, events] = await Promise.all([listUsers(), listRoles(), listAuditEvents()]);
  const customRoles = roles.filter((role) => !role.isSystem);
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentEventCount = events.filter((event) => event.createdAt.getTime() >= thirtyDaysAgo).length;
  const recentEvents = events.slice(0, 3);

  const metrics: readonly {
    detail: string;
    icon: LucideIcon;
    label: string;
    tone: string;
    value: number;
  }[] = [
    {
      label: "Total users",
      value: users.length,
      detail: `${users.filter((user) => user.status === "active").length} active accounts`,
      icon: Users,
      tone: "text-success",
    },
    {
      label: "Custom roles",
      value: customRoles.length,
      detail: `${roles.length} roles in total`,
      icon: KeyRound,
      tone: "text-primary",
    },
    {
      label: "Access events",
      value: recentEventCount,
      detail: "Last 30 days",
      icon: Activity,
      tone: "text-muted-foreground",
    },
  ];

  const quickActions: readonly { href: string; icon: LucideIcon; label: string }[] = [
    { href: "/admin/users", icon: UserPlus, label: "Assign a user role" },
    { href: "/admin/roles", icon: BadgePlus, label: "Create custom role" },
    { href: "/admin/audit", icon: ScrollText, label: "Review audit history" },
  ];

  return (
    <div className="flex min-h-full flex-col gap-6">
      <ToolPageHeader
        actions={
          <a className={buttonVariants({ variant: "secondary" })} href="/admin/audit">
            View audit history
          </a>
        }
        className="mb-0 border-b-0 pb-0"
        description="Monitor access, role coverage, and recent security activity."
        title="Admin overview"
      />

      <section aria-label="Administration metrics" className="grid gap-4 md:grid-cols-3">
        {metrics.map(({ detail, icon: Icon, label, tone, value }) => (
          <Card className="gap-1.5 p-5 shadow-none" key={label}>
            <Text className="text-muted-foreground">{label}</Text>
            <Metric className="text-foreground">{value.toLocaleString()}</Metric>
            <Caption className={`inline-flex items-center gap-1 ${tone}`}>
              <Icon aria-hidden="true" className="size-3.5" />
              {detail}
            </Caption>
          </Card>
        ))}
      </section>

      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section
          className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card"
          aria-labelledby="recent-access-heading"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-[18px]">
            <H3 id="recent-access-heading">Recent access changes</H3>
            <TextLink className="text-primary hover:underline" href="/admin/audit">
              View all →
            </TextLink>
          </div>
          {recentEvents.length ? (
            <div className="divide-y divide-border">
              {recentEvents.map((event) => {
                const { icon: Icon, label } = auditEventPresentation(event.action);
                return (
                  <div className="flex items-center gap-3 px-5 py-[15px]" key={event.id}>
                    <span className="grid size-[38px] shrink-0 place-items-center rounded-lg bg-accent text-primary">
                      <Icon aria-hidden="true" className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <Strong className="block truncate">{label}</Strong>
                      <Caption className="mt-0.5 block truncate text-muted-foreground">{eventDetail(event)}</Caption>
                    </span>
                    <time className="shrink-0 text-muted-foreground" dateTime={event.createdAt.toISOString()}>
                      {relativeTime(event.createdAt)}
                    </time>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              className="m-5 border-0 bg-muted p-6"
              description="Privileged access changes will appear here."
              icon={<Inbox aria-hidden="true" />}
              title="No access changes yet"
            />
          )}
          <div className="mt-auto flex items-center gap-2 bg-muted px-5 py-3 text-muted-foreground">
            <Inbox aria-hidden="true" className="size-4" />
            <Text>Activity is sourced from the privileged audit log.</Text>
          </div>
        </section>

        <aside className="flex flex-col gap-4 rounded-xl bg-surface-ink p-[22px] text-on-ink">
          <div>
            <H3>Quick actions</H3>
            <Caption className="block mt-2 text-on-ink-muted">
              Common access-management tasks for administrators.
            </Caption>
          </div>
          <nav aria-label="Quick actions" className="grid gap-2">
            {quickActions.map(({ href, icon: Icon, label }) => (
              <TextLink
                className="flex items-center gap-2.5 rounded-lg bg-white/[0.07] px-[13px] py-3 text-on-ink outline-none transition-colors hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-ring"
                href={href}
                key={href}
              >
                <Icon aria-hidden="true" className="size-[17px]" />
                {label}
              </TextLink>
            ))}
          </nav>
          <div className="mt-auto flex items-center gap-2 text-on-ink-muted">
            <History aria-hidden="true" className="size-3.5" />
            <Text>All privileged changes are recorded.</Text>
          </div>
        </aside>
      </div>
    </div>
  );
}
