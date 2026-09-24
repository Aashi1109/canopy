"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  EmptyState,
  Input,
  Label,
  Toaster,
  toast,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/index.tsx";
import { AdminListing } from "../../components/AdminListing";
import { mutateBlogAction } from "../actions";

interface Props {
  kind: "category" | "tag";
  terms: {
    id: string;
    name: string;
    createdBy: string | null;
    updatedBy: string | null;
    updatedAt: Date;
  }[];
  returnTo?: string;
  pagination: { page: number; pageCount: number; total: number; href: string };
}

export function BlogTaxonomy({ kind, terms, returnTo, pagination }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [pending, setPending] = useState(false);
  async function save(value: { id?: string; name: string }) {
    if (pending || !value.name.trim()) return;
    setPending(true);
    try {
      const result = await mutateBlogAction("saveTerm", {
        kind,
        ...value,
        name: value.name.trim(),
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (!value.id && returnTo) {
        router.push(returnTo);
        router.refresh();
        return;
      }
      if (!value.id) setName("");
      if (value.id) setEditing(null);
      toast.success(value.id ? "Name updated." : `${kind === "category" ? "Category" : "Tag"} created.`);
      router.refresh();
    } catch {
      toast.error("Couldn’t save the name. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <Toaster position="top-right" />
      <form
        className="flex shrink-0 flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save({ name });
        }}
      >
        <div className="grid min-w-48 flex-1 gap-2">
          <Label htmlFor="blog-term-name">New {kind}</Label>
          <Input
            id="blog-term-name"
            placeholder={kind === "category" ? "e.g. Business" : "e.g. Freelancing"}
            value={name}
            maxLength={100}
            required
            disabled={pending || !!editing}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button type="submit" loading={pending && !editing} disabled={pending || !!editing || !name.trim()}>
          Add {kind}
        </Button>
      </form>
      {editing && (
        <p className="text-sm text-muted-foreground" role="status">
          Save or cancel this rename before editing another name or adding a {kind}.
        </p>
      )}
      <AdminListing
        aria-label="Categories and tags"
        pagination={{
          "aria-label": "Taxonomy pages",
          page: pagination.page,
          pageCount: pagination.pageCount,
          getPageHref: (page) => `${pagination.href}${page > 1 ? `&page=${page}` : ""}`,
          summary: `Showing ${pagination.total ? (pagination.page - 1) * 25 + 1 : 0}–${(pagination.page - 1) * 25 + terms.length} of ${pagination.total} ${kind === "category" ? (pagination.total === 1 ? "category" : "categories") : pagination.total === 1 ? "tag" : "tags"}`,
        }}
      >
        {terms.length ? (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Last updated</TableHead>
                <TableHead className="w-36 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {terms.map((term) => (
                <TableRow key={term.id}>
                  <TableCell className="whitespace-normal">
                    {editing?.id === term.id ? (
                      <Input
                        aria-label={`Rename ${term.name}`}
                        maxLength={100}
                        value={editing.name}
                        disabled={pending}
                        onChange={(event) => setEditing({ id: term.id, name: event.target.value })}
                      />
                    ) : (
                      <span className="break-words font-medium">{term.name}</span>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                      Updated {new Date(term.updatedAt).toISOString().slice(0, 10)}
                    </p>
                    <Accordion type="single" collapsible className="mt-2 text-muted-foreground sm:hidden">
                      <AccordionItem value="attribution">
                        <AccordionTrigger>Account attribution</AccordionTrigger>
                        <AccordionContent>
                          <p className="break-all">Created by: {term.createdBy ?? "Deleted account"}</p>
                          <p className="mt-1 break-all">Last edited by: {term.updatedBy ?? "Deleted account"}</p>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </TableCell>
                  <TableCell className="hidden max-w-64 whitespace-normal text-sm text-muted-foreground sm:table-cell">
                    <p>
                      {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(
                        new Date(term.updatedAt),
                      )}
                    </p>
                    <Accordion type="single" collapsible className="mt-2">
                      <AccordionItem value="attribution">
                        <AccordionTrigger>Account attribution</AccordionTrigger>
                        <AccordionContent>
                          <p className="break-all">Created by: {term.createdBy ?? "Deleted account"}</p>
                          <p className="mt-1 break-all">Last edited by: {term.updatedBy ?? "Deleted account"}</p>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {editing?.id === term.id ? (
                        <>
                          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            loading={pending}
                            disabled={!editing.name.trim()}
                            onClick={() => {
                              void save(editing);
                            }}
                          >
                            Save
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending || !!editing}
                          onClick={() => setEditing({ id: term.id, name: term.name })}
                        >
                          Rename
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            className="rounded-none border-0 shadow-none"
            title={`No ${kind === "category" ? "categories" : "tags"} yet`}
            description={`Add a ${kind} above to make it available to all posts.`}
          />
        )}
      </AdminListing>
    </div>
  );
}
