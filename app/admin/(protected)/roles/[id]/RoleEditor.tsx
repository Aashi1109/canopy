"use client";

import { AdminPageHeader } from "@/app/admin/(protected)/components/AdminPageHeader";
import { getMissingPermissionPrerequisite, PERMISSION_CATALOG, type Role } from "@/lib/authorization/index.ts";
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
  Muted,
  Button,
  Checkbox,
  FieldLegend,
  FieldSet,
  InlineTextEditor,
  SectionCard,
  SectionHeading,
  toast,
  Toaster,
  TooltipProvider,
} from "@/components/ui/index.tsx";
import { startTransition, useActionState, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { startCase } from "@/utils/strings";
import { deleteRoleAction, updateRoleAction } from "../../../actions";
import type { RoleUsersPage } from "@/lib/admin/data";
import RoleMembers from "./RoleMembers";

const PERMISSION_SECTIONS = Object.entries(PERMISSION_CATALOG).filter(([resource]) => resource !== "admin");

export default function RoleEditor({
  role,
  members,
  canAssign = false,
}: {
  role: Role;
  members?: RoleUsersPage;
  canAssign?: boolean;
}) {
  const [draft, setDraft] = useState<Role>(() => ({
    ...role,
    access: { ...role.access, admin: { enter: true } },
  }));
  const [saved, setSaved] = useState(draft);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saveState, saveAction, saving] = useActionState(
    async (_previous: { error: string | null } | null, formData: FormData) => {
      try {
        const result = await updateRoleAction(formData);
        if (result.role) {
          setDraft(result.role);
          setSaved(result.role);
          toast.success("Role saved.");
        }
        return result;
      } catch (error) {
        unstable_rethrow(error);
        return { error: "Unable to save the role. Please try again." };
      }
    },
    null,
  );
  const [deleteError, deleteAction, deleting] = useActionState(async (_previous: string | null, formData: FormData) => {
    try {
      const result = await deleteRoleAction(formData);
      return result.error;
    } catch (error) {
      unstable_rethrow(error);
      return "Unable to delete the role. Please try again.";
    }
  }, null);
  const busy = saving || deleting;
  const hasInvalidDetails =
    !draft.name.trim() || draft.name.length > 160 || !draft.description.trim() || draft.description.length > 2000;
  const isDirty =
    draft.name.trim() !== saved.name.trim() ||
    draft.description.trim() !== saved.description.trim() ||
    PERMISSION_SECTIONS.some(([resource, definition]) =>
      Object.keys(definition.actions).some(
        (action) => (draft.access[resource]?.[action] === true) !== (saved.access[resource]?.[action] === true),
      ),
    );
  const hasMissingPrerequisites = PERMISSION_SECTIONS.some(([resource, definition]) =>
    Object.keys(definition.actions).some(
      (action) =>
        draft.access[resource]?.[action] === true && getMissingPermissionPrerequisite(draft.access, resource, action),
    ),
  );

  function changePermission(resource: string, action: string, checked: boolean) {
    setDraft((current) => {
      if (checked && getMissingPermissionPrerequisite(current.access, resource, action)) {
        return current;
      }
      const access = {
        ...current.access,
        [resource]: { ...current.access[resource], [action]: checked },
      };
      if (!checked && action === "view") access[resource] = { view: false };
      return { ...current, access };
    });
  }

  return (
    <>
      <Toaster position="top-right" />
      <AdminPageHeader
        className="sm:items-center [&>div:first-child]:min-w-0 [&>div:first-child]:flex-1"
        actions={
          <>
            <Button
              disabled={!isDirty || busy || hasMissingPrerequisites || hasInvalidDetails}
              form="role-details"
              loading={saving}
              type="submit"
            >
              {saving ? "Saving…" : "Save role"}
            </Button>
            <AlertDialog
              open={deleteOpen}
              onOpenChange={(open) => {
                if (!deleting) setDeleteOpen(open);
              }}
            >
              <AlertDialogTrigger asChild>
                <Button disabled={busy} type="button" variant="destructive">
                  Delete role
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{saved.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes the role and cannot be undone. Assigned custom roles cannot be deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteError ? <AlertBanner variant="error">{deleteError}</AlertBanner> : null}
                <form action={deleteAction}>
                  <input name="roleId" type="hidden" value={role.id} />
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting} type="button">
                      Cancel
                    </AlertDialogCancel>
                    <Button disabled={deleting} loading={deleting} type="submit" variant="destructive">
                      {deleting ? "Deleting…" : "Delete role"}
                    </Button>
                  </AlertDialogFooter>
                </form>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
        description={
          <InlineTextEditor
            label="Role description"
            value={draft.description}
            onChange={(description) => setDraft((current) => ({ ...current, description }))}
            multiline
            required
            maxLength={2000}
            disabled={busy}
          />
        }
        title={
          <InlineTextEditor
            label="Role name"
            value={draft.name}
            onChange={(name) => setDraft((current) => ({ ...current, name }))}
            required
            maxLength={160}
            disabled={busy}
          />
        }
      />
      <SectionCard>
        <SectionHeading title="Permissions" />
        {hasMissingPrerequisites ? (
          <AlertBanner variant="error">
            Some selected permissions require their section’s View permission. Select View or clear those permissions
            before saving.
          </AlertBanner>
        ) : null}
        {saveState?.error ? <AlertBanner variant="error">{saveState.error}</AlertBanner> : null}
        <form
          className="grid gap-6"
          id="role-details"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isDirty || busy || hasMissingPrerequisites || hasInvalidDetails) return;
            // Form actions auto-reset Radix checkboxes to their initial values.
            const formData = new FormData(event.currentTarget);
            startTransition(() => saveAction(formData));
          }}
        >
          <fieldset disabled={busy} className="grid min-w-0 gap-6">
            <input name="roleId" type="hidden" value={role.id} />
            <input name="permission:admin:enter" type="hidden" value="on" />
            <input name="name" type="hidden" value={draft.name} />
            <input name="description" type="hidden" value={draft.description} />
            <TooltipProvider>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {PERMISSION_SECTIONS.map(([resource, definition]) => (
                  <FieldSet className="gap-0 rounded-lg border border-border bg-muted/40 p-4" key={resource}>
                    <FieldLegend className="mb-0 px-1 text-foreground">{startCase(resource)}</FieldLegend>
                    <Muted className="mb-4 text-muted-foreground">{definition.description}</Muted>
                    <div className="grid gap-3">
                      {Object.entries(definition.actions).map(([action, help]) => {
                        const missing = getMissingPermissionPrerequisite(draft.access, resource, action);
                        const checked = draft.access[resource]?.[action] === true;
                        return (
                          <Checkbox
                            checked={checked}
                            disabled={Boolean(missing) && !checked}
                            onCheckedChange={(value) => changePermission(resource, action, value === true)}
                            description={help.description}
                            key={action}
                            label={startCase(action)}
                            name={`permission:${resource}:${action}`}
                            tooltip={
                              missing
                                ? `Select ${startCase(missing.resource)} → ${startCase(missing.action)} first.`
                                : help.description
                            }
                          />
                        );
                      })}
                    </div>
                  </FieldSet>
                ))}
              </div>
            </TooltipProvider>
          </fieldset>
        </form>
      </SectionCard>
      {members ? (
        <RoleMembers
          roleId={role.id}
          roleName={saved.name}
          initial={members}
          canAssign={canAssign}
          disabled={isDirty || busy}
        />
      ) : null}
    </>
  );
}
