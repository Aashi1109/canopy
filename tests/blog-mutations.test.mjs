import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { ADMIN_ACCESS } from "../lib/authorization/index.ts";
import {
  db,
  auditEventsTable,
  blogPostsTable as posts,
  blogRevisionsTable as revisions,
  blogPostSchedulesTable as schedules,
  blogCategoriesTable as categories,
  blogTagsTable as tags,
  blogPublishedPostTagsTable as publishedTags,
} from "../db/index.ts";
import {
  createBlogPost,
  duplicateBlogPost,
  saveBlogDraft,
  publishBlogPost,
  scheduleBlogPost,
  retryBlogSchedule,
  cancelBlogSchedule,
  unpublishBlogPost,
  trashBlogPost,
  restoreTrashedBlogPost,
  restoreBlogRevision,
  saveBlogTerm,
  publishDueBlogPosts,
} from "../lib/blog/mutations.ts";
import { blogDocumentHash, createBlogDocument, validateBlogDocument } from "../lib/blog/document.ts";

const NOW = new Date("2026-09-16T10:30:00Z");
const category = { id: "category-1", name: "Guides", slug: "guides" };
const tag = { id: "tag-1", name: "PDF", slug: "pdf" };
const clock = () => ({ rows: [{ now: NOW }] });
const dialect = new PgDialect();
const query = (condition) => (condition ? dialect.sqlToQuery(condition) : { sql: "", params: [] });
function document(title = "Original article") {
  return validateBlogDocument({
    ...createBlogDocument(title),
    excerpt: "A useful article.",
    body: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Useful content." }] }],
    },
    category: { id: category.id, label: category.name },
    tags: [{ id: tag.id, label: tag.name }],
  });
}
function post(overrides = {}) {
  const draft = document();
  return {
    id: "post-1",
    slug: "original-article",
    draftDocument: draft,
    draftHash: blogDocumentHash(draft),
    version: 5,
    revisionSequence: 2,
    lastCheckpointAt: new Date(NOW.getTime() - 120_000),
    draftUpdatedAt: new Date(NOW.getTime() - 120_000),
    draftUpdatedBy: "actor",
    publishedRevisionId: "revision-live",
    publishedCategoryId: category.id,
    firstPublishedAt: new Date("2026-09-01T10:00:00Z"),
    publishedUpdatedAt: new Date("2026-09-01T10:00:00Z"),
    createdBy: "actor",
    createdAt: new Date("2026-08-01T10:00:00Z"),
    updatedAt: NOW,
    trashedAt: null,
    ...overrides,
  };
}
function revision(row, overrides = {}) {
  return {
    id: "revision-2",
    postId: row.id,
    revisionNumber: row.revisionSequence,
    document: row.draftDocument,
    contentHash: row.draftHash,
    reason: "manual_save",
    createdBy: "actor",
    createdAt: row.lastCheckpointAt,
    sourceRevisionId: null,
    ...overrides,
  };
}
function permission({ missing, status = "active" } = {}) {
  const access = structuredClone(ADMIN_ACCESS);
  if (missing) delete access.blog[missing];
  return [
    {
      status,
      roleId: "blog-manager",
      roleName: "Blog manager",
      roleDescription: "Custom blog role",
      roleAccess: access,
      roleIsSystem: false,
    },
  ];
}

// Scripted database boundary: real mutation/validation/permission code runs.
// Transactions stage writes and roll back on exceptions. SQL locking and actual
// uniqueness remain covered by the separate PostgreSQL integration suite.
async function withDatabase(reads, callback, options = {}) {
  const original = {
    transaction: db.transaction,
    select: db.select,
    update: db.update,
    execute: db.execute,
  };
  const queue = [...reads];
  const state = {
    committed: [],
    rolledBack: [],
    post: structuredClone(options.post ?? post()),
    readQueries: [],
    attempts: 0,
  };
  let staged;
  let conflicts = options.insertConflicts ?? 0;
  const select = () => {
    const entry = {};
    const chain = {
      from(table) {
        entry.table = table;
        return chain;
      },
      where(condition) {
        entry.condition = query(condition);
        return chain;
      },
      innerJoin: () => chain,
      leftJoin: () => chain,
      limit: () => chain,
      for: () => chain,
      orderBy: () => chain,
      then(resolve, reject) {
        state.readQueries.push(entry);
        const next = queue.shift();
        return Promise.resolve()
          .then(() => {
            if (next === undefined) throw new Error("Unexpected database read");
            if (next instanceof Error) throw next;
            return typeof next === "function" ? next(state) : structuredClone(next);
          })
          .then(resolve, reject);
      },
    };
    return chain;
  };
  const mutation = (kind, table) => {
    const entry = { kind, table, values: undefined, condition: undefined };
    let completed;
    const perform = () => {
      if (completed) return completed;
      if (options.failWrite?.(entry)) throw new Error("simulated database write failure");
      if (kind === "insert" && table === posts && conflicts-- > 0) return [];
      const values = entry.values;
      let rows = [];
      if (kind === "insert") {
        rows = Array.isArray(values) ? values : [values];
        if (table === posts)
          rows = rows.map((value) => ({
            ...post({
              version: 1,
              revisionSequence: 0,
              lastCheckpointAt: null,
              publishedRevisionId: null,
              publishedCategoryId: null,
              firstPublishedAt: null,
              publishedUpdatedAt: null,
            }),
            ...value,
          }));
      } else if (kind === "update") {
        rows = [{ ...(table === posts ? state.post : (options.term ?? {})), ...values }];
      } else if (table === schedules) rows = structuredClone(options.removedSchedules ?? []);
      if (table === posts && rows[0]) state.post = { ...rows[0] };
      (staged ?? state.committed).push(entry);
      completed = rows;
      return rows;
    };
    const chain = {
      values(values) {
        entry.values = values;
        return chain;
      },
      set(values) {
        entry.values = values;
        return chain;
      },
      where(condition) {
        entry.condition = query(condition);
        return chain;
      },
      onConflictDoNothing: () => chain,
      returning: () => Promise.resolve().then(perform),
      then: (resolve, reject) => Promise.resolve().then(perform).then(resolve, reject),
    };
    return chain;
  };
  const execute = async (statement) => {
    const compiled = query(statement);
    if (/^SET LOCAL /i.test(compiled.sql)) return [];
    const next = queue.shift();
    if (next === undefined) throw new Error("Unexpected database statement");
    if (next instanceof Error) throw next;
    return structuredClone(next);
  };
  const tx = {
    select,
    insert: (table) => mutation("insert", table),
    update: (table) => mutation("update", table),
    delete: (table) => mutation("delete", table),
    execute,
  };
  db.select = select;
  db.update = tx.update;
  db.execute = execute;
  db.transaction = async (operation) => {
    state.attempts++;
    const before = structuredClone(state.post);
    staged = [];
    try {
      const result = await operation(tx);
      state.committed.push(...staged);
      return result;
    } catch (error) {
      state.rolledBack.push(...staged);
      state.post = before;
      throw error;
    } finally {
      staged = undefined;
    }
  };
  try {
    await callback(state);
    assert.equal(queue.length, 0, "all expected database reads were exercised");
  } finally {
    Object.assign(db, original);
  }
}
const writes = (state, table, kind) =>
  state.committed.filter((entry) => entry.table === table && (!kind || entry.kind === kind));
const auditActions = (state) => writes(state, auditEventsTable).map((entry) => entry.values.action);

test("every administrative blog mutation rejects missing permission before content writes", async () => {
  const input = { postId: "post-1", version: 5 };
  const cases = [
    ["create", () => createBlogPost("actor", { title: "Test" })],
    ["create", () => duplicateBlogPost("actor", { postId: input.postId })],
    ["edit", () => saveBlogDraft("actor", { ...input, document: document() })],
    ["publish", () => publishBlogPost("actor", input)],
    ["publish", () => scheduleBlogPost("actor", { ...input, scheduledAt: "2026-09-17T00:00:00Z" })],
    ["publish", () => retryBlogSchedule("actor", input)],
    ["publish", () => cancelBlogSchedule("actor", input)],
    ["publish", () => unpublishBlogPost("actor", input)],
    ["archive", () => trashBlogPost("actor", input)],
    ["archive", () => restoreTrashedBlogPost("actor", input)],
    ["edit", () => restoreBlogRevision("actor", { ...input, revisionId: "revision-1" })],
    ["edit", () => saveBlogTerm("actor", { kind: "category", name: "Guides" })],
  ];
  for (const [missing, invoke] of cases)
    await withDatabase([permission({ missing })], async (state) => {
      await assert.rejects(invoke, new RegExp(`Missing permission: blog.${missing}`));
      assert.deepEqual(state.committed, []);
    });
});

test("stale versions, trash, and absent articles reject saves without overwriting work", async () => {
  for (const [rows, code] of [
    [[post({ version: 6 })], "CONFLICT"],
    [[post({ trashedAt: NOW })], "VALIDATION"],
    [[], "NOT_FOUND"],
  ]) {
    await withDatabase([permission(), rows], async (state) => {
      await assert.rejects(() => saveBlogDraft("actor", { postId: "post-1", version: 5, document: document() }), {
        code,
      });
      assert.deepEqual(state.committed, []);
    });
  }
});

test("title limit is enforced when creating and saving drafts before content writes", async () => {
  const title = Array(20).fill("word").join(" ");
  await withDatabase([permission(), clock(), []], async () => {
    const result = await createBlogPost("actor", { title });
    assert.equal(result.draftDocument.title, title);
  });
  await withDatabase([permission()], async (state) => {
    await assert.rejects(() => createBlogPost("actor", { title: `${title} extra` }), /20 words/);
    assert.equal(state.committed.length, 0);
  });
  const current = post({ lastCheckpointAt: new Date(NOW.getTime() - 1000) });
  await withDatabase([permission(), [current], [category], [tag], clock()], async () => {
    const result = await saveBlogDraft("actor", {
      postId: current.id,
      version: current.version,
      document: { ...current.draftDocument, title },
    });
    assert.equal(result.draftDocument.title, title);
  });
  await withDatabase([permission(), [current]], async (state) => {
    await assert.rejects(
      () =>
        saveBlogDraft("actor", {
          postId: current.id,
          version: current.version,
          document: { ...current.draftDocument, title: `${title} extra` },
        }),
      /20 words/,
    );
    assert.equal(state.committed.length, 0);
  });
});

test("autosave canonicalizes taxonomy, checkpoints changed work, and leaves public state and slug intact", async () => {
  const current = post();
  const changed = document("Updated title");
  changed.category.label = "Untrusted client label";
  changed.tags[0].label = "Untrusted tag label";
  await withDatabase(
    [permission(), [current], [category], [tag], clock(), [revision(current)]],
    async (state) => {
      const result = await saveBlogDraft("actor", {
        postId: current.id,
        version: current.version,
        document: changed,
      });
      assert.equal(result.version, 6);
      assert.equal(result.slug, current.slug);
      assert.equal(result.publishedRevisionId, current.publishedRevisionId);
      assert.deepEqual(result.publishedUpdatedAt, current.publishedUpdatedAt);
      assert.equal(result.draftDocument.category.label, category.name);
      assert.equal(result.draftDocument.tags[0].label, tag.name);
      const [snapshot] = writes(state, revisions);
      assert.equal(snapshot.values.reason, "autosave");
      assert.equal(snapshot.values.revisionNumber, 3);
      assert.equal(snapshot.values.document.title, "Updated title");
      assert.deepEqual(auditActions(state), ["blog.save"]);
      assert.equal(writes(state, schedules).length, 0);
      assert.equal(writes(state, publishedTags).length, 0);
    },
    { post: current },
  );
});

test("autosaves persist before checkpoint interval and unchanged saves do not churn versions", async () => {
  const current = post({ lastCheckpointAt: new Date(NOW.getTime() - 1000) });
  for (const changed of [true, false])
    await withDatabase(
      [permission(), [current], [category], [tag], clock()],
      async (state) => {
        const result = await saveBlogDraft("actor", {
          postId: current.id,
          version: current.version,
          document: changed ? document("Latest edit") : current.draftDocument,
        });
        assert.equal(result.version, changed ? 6 : 5);
        assert.equal(writes(state, revisions).length, 0);
        assert.equal(writes(state, posts).length, changed ? 1 : 0);
      },
      { post: current },
    );
});

test("manual save captures uncheckpointed work and reuses an identical latest revision", async () => {
  const current = post({ lastCheckpointAt: new Date(NOW.getTime() - 1000) });
  for (const sameRevision of [true, false])
    await withDatabase(
      [
        permission(),
        [current],
        [category],
        [tag],
        clock(),
        [revision(current, sameRevision ? {} : { contentHash: "older-content" })],
      ],
      async (state) => {
        const result = await saveBlogDraft("actor", {
          postId: current.id,
          version: current.version,
          document: current.draftDocument,
          mode: "manual",
        });
        assert.equal(result.version, 5);
        assert.equal(writes(state, revisions).length, sameRevision ? 0 : 1);
        if (!sameRevision) assert.equal(writes(state, revisions)[0].values.reason, "manual_save");
      },
      { post: current },
    );
});

test("revision restoration backs up unsaved-to-history content and changes only the working draft", async () => {
  const current = post();
  const historical = document("Historical title");
  historical.category.label = "Historical category name";
  const source = revision(current, {
    id: "revision-1",
    revisionNumber: 1,
    document: historical,
    contentHash: blogDocumentHash(historical),
  });
  await withDatabase(
    [
      permission(),
      [current],
      [source],
      [category],
      [tag],
      clock(),
      [revision(current, { contentHash: "prior-checkpoint" })],
      [],
    ],
    async (state) => {
      const result = await restoreBlogRevision("actor", {
        postId: current.id,
        version: current.version,
        revisionId: source.id,
      });
      assert.equal(result.draftDocument.title, historical.title);
      assert.equal(result.draftDocument.category.label, "Historical category name");
      assert.equal(result.slug, current.slug);
      assert.equal(result.publishedRevisionId, current.publishedRevisionId);
      assert.equal(result.version, 6);
      const snapshots = writes(state, revisions).map((entry) => entry.values);
      assert.deepEqual(
        snapshots.map((row) => row.reason),
        ["restore_backup", "restore"],
      );
      assert.deepEqual(
        snapshots.map((row) => row.revisionNumber),
        [3, 4],
      );
      assert.equal(snapshots[0].document.title, current.draftDocument.title);
      assert.equal(snapshots[1].sourceRevisionId, source.id);
      assert.equal(writes(state, schedules).length, 0);
      assert.equal(writes(state, publishedTags).length, 0);
    },
    { post: current },
  );
});

test("create retries unique slug conflicts with a random suffix and records an initial revision", async () => {
  await withDatabase(
    [permission(), clock(), []],
    async (state) => {
      const result = await createBlogPost("actor", { title: "How & Why" });
      assert.match(result.slug, /^how-and-why-[0-9a-f]{8}$/);
      assert.equal(result.revisionSequence, 1);
      assert.equal(result.publishedRevisionId, null);
      assert.equal(writes(state, revisions)[0].values.reason, "create");
      assert.deepEqual(auditActions(state), ["blog.create"]);
    },
    { insertConflicts: 1 },
  );
  await withDatabase(
    [permission()],
    async (state) => {
      await assert.rejects(() => createBlogPost("actor", { title: "Collisions" }), {
        code: "CONFLICT",
      });
      assert.equal(state.committed.length, 0);
    },
    { insertConflicts: 5 },
  );
});

test("duplicating starts a new draft with its own identity and initial history", async () => {
  const source = post();
  await withDatabase([permission(), permission(), [source], [category], [tag], clock(), []], async (state) => {
    const result = await duplicateBlogPost("actor", { postId: source.id });
    assert.notEqual(result.id, source.id);
    assert.deepEqual(result.draftDocument, source.draftDocument);
    assert.equal(result.publishedRevisionId, null);
    assert.equal(result.firstPublishedAt, null);
    assert.equal(result.version, 1);
    assert.equal(result.revisionSequence, 1);
    assert.equal(writes(state, revisions).length, 1);
    assert.equal(writes(state, schedules).length, 0);
    assert.deepEqual(auditActions(state), ["blog.duplicate"]);
  });
});

test("unknown taxonomy references and incomplete article content fail before snapshot or publication writes", async () => {
  const current = post();
  await withDatabase([permission(), [current], []], async (state) => {
    await assert.rejects(
      () =>
        saveBlogDraft("actor", {
          postId: current.id,
          version: current.version,
          document: current.draftDocument,
        }),
      /existing category/,
    );
    assert.equal(state.committed.length, 0);
  });
  const incomplete = post({ draftDocument: { ...document(), excerpt: "" } });
  await withDatabase([permission(), [incomplete], [category], [tag]], async (state) => {
    await assert.rejects(
      () => publishBlogPost("actor", { postId: current.id, version: current.version }),
      /Excerpt is required/,
    );
    assert.equal(state.committed.length, 0);
  });
});

test("publishing promotes a snapshot and clears schedule, with audit failure rolling everything back", async () => {
  const current = post();
  const snapshot = revision(current);
  const reads = () => [permission(), [current], [category], [tag], clock(), [snapshot], [category], [tag]];
  for (const failAudit of [false, true])
    await withDatabase(
      reads(),
      async (state) => {
        const invoke = () => publishBlogPost("actor", { postId: current.id, version: current.version });
        if (failAudit) {
          await assert.rejects(invoke, /simulated database write failure/);
          assert.equal(state.committed.length, 0);
          assert.equal(state.post.publishedRevisionId, current.publishedRevisionId);
          assert.ok(state.rolledBack.some((entry) => entry.table === schedules));
          return;
        }
        const result = await invoke();
        assert.equal(result.publishedRevisionId, snapshot.id);
        assert.equal(result.draftDocument.title, current.draftDocument.title);
        assert.equal(result.version, 6);
        assert.deepEqual(result.firstPublishedAt, current.firstPublishedAt);
        assert.deepEqual(result.publishedUpdatedAt, NOW);
        assert.equal(writes(state, schedules, "delete").length, 1);
        assert.deepEqual(writes(state, publishedTags, "insert")[0].values, [{ postId: current.id, tagId: tag.id }]);
        assert.deepEqual(auditActions(state), ["blog.publish"]);
      },
      { post: current, failWrite: (entry) => failAudit && entry.table === auditEventsTable },
    );
});

test("scheduling freezes the saved revision and rejects due or past times", async () => {
  const current = post();
  const snapshot = revision(current);
  await withDatabase(
    [permission(), [current], clock(), [category], [tag], [snapshot]],
    async (state) => {
      const result = await scheduleBlogPost("actor", {
        postId: current.id,
        version: current.version,
        scheduledAt: "2026-09-16T11:12:00Z",
      });
      const schedule = writes(state, schedules, "insert")[0].values;
      assert.equal(schedule.revisionId, snapshot.id);
      assert.equal(schedule.scheduledBy, "actor");
      assert.equal(schedule.scheduledAt.toISOString(), "2026-09-16T11:12:00.000Z");
      assert.equal(result.version, 6);
      assert.equal(result.publishedRevisionId, current.publishedRevisionId);
      assert.deepEqual(auditActions(state), ["blog.schedule"]);
    },
    { post: current },
  );
  await withDatabase([permission(), [current], clock()], async (state) => {
    await assert.rejects(
      () =>
        scheduleBlogPost("actor", {
          postId: current.id,
          version: current.version,
          scheduledAt: NOW.toISOString(),
        }),
      /future publication time/,
    );
    assert.equal(state.committed.length, 0);
  });
});

test("live article trash requires publication authority as well as archive permission", async () => {
  await withDatabase(
    [permission({ missing: "publish" }), [post()], permission({ missing: "publish" })],
    async (state) => {
      await assert.rejects(
        () => trashBlogPost("actor", { postId: "post-1", version: 5 }),
        /Missing permission: blog.publish/,
      );
      assert.equal(state.committed.length, 0);
    },
  );
});

test("unpublishing removes live projections and schedule while trash restoration stays a draft", async () => {
  const current = post();
  await withDatabase(
    [permission(), [current], clock()],
    async (state) => {
      const result = await unpublishBlogPost("actor", {
        postId: current.id,
        version: current.version,
      });
      assert.equal(result.publishedRevisionId, null);
      assert.equal(result.publishedCategoryId, null);
      assert.equal(result.publishedSearch, null);
      assert.equal(writes(state, schedules, "delete").length, 1);
      assert.equal(writes(state, publishedTags, "delete").length, 1);
      assert.deepEqual(result.firstPublishedAt, current.firstPublishedAt);
    },
    { post: current },
  );
  const trashed = post({ trashedAt: NOW, publishedRevisionId: null, publishedCategoryId: null });
  await withDatabase(
    [permission(), [trashed], clock()],
    async (state) => {
      const result = await restoreTrashedBlogPost("actor", {
        postId: trashed.id,
        version: trashed.version,
      });
      assert.equal(result.trashedAt, null);
      assert.equal(result.publishedRevisionId, null);
      assert.equal(writes(state, schedules).length, 0);
    },
    { post: trashed },
  );
});

test("taxonomy records track creating and editing administrators without changing their slug", async () => {
  for (const kind of ["category", "tag"]) {
    const table = kind === "category" ? categories : tags;
    await withDatabase([permission()], async (state) => {
      const result = await saveBlogTerm("creator", { kind, name: "PDF Guides" });
      assert.equal(result.createdBy, "creator");
      assert.equal(result.updatedBy, "creator");
      assert.equal(result.slug, "pdf-guides");
      assert.equal(writes(state, table).length, 1);
    });
    const existing = { ...category, createdBy: "creator", updatedBy: "creator" };
    await withDatabase(
      [permission(), [existing], [], clock()],
      async (state) => {
        const result = await saveBlogTerm("editor", { kind, id: existing.id, name: "Renamed" });
        assert.equal(result.createdBy, "creator");
        assert.equal(result.updatedBy, "editor");
        assert.equal(result.slug, existing.slug);
        assert.deepEqual(auditActions(state), [`blog.${kind}.edit`]);
      },
      { term: existing },
    );
  }
});

test("taxonomy creation and rename reject names that could corrupt saved article labels", async () => {
  for (const name of ["Bad\u0001name", "Invalid\ud800name"]) {
    for (const id of [undefined, category.id])
      await withDatabase([], async (state) => {
        await assert.rejects(() => saveBlogTerm("editor", { kind: "category", name, ...(id ? { id } : {}) }));
        assert.equal(state.attempts, 0);
        assert.equal(state.committed.length, 0);
      });
  }
});

test("scheduler publishes the frozen revision, preserving newer draft and initial publication date", async () => {
  const current = post({ draftDocument: document("Newer unscheduled draft") });
  current.draftHash = blogDocumentHash(current.draftDocument);
  const frozen = revision(current, {
    id: "frozen",
    document: document("Scheduled content"),
    contentHash: blogDocumentHash(document("Scheduled content")),
  });
  const scheduled = {
    id: "schedule-1",
    postId: current.id,
    revisionId: frozen.id,
    scheduledAt: new Date(NOW.getTime() - 1000),
    scheduledBy: "actor",
  };
  await withDatabase(
    [clock(), [scheduled], permission(), [current], [scheduled], [frozen], clock(), [category], [tag], [{ count: 0 }]],
    async (state) => {
      assert.deepEqual(await publishDueBlogPosts(), {
        attempted: 1,
        published: 1,
        failed: 0,
        remaining: 0,
      });
      assert.equal(state.post.publishedRevisionId, frozen.id);
      assert.equal(state.post.draftDocument.title, "Newer unscheduled draft");
      assert.deepEqual(state.post.firstPublishedAt, current.firstPublishedAt);
      assert.equal(writes(state, schedules, "delete")[0].condition.params.includes(scheduled.id), true);
      assert.deepEqual(auditActions(state), ["blog.publish"]);
    },
    { post: current },
  );
});

test("retry-now publishes only the frozen due revision and records the invoking administrator", async () => {
  const current = post({ draftDocument: document("Newer unscheduled draft") });
  current.draftHash = blogDocumentHash(current.draftDocument);
  const frozen = revision(current, {
    id: "frozen",
    document: document("Scheduled version"),
    contentHash: blogDocumentHash(document("Scheduled version")),
  });
  const scheduled = {
    id: "schedule-1",
    postId: current.id,
    revisionId: frozen.id,
    scheduledAt: NOW,
    scheduledBy: "original-publisher",
    lastErrorCode: "TEMPORARY_FAILURE",
  };
  await withDatabase(
    [permission(), [scheduled], permission(), [current], [scheduled], clock(), [frozen], [category], [tag]],
    async (state) => {
      const result = await retryBlogSchedule("retrying-admin", {
        postId: current.id,
        version: current.version,
      });
      assert.equal(result.publishedRevisionId, frozen.id);
      assert.equal(result.draftDocument.title, "Newer unscheduled draft");
      assert.equal(result.version, 6);
      assert.equal(writes(state, revisions).length, 0);
      assert.equal(writes(state, schedules, "delete")[0].condition.params.includes(scheduled.id), true);
      const event = writes(state, auditEventsTable)[0].values;
      assert.equal(event.actorUserId, "retrying-admin");
      assert.equal(event.action, "blog.publish");
      assert.equal(event.metadata.scheduleId, scheduled.id);
      assert.equal(event.metadata.scheduledAt, NOW.toISOString());
    },
    { post: current },
  );
});

test("retry-now requires an active original publisher; deleted, suspended and revoked publishers must reschedule", async () => {
  const scheduled = {
    id: "schedule-1",
    postId: "post-1",
    revisionId: "frozen",
    scheduledAt: NOW,
    scheduledBy: "original-publisher",
  };
  for (const originalPermission of [permission({ missing: "publish" }), permission({ status: "suspended" }), []]) {
    await withDatabase([permission(), [scheduled], originalPermission], async (state) => {
      await assert.rejects(
        () => retryBlogSchedule("retrying-admin", { postId: "post-1", version: 5 }),
        /Access denied|Missing permission/,
      );
      assert.equal(state.committed.length, 0);
    });
  }
  await withDatabase([permission(), [{ ...scheduled, scheduledBy: null }]], async (state) => {
    await assert.rejects(
      () => retryBlogSchedule("retrying-admin", { postId: "post-1", version: 5 }),
      /Scheduling account/,
    );
    assert.equal(state.committed.length, 0);
  });
});

test("retry-now rejects missing, replaced, future and invalid-version schedules without publication", async () => {
  const current = post();
  const scheduled = {
    id: "schedule-1",
    postId: current.id,
    revisionId: "frozen",
    scheduledAt: NOW,
    scheduledBy: "actor",
  };
  const cases = [
    [[permission(), []], "NOT_FOUND"],
    [[permission(), [scheduled], [current], []], "CONFLICT"],
    [[permission(), [scheduled], [post({ version: 6 })]], "CONFLICT"],
    [[permission(), [scheduled], [post({ trashedAt: NOW })]], "VALIDATION"],
    [
      [permission(), [scheduled], [current], [{ ...scheduled, scheduledAt: new Date(NOW.getTime() + 1) }], clock()],
      "VALIDATION",
    ],
    [[permission(), [scheduled], [current], [scheduled], clock(), []], "NOT_FOUND"],
  ];
  for (const [reads, code] of cases)
    await withDatabase(reads, async (state) => {
      await assert.rejects(() => retryBlogSchedule("actor", { postId: current.id, version: current.version }), {
        code,
      });
      assert.equal(state.committed.length, 0);
    });
});

test("failed retry publication rolls back schedule removal and live changes when audit cannot be saved", async () => {
  const current = post();
  const frozen = revision(current);
  const scheduled = {
    id: "schedule-1",
    postId: current.id,
    revisionId: frozen.id,
    scheduledAt: NOW,
    scheduledBy: "actor",
  };
  await withDatabase(
    [permission(), [scheduled], [current], [scheduled], clock(), [frozen], [category], [tag]],
    async (state) => {
      await assert.rejects(
        () => retryBlogSchedule("actor", { postId: current.id, version: current.version }),
        /simulated database write failure/,
      );
      assert.equal(state.committed.length, 0);
      assert.equal(state.post.publishedRevisionId, current.publishedRevisionId);
      assert.equal(state.post.version, current.version);
      assert.ok(state.rolledBack.some((entry) => entry.table === schedules && entry.kind === "delete"));
    },
    { post: current, failWrite: (entry) => entry.table === auditEventsTable },
  );
});

test("scheduler leaves a cancelled or replaced request alone after re-reading it under lock", async () => {
  const current = post();
  const stale = {
    id: "old-schedule",
    postId: current.id,
    revisionId: "revision-2",
    scheduledAt: NOW,
    scheduledBy: "actor",
  };
  await withDatabase(
    [clock(), [stale], permission(), [current], [], [{ count: 1 }]],
    async (state) => {
      assert.deepEqual(await publishDueBlogPosts(), {
        attempted: 1,
        published: 0,
        failed: 0,
        remaining: 1,
      });
      assert.equal(state.committed.length, 0);
      const reread = state.readQueries.find(
        (entry) => entry.table === schedules && entry.condition?.params.includes(stale.id),
      );
      assert.ok(reread, "the schedule is re-read using its request identity");
    },
    { post: current },
  );
});

test("revoked scheduling permissions preserve due work and scope failure diagnostics to request identity", async () => {
  const scheduled = {
    id: "old-schedule",
    postId: "post-1",
    revisionId: "revision-2",
    scheduledAt: NOW,
    scheduledBy: "actor",
  };
  await withDatabase([clock(), [scheduled], permission({ missing: "publish" }), [{ count: 1 }]], async (state) => {
    assert.deepEqual(await publishDueBlogPosts(), {
      attempted: 1,
      published: 0,
      failed: 1,
      remaining: 1,
    });
    const [diagnostic] = writes(state, schedules, "update");
    assert.equal(diagnostic.values.lastErrorCode, "PUBLISHER_FORBIDDEN");
    assert.deepEqual(diagnostic.condition.params, [scheduled.id]);
    assert.equal(writes(state, posts).length, 0);
    assert.equal(writes(state, revisions).length, 0);
  });
});

test("scheduler continues with other posts when diagnostic persistence also fails", async (t) => {
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args));
  const first = {
    id: "schedule-1",
    postId: "post-1",
    revisionId: "revision-2",
    scheduledAt: NOW,
    scheduledBy: null,
  };
  const second = { ...first, id: "schedule-2", postId: "post-2" };
  await withDatabase(
    [clock(), [first, second], [{ count: 2 }]],
    async (state) => {
      assert.deepEqual(await publishDueBlogPosts(), {
        attempted: 2,
        published: 0,
        failed: 2,
        remaining: 2,
      });
      assert.equal(state.attempts, 2);
      assert.equal(warnings.length, 2);
      assert.deepEqual(warnings[0][1], {
        postId: first.postId,
        scheduleId: first.id,
        code: "PUBLISHER_FORBIDDEN",
      });
    },
    { failWrite: (entry) => entry.table === schedules && entry.kind === "update" },
  );
});

test("scheduler does not reattempt the same post when rescheduling appears on a later batch", async () => {
  const firstBatch = Array.from({ length: 50 }, (_, index) => ({
    id: `schedule-${index}`,
    postId: `post-${index}`,
    revisionId: `revision-${index}`,
    scheduledAt: NOW,
    cursorTime: "2026-09-16T10:30:00.000123Z",
    scheduledBy: null,
  }));
  const replacement = { ...firstBatch[0], id: "zz-replacement-request" };
  await withDatabase([clock(), firstBatch, [replacement], [{ count: 50 }]], async (state) => {
    assert.deepEqual(await publishDueBlogPosts(), {
      attempted: 50,
      published: 0,
      failed: 50,
      remaining: 50,
    });
    assert.equal(state.attempts, 50);
    assert.equal(writes(state, schedules, "update").length, 50);
    assert.ok(writes(state, schedules, "update").every((entry) => !entry.condition.params.includes(replacement.id)));
    const laterBatch = state.readQueries.filter((entry) => entry.table === schedules)[1];
    assert.ok(
      laterBatch.condition.params.includes(firstBatch.at(-1).cursorTime),
      "cursor retains PostgreSQL microseconds",
    );
  });
});
