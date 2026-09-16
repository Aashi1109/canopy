"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { Plus, X } from "lucide-react";
import {
  AlertBanner,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Checkbox,
  Input,
  Popover,
  SectionCard,
  SectionHeading,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
  toast,
} from "@smarttools/ui";
import type { RoleUser, RoleUsersPage } from "@/lib/admin/data";
import { assignRoleMembersAction, searchRoleUsersAction } from "./membershipActions";

export default function RoleMembers({
  roleId,
  roleName,
  initial,
  canAssign,
  disabled,
}: {
  roleId: string;
  roleName: string;
  initial: RoleUsersPage;
  canAssign: boolean;
  disabled: boolean;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initial);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState(false);
  const [open, setOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RoleUser[]>([]);
  const [results, setResults] = useState<RoleUsersPage>({ users: [], total: 0, hasMore: false });
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const pending = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const resultsPanel = useRef<HTMLDivElement>(null);

  useEffect(() => setMembers(initial), [initial]);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoading(true);
    setSearchError(false);
    const timer = setTimeout(() => {
      searchRoleUsersAction(roleId, false, query, offset)
        .then((page) => {
          if (current) setResults(page);
        })
        .catch((error: unknown) => {
          unstable_rethrow(error);
          if (current) setSearchError(true);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [open, roleId, query, offset, retry]);

  function changeOpen(next: boolean) {
    if (pending.current) return;
    if (next && disabled) return;
    setOpen(next);
    setResultsOpen(false);
    setSelected([]);
    setQuery("");
    setOffset(0);
    setSaveError(false);
    setSearchError(false);
    setLoading(true);
  }

  function toggle(user: RoleUser, checked: boolean) {
    setSelected((users) =>
      checked ? [...users.filter((item) => item.id !== user.id), user] : users.filter((item) => item.id !== user.id),
    );
    setSaveError(false);
    if (checked) {
      searchInput.current?.focus();
      setResultsOpen(false);
    }
  }

  async function assign() {
    if (pending.current || !selected.length || disabled) return;
    pending.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      await assignRoleMembersAction(
        roleId,
        selected.map((user) => user.id),
      );
      setMembers((current) => {
        const additions = selected.filter((user) => !current.users.some((member) => member.id === user.id));
        return {
          ...current,
          users: [...additions, ...current.users],
          total: current.total + additions.length,
        };
      });
      setOpen(false);
      setSelected([]);
      toast.success(`${roleName} assigned to ${selected.length} ${selected.length === 1 ? "user" : "users"}.`);
      router.refresh();
    } catch (error) {
      unstable_rethrow(error);
      setSaveError(true);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  async function loadMembers() {
    setMemberLoading(true);
    setMemberError(false);
    try {
      const page = await searchRoleUsersAction(roleId, true, "", members.users.length);
      setMembers((current) => ({
        ...page,
        users: [
          ...current.users,
          ...page.users.filter((user) => !current.users.some((member) => member.id === user.id)),
        ],
      }));
    } catch (error) {
      unstable_rethrow(error);
      setMemberError(true);
    } finally {
      setMemberLoading(false);
    }
  }

  function userOption(user: RoleUser, checked: boolean) {
    return (
      <div className="flex min-w-0 items-center gap-3 py-2.5" key={user.id}>
        <Checkbox
          className="min-w-0 flex-1 [&>span]:min-w-0 [overflow-wrap:anywhere]"
          label={user.name || user.email}
          description={user.email}
          checked={checked}
          disabled={saving || (!checked && selected.length >= 100)}
          onCheckedChange={(value) => toggle(user, value === true)}
        />
        {user.status === "suspended" ? <StatusBadge variant="warning">Suspended</StatusBadge> : null}
      </div>
    );
  }

  return (
    <SectionCard className="mt-6">
      <TooltipProvider>
        <AlertDialog open={open} onOpenChange={changeOpen}>
          <SectionHeading
            className="flex-wrap"
            title={`Assigned users · ${members.total}`}
            description={`People with the ${roleName} role. Select a person to view details.`}
            action={
              canAssign ? (
                <AlertDialogTrigger asChild>
                  <Button disabled={disabled}>
                    <Plus className="size-4" />
                    Assign users
                  </Button>
                </AlertDialogTrigger>
              ) : undefined
            }
          />
          {canAssign && disabled ? (
            <p className="mb-3 text-sm text-muted-foreground">Save or revert role changes before assigning users.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {members.users.map((user) => (
              <Popover.Root key={user.id}>
                <Popover.Trigger asChild>
                  <Button variant="outline" className="h-auto max-w-full rounded-full py-1.5 pr-3 pl-1.5">
                    <Avatar aria-hidden="true" className="size-7 shrink-0">
                      <AvatarImage src={user.image ?? undefined} alt="" />
                      <AvatarFallback className="text-xs">
                        {user.name
                          .split(/\s+/)
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("") || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{user.name || user.email}</span>
                  </Button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    sideOffset={8}
                    className="z-50 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-md"
                  >
                    <p className="font-medium">{user.name || user.email}</p>
                    <p className="mt-1 break-all text-muted-foreground">{user.email}</p>
                    <StatusBadge className="mt-2" variant={user.status === "active" ? "success" : "warning"}>
                      {user.status === "active" ? "Active" : "Suspended"}
                    </StatusBadge>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            ))}
          </div>
          {!members.total ? <p className="text-sm text-muted-foreground">No users assigned to this role yet.</p> : null}
          {memberError ? (
            <AlertBanner variant="error" className="mt-3">
              Could not load members. Try again.
            </AlertBanner>
          ) : null}
          {members.hasMore ? (
            <Button className="mt-3" variant="ghost" loading={memberLoading} onClick={loadMembers}>
              {memberLoading
                ? "Loading…"
                : memberError
                  ? "Retry loading members"
                  : `Show more · ${members.total} total`}
            </Button>
          ) : null}
          <AlertDialogContent
            className="inset-0 m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0 data-[size=default]:sm:max-w-[640px]"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              searchInput.current?.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (saving || resultsOpen) event.preventDefault();
            }}
          >
            <AlertDialogHeader className="relative shrink-0 place-items-start gap-1.5 px-6 pt-6 pb-4 pr-16 text-left sm:px-7 sm:pr-16">
              <AlertDialogTitle>Assign users</AlertDialogTitle>
              <AlertDialogDescription>
                Assign the saved {roleName} role. Other roles stay unchanged.
              </AlertDialogDescription>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-4 right-4"
                    aria-label="Close assignment"
                    disabled={saving}
                    onClick={() => changeOpen(false)}
                  >
                    <X className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close</TooltipContent>
              </Tooltip>
            </AlertDialogHeader>
            <div className="min-h-0 space-y-3 overflow-y-auto px-6 pb-4 sm:px-7">
              <Popover.Root open={resultsOpen} onOpenChange={setResultsOpen}>
                <Popover.Anchor asChild>
                  <label className="grid gap-1.5 text-sm font-medium">
                    Find users
                    <Input
                      ref={searchInput}
                      value={query}
                      maxLength={200}
                      disabled={saving}
                      placeholder="Search by name or email"
                      aria-haspopup="dialog"
                      aria-expanded={resultsOpen}
                      aria-controls="role-user-search-results"
                      onFocus={() => setResultsOpen(true)}
                      onClick={() => setResultsOpen(true)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setResultsOpen(true);
                          requestAnimationFrame(() =>
                            resultsPanel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(),
                          );
                        }
                      }}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setOffset(0);
                        setLoading(true);
                        setResultsOpen(true);
                      }}
                    />
                  </label>
                </Popover.Anchor>
                <Popover.Portal>
                  <Popover.Content
                    ref={resultsPanel}
                    id="role-user-search-results"
                    aria-label="Search results"
                    align="start"
                    sideOffset={6}
                    collisionPadding={16}
                    className="z-50 max-h-[min(320px,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-lg border bg-popover p-3 text-popover-foreground shadow-md"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                    onInteractOutside={(event) => {
                      if (event.target === searchInput.current) event.preventDefault();
                    }}
                    onEscapeKeyDown={() => {
                      searchInput.current?.focus();
                    }}
                  >
                    <div aria-busy={loading}>
                      {loading ? (
                        <p role="status" className="py-4 text-sm text-muted-foreground">
                          Searching users…
                        </p>
                      ) : searchError ? (
                        <AlertBanner variant="error">
                          Could not load users.{" "}
                          <Button variant="ghost" onClick={() => setRetry((value) => value + 1)}>
                            Retry search
                          </Button>
                        </AlertBanner>
                      ) : (
                        <>
                          {results.users
                            .filter((user) => !selected.some((item) => item.id === user.id))
                            .map((user) => userOption(user, false))}
                          {!results.total ? (
                            <p role="status" className="py-4 text-sm text-muted-foreground">
                              {query
                                ? "No matching users. Try another name or email."
                                : "All users already have this role."}
                            </p>
                          ) : null}
                          {results.total > 0 &&
                          results.users.every((user) => selected.some((item) => item.id === user.id)) ? (
                            <p role="status" className="py-4 text-sm text-muted-foreground">
                              All users on this page are selected.
                            </p>
                          ) : null}
                          {offset > 0 || results.hasMore ? (
                            <div className="flex items-center justify-between gap-2 pt-2">
                              <Button
                                variant="ghost"
                                disabled={saving || offset === 0}
                                onClick={() => {
                                  setOffset((value) => Math.max(0, value - 25));
                                  setLoading(true);
                                }}
                              >
                                Previous
                              </Button>
                              <span className="text-xs text-muted-foreground">
                                {offset + 1}–{offset + results.users.length} of {results.total}
                              </span>
                              <Button
                                variant="ghost"
                                disabled={saving || !results.hasMore}
                                onClick={() => {
                                  setOffset((value) => value + 25);
                                  setLoading(true);
                                }}
                              >
                                Next
                              </Button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
              {selected.length ? (
                <div role="group" aria-label="Selected users">
                  <p className="text-xs font-medium text-muted-foreground">Selected · {selected.length}</p>
                  {selected.map((user) => userOption(user, true))}
                </div>
              ) : null}
              {selected.length >= 100 ? (
                <p className="text-sm text-muted-foreground">Assign up to 100 users at a time.</p>
              ) : null}
              {saveError ? (
                <AlertBanner variant="error">
                  Could not confirm the assignment. Your selection is kept; retry safely.
                </AlertBanner>
              ) : null}
            </div>
            <AlertDialogFooter className="shrink-0 px-6 pt-2 pb-6 sm:px-7">
              <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
              <Button disabled={saving || !selected.length || disabled} loading={saving} onClick={assign}>
                {saving
                  ? "Assigning…"
                  : saveError
                    ? "Retry assignment"
                    : `Assign to ${selected.length} ${selected.length === 1 ? "user" : "users"}`}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TooltipProvider>
    </SectionCard>
  );
}
