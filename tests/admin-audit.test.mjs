import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Activity, Import, KeyRound, UserRoundCog, UserX } from "lucide-react";
import { auditEventPresentation } from "../app/admin/(protected)/audit/eventPresentation.ts";

const root = new URL("../", import.meta.url);

test("admin audit history shows readable users without losing deleted-user events", async () => {
  const [data, page] = await Promise.all([
    readFile(new URL("lib/admin/data.ts", root), "utf8"),
    readFile(new URL("app/admin/(protected)/audit/page.tsx", root), "utf8"),
  ]);

  assert.match(data, /\.leftJoin\(\s*auditActor,\s*eq\(auditActor\.id,\s*auditEventsTable\.actorUserId\),?\s*\)/s);
  assert.match(
    data,
    /\.leftJoin\(\s*auditTargetUser,[\s\S]*eq\(auditEventsTable\.targetType,\s*["']user["']\)[\s\S]*eq\(auditTargetUser\.id,\s*auditEventsTable\.targetId\)/,
  );
  assert.match(data, /actorName:\s*auditActor\.name/);
  assert.match(data, /actorEmail:\s*auditActor\.email/);
  assert.match(data, /targetUserName:\s*auditTargetUser\.name/);
  assert.match(data, /targetUserEmail:\s*auditTargetUser\.email/);

  assert.match(page, /event\.actorName\s*\?\?\s*["']Deleted user["']/);
  assert.match(page, /event\.actorEmail\s*\?\?\s*event\.actorUserId/);
  assert.match(page, /event\.targetType\s*===\s*["']user["']/);
  assert.match(page, /event\.targetUserName\s*\?\?\s*["']Deleted user["']/);
  assert.match(page, /event\.targetUserEmail\s*\?\?\s*event\.targetId/);
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

  assert.deepEqual(
    Object.fromEntries(Object.keys(expectedLabels).map((action) => [action, auditEventPresentation(action).label])),
    expectedLabels,
  );
});

test("admin audit event icons communicate the event type", () => {
  assert.equal(auditEventPresentation("user.assign-roles").icon, UserRoundCog);
  assert.equal(auditEventPresentation("user.suspend").icon, UserX);
  assert.equal(auditEventPresentation("role.edit").icon, KeyRound);
  assert.equal(auditEventPresentation("template.import").icon, Import);
});

test("admin audit table renders the readable event treatment", async () => {
  const page = await readFile(new URL("app/admin/(protected)/audit/page.tsx", root), "utf8");

  assert.match(page, /auditEventPresentation\(event\.action\)/);
  assert.match(page, /<EventIcon aria-hidden=["']true["']/);
  assert.match(page, /\{label\}/);
  assert.doesNotMatch(page, /<StatusBadge/);
});

test("admin overview reuses the readable event treatment", async () => {
  const page = await readFile(new URL("app/admin/(protected)/page.tsx", root), "utf8");

  assert.match(page, /auditEventPresentation\(event\.action\)/);
  assert.match(page, /const \{ icon: Icon, label \}/);
  assert.doesNotMatch(page, /function eventIcon/);
});

test("unknown audit actions still get a readable fallback", () => {
  assert.deepEqual(auditEventPresentation("billing.permission_revoked"), {
    icon: Activity,
    label: "Billing permission revoked",
  });
});
