"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Folder, Pencil, Tag } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Avatar,
  AvatarFallback,
  AvatarImage,
  BackButton,
  Button,
  CreateMenuButton,
  DropdownMenuItem,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/index.tsx";
import { AdminListing } from "../../components/AdminListing";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { mutateBlogAction } from "../actions";

interface Props {
  kind: "category" | "tag";
  terms: {
    id: string;
    name: string;
    createdByUser: { name: string; image: string | null } | null;
    updatedByUser: { name: string; image: string | null } | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
  backHref: string;
  taxonomyHrefs: Record<"category" | "tag", string>;
  returnTo?: string;
  pagination: { page: number; pageCount: number; total: number; href: string };
}

function TaxonomyAttribution({ user, date }: { user: Props["terms"][number]["createdByUser"]; date: Date }) {
  const name = user?.name.trim() || (user ? "Unnamed account" : "Deleted account");
  const initials = user
    ? name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
    : "—";
  const timestamp = new Date(date);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar aria-hidden="true" size="sm" className="shrink-0">
        {user?.image ? <AvatarImage alt="" src={user.image} /> : null}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 gap-0.5">
        <span className="break-words text-sm leading-5">{name}</span>
        <time dateTime={timestamp.toISOString()} className="text-xs leading-4 text-muted-foreground">
          {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(timestamp)}
        </time>
      </div>
    </div>
  );
}

export function BlogTaxonomy({ kind, terms, backHref, taxonomyHrefs, returnTo, pagination }: Props) {
  const router = useRouter();
  const createTrigger = useRef<HTMLButtonElement>(null);
  const dialogTrigger = useRef<HTMLButtonElement | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const createOpen = useRef(false);
  const saving = useRef(false);
  const [creationKind, setCreationKind] = useState<"category" | "tag" | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (nameError && !pending) nameInput.current?.focus();
  }, [nameError, pending]);

  function openCreate(nextKind: "category" | "tag") {
    if (saving.current || editing) return;
    createOpen.current = true;
    dialogTrigger.current = createTrigger.current;
    setName("");
    setNameError(null);
    setCreationKind(nextKind);
  }

  function resetDialog() {
    createOpen.current = false;
    setCreationKind(null);
    setEditing(null);
    setName("");
    setNameError(null);
  }

  async function save(value: { id?: string; name: string }, selectedKind = kind) {
    if (saving.current) return;
    const trimmedName = value.name.trim();
    if (!trimmedName || trimmedName.length > 100) {
      setNameError(!trimmedName ? "Enter a name." : "Use 100 characters or fewer.");
      nameInput.current?.focus();
      return;
    }
    saving.current = true;
    setPending(true);
    try {
      const result = await mutateBlogAction("saveTerm", {
        kind: selectedKind,
        ...value,
        name: trimmedName,
      });
      if (!result.ok) {
        if (result.code === "VALIDATION" || result.code === "CONFLICT") {
          setNameError(result.message);
        } else toast.error(result.message);
        return;
      }
      resetDialog();
      toast.success(value.id ? "Name updated." : `${selectedKind === "category" ? "Category" : "Tag"} created.`);
      if (!value.id) router.push(returnTo ?? taxonomyHrefs[selectedKind]);
      router.refresh();
    } catch {
      toast.error("Couldn’t save the name. Try again.");
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  const dialogKind = creationKind ?? kind;
  return (
    <Tabs value={kind} className="h-full min-h-0 min-w-0 gap-5">
      <Toaster position="top-right" />
      <div className="flex shrink-0 items-start gap-2">
        <BackButton href={backHref} label={returnTo ? "Back to editor" : "Back to posts"} className="mt-1" />
        <AdminPageHeader
          className="mb-0 min-w-0 flex-1 sm:items-start"
          title="Categories & tags"
          description="Manage the topics and labels used across your posts."
          actions={
            <CreateMenuButton
              size="sm"
              disabled={pending || !!editing}
              triggerRef={createTrigger}
              onCloseAutoFocus={(event) => {
                if (createOpen.current) event.preventDefault();
              }}
            >
              <DropdownMenuItem onSelect={() => openCreate("category")}>
                <Folder aria-hidden="true" />
                Category
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openCreate("tag")}>
                <Tag aria-hidden="true" />
                Tag
              </DropdownMenuItem>
            </CreateMenuButton>
          }
        />
      </div>
      <TabsList aria-label="Taxonomy type" className="w-full shrink-0">
        <TabsTrigger asChild value="category" className="flex-none">
          <Link href={taxonomyHrefs.category}>Categories</Link>
        </TabsTrigger>
        <TabsTrigger asChild value="tag" className="flex-none">
          <Link href={taxonomyHrefs.tag}>Tags</Link>
        </TabsTrigger>
      </TabsList>
      <TabsContent value={kind} className="flex min-h-0 flex-col gap-3">
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
            <TooltipProvider>
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden w-1/4 md:table-cell">Created</TableHead>
                    <TableHead className="hidden w-1/4 md:table-cell">Last edited</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {terms.map((term) => (
                    <TableRow key={term.id}>
                      <TableCell className="whitespace-normal">
                        <span className="break-words font-medium">{term.name}</span>
                        <div className="mt-3 grid min-w-0 gap-3 md:hidden">
                          <div className="grid min-w-0 gap-1">
                            <span className="text-xs font-medium text-muted-foreground">Created</span>
                            <TaxonomyAttribution user={term.createdByUser} date={term.createdAt} />
                          </div>
                          <div className="grid min-w-0 gap-1">
                            <span className="text-xs font-medium text-muted-foreground">Last edited</span>
                            <TaxonomyAttribution user={term.updatedByUser} date={term.updatedAt} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden whitespace-normal md:table-cell">
                        <TaxonomyAttribution user={term.createdByUser} date={term.createdAt} />
                      </TableCell>
                      <TableCell className="hidden whitespace-normal md:table-cell">
                        <TaxonomyAttribution user={term.updatedByUser} date={term.updatedAt} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Rename ${term.name}`}
                                disabled={pending || !!editing}
                                onClick={(event) => {
                                  if (saving.current || creationKind !== null) return;
                                  dialogTrigger.current = event.currentTarget;
                                  setName(term.name);
                                  setNameError(null);
                                  setEditing({ id: term.id });
                                }}
                              >
                                <Pencil aria-hidden="true" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Rename {kind}</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          ) : (
            <EmptyState
              className="rounded-none border-0 shadow-none"
              title={`No ${kind === "category" ? "categories" : "tags"} yet`}
              description={`Use Create to add a ${kind} and make it available to all posts.`}
            />
          )}
        </AdminListing>
      </TabsContent>
      <AlertDialog
        open={creationKind !== null || editing !== null}
        onOpenChange={(open) => {
          if (!open && !saving.current) resetDialog();
        }}
      >
        <AlertDialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameInput.current?.focus();
            if (editing) nameInput.current?.select();
          }}
          onEscapeKeyDown={(event) => {
            if (saving.current) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = dialogTrigger.current?.isConnected ? dialogTrigger.current : createTrigger.current;
            trigger?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {editing ? "Rename" : "Create"} {dialogKind}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {editing ? `Update this ${dialogKind}’s name.` : "This name will be available to all posts."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            className="grid gap-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (creationKind || editing) void save({ ...(editing ? { id: editing.id } : {}), name }, dialogKind);
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="blog-term-name">Name</Label>
              <Input
                ref={nameInput}
                id="blog-term-name"
                autoFocus
                placeholder={dialogKind === "category" ? "e.g. Business" : "e.g. Freelancing"}
                value={name}
                maxLength={100}
                required
                disabled={pending}
                aria-invalid={!!nameError}
                aria-describedby="blog-term-name-help"
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
              />
              <p
                id="blog-term-name-help"
                className={`text-xs ${nameError ? "text-validation" : "text-muted-foreground"}`}
                aria-live="polite"
              >
                {nameError ?? `${name.length}/100 characters`}
              </p>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <Button type="submit" loading={pending} disabled={pending}>
                {editing ? "Save changes" : `Create ${dialogKind}`}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}
