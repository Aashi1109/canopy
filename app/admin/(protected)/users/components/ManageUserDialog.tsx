"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
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
  StatusBadge,
} from "@canopy/ui";
import { assignRolesAction, setUserStatusAction } from "../../../actions";

type User = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  status: "active" | "suspended";
  roles: string[];
};

type Role = { id: string; name: string; description: string | null };

export function ManageUserDialog({ user, roles, children }: { user: User; roles: Role[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState(user.roles);
  const [status, setStatus] = useState(user.status);
  const [pending, setPending] = useState<"roles" | "status" | null>(null);
  const [roleError, setRoleError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusError, setStatusError] = useState("");

  function changeOpen(next: boolean) {
    if (pending) return;
    if (next) {
      setSelectedRoles(user.roles);
      setStatus(user.status);
      setRoleError("");
      setStatusMessage("");
      setStatusError("");
    }
    setOpen(next);
  }

  async function saveRoles() {
    setPending("roles");
    setRoleError("");
    const data = new FormData();
    data.set("userId", user.id);
    // Serialize controlled state, not mounted accordion fields: closed panels
    // must not drop selected roles or the mandatory base role.
    for (const role of new Set([...selectedRoles, "user"])) data.append("roles", role);
    try {
      await assignRolesAction(data);
      setOpen(false);
    } catch {
      setRoleError("Roles could not be saved. Your selections are unchanged. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function changeStatus() {
    setPending("status");
    setStatusError("");
    setStatusMessage("");
    const next = status === "active" ? "suspended" : "active";
    const data = new FormData();
    data.set("userId", user.id);
    data.set("status", next);
    try {
      await setUserStatusAction(data);
      setStatus(next);
      setStatusMessage(
        next === "active"
          ? "Account reactivated. Role changes have not been saved."
          : "Account suspended and sessions revoked. Role changes have not been saved.",
      );
    } catch {
      setStatusError("Account access could not be changed. Try again. Your role selections are unchanged.");
    } finally {
      setPending(null);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`Manage ${user.name}`}
          className="grid h-auto w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-none px-5 py-3.5 text-left font-normal focus-visible:ring-inset md:grid-cols-[minmax(0,1fr)_220px_150px]"
          type="button"
          variant="ghost"
        >
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="inset-0 m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0 data-[size=default]:sm:max-w-[640px]">
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pb-4 pt-6">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Manage user</AlertDialogTitle>
            <AlertDialogDescription>Manage roles and account access separately.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel aria-label="Close manage user" disabled={pending !== null} size="icon" variant="ghost">
            <X aria-hidden="true" />
          </AlertDialogCancel>
        </div>
        <div className="min-h-0 overflow-y-auto px-6 pb-6">
          <div className="mb-3 flex items-center gap-3 rounded-lg bg-muted p-4">
            <Avatar className="size-9 shrink-0">
              {user.image ? <AvatarImage alt="" src={user.image} /> : null}
              <AvatarFallback>
                {user.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part.charAt(0))
                  .join("")
                  .toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium">{user.name}</p>
              <p className="break-all text-sm text-muted-foreground">{user.email}</p>
            </div>
            <StatusBadge variant={status === "active" ? "success" : "danger"}>
              {status === "active" ? "Active" : "Suspended"}
            </StatusBadge>
          </div>
          <Accordion type="multiple" defaultValue={["roles", "access"]}>
            <AccordionItem value="roles">
              <AccordionTrigger>Roles</AccordionTrigger>
              <AccordionContent>
                <p className="mb-3 text-sm text-muted-foreground">Select the roles this person should have.</p>
                <div className="divide-y divide-border">
                  {roles.map((role) => (
                    <div className="py-3" key={role.id}>
                      <Checkbox
                        checked={role.id === "user" || selectedRoles.includes(role.id)}
                        description={role.description ?? undefined}
                        disabled={role.id === "user" || pending !== null}
                        label={role.id === "user" ? `${role.name} · Required` : role.name}
                        onCheckedChange={(checked) =>
                          setSelectedRoles((current) =>
                            checked === true
                              ? [...new Set([...current, role.id])]
                              : current.filter((id) => id !== role.id),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="access">
              <AccordionTrigger>Account access</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                    {status === "active"
                      ? "Suspending blocks access and revokes sessions. It does not save role changes."
                      : "Reactivation restores access. It does not save role changes."}
                  </p>
                  <Button
                    className="shrink-0 self-end sm:self-auto"
                    disabled={pending !== null}
                    loading={pending === "status"}
                    onClick={changeStatus}
                    size="xs"
                    type="button"
                    variant={status === "active" ? "danger-subtle" : "secondary"}
                  >
                    {pending === "status"
                      ? "Updating…"
                      : status === "active"
                        ? "Suspend and revoke sessions"
                        : "Reactivate account"}
                  </Button>
                </div>
                {statusError ? <AlertBanner variant="error">{statusError}</AlertBanner> : null}
                {statusMessage ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {statusMessage}
                  </p>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        <form action={saveRoles} className="shrink-0 border-t border-border p-6">
          {roleError ? (
            <div className="mb-4">
              <AlertBanner variant="error">{roleError}</AlertBanner>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending !== null}>Cancel</AlertDialogCancel>
            <Button disabled={pending !== null} loading={pending === "roles"} type="submit">
              {pending === "roles" ? "Saving…" : "Save roles"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
