import { appHref } from "@/lib/routing/subdomains.ts";
import { AdminPageHeader } from "@/app/admin/(protected)/components/AdminPageHeader";
import {
  Caption,
  InlineCode,
  Overline,
  Strong,
  Text,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/index.tsx";
import { History } from "lucide-react";
import { requirePagePermission } from "../../../../lib/admin/access";
import { listAuditEventsPage } from "../../../../lib/admin/data";
import { AdminListing } from "../components/AdminListing";
import { AdminFilters } from "../components/AdminFilters";
import { auditEventPresentation } from "./eventPresentation";

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

type AuditSearchParams = Promise<{
  action?: string | string[];
  date?: string | string[];
  q?: string | string[];
  page?: string | string[];
}>;

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function AuditPage({ searchParams }: { searchParams: AuditSearchParams }) {
  await requirePagePermission("audit", "view");
  const params = await searchParams;
  const query = valueOf(params.q).trim();
  const requestedAction = valueOf(params.action);
  const action = requestedAction === "all" ? "" : requestedAction;
  const requestedDate = valueOf(params.date);
  const date = ["7", "30", "90", "all"].includes(requestedDate) ? requestedDate : "30";
  const days = date === "all" ? null : Number(date);
  const cutoff = days && Number.isFinite(days) ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
  const requestedPage = Number(valueOf(params.page));
  const pageSize = 25;
  const {
    events,
    total,
    page,
    pageCount,
    actions: retainedActions,
  } = await listAuditEventsPage({
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    pageSize,
    query,
    action,
    cutoff,
  });
  const actions = [...new Set([...retainedActions, ...(action ? [action] : [])])].sort();
  function pageHref(nextPage: number) {
    const next = new URLSearchParams({ date });
    if (query) next.set("q", query);
    if (action) next.set("action", action);
    if (nextPage > 1) next.set("page", String(nextPage));
    return appHref(`/admin/audit?${next}`);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AdminPageHeader
        className="shrink-0"
        description="A chronological record of privileged administrative and access events. Sensitive metadata is redacted."
        title="Audit history"
      />
      <div className="mb-5 shrink-0">
        <AdminFilters
          search={{ key: "q", label: "Search events", placeholder: "Actor, target, or action…" }}
          selects={[
            {
              key: "action",
              label: "Action",
              options: [
                { value: "all", label: "All actions" },
                ...actions.map((value) => ({ value, label: auditEventPresentation(value).label })),
              ],
            },
            {
              key: "date",
              label: "Date range",
              defaultValue: "30",
              options: [
                { value: "7", label: "Last 7 days" },
                { value: "30", label: "Last 30 days" },
                { value: "90", label: "Last 90 days" },
                { value: "all", label: "All retained events" },
              ],
            },
          ]}
        />
      </div>
      {events.length ? (
        <AdminListing
          aria-label="Audit events"
          pagination={{
            "aria-label": "Audit history pages",
            page,
            pageCount,
            getPageHref: pageHref,
            summary: `Showing ${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + events.length} of ${total} events`,
          }}
        >
          <Table className="min-w-[900px] table-fixed border-collapse">
            <TableHeader>
              <TableRow className="bg-muted/60">
                {[
                  ["Actor", "w-[16%]"],
                  ["Event", "w-[16%]"],
                  ["Target", "w-[24%]"],
                  ["Metadata", "w-[30%]"],
                  ["Time", "w-[14%]"],
                ].map(([heading, width]) => (
                  <TableHead className={`${width} py-3 `} key={heading} scope="col">
                    {heading}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => {
                const { icon: EventIcon, label } = auditEventPresentation(event.action);
                return (
                  <TableRow className="align-top hover:bg-muted/30" key={event.id}>
                    <TableCell className="whitespace-normal py-3.5">
                      <Strong className="block text-foreground">{event.actorName ?? "Deleted user"}</Strong>
                      <Caption className="mt-0.5 block break-all text-muted-foreground">
                        {event.actorEmail ?? event.actorUserId}
                      </Caption>
                    </TableCell>
                    <TableCell className="whitespace-normal py-3.5 align-middle">
                      <Text className="inline-flex items-center gap-2.5 text-foreground">
                        <EventIcon aria-hidden="true" className="size-[18px] shrink-0 text-primary" strokeWidth={1.8} />
                        {label}
                      </Text>
                    </TableCell>
                    <TableCell className="whitespace-normal py-3.5">
                      {event.targetType === "user" ? (
                        <>
                          <Strong className="block text-foreground">{event.targetUserName ?? "Deleted user"}</Strong>
                          <Caption className="mt-0.5 block break-all text-muted-foreground">
                            {event.targetUserEmail ?? event.targetId}
                          </Caption>
                        </>
                      ) : (
                        <>
                          <Overline className="block text-muted-foreground">{event.targetType}</Overline>
                          <InlineCode className="mt-1 block break-all">{event.targetId}</InlineCode>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal py-3.5">
                      <InlineCode className="block break-all text-muted-foreground">
                        {JSON.stringify(event.metadata)}
                      </InlineCode>
                    </TableCell>
                    <TableCell className="whitespace-normal py-3.5 text-muted-foreground">
                      <time dateTime={event.createdAt.toISOString()}>{dateTimeFormatter.format(event.createdAt)}</time>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </AdminListing>
      ) : (
        <EmptyState
          description={
            retainedActions.length
              ? "No events match the current filters. Adjust the search, action, or date range."
              : "Privileged changes will appear here after an administrator makes one."
          }
          icon={<History aria-hidden="true" />}
          title={retainedActions.length ? "No matching audit events" : "No privileged mutations recorded"}
        />
      )}
    </div>
  );
}
