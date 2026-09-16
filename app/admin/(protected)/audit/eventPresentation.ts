import {
  Activity,
  Archive,
  BadgePlus,
  Copy,
  FilePenLine,
  FilePlus2,
  Import,
  KeyRound,
  ListOrdered,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  ToggleRight,
  Trash2,
  UserCheck,
  UserRoundCog,
  UserX,
  Wrench,
  type LucideIcon,
} from "lucide-react";

type AuditEventPresentation = {
  icon: LucideIcon;
  label: string;
};

const AUDIT_EVENT_PRESENTATIONS: Record<string, AuditEventPresentation> = {
  "feature.edit": { icon: SlidersHorizontal, label: "Updated feature" },
  "feature.toggle": { icon: ToggleRight, label: "Toggled feature" },
  "role.create": { icon: BadgePlus, label: "Created role" },
  "role.delete": { icon: Trash2, label: "Deleted role" },
  "role.edit": { icon: KeyRound, label: "Updated role" },
  "template.archive": { icon: Archive, label: "Archived template" },
  "template.create": { icon: FilePlus2, label: "Created template" },
  "template.duplicate": { icon: Copy, label: "Duplicated template" },
  "template.edit": { icon: FilePenLine, label: "Updated template" },
  "template.import": { icon: Import, label: "Imported template" },
  "template.publish": { icon: Send, label: "Published template" },
  "template.set-default": { icon: Star, label: "Set default template" },
  "tool.archive": { icon: Archive, label: "Archived tool" },
  "tool.edit": { icon: Wrench, label: "Updated tool" },
  "tool.reorder": { icon: ListOrdered, label: "Reordered tools" },
  "tool.toggle": { icon: ToggleRight, label: "Toggled tool" },
  "user.assign-roles": { icon: UserRoundCog, label: "Assigned roles" },
  "user.promote_admin": { icon: ShieldCheck, label: "Promoted user to admin" },
  "user.reactivate": { icon: UserCheck, label: "Reactivated user" },
  "user.suspend": { icon: UserX, label: "Suspended user" },
};

export function auditEventPresentation(action: string): AuditEventPresentation {
  const known = AUDIT_EVENT_PRESENTATIONS[action];
  if (known) return known;

  const readable = action
    .trim()
    .replace(/[._-]+/g, " ")
    .toLowerCase();
  return {
    icon: Activity,
    label: readable ? readable[0].toUpperCase() + readable.slice(1) : "Unknown event",
  };
}
