import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_ACCESS,
  PERMISSION_CATALOG,
  SYSTEM_ROLES,
  assertCanDeleteRole,
  assertCanDeleteUser,
  assertCanDemoteUser,
  assertCanEditRole,
  assertCanSuspendUser,
  assertAccessPrerequisites,
  assertValidAccess,
  getMissingPermissionPrerequisite,
  hasPermission,
  mergeRoleAccess,
} from "../packages/authorization/src/index.ts";

const USER_DESCRIPTION =
  "Default role assigned to every account. Does not grant access to the Admin application.";
const ADMIN_DESCRIPTION =
  "Protected operational role for managing SmartTools, users, roles, templates, features, and audit history.";

function customRole(overrides = {}) {
  return {
    id: "template-editor",
    name: "Template editor",
    description: "Manages invoice templates.",
    access: { templates: { view: true, edit: true } },
    isSystem: false,
    ...overrides,
  };
}

function user(overrides = {}) {
  return {
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    image: null,
    status: "active",
    roles: ["user"],
    ...overrides,
  };
}

test("system roles match the protected user and admin contracts", () => {
  assert.deepEqual(SYSTEM_ROLES, [
    {
      id: "user",
      name: "User",
      description: USER_DESCRIPTION,
      access: {},
      isSystem: true,
    },
    {
      id: "admin",
      name: "Admin",
      description: ADMIN_DESCRIPTION,
      access: ADMIN_ACCESS,
      isSystem: true,
    },
  ]);
  assert.deepEqual(ADMIN_ACCESS, {
    admin: { enter: true },
    tools: { view: true, edit: true, toggle: true, archive: true },
    templates: {
      view: true,
      create: true,
      edit: true,
      publish: true,
      archive: true,
    },
    blog: { view: true, create: true, edit: true, publish: true, archive: true },
    features: { view: true, edit: true, toggle: true },
    users: { view: true, suspend: true, assignRoles: true },
    roles: { view: true, create: true, edit: true, delete: true },
    audit: { view: true },
  });
  assert.equal(Object.isFrozen(SYSTEM_ROLES), true);
  assert.equal(Object.isFrozen(ADMIN_ACCESS.templates), true);
});

test("system Admin uses current built-in grants even when stored grants predate Blog", () => {
  const legacyAccess = { ...ADMIN_ACCESS };
  delete legacyAccess.blog;
  const admin = customRole({ id: "admin", isSystem: true, access: legacyAccess });
  const access = mergeRoleAccess([admin]);
  assert.deepEqual(access, ADMIN_ACCESS);
  for (const action of Object.keys(PERMISSION_CATALOG.blog.actions)) {
    assert.equal(hasPermission(access, "blog", action), true);
  }
  assert.equal(
    hasPermission(
      mergeRoleAccess([customRole({ name: "Admin", access: legacyAccess })]),
      "blog",
      "view",
    ),
    false,
  );
  assert.equal(legacyAccess.blog, undefined, "stored grants are not mutated");
});

test("every supported permission has resource and action help text", () => {
  assert.deepEqual(Object.keys(PERMISSION_CATALOG), [
    "admin",
    "tools",
    "templates",
    "blog",
    "features",
    "users",
    "roles",
    "audit",
  ]);

  for (const resource of Object.values(PERMISSION_CATALOG)) {
    assert.ok(resource.description.trim());
    for (const action of Object.values(resource.actions)) {
      assert.ok(action.description.trim());
    }
  }
});

test("multiple roles combine only positive grants and missing grants deny", () => {
  const viewer = customRole({
    id: "viewer",
    access: { admin: { enter: true }, tools: { view: true, edit: false } },
  });
  const editor = customRole({
    id: "editor",
    access: { tools: { edit: true }, templates: { view: true } },
  });

  const access = mergeRoleAccess([viewer, editor]);

  assert.deepEqual(access, {
    admin: { enter: true },
    tools: { view: true, edit: true },
    templates: { view: true },
  });
  assert.equal(hasPermission(access, "tools", "view"), true);
  assert.equal(hasPermission(access, "tools", "archive"), false);
  assert.equal(hasPermission(access, "tools", "launch"), false);
  assert.equal(hasPermission(access, "missing", "view"), false);
  assert.equal(viewer.access.tools.edit, false);
});

test("access validation rejects malformed and unknown permissions", () => {
  assert.doesNotThrow(() => assertValidAccess({ tools: { view: true, edit: false } }));
  assert.throws(
    () => assertValidAccess({ billing: { view: true } }),
    /Unknown permission resource: billing/,
  );
  assert.throws(
    () => assertValidAccess({ tools: { launch: true } }),
    /Unknown permission: tools\.launch/,
  );
  assert.throws(
    () => assertValidAccess({ tools: { view: "yes" } }),
    /Permission tools\.view must be boolean/,
  );
  assert.throws(
    () => assertValidAccess({ tools: null }),
    /Permissions for tools must be an object/,
  );
  assert.throws(() => assertValidAccess(null), /Access must be an object/);
  assert.throws(
    () => mergeRoleAccess([customRole({ access: { tools: { launch: true } } })]),
    /Unknown permission: tools\.launch/,
  );
});

test("permission prerequisites apply to effective grants without silently granting access", () => {
  assert.deepEqual(getMissingPermissionPrerequisite({}, "tools", "edit"), {
    resource: "admin",
    action: "enter",
  });
  assert.deepEqual(getMissingPermissionPrerequisite({ admin: { enter: true } }, "tools", "edit"), {
    resource: "tools",
    action: "view",
  });
  assert.equal(getMissingPermissionPrerequisite({}, "admin", "enter"), null);
  for (const [resource, { actions }] of Object.entries(PERMISSION_CATALOG)) {
    for (const action of Object.keys(actions)) {
      assert.equal(hasPermission(ADMIN_ACCESS, resource, action), true);
      if (resource === "admin") continue;
      assert.equal(
        hasPermission({ [resource]: { view: true, [action]: true } }, resource, action),
        false,
      );
      if (action !== "view") {
        assert.equal(
          hasPermission(
            { admin: { enter: true }, [resource]: { [action]: true } },
            resource,
            action,
          ),
          false,
        );
      }
    }
  }
  assert.throws(
    () => assertAccessPrerequisites({ tools: { view: true } }),
    /tools.view requires admin.enter/,
  );
  assert.throws(
    () => assertAccessPrerequisites({ admin: { enter: true }, tools: { edit: true } }),
    /tools.edit requires tools.view/,
  );
  assert.throws(() => assertAccessPrerequisites({ tools: { view: "true" } }), /must be boolean/);
  assert.doesNotThrow(() => assertAccessPrerequisites({ tools: { edit: false } }));
  assert.doesNotThrow(() => assertAccessPrerequisites({}));
  assert.doesNotThrow(() => assertAccessPrerequisites(ADMIN_ACCESS));
  const fragments = [
    { access: { admin: { enter: true } } },
    { access: { tools: { view: true } } },
    { access: { tools: { edit: true } } },
  ];
  const combined = mergeRoleAccess(fragments);
  assert.doesNotThrow(() => assertAccessPrerequisites(combined));
  assert.equal(hasPermission(combined, "tools", "edit"), true);
  assert.equal(hasPermission(combined, "tools", "archive"), false);
  assert.deepEqual(fragments[2].access, { tools: { edit: true } });
});

test("protected roles cannot be edited or deleted and assigned custom roles cannot be deleted", () => {
  for (const id of ["user", "admin"]) {
    const protectedRole = customRole({ id, isSystem: false });
    assert.throws(() => assertCanEditRole(protectedRole), /protected/);
    assert.throws(() => assertCanDeleteRole(protectedRole, 0), /protected/);
  }

  const assignedRole = customRole();
  assert.doesNotThrow(() => assertCanEditRole(assignedRole));
  assert.throws(() => assertCanEditRole(customRole({ isSystem: true })), /protected/);
  assert.throws(() => assertCanDeleteRole(assignedRole, 1), /assigned to users/);
  assert.doesNotThrow(() => assertCanDeleteRole(assignedRole, 0));
});

test("the final active admin cannot be demoted, suspended, or deleted", () => {
  const finalAdmin = user({ roles: ["user", "admin"] });
  const counts = { adminCount: 1, activeAdminCount: 1 };

  assert.throws(() => assertCanDemoteUser(finalAdmin, counts), /final Admin/);
  assert.throws(() => assertCanSuspendUser(finalAdmin, counts), /final Admin/);
  assert.throws(() => assertCanDeleteUser(finalAdmin, counts), /final Admin/);

  const multipleAdmins = { adminCount: 2, activeAdminCount: 2 };
  assert.doesNotThrow(() => assertCanDemoteUser(finalAdmin, multipleAdmins));
  assert.doesNotThrow(() => assertCanSuspendUser(finalAdmin, multipleAdmins));
  assert.doesNotThrow(() => assertCanDeleteUser(finalAdmin, multipleAdmins));
  assert.doesNotThrow(() => assertCanDeleteUser(user(), counts));
});

test("an inactive backup admin does not permit removal of the final active admin", () => {
  const activeAdmin = user({ roles: ["admin"] });
  const counts = { adminCount: 2, activeAdminCount: 1 };

  assert.throws(() => assertCanDemoteUser(activeAdmin, counts), /final Admin/);
  assert.throws(() => assertCanSuspendUser(activeAdmin, counts), /final Admin/);
  assert.throws(() => assertCanDeleteUser(activeAdmin, counts), /final Admin/);
});

test("a suspended final admin remains protected from demotion and deletion", () => {
  const suspendedAdmin = user({ status: "suspended", roles: ["admin"] });
  const counts = { adminCount: 1, activeAdminCount: 0 };

  assert.throws(() => assertCanDemoteUser(suspendedAdmin, counts), /final Admin/);
  assert.doesNotThrow(() => assertCanSuspendUser(suspendedAdmin, counts));
  assert.throws(() => assertCanDeleteUser(suspendedAdmin, counts), /final Admin/);
});

test("invalid role and admin counts fail closed", () => {
  assert.throws(
    () => assertCanDeleteRole(customRole(), -1),
    /Assigned user count must be a non-negative integer/,
  );
  assert.throws(
    () =>
      assertCanSuspendUser(user({ roles: ["admin"] }), {
        adminCount: 1,
        activeAdminCount: Number.NaN,
      }),
    /Admin counts must be non-negative integers/,
  );
  assert.throws(
    () =>
      assertCanSuspendUser(user({ roles: ["admin"] }), {
        adminCount: 1,
        activeAdminCount: 2,
      }),
    /Admin counts must be non-negative integers/,
  );
});
