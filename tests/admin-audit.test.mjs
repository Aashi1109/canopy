import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { Activity, Import, KeyRound, UserRoundCog, UserX } from "lucide-react";
import { auditEventPresentation } from "../app/admin/(protected)/audit/eventPresentation.ts";

const root = new URL("../", import.meta.url);

test("admin audit history shows readable users without losing deleted-user events", async () => {
  const [data, page] = await Promise.all([
    readFile(new URL("lib/admin/data.ts", root), "utf8"),
    readFile(new URL("app/admin/(protected)/audit/page.tsx", root), "utf8"),
  ]);

  expect(data).toMatch(/\.leftJoin\(\s*auditActor,\s*eq\(auditActor\.id,\s*auditEventsTable\.actorUserId\),?\s*\)/s);
  expect(data).toMatch(
    /\.leftJoin\(\s*auditTargetUser,[\s\S]*eq\(auditEventsTable\.targetType,\s*["']user["']\)[\s\S]*eq\(auditTargetUser\.id,\s*auditEventsTable\.targetId\)/,
  );
  expect(data).toMatch(/actorName:\s*auditActor\.name/);
  expect(data).toMatch(/actorEmail:\s*auditActor\.email/);
  expect(data).toMatch(/targetUserName:\s*auditTargetUser\.name/);
  expect(data).toMatch(/targetUserEmail:\s*auditTargetUser\.email/);

  expect(page).toMatch(/event\.actorName\s*\?\?\s*["']Deleted user["']/);
  expect(page).toMatch(/event\.actorEmail\s*\?\?\s*event\.actorUserId/);
  expect(page).toMatch(/event\.targetType\s*===\s*["']user["']/);
  expect(page).toMatch(/event\.targetUserName\s*\?\?\s*["']Deleted user["']/);
  expect(page).toMatch(/event\.targetUserEmail\s*\?\?\s*event\.targetId/);
});

test("admin audit events have readable labels", () => {
  const expectedLabels = {
    "feature.edit": "Updated feature",
    "feature.toggle": "Toggled feature",
    "role.create": "Created role",
    "role.delete": "Deleted role",
    "role.edit": "Updated role",
    "template.archive": "Archived template",
    "template.create": "Created template",
    "template.duplicate": "Duplicated template",
    "template.edit": "Updated template",
    "template.import": "Imported template",
    "template.publish": "Published template",
    "template.set-default": "Set default template",
    "tool.archive": "Archived tool",
    "tool.edit": "Updated tool",
    "tool.reorder": "Reordered tools",
    "tool.toggle": "Toggled tool",
    "user.assign-roles": "Assigned roles",
    "user.promote_admin": "Promoted user to admin",
    "user.reactivate": "Reactivated user",
    "user.suspend": "Suspended user",
  };

  expect(
    Object.fromEntries(Object.keys(expectedLabels).map((action) => [action, auditEventPresentation(action).label])),
  ).toEqual(expectedLabels);
});

test("admin audit event icons communicate the event type", () => {
  expect(auditEventPresentation("user.assign-roles").icon).toBe(UserRoundCog);
  expect(auditEventPresentation("user.suspend").icon).toBe(UserX);
  expect(auditEventPresentation("role.edit").icon).toBe(KeyRound);
  expect(auditEventPresentation("template.import").icon).toBe(Import);
});

test("admin audit table renders the readable event treatment", async () => {
  const page = await readFile(new URL("app/admin/(protected)/audit/page.tsx", root), "utf8");

  expect(page).toMatch(/auditEventPresentation\(event\.action\)/);
  expect(page).toMatch(/<EventIcon aria-hidden=["']true["']/);
  expect(page).toMatch(/\{label\}/);
  expect(page).not.toMatch(/<StatusBadge/);
});

test("admin overview reuses the readable event treatment", async () => {
  const page = await readFile(new URL("app/admin/(protected)/page.tsx", root), "utf8");

  expect(page).toMatch(/auditEventPresentation\(event\.action\)/);
  expect(page).toMatch(/const \{ icon: Icon, label \}/);
  expect(page).not.toMatch(/function eventIcon/);
});

test("unknown audit actions still get a readable fallback", () => {
  expect(auditEventPresentation("billing.permission_revoked")).toEqual({
    icon: Activity,
    label: "Billing permission revoked",
  });
});
