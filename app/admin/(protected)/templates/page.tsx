import { AdminListing } from "@/app/admin/(protected)/components/AdminListing";
import { adminPageHref, paginateAdminItems } from "../lib/pagination";
import { DOCUMENT_TYPES } from "@/lib/invoice-templates/index.ts";
import {
  Caption,
  Text,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  buttonVariants,
} from "@/components/ui/index.tsx";
import { Ellipsis, FilePenLine, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { AdminFilters } from "../components/AdminFilters";
import { AdminPageHeader } from "../components/AdminPageHeader";
import { requirePagePermission } from "../../../../lib/admin/access";
import { listTemplates } from "../../../../lib/admin/data";
const updatedAtFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function filterValue(value: string | string[] | undefined, allowedValues?: readonly string[]) {
  const first = Array.isArray(value) ? value[0] : value;
  return first && (!allowedValues || allowedValues.includes(first)) ? first : "";
}

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    mode?: string | string[];
    query?: string | string[];
    status?: string | string[];
    type?: string | string[];
  }>;
}) {
  await requirePagePermission("templates", "view");
  const [templates, params] = await Promise.all([listTemplates(), searchParams]);
  const filters = {
    query: filterValue(params.query),
    type: filterValue(params.type, DOCUMENT_TYPES) || "all",
    status: filterValue(params.status, ["published", "draft", "archived"]) || "all",
    mode: filterValue(params.mode, ["standard", "advanced"]) || "all",
  };
  const query = filters.query.trim().toLowerCase();
  const visibleTemplates = templates.filter((template) => {
    const isAdvanced = template.layoutFamily === "advanced";
    return (
      (!query || template.name.toLowerCase().includes(query) || template.slug.toLowerCase().includes(query)) &&
      (!filters.type || filters.type === "all" || template.documentType === filters.type) &&
      (!filters.status || filters.status === "all" || template.status === filters.status) &&
      (!filters.mode || filters.mode === "all" || (filters.mode === "advanced" ? isAdvanced : !isAdvanced))
    );
  });

  const result = paginateAdminItems(visibleTemplates, params.page);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[84rem] flex-col">
      <AdminPageHeader
        className="shrink-0"
        title="Templates"
        description="Manage reusable document layouts across every document type."
        actions={
          <div className="flex flex-wrap gap-2.5">
            <Link
              className={buttonVariants({ className: "rounded-full", variant: "secondary" })}
              href="/admin/templates/import"
            >
              <Upload aria-hidden="true" className="size-4" />
              Import JSON
            </Link>
            <Link className={buttonVariants({ className: "rounded-full px-5" })} href="/admin/templates/new">
              <Plus aria-hidden="true" className="size-4" />
              Create template
            </Link>
          </div>
        }
      />

      <div className="mb-5 shrink-0">
        <AdminFilters
          search={{ key: "query", label: "Search templates", placeholder: "Name or slug" }}
          selects={[
            {
              key: "type",
              label: "Document type",
              options: [
                { value: "all", label: "All document types" },
                { value: "invoice", label: "Invoice" },
                { value: "receipt", label: "Receipt" },
                { value: "expense-report", label: "Expense report" },
                { value: "mileage-log", label: "Mileage log" },
                { value: "quarterly-tax-estimator", label: "Tax estimator" },
                { value: "w9-request", label: "W-9 request" },
                { value: "1099-nec-tracker", label: "1099-NEC tracker" },
              ],
            },
            {
              key: "status",
              label: "Status",
              options: [
                { value: "all", label: "All statuses" },
                { value: "published", label: "Published" },
                { value: "draft", label: "Draft" },
                { value: "archived", label: "Archived" },
              ],
            },
            {
              key: "mode",
              label: "Editor",
              options: [
                { value: "all", label: "Standard + advanced" },
                { value: "standard", label: "Standard" },
                { value: "advanced", label: "Advanced" },
              ],
            },
          ]}
        />
      </div>

      <AdminListing
        aria-label="Template catalog"
        className="min-h-0 flex-1 shadow-sm"
        pagination={{
          page: result.page,
          pageCount: result.pageCount,
          getPageHref: (page) => adminPageHref("/admin/templates", page, filters),
          summary: `Showing ${result.start}–${result.end} of ${result.total} templates`,
        }}
      >
        {visibleTemplates.length ? (
          <Table>
            <TableHeader>
              <TableRow className="h-11 hover:bg-transparent">
                <TableHead className="min-w-64 px-[18px]">Template</TableHead>
                <TableHead className="w-40">Document type</TableHead>
                <TableHead className="w-32">Editor</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-40">Updated</TableHead>
                <TableHead className="w-14">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((template) => {
                const isAdvanced = template.layoutFamily === "advanced";

                return (
                  <TableRow className="h-[68px]" key={template.id}>
                    <TableCell className="px-[18px]">
                      <Link className="group block" href={`/admin/templates/${template.id}/manage`}>
                        <Text className="block text-foreground group-hover:text-primary">{template.name}</Text>
                        <Caption className="mt-0.5 block text-muted-foreground">/{template.slug}</Caption>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Caption className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-foreground">
                        {template.documentType.replaceAll("-", " ")}
                      </Caption>
                    </TableCell>
                    <TableCell>{isAdvanced ? "Advanced" : "Standard"}</TableCell>
                    <TableCell>
                      <StatusBadge
                        className="min-h-6 px-2.5"
                        variant={
                          template.status === "published"
                            ? "success"
                            : template.status === "archived"
                              ? "archived"
                              : "warning"
                        }
                      >
                        {template.status}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <time className="text-muted-foreground" dateTime={template.updatedAt.toISOString()}>
                        {updatedAtFormatter.format(template.updatedAt)}
                      </time>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        aria-label={`Edit details for ${template.name}`}
                        className="inline-grid size-9 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        href={`/admin/templates/${template.id}/manage`}
                      >
                        <Ellipsis aria-hidden="true" className="size-[18px]" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            action={
              <Link className={buttonVariants()} href="/admin/templates/new">
                Create template
              </Link>
            }
            description={
              templates.length
                ? "Adjust the filters to see more templates."
                : "Create a draft or import an existing template to get started."
            }
            title={templates.length ? "No matching templates" : "No templates found"}
          />
        )}
      </AdminListing>

      <div className="mt-4 flex shrink-0 justify-end">
        <Link
          className="inline-flex items-center gap-2 text-primary hover:underline"
          href="/admin/templates/new/advanced"
        >
          <FilePenLine aria-hidden="true" className="size-4" />
          Create an advanced template
        </Link>
      </div>
    </div>
  );
}
