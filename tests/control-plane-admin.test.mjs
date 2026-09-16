import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";

import { ADMIN_ACCESS } from "../packages/authorization/src/index.ts";
import {
  auditEventsTable,
  authSession,
  authUser,
  db,
  featureOverridesTable,
  invoiceTemplatesTable,
  managedToolsTable,
  rolesTable,
  userRolesTable,
} from "../packages/database/src/index.ts";
import {
  createAdvancedTemplateConfig,
  seedTemplates,
} from "../packages/invoice-templates/src/index.ts";
import {
  archiveInvoiceTemplate,
  assignUserRoles,
  assignRoleToUsers,
  createAdvancedDocumentTemplate,
  createCustomRole,
  createInvoiceTemplate,
  deleteCustomRole,
  duplicateInvoiceTemplate,
  importInvoiceTemplate,
  publishInvoiceTemplate,
  redactAuditMetadata,
  reorderManagedTools,
  setDefaultInvoiceTemplate,
  setFeatureEnabled,
  setManagedToolArchived,
  setManagedToolEnabled,
  setUserStatus,
  updateAndPublishInvoiceTemplate,
  updateCustomRole,
  updateFeature,
  updateInvoiceTemplate,
  updateManagedTool,
} from "../lib/admin/adminMutations.ts";

function permissionRows(access) {
  return [
    {
      status: "active",
      roleId: "test-role",
      roleName: "Test role",
      roleDescription: "Test permissions.",
      roleAccess: {
        ...Object.fromEntries(
          Object.entries(access).map(([resource, actions]) => [
            resource,
            resource === "admin" ? actions : { view: true, ...actions },
          ]),
        ),
        admin: { enter: true, ...access.admin },
      },
      roleIsSystem: false,
    },
  ];
}

/**
 * The stored roster for one app. Reordering enumerates `managed_tools`, never a
 * bundled list, so the rows the transaction reads are what defines "complete".
 */
function toolRoster(toolIds, app) {
  return toolIds.map((toolId, order) => ({
    toolId,
    app,
    slug: toolId.split(".")[1],
    name: toolId,
    description: `Stored ${toolId}.`,
    order,
    enabled: true,
    archived: false,
  }));
}

function createFakeTransaction(selectResults) {
  const state = { inserts: [], updates: [], deletes: [] };

  function select() {
    const result = selectResults.shift();
    const chain = {
      from: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: () => chain,
      for: () => chain,
      then: (resolve, reject) =>
        result === undefined
          ? Promise.reject(new Error("Unexpected database read")).then(resolve, reject)
          : Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  }

  function mutation(kind, table, values) {
    const entry = { table, values };
    state[kind].push(entry);
    const rows = Array.isArray(values) ? values : [values];
    const chain = {
      values(nextValues) {
        entry.values = nextValues;
        return mutationChain(kind, entry, nextValues);
      },
      set(nextValues) {
        entry.values = nextValues;
        return mutationChain(kind, entry, nextValues);
      },
      where: () => chain,
      returning: () => Promise.resolve(rows),
      then: (resolve, reject) => Promise.resolve([]).then(resolve, reject),
    };
    return chain;
  }

  function mutationChain(kind, entry, values) {
    const rows = Array.isArray(values) ? values : [values];
    const chain = {
      onConflictDoNothing: () => chain,
      onConflictDoUpdate: () => chain,
      where: () => chain,
      returning: () => Promise.resolve(rows),
      then: (resolve, reject) => Promise.resolve([]).then(resolve, reject),
    };
    return chain;
  }

  return {
    state,
    transaction: {
      select,
      insert: (table) => mutation("inserts", table),
      update: (table) => mutation("updates", table),
      delete: (table) => mutation("deletes", table),
    },
  };
}

async function withFakeDatabase(selectResults, callback) {
  const originalTransaction = db.transaction;
  const fake = createFakeTransaction([...selectResults]);
  db.transaction = async (operation) => operation(fake.transaction);
  try {
    return await callback(fake.state);
  } finally {
    db.transaction = originalTransaction;
  }
}

test("catalog and role caches invalidate only after successful commits", async (t) => {
  const variables = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
  const previous = variables.map((key) => process.env[key]);
  t.after(() =>
    variables.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    }),
  );
  process.env.UPSTASH_REDIS_REST_URL = "https://cache.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  let committed = false;
  const invalidated = [];
  t.mock.method(axios, "post", async (_url, command) => {
    assert.equal(committed, true, "Redis must not be called before commit");
    assert.equal(command[0], "DEL");
    invalidated.push(command[1]);
    return { data: { result: 1 } };
  });
  const tool = toolRoster(["devtools.stored-tool"], "devtools")[0];
  for (const [key, reads, operation] of [
    [
      "catalog:all",
      [permissionRows(ADMIN_ACCESS), [tool]],
      () => setManagedToolEnabled("actor", tool.toolId, false),
    ],
    [
      "roles:all",
      [permissionRows(ADMIN_ACCESS)],
      () => createCustomRole("actor", { name: "Editor", description: "Edits tools." }),
    ],
  ]) {
    for (const rollback of [false, true]) {
      committed = false;
      const before = invalidated.length;
      await withFakeDatabase(reads, async () => {
        const transaction = db.transaction;
        db.transaction = async (callback) => {
          const result = await transaction(callback);
          assert.equal(invalidated.length, before);
          if (rollback) throw new Error("Commit failed");
          committed = true;
          return result;
        };
        if (rollback) await assert.rejects(operation, /Commit failed/);
        else await operation();
      });
      assert.equal(invalidated.length, before + (rollback ? 0 : 1));
      if (!rollback) assert.equal(invalidated.at(-1), key);
    }
  }
});

test("bulk role assignment adds only the requested role, preserves status and is idempotent", async () => {
  const role = {
    id: "reviewer",
    isSystem: false,
    access: { admin: { enter: true }, tools: { view: true } },
  };
  await withFakeDatabase(
    [
      permissionRows(ADMIN_ACCESS),
      permissionRows(ADMIN_ACCESS),
      [{ id: "a", status: "suspended" }],
      [{ id: "b", status: "active" }],
      [role],
      [{ roleId: "user" }, { roleId: "editor" }],
      [{ roleId: "user" }, { roleId: "reviewer" }],
    ],
    async (state) => {
      await assignRoleToUsers("actor", "reviewer", ["b", "a", "a"]);
      assert.deepEqual(
        state.inserts
          .filter((entry) => entry.table === userRolesTable)
          .map((entry) => entry.values),
        [{ userId: "a", roleId: "reviewer" }],
      );
      assert.equal(state.deletes.length, 0);
      assert.equal(state.updates.length, 0);
      assert.equal(state.inserts.filter((entry) => entry.table === auditEventsTable).length, 1);
    },
  );
});

test("bulk assignment rejects invalid selections, missing users and system roles", async () => {
  await assert.rejects(() => assignRoleToUsers("actor", "reviewer", []), /Select/);
  await assert.rejects(() => assignRoleToUsers("actor", "reviewer", Array(101).fill("a")), /100/);
  await withFakeDatabase(
    [permissionRows(ADMIN_ACCESS), permissionRows(ADMIN_ACCESS), []],
    async (state) => {
      await assert.rejects(() => assignRoleToUsers("actor", "reviewer", ["missing"]), /not found/i);
      assert.equal(state.inserts.length, 0);
    },
  );
  await withFakeDatabase(
    [
      permissionRows(ADMIN_ACCESS),
      permissionRows(ADMIN_ACCESS),
      [{ id: "a", status: "active" }],
      [{ id: "admin", isSystem: true, access: ADMIN_ACCESS }],
    ],
    async (state) => {
      await assert.rejects(() => assignRoleToUsers("actor", "admin", ["a"]), /custom role/i);
      assert.equal(state.inserts.length, 0);
    },
  );
});

test("bulk role assignment requires role viewing and user assignment permissions", async () => {
  for (const reads of [[permissionRows({})], [permissionRows(ADMIN_ACCESS), permissionRows({})]]) {
    await withFakeDatabase(reads, async (state) => {
      await assert.rejects(() => assignRoleToUsers("actor", "reviewer", ["a"]));
      assert.equal(state.inserts.length, 0);
    });
  }
});

function accessWithout(resource, action) {
  const access = structuredClone(ADMIN_ACCESS);
  delete access[resource][action];
  return access;
}

function templateContent(overrides = {}) {
  const template = seedTemplates[0];
  return {
    name: template.name,
    slug: `test-${template.slug}`,
    description: template.description,
    category: template.category,
    layoutFamily: template.layoutFamily,
    config: structuredClone(template.config),
    ...overrides,
  };
}

function templateRow(overrides = {}) {
  const template = seedTemplates[0];
  return {
    id: template.id,
    name: template.name,
    slug: template.slug,
    description: template.description,
    category: template.category,
    status: template.status,
    isDefault: template.isDefault,
    version: template.version,
    documentType: template.documentType,
    layoutFamily: template.layoutFamily,
    config: structuredClone(template.config),
    isPremium: false,
    requiredPlan: "free",
    createdAt: new Date(template.createdAt),
    updatedAt: new Date(template.updatedAt),
    ...overrides,
  };
}

function advancedTemplateInput(overrides = {}) {
  return {
    name: "Advanced invoice",
    slug: "advanced-invoice",
    description: "A freely editable PDF template.",
    category: "professional",
    documentType: "invoice",
    pageFormat: "A4",
    ...overrides,
  };
}

function advancedTemplateRow(overrides = {}) {
  return {
    ...templateRow(),
    id: "advanced-template",
    name: "Advanced invoice",
    slug: "advanced-invoice",
    description: "A freely editable PDF template.",
    status: "draft",
    isDefault: false,
    documentType: "invoice",
    layoutFamily: "advanced",
    config: createAdvancedTemplateConfig("invoice", "A4"),
    ...overrides,
  };
}

test("every privileged mutation checks its exact PostgreSQL permission", async () => {
  const featureManifest = [
    {
      app: "paperwork",
      key: "new-editor",
      defaultName: "New editor",
      defaultDescription: "Controls the new editor.",
    },
  ];
  const cases = [
    ["tools.edit", () => updateManagedTool("actor", "paperwork.invoice-generator", {})],
    ["tools.edit", () => reorderManagedTools("actor", "paperwork", [])],
    ["tools.toggle", () => setManagedToolEnabled("actor", "paperwork.invoice-generator", true)],
    ["tools.archive", () => setManagedToolArchived("actor", "paperwork.invoice-generator", true)],
    ["features.edit", () => updateFeature("actor", "paperwork", "new-editor", {}, featureManifest)],
    [
      "features.toggle",
      () => setFeatureEnabled("actor", "paperwork", "new-editor", true, featureManifest),
    ],
    ["users.assignRoles", () => assignUserRoles("actor", "target", ["user"])],
    ["users.suspend", () => setUserStatus("actor", "target", "suspended")],
    [
      "roles.create",
      () => createCustomRole("actor", { name: "Editor", description: "Edits templates." }),
    ],
    ["roles.edit", () => updateCustomRole("actor", "role", {})],
    ["roles.delete", () => deleteCustomRole("actor", "role")],
    ["templates.create", () => createInvoiceTemplate("actor", {})],
    ["templates.create", () => createAdvancedDocumentTemplate("actor", {})],
    [
      "templates.create",
      () => duplicateInvoiceTemplate("actor", "template", { name: "Copy", slug: "copy" }),
    ],
    ["templates.create", () => importInvoiceTemplate("actor", {})],
    ["templates.edit", () => updateInvoiceTemplate("actor", "template", {})],
    ["templates.publish", () => publishInvoiceTemplate("actor", "template")],
    ["templates.archive", () => archiveInvoiceTemplate("actor", "template")],
    ["templates.publish", () => setDefaultInvoiceTemplate("actor", "template")],
  ];

  for (const [permission, invoke] of cases) {
    const [resource, action] = permission.split(".");
    await withFakeDatabase([permissionRows(accessWithout(resource, action))], async (state) => {
      await assert.rejects(
        invoke,
        new RegExp(`Missing permission: ${permission.replace(".", "\\.")}`),
      );
      assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
    });
  }
});

test("audit metadata recursively redacts authentication material", () => {
  assert.deepEqual(
    redactAuditMetadata({
      changed: ["name", "accessToken"],
      password: "hunter2",
      nested: {
        refreshToken: "token-value",
        cookie_header: "session=secret",
        oauthProvider: "google",
        safe: true,
      },
    }),
    {
      changed: ["name", "accessToken"],
      password: "[REDACTED]",
      nested: {
        refreshToken: "[REDACTED]",
        cookie_header: "[REDACTED]",
        oauthProvider: "google",
        safe: true,
      },
    },
  );
});

test("tool setup validates and stores a code-owned slug with its audit event", async () => {
  // A setup-required row: seeded (or created by an admin) with no route yet.
  const setupRequired = {
    toolId: "devtools.json-formatter",
    app: "devtools",
    slug: null,
    name: "JSON Formatter",
    description: "Format JSON.",
    order: 0,
    enabled: false,
    archived: false,
  };

  await withFakeDatabase(
    [permissionRows({ tools: { edit: true } }), [setupRequired], []],
    async (state) => {
      await updateManagedTool("actor", "devtools.json-formatter", {
        slug: "json-formatter",
        name: "JSON Formatter",
        description: "Format and validate JSON.",
      });

      const toolWrite = state.inserts.find(({ table }) => table === managedToolsTable);
      const auditWrite = state.inserts.find(({ table }) => table === auditEventsTable);
      assert.equal(toolWrite.values.app, "devtools");
      assert.equal(toolWrite.values.slug, "json-formatter");
      assert.equal(auditWrite.values.action, "tool.edit");
      assert.equal(auditWrite.values.actorUserId, "actor");
    },
  );
});

test("tool reordering stores one contiguous app order and one audit event", async () => {
  const toolIds = [
    "paperwork.receipt-generator",
    "paperwork.invoice-generator",
    "paperwork.expense-report",
    "paperwork.mileage-log",
    "paperwork.quarterly-tax-estimator",
    "paperwork.w9-request",
    "paperwork.1099-nec-tracker",
  ];

  await withFakeDatabase(
    [permissionRows({ tools: { edit: true } }), toolRoster(toolIds, "paperwork")],
    async (state) => {
      await reorderManagedTools("actor", "paperwork", toolIds);

      assert.deepEqual(
        toolIds.map(
          (toolId) =>
            state.inserts.find(
              ({ table, values }) => table === managedToolsTable && values.toolId === toolId,
            ).values.order,
        ),
        toolIds.map((_, order) => order),
      );
      const auditWrite = state.inserts.find(({ table }) => table === auditEventsTable);
      assert.equal(auditWrite.values.action, "tool.reorder");
      assert.equal(auditWrite.values.targetId, "paperwork");
    },
  );
});

test("tool reordering accepts a complete app roster in reverse", async () => {
  const roster = toolRoster(
    Array.from({ length: 30 }, (_, index) => `media.stored-tool-${index}`),
    "media",
  );
  const toolIds = roster.map((tool) => tool.toolId).reverse();

  await withFakeDatabase([permissionRows({ tools: { edit: true } }), roster], async (state) => {
    await reorderManagedTools("actor", "media", toolIds);

    assert.ok(toolIds.length > 0, "the roster must not be empty");
    assert.deepEqual(
      toolIds.map(
        (toolId) =>
          state.inserts.find(
            ({ table, values }) => table === managedToolsTable && values.toolId === toolId,
          ).values.order,
      ),
      toolIds.map((_, order) => order),
    );
  });
});

test("tool reordering rejects incomplete, duplicate, and cross-app orders", async () => {
  const invalidOrders = [
    [],
    [
      "paperwork.invoice-generator",
      "paperwork.invoice-generator",
      "paperwork.expense-report",
      "paperwork.mileage-log",
      "paperwork.quarterly-tax-estimator",
      "paperwork.w9-request",
      "paperwork.1099-nec-tracker",
    ],
    [
      "paperwork.invoice-generator",
      "paperwork.receipt-generator",
      "paperwork.expense-report",
      "paperwork.mileage-log",
      "paperwork.quarterly-tax-estimator",
      "paperwork.w9-request",
      "devtools.json-formatter",
    ],
  ];

  const paperworkRoster = toolRoster(
    [
      "paperwork.invoice-generator",
      "paperwork.receipt-generator",
      "paperwork.expense-report",
      "paperwork.mileage-log",
      "paperwork.quarterly-tax-estimator",
      "paperwork.w9-request",
      "paperwork.1099-nec-tracker",
    ],
    "paperwork",
  );

  for (const toolIds of invalidOrders) {
    await withFakeDatabase(
      [permissionRows({ tools: { edit: true } }), paperworkRoster],
      async (state) => {
        await assert.rejects(
          () => reorderManagedTools("actor", "paperwork", toolIds),
          /every registered paperwork tool exactly once/,
        );
        assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
      },
    );
  }
});

test("a saved tool slug is immutable and failed changes are not audited", async () => {
  const stored = {
    toolId: "devtools.json-formatter",
    app: "devtools",
    slug: "json-formatter",
    name: "JSON Formatter",
    description: "Format JSON.",
    order: 0,
    enabled: true,
    archived: false,
  };

  await withFakeDatabase([permissionRows({ tools: { edit: true } }), [stored]], async (state) => {
    await assert.rejects(
      () =>
        updateManagedTool("actor", stored.toolId, {
          slug: "json-prettifier",
        }),
      /slug is immutable/,
    );
    assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
  });
});

test("stored tools toggle, and archiving disables them", async () => {
  const stored = {
    toolId: "devtools.json-formatter",
    app: "devtools",
    slug: "json-formatter",
    name: "JSON Formatter",
    description: "Format JSON.",
    order: 0,
    enabled: true,
    archived: false,
  };
  await withFakeDatabase(
    [permissionRows({ tools: { toggle: true } }), [{ ...stored, enabled: false }]],
    async (state) => {
      await setManagedToolEnabled("actor", stored.toolId, true);
      const write = state.inserts.find(({ table }) => table === managedToolsTable);
      assert.equal(write.values.slug, stored.slug);
      assert.equal(write.values.enabled, true);
    },
  );

  await withFakeDatabase(
    [permissionRows({ tools: { archive: true } }), [stored]],
    async (state) => {
      await setManagedToolArchived("actor", stored.toolId, true);
      const write = state.inserts.find(({ table }) => table === managedToolsTable);
      assert.equal(write.values.archived, true);
      assert.equal(write.values.enabled, false);
      assert.equal(
        state.inserts.find(({ table }) => table === auditEventsTable).values.action,
        "tool.archive",
      );
    },
  );

  await withFakeDatabase(
    [permissionRows({ tools: { toggle: true } }), [{ ...stored, archived: true }]],
    async (state) => {
      await assert.rejects(
        () => setManagedToolEnabled("actor", stored.toolId, true),
        /archived tool cannot be enabled/,
      );
      assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
    },
  );

  await withFakeDatabase([permissionRows({ tools: { toggle: true } }), [stored]], async (state) => {
    await setManagedToolEnabled("actor", stored.toolId, false);
    assert.equal(
      state.inserts.find(({ table }) => table === managedToolsTable).values.enabled,
      false,
    );
  });
});

test("tool edits reject unknown tools, invalid slugs, and blank text", async () => {
  // With the row as the only registry, a tool id nobody stored simply does not
  // exist — there is no bundled entry left for it to fall back to.
  const storedRows = [
    {
      toolId: "devtools.json-formatter",
      app: "devtools",
      slug: "json-formatter",
      name: "JSON Formatter",
      description: "Format JSON.",
      order: 0,
      enabled: true,
      archived: false,
    },
  ];
  const cases = [
    [[], { name: "Valid" }, /Unknown tool/],
    [storedRows, { slug: "Admin" }, /slug is invalid or reserved/],
    [storedRows, { name: " " }, /Tool name is required/],
  ];
  for (const [storedRows, input, error] of cases) {
    await withFakeDatabase(
      [permissionRows({ tools: { edit: true } }), storedRows],
      async (state) => {
        await assert.rejects(
          () => updateManagedTool("actor", "devtools.json-formatter", input),
          error,
        );
        assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
      },
    );
  }
});

test("unregistered feature keys cannot create overrides", async () => {
  await withFakeDatabase([permissionRows({ features: { edit: true } })], async (state) => {
    await assert.rejects(
      () => updateFeature("actor", "paperwork", "unknown", {}, []),
      /Unknown feature/,
    );
    assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
  });
});

test("registered features default disabled and preserve metadata when toggled", async () => {
  const manifest = [
    {
      app: "paperwork",
      key: "new-editor",
      defaultName: "New editor",
      defaultDescription: "Controls the new editor.",
    },
  ];
  await withFakeDatabase([permissionRows({ features: { edit: true } }), []], async (state) => {
    await updateFeature("actor", "paperwork", "new-editor", { name: "Invoice editor" }, manifest);
    const write = state.inserts.find(({ table }) => table === featureOverridesTable);
    assert.equal(write.values.name, "Invoice editor");
    assert.equal(write.values.description, "Controls the new editor.");
    assert.equal(write.values.enabled, false);
  });

  await withFakeDatabase(
    [
      permissionRows({ features: { toggle: true } }),
      [
        {
          app: "paperwork",
          key: "new-editor",
          name: "Invoice editor",
          description: "Controls the new editor.",
          enabled: false,
        },
      ],
    ],
    async (state) => {
      await setFeatureEnabled("actor", "paperwork", "new-editor", true, manifest);
      const write = state.inserts.find(({ table }) => table === featureOverridesTable);
      assert.equal(write.values.name, "Invoice editor");
      assert.equal(write.values.enabled, true);
    },
  );
});

test("suspension protects the final admin and retains identity while auditing the status change", async () => {
  const target = {
    id: "target",
    name: "Target",
    email: "target@example.com",
    image: null,
    status: "active",
  };

  await withFakeDatabase(
    [
      permissionRows({ users: { suspend: true } }),
      [target],
      [{ roleId: "admin" }],
      [{ userId: "target", status: "active" }],
    ],
    async (state) => {
      await assert.rejects(() => setUserStatus("actor", "target", "suspended"), /final Admin/);
      assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
    },
  );

  await withFakeDatabase(
    [permissionRows({ users: { suspend: true } }), [target], [{ roleId: "user" }]],
    async (state) => {
      await setUserStatus("actor", "target", "suspended");
      assert.equal(
        state.updates.find(({ table }) => table === authUser).values.status,
        "suspended",
      );
      assert.equal(
        state.deletes.some(({ table }) => table === authSession),
        false,
      );
      assert.equal(
        state.inserts.find(({ table }) => table === auditEventsTable).values.action,
        "user.suspend",
      );
    },
  );
});

test("role assignment keeps the default user role and protects the final admin", async () => {
  const target = {
    id: "target",
    name: "Target",
    email: "target@example.com",
    image: null,
    status: "active",
  };
  await withFakeDatabase(
    [
      permissionRows({ users: { assignRoles: true } }),
      [target],
      [{ roleId: "user" }],
      [
        { id: "user", access: {} },
        { id: "editor", access: { admin: { enter: true }, templates: { view: true, edit: true } } },
      ],
    ],
    async (state) => {
      assert.deepEqual(await assignUserRoles("actor", "target", ["editor", "editor"]), [
        "user",
        "editor",
      ]);
      assert.deepEqual(state.inserts.find(({ table }) => table === userRolesTable).values, [
        { userId: "target", roleId: "editor" },
      ]);
      assert.equal(
        state.deletes.some(({ table }) => table === userRolesTable),
        false,
      );
    },
  );

  await withFakeDatabase(
    [
      permissionRows({ users: { assignRoles: true } }),
      [target],
      [{ roleId: "user" }, { roleId: "admin" }],
      [{ id: "user", access: {} }],
      [{ userId: "target", status: "active" }],
    ],
    async (state) => {
      await assert.rejects(() => assignUserRoles("actor", "target", ["user"]), /final Admin/);
      assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
    },
  );

  await withFakeDatabase(
    [
      permissionRows({ users: { assignRoles: true } }),
      [target],
      [{ roleId: "user" }],
      [{ id: "user", access: {} }],
    ],
    async (state) => {
      assert.deepEqual(await assignUserRoles("actor", "target", ["user"]), ["user"]);
      assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
    },
  );

  await withFakeDatabase(
    [
      permissionRows({ users: { assignRoles: true } }),
      [target],
      [{ roleId: "user" }],
      [{ id: "user", access: {} }],
    ],
    async (state) => {
      await assert.rejects(
        () => assignUserRoles("actor", "target", ["missing"]),
        /roles do not exist/,
      );
      assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
    },
  );

  await withFakeDatabase(
    [
      permissionRows({ users: { assignRoles: true } }),
      [target],
      [{ roleId: "user" }, { roleId: "editor" }],
      [{ id: "user", access: {} }],
    ],
    async (state) => {
      await assignUserRoles("actor", "target", ["user"]);
      assert.ok(state.deletes.some(({ table }) => table === userRolesTable));
      assert.equal(
        state.inserts.some(({ table }) => table === userRolesTable),
        false,
      );
    },
  );
});

test("inactive actors and invalid user statuses fail before mutation", async () => {
  await withFakeDatabase([[]], async (state) => {
    await assert.rejects(
      () => createCustomRole("actor", { name: "Role", description: "Role." }),
      /Access denied/,
    );
    assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
  });

  await withFakeDatabase([permissionRows({ users: { suspend: true } })], async (state) => {
    await assert.rejects(
      () => setUserStatus("actor", "target", "deleted"),
      /must be active or suspended/,
    );
    assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
  });
});

test("role assignment validates prerequisites across the combined selected roles before writing", async () => {
  const target = {
    id: "target",
    name: "Target",
    email: "target@example.com",
    image: null,
    status: "active",
  };
  const entry = { id: "entry", access: { admin: { enter: true } } };
  const viewer = { id: "viewer", access: { tools: { view: true } } };
  const editor = { id: "editor", access: { tools: { edit: true } } };
  for (const [selected, error] of [
    [[editor], /requires admin.enter/],
    [[entry, editor], /requires tools.view/],
    [[entry, viewer, editor], null],
    [[], null],
  ]) {
    const requested = selected.map(({ id }) => id);
    await withFakeDatabase(
      [
        permissionRows({ users: { assignRoles: true } }),
        [target],
        [{ roleId: "user" }],
        [{ id: "user", access: {} }, ...selected],
      ],
      async (state) => {
        if (error) {
          await assert.rejects(() => assignUserRoles("actor", target.id, requested), error);
          assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
        } else {
          assert.deepEqual(await assignUserRoles("actor", target.id, requested), [
            "user",
            ...requested,
          ]);
          if (requested.length) {
            assert.deepEqual(
              state.inserts.find(({ table }) => table === userRolesTable).values,
              requested.map((roleId) => ({ userId: target.id, roleId })),
            );
            assert.ok(state.inserts.some(({ table }) => table === auditEventsTable));
          } else {
            assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
          }
        }
      },
    );
  }
});

test("role saves and direct mutations reject missing prerequisites before writing", async () => {
  const role = {
    id: "editor",
    name: "Editor",
    description: "Edits tools.",
    access: {},
    isSystem: false,
  };
  for (const access of [
    { tools: { edit: true } },
    { admin: { enter: true }, tools: { edit: true } },
  ]) {
    await withFakeDatabase([permissionRows({ roles: { edit: true } }), [role]], async (state) => {
      await assert.rejects(() => updateCustomRole("actor", role.id, { access }), /requires/);
      assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
    });
  }
  for (const access of [
    { admin: { enter: false }, roles: { view: true, edit: true } },
    { roles: { view: false, edit: true } },
  ]) {
    await withFakeDatabase([permissionRows(access)], async (state) => {
      await assert.rejects(
        () => updateCustomRole("actor", role.id, { name: "New name" }),
        /Missing permission/,
      );
      assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
    });
  }
});

test("custom roles start with admin entry only and assigned roles cannot be deleted", async () => {
  await withFakeDatabase([permissionRows({ roles: { create: true } })], async (state) => {
    await createCustomRole("actor", {
      name: "Template editor",
      description: "Edits invoice templates.",
    });
    const roleWrite = state.inserts.find(({ table }) => table === rolesTable);
    assert.deepEqual(roleWrite.values.access, { admin: { enter: true } });
    assert.equal(roleWrite.values.isSystem, false);
    assert.ok(state.inserts.some(({ table }) => table === auditEventsTable));
  });

  await withFakeDatabase(
    [
      permissionRows({ roles: { delete: true } }),
      [
        {
          id: "editor",
          name: "Editor",
          description: "Edits templates.",
          access: {},
          isSystem: false,
        },
      ],
      [{ userId: "target" }],
    ],
    async (state) => {
      await assert.rejects(() => deleteCustomRole("actor", "editor"), /assigned to users/);
      assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
    },
  );
});

test("custom role saves retain admin entry while accepting only valid entity grants", async () => {
  const role = {
    id: "editor",
    name: "Editor",
    description: "Edits tools.",
    access: { tools: { view: true, edit: true } },
    isSystem: false,
  };
  for (const input of [
    { access: {} },
    { access: { admin: { enter: false } } },
    { name: "Renamed" },
    { access: { tools: { view: true } } },
  ]) {
    await withFakeDatabase([permissionRows({ roles: { edit: true } }), [role]], async (state) => {
      const saved = await updateCustomRole("actor", role.id, input);
      assert.deepEqual(saved.access, {
        ...(input.access ?? role.access),
        admin: { enter: true },
      });
      assert.deepEqual(
        state.updates.find(({ table }) => table === rolesTable).values.access,
        saved.access,
      );
      assert.ok(
        state.inserts
          .find(({ table }) => table === auditEventsTable)
          .values.metadata.changes.includes("access"),
      );
    });
  }
  for (const access of [
    null,
    [],
    { admin: null },
    { admin: { enter: "yes" } },
    { admin: { unknown: true } },
  ]) {
    await withFakeDatabase([permissionRows({ roles: { edit: true } }), [role]], async (state) => {
      await assert.rejects(
        () => updateCustomRole("actor", role.id, { access }),
        /object|boolean|Unknown permission/,
      );
      assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
    });
  }
  for (const protectedRole of [
    { ...role, id: "admin", access: ADMIN_ACCESS },
    { ...role, id: "user" },
    { ...role, isSystem: true },
  ]) {
    await withFakeDatabase(
      [permissionRows({ roles: { edit: true } }), [protectedRole]],
      async (state) => {
        await assert.rejects(
          () => updateCustomRole("actor", protectedRole.id, { access: {} }),
          /System roles are protected/,
        );
        assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
      },
    );
  }
});

test("custom role edits validate access and unassigned custom roles can be deleted", async () => {
  const role = {
    id: "editor",
    name: "Editor",
    description: "Edits templates.",
    access: {},
    isSystem: false,
  };
  await withFakeDatabase([permissionRows({ roles: { edit: true } }), [role]], async (state) => {
    await updateCustomRole("actor", role.id, {
      description: "Edits and publishes templates.",
      access: { admin: { enter: true }, templates: { view: true, edit: true, publish: true } },
    });
    const write = state.updates.find(({ table }) => table === rolesTable);
    assert.deepEqual(write.values.access, {
      admin: { enter: true },
      templates: { view: true, edit: true, publish: true },
    });
    assert.ok(state.inserts.some(({ table }) => table === auditEventsTable));
  });

  await withFakeDatabase(
    [permissionRows({ roles: { delete: true } }), [role], []],
    async (state) => {
      await deleteCustomRole("actor", role.id);
      assert.ok(state.deletes.some(({ table }) => table === rolesTable));
      assert.ok(state.inserts.some(({ table }) => table === auditEventsTable));
    },
  );
});

test("template creation uses shared validation and starts as a non-default draft", async () => {
  await withFakeDatabase([permissionRows({ templates: { create: true } }), []], async (state) => {
    await createInvoiceTemplate("actor", templateContent());
    const templateWrite = state.inserts.find(({ table }) => table === invoiceTemplatesTable);
    assert.equal(templateWrite.values.status, "draft");
    assert.equal(templateWrite.values.isDefault, false);
    assert.ok(state.inserts.some(({ table }) => table === auditEventsTable));
  });

  await withFakeDatabase([permissionRows({ templates: { create: true } })], async (state) => {
    await assert.rejects(
      () => createInvoiceTemplate("actor", templateContent({ name: "x" })),
      /Template name must be at least 2 characters/,
    );
    assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
  });
});

test("advanced template creation validates invoice and receipt drafts", async () => {
  for (const input of [
    advancedTemplateInput(),
    advancedTemplateInput({
      name: "Advanced receipt",
      slug: "advanced-receipt",
      documentType: "receipt",
      pageFormat: "RECEIPT_80MM",
    }),
  ]) {
    await withFakeDatabase([permissionRows({ templates: { create: true } }), []], async (state) => {
      await createAdvancedDocumentTemplate("actor", input);
      const templateWrite = state.inserts.find(({ table }) => table === invoiceTemplatesTable);
      assert.equal(templateWrite.values.status, "draft");
      assert.equal(templateWrite.values.isDefault, false);
      assert.equal(templateWrite.values.documentType, input.documentType);
      assert.equal(templateWrite.values.layoutFamily, "advanced");
      assert.equal(templateWrite.values.config.editor, "pdfme");
      assert.equal(templateWrite.values.config.pageFormat, input.pageFormat);
    });
  }

  await withFakeDatabase([permissionRows({ templates: { create: true } })], async (state) => {
    await assert.rejects(
      () =>
        createAdvancedDocumentTemplate(
          "actor",
          advancedTemplateInput({ pageFormat: "RECEIPT_80MM" }),
        ),
      /invoice|page format/i,
    );
    assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
  });
});

test("template duplicate, import, and edit stay validated and audited", async () => {
  const source = templateRow();
  await withFakeDatabase(
    [permissionRows({ templates: { create: true } }), [source], []],
    async (state) => {
      await duplicateInvoiceTemplate("actor", source.id, {
        name: "Classic copy",
        slug: "classic-copy",
      });
      const write = state.inserts.find(({ table }) => table === invoiceTemplatesTable);
      assert.equal(write.values.name, "Classic copy");
      assert.equal(write.values.status, "draft");
    },
  );

  await withFakeDatabase([permissionRows({ templates: { create: true } }), []], async (state) => {
    await importInvoiceTemplate("actor", {
      ...seedTemplates[1],
      slug: "imported-modern",
    });
    assert.equal(
      state.inserts.find(({ table }) => table === auditEventsTable).values.action,
      "template.import",
    );
  });

  await withFakeDatabase(
    [permissionRows({ templates: { edit: true } }), [source], []],
    async (state) => {
      await updateInvoiceTemplate("actor", source.id, {
        name: "Classic updated",
      });
      const write = state.updates.find(({ table }) => table === invoiceTemplatesTable);
      assert.equal(write.values.name, "Classic updated");
      assert.equal(write.values.version, source.version + 1);
    },
  );

  await withFakeDatabase(
    [permissionRows({ templates: { edit: true } }), [source]],
    async (state) => {
      await assert.rejects(
        () => updateInvoiceTemplate("actor", source.id, { slug: "changed-slug" }),
        /Template slug cannot be changed/,
      );
      assert.equal(state.updates.length, 0);
    },
  );
});

test("advanced templates can be duplicated, imported, and edited", async () => {
  const source = advancedTemplateRow();

  await withFakeDatabase(
    [permissionRows({ templates: { create: true } }), [source], []],
    async (state) => {
      await duplicateInvoiceTemplate("actor", source.id, {
        name: "Advanced copy",
        slug: "advanced-copy",
      });
      const write = state.inserts.find(({ table }) => table === invoiceTemplatesTable);
      assert.equal(write.values.documentType, "invoice");
      assert.equal(write.values.layoutFamily, "advanced");
      assert.deepEqual(write.values.config, source.config);
    },
  );

  await withFakeDatabase([permissionRows({ templates: { create: true } }), []], async (state) => {
    await importInvoiceTemplate("actor", source);
    const write = state.inserts.find(({ table }) => table === invoiceTemplatesTable);
    assert.equal(write.values.layoutFamily, "advanced");
    assert.equal(write.values.status, "draft");
    assert.equal(write.values.isDefault, false);
  });

  const nextConfig = structuredClone(source.config);
  nextConfig.sampleData.documentNumber = "INV-UPDATED";
  await withFakeDatabase(
    [permissionRows({ templates: { edit: true } }), [source], []],
    async (state) => {
      await updateInvoiceTemplate("actor", source.id, {
        name: "Advanced updated",
        config: nextConfig,
      });
      const write = state.updates.find(({ table }) => table === invoiceTemplatesTable);
      assert.equal(write.values.name, "Advanced updated");
      assert.equal(write.values.layoutFamily, "advanced");
      assert.deepEqual(write.values.config, nextConfig);
    },
  );
});

test("template publication maintains one default and protects it from archival", async () => {
  const draft = templateRow({ status: "draft", isDefault: false });
  await withFakeDatabase(
    [
      permissionRows({ templates: { publish: true } }),
      [draft],
      permissionRows({ templates: { publish: true } }),
      [draft],
      [],
    ],
    async (state) => {
      await publishInvoiceTemplate("actor", draft.id);
      const write = state.updates.find(({ table }) => table === invoiceTemplatesTable);
      assert.equal(write.values.status, "published");
      assert.equal(write.values.isDefault, true);
    },
  );

  const published = templateRow({ id: "other", isDefault: false });
  await withFakeDatabase(
    [permissionRows({ templates: { publish: true } }), [published], []],
    async (state) => {
      await setDefaultInvoiceTemplate("actor", published.id);
      const templateUpdates = state.updates.filter(({ table }) => table === invoiceTemplatesTable);
      assert.equal(templateUpdates.length, 2);
      assert.equal(templateUpdates[0].values.isDefault, false);
      assert.equal(templateUpdates[1].values.isDefault, true);
    },
  );

  const currentDefault = templateRow({ isDefault: true });
  await withFakeDatabase(
    [permissionRows({ templates: { archive: true } }), [currentDefault]],
    async (state) => {
      await assert.rejects(
        () => archiveInvoiceTemplate("actor", currentDefault.id),
        /Set another published default/,
      );
      assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
    },
  );

  await withFakeDatabase(
    [
      permissionRows({ templates: { archive: true } }),
      [templateRow({ id: "old", isDefault: false })],
    ],
    async (state) => {
      await archiveInvoiceTemplate("actor", "old");
      assert.equal(
        state.updates.find(({ table }) => table === invoiceTemplatesTable).values.status,
        "archived",
      );
    },
  );

  await withFakeDatabase(
    [
      permissionRows({ templates: { publish: true } }),
      [templateRow({ id: "draft", status: "draft", isDefault: false })],
    ],
    async (state) => {
      await assert.rejects(
        () => setDefaultInvoiceTemplate("actor", "draft"),
        /Only a published template/,
      );
      assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
    },
  );
});

test("advanced templates publish and use defaults within their document kind", async () => {
  const draft = advancedTemplateRow();
  await withFakeDatabase(
    [
      permissionRows({ templates: { publish: true } }),
      [draft],
      permissionRows({ templates: { publish: true } }),
      [draft],
      [{ id: seedTemplates[0].id }],
    ],
    async (state) => {
      await publishInvoiceTemplate("actor", draft.id);
      const write = state.updates.find(({ table }) => table === invoiceTemplatesTable);
      assert.equal(write.values.status, "published");
      assert.equal(write.values.isDefault, false);
    },
  );

  const published = advancedTemplateRow({ status: "published" });
  await withFakeDatabase(
    [permissionRows({ templates: { publish: true } }), [published], [{ id: seedTemplates[0].id }]],
    async (state) => {
      await setDefaultInvoiceTemplate("actor", published.id);
      const templateUpdates = state.updates.filter(({ table }) => table === invoiceTemplatesTable);
      assert.equal(templateUpdates.length, 2);
      assert.equal(templateUpdates[0].values.isDefault, false);
      assert.equal(templateUpdates[1].values.isDefault, true);
    },
  );
});

test("template update and publish use a version-gated publication transaction", async () => {
  const source = templateRow({ status: "draft", isDefault: false });
  const updated = templateRow({
    ...source,
    name: "Published update",
    version: source.version + 1,
  });

  await withFakeDatabase(
    [
      permissionRows({ templates: { edit: true, publish: true } }),
      [source],
      [],
      permissionRows({ templates: { edit: true, publish: true } }),
      [updated],
      [],
    ],
    async (state) => {
      await updateAndPublishInvoiceTemplate("actor", source.id, {
        name: updated.name,
      });
      const templateUpdates = state.updates.filter(({ table }) => table === invoiceTemplatesTable);
      assert.equal(templateUpdates.length, 2);
      assert.equal(templateUpdates[0].values.name, updated.name);
      assert.equal(templateUpdates[1].values.status, "published");
    },
  );
});
