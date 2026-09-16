import assert from "node:assert/strict";
import test from "node:test";

import { ADMIN_ACCESS } from "../packages/authorization/src/index.ts";
import { auditEventsTable, db, managedToolsTable, toolContentTable } from "../packages/database/src/index.ts";
import { reservedToolSlugs } from "../packages/tool-catalog/src/index.ts";
import { createManagedTool } from "../lib/admin/adminMutations.ts";
import { TOOL_CATEGORIES } from "../lib/tool-framework/categories.ts";

const APP = "devtools";
// Resolved from the registry: no category or tool is named here.
const CATEGORY = Object.keys(TOOL_CATEGORIES).find((key) => TOOL_CATEGORIES[key].app === APP);
const OTHER_APP_CATEGORY = Object.keys(TOOL_CATEGORIES).find((key) => TOOL_CATEGORIES[key].app !== APP);
const RESERVED_SLUG = reservedToolSlugs[APP][0];

const KEY = "aardvark-widget";
const DRAFT = {
  app: APP,
  key: KEY,
  name: "Aardvark Widget",
  description: "Does an aardvark-shaped thing.",
  slug: "",
  category: CATEGORY,
};

// -- the fake transaction, matching tests/admin-tool-content.test.mjs --------

function permissionRows(access) {
  return [
    {
      status: "active",
      roleId: "test-role",
      roleName: "Test role",
      roleDescription: "Test permissions.",
      roleAccess: { ...access, admin: { enter: true, ...access.admin } },
      roleIsSystem: false,
    },
  ];
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

  function mutationChain(entry, values) {
    const rows = Array.isArray(values) ? values : [values];
    const chain = {
      onConflictDoNothing: () => chain,
      onConflictDoUpdate: (config) => {
        entry.set = config?.set;
        return chain;
      },
      where: () => chain,
      returning: () => Promise.resolve(rows),
      then: (resolve, reject) => Promise.resolve([]).then(resolve, reject),
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
        return mutationChain(entry, nextValues);
      },
      set(nextValues) {
        entry.values = nextValues;
        return mutationChain(entry, nextValues);
      },
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

function accessWithout(resource, action) {
  const access = structuredClone(ADMIN_ACCESS);
  delete access[resource][action];
  return access;
}

const EDITOR = permissionRows({ tools: { view: true, edit: true } });

function toolWrite(state) {
  return state.inserts.find(({ table }) => table === managedToolsTable);
}

function contentWrite(state) {
  return state.inserts.find(({ table }) => table === toolContentTable);
}

function auditWrite(state) {
  return state.inserts.find(({ table }) => table === auditEventsTable);
}

/** Existing rows for the app, shaped like the one locked read the write does. */
function siblings(...rows) {
  return rows;
}

// -- authorization ----------------------------------------------------------

test("creating a tool requires tools.edit and writes nothing without it", async () => {
  await withFakeDatabase([permissionRows(accessWithout("tools", "edit"))], async (state) => {
    await assert.rejects(() => createManagedTool("actor", DRAFT), /Missing permission: tools\.edit/);
    assert.deepEqual(state, { inserts: [], updates: [], deletes: [] });
  });
});

// -- identity ---------------------------------------------------------------

test("a tool id that already exists is rejected", async () => {
  await withFakeDatabase(
    [EDITOR, siblings({ toolId: `${APP}.${KEY}`, slug: "something-else", order: 0 })],
    async (state) => {
      await assert.rejects(() => createManagedTool("actor", DRAFT), new RegExp(`Tool ${APP}\\.${KEY} already exists`));
      assert.deepEqual(state.inserts, []);
    },
  );
});

test("a folder key that is not a valid slug is rejected before any read", async () => {
  for (const key of ["Not A Key", "trailing-", "double--hyphen", "under_score"]) {
    await withFakeDatabase([EDITOR], async (state) => {
      await assert.rejects(() => createManagedTool("actor", { ...DRAFT, key }), /Folder key must be lowercase words/);
      assert.deepEqual(state.inserts, []);
    });
  }
});

test("an app outside devtools and media is rejected", async () => {
  await withFakeDatabase([EDITOR], async (state) => {
    await assert.rejects(
      () => createManagedTool("actor", { ...DRAFT, app: "paperwork" }),
      /must be "devtools" or "media"/,
    );
    assert.deepEqual(state.inserts, []);
  });
});

// -- slug -------------------------------------------------------------------

test("a reserved slug is rejected", async () => {
  await withFakeDatabase([EDITOR], async (state) => {
    await assert.rejects(() => createManagedTool("actor", { ...DRAFT, slug: RESERVED_SLUG }), /invalid or reserved/);
    assert.deepEqual(state.inserts, []);
  });
});

test("a slug already used by the same app is rejected", async () => {
  await withFakeDatabase(
    [EDITOR, siblings({ toolId: `${APP}.other`, slug: "aardvark-widget", order: 0 })],
    async (state) => {
      await assert.rejects(() => createManagedTool("actor", DRAFT), /already in use/);
      assert.deepEqual(state.inserts, []);
    },
  );
});

test("a blank slug falls back to the name, recomputed on the server", async () => {
  await withFakeDatabase([EDITOR, siblings()], async (state) => {
    await createManagedTool("actor", { ...DRAFT, slug: "   " });
    assert.equal(toolWrite(state).values.slug, "aardvark-widget");
  });
});

// -- category ---------------------------------------------------------------

test("a category outside the registry is rejected", async () => {
  await withFakeDatabase([EDITOR], async (state) => {
    await assert.rejects(
      () => createManagedTool("actor", { ...DRAFT, category: "totally-made-up" }),
      /not registered for devtools/,
    );
    assert.deepEqual(state.inserts, []);
  });
});

test("a category belonging to the other app is rejected", async () => {
  await withFakeDatabase([EDITOR], async (state) => {
    await assert.rejects(
      () => createManagedTool("actor", { ...DRAFT, category: OTHER_APP_CATEGORY }),
      /not registered for devtools/,
    );
    assert.deepEqual(state.inserts, []);
  });
});

// -- order ------------------------------------------------------------------

test("order appends above every existing row, so UNIQUE (app, sort_order) cannot collide", async () => {
  // Gaps and out-of-sequence rows included on purpose: the next value is one
  // above the highest, never a count and never a reused gap.
  await withFakeDatabase(
    [
      EDITOR,
      siblings(
        { toolId: `${APP}.a`, slug: "a", order: 7 },
        { toolId: `${APP}.b`, slug: "b", order: 2 },
        { toolId: `${APP}.c`, slug: "c", order: 0 },
      ),
    ],
    async (state) => {
      await createManagedTool("actor", DRAFT);
      assert.equal(toolWrite(state).values.order, 8);
    },
  );

  // The first tool of an app starts at zero rather than at one.
  await withFakeDatabase([EDITOR, siblings()], async (state) => {
    await createManagedTool("actor", DRAFT);
    assert.equal(toolWrite(state).values.order, 0);
  });
});

// -- the created rows -------------------------------------------------------

test("a created tool is disabled, unarchived, and paired with a tool_content row", async () => {
  await withFakeDatabase([EDITOR, siblings({ toolId: `${APP}.a`, slug: "a", order: 0 })], async (state) => {
    const created = await createManagedTool("actor", DRAFT);

    const { values } = toolWrite(state);
    assert.equal(values.toolId, `${APP}.${KEY}`);
    assert.equal(values.app, APP);
    assert.equal(values.slug, "aardvark-widget");
    assert.equal(values.name, "Aardvark Widget");
    assert.equal(values.description, "Does an aardvark-shaped thing.");
    assert.equal(values.order, 1);
    assert.equal(values.enabled, false);
    assert.equal(values.archived, false);
    assert.equal(created.toolId, `${APP}.${KEY}`);

    // The content row carries the chosen category and nothing else. Every
    // other column stays null so it still inherits from `definition.ts` once
    // the folder ships; the category is persisted because the form asked for
    // it and there is no code yet to fall back to.
    assert.deepEqual(contentWrite(state).values, {
      toolId: `${APP}.${KEY}`,
      category: CATEGORY,
    });

    const audit = auditWrite(state);
    assert.equal(audit.values.action, "tool.create");
    assert.equal(audit.values.targetId, `${APP}.${KEY}`);
    assert.equal(audit.values.metadata.category, CATEGORY);
    assert.equal(audit.values.metadata.order, 1);
  });
});

test("name and description are required and stored trimmed", async () => {
  for (const field of ["name", "description"]) {
    await withFakeDatabase([EDITOR], async (state) => {
      await assert.rejects(() => createManagedTool("actor", { ...DRAFT, [field]: "   " }), /is required/);
      assert.deepEqual(state.inserts, []);
    });
  }

  await withFakeDatabase([EDITOR, siblings()], async (state) => {
    await createManagedTool("actor", {
      ...DRAFT,
      name: "  Aardvark Widget  ",
      description: "  Does an aardvark-shaped thing.  ",
    });
    assert.equal(toolWrite(state).values.name, "Aardvark Widget");
    assert.equal(toolWrite(state).values.description, "Does an aardvark-shaped thing.");
  });
});
