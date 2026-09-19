import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { createDraftPersistence } from "../app/admin/(protected)/blog/lib/draftPersistence.ts";
import { blogFormattingExtensions } from "../app/admin/(protected)/blog/lib/formattingExtensions.ts";
import { createBlogDocument } from "../lib/blog/document.ts";

function setup(t, request) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [],
    states = [];
  const draft = createDraftPersistence({
    document: "initial",
    version: 1,
    request: async (input) => {
      calls.push(input);
      return request ? request(input) : { ok: true, data: { version: input.version + 1 } };
    },
    onState: (state, message) => states.push({ state, message }),
  });
  t.after(() => draft.stop());
  return { draft, calls, states };
}
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

test("editor drafts reach React Server Actions during autosave and manual save without losing formatting", async (t) => {
  // The installed Flight encoder needs the bundler hook even for plain argument encoding.
  const previousWebpackRequire = globalThis.__webpack_require__;
  globalThis.__webpack_require__ = { u() {} };
  t.after(() => {
    if (previousWebpackRequire === undefined) delete globalThis.__webpack_require__;
    else globalThis.__webpack_require__ = previousWebpackRequire;
  });
  const { encodeReply } = createRequire(import.meta.url)("next/dist/compiled/react-server-dom-webpack/client.browser");
  const schema = getSchema([...blogFormattingExtensions, StarterKit]);
  const document = {
    ...createBlogDocument("I am the best"),
    body: schema
      .nodeFromJSON({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Ordinary text" }] },
          {
            type: "heading",
            attrs: { level: 2, textAlign: "center" },
            content: [
              {
                type: "text",
                text: "A link",
                marks: [{ type: "link", attrs: { href: "https://example.com" } }],
              },
            ],
          },
        ],
      })
      .toJSON(),
  };
  const states = [],
    payloads = [];
  const draft = createDraftPersistence({
    document,
    version: 1,
    request: async (input) => {
      payloads.push(JSON.parse(await encodeReply(["save", { postId: "post-1", ...input }])));
      return { ok: true, data: { version: input.version + 1 } };
    },
    onState: (state) => states.push(state),
  });
  t.after(() => draft.stop());
  for (const mode of ["autosave", "manual"]) {
    draft.change({ ...document, title: `${document.title} ${mode}` });
    assert.equal(await draft.save(mode), true, `${mode} must cross the Server Action boundary`);
    assert.equal(draft.dirty, false);
    assert.deepEqual(payloads.at(-1), [
      "save",
      {
        postId: "post-1",
        document: JSON.parse(JSON.stringify({ ...document, title: `${document.title} ${mode}` })),
        version: payloads.length,
        mode,
      },
    ]);
  }
  assert.equal(states.includes("error"), false);
  assert.equal(draft.version, 3);
});

test("autosave waits ten seconds after the final edit and sends only the latest document", async (t) => {
  const { draft, calls } = setup(t);
  draft.change("one");
  t.mock.timers.tick(9_000);
  await settle();
  assert.equal(calls.length, 0);
  draft.change("two");
  t.mock.timers.tick(9_999);
  await settle();
  assert.equal(calls.length, 0);
  t.mock.timers.tick(1);
  await settle();
  assert.deepEqual(calls, [{ document: "two", version: 1, mode: "autosave" }]);
  t.mock.timers.tick(120_000);
  await settle();
  assert.equal(calls.length, 1, "the old deadline must not create another request");
});

test("continuous typing saves at sixty seconds across repeated cycles without resetting the deadline", async (t) => {
  const { draft, calls } = setup(t);
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let edit = 0; edit < 12; edit++) {
      draft.change(`${cycle}:${edit}`);
      t.mock.timers.tick(edit === 11 ? 4_999 : 5_000);
      await settle();
      assert.equal(calls.length, cycle, "typing must not trigger an early idle save");
    }
    t.mock.timers.tick(1);
    await settle();
    assert.deepEqual(calls[cycle], { document: `${cycle}:11`, version: cycle + 1, mode: "autosave" });
  }
});

test("manual save waits for an autosave and flushes newer edits using the returned version", async (t) => {
  let finish;
  const { draft, calls } = setup(t, (input) =>
    calls.length === 1
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : { ok: true, data: { version: input.version + 1 } },
  );
  draft.change("first");
  t.mock.timers.tick(10_000);
  draft.change("newer");
  const flushed = draft.save();
  await settle();
  assert.equal(calls.length, 1);
  finish({ ok: true, data: { version: 4 } });
  assert.equal(await flushed, true);
  assert.deepEqual(calls[1], { document: "newer", version: 4, mode: "manual" });
  assert.equal(draft.dirty, false);
});

test("conflict stays sticky while typing and never overwrites the remote revision", async (t) => {
  const { draft, calls, states } = setup(t, () => ({
    ok: false,
    code: "CONFLICT",
    message: "Reload the saved version.",
  }));
  draft.change("local");
  assert.equal(await draft.save(), false);
  draft.change("still local");
  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(await draft.save(), false);
  assert.equal(calls.length, 1);
  assert.equal(states.at(-1).state, "conflict");
  assert.equal(draft.dirty, true);
});

test("failed requests preserve edits, do not loop, and can be retried explicitly", async (t) => {
  let fail = true;
  const { draft, calls, states } = setup(t, (input) => {
    if (fail) throw Error("offline");
    return { ok: true, data: { version: input.version + 1 } };
  });
  draft.change("local");
  assert.equal(await draft.save(), false);
  assert.equal(states.at(-1).state, "error");
  t.mock.timers.tick(60_000);
  assert.equal(calls.length, 1);
  fail = false;
  assert.equal(await draft.save(), true);
  assert.equal(draft.dirty, false);
});

test("teardown cancels autosave and publication version changes feed the next save", async (t) => {
  const { draft, calls } = setup(t);
  draft.change("local");
  draft.stop();
  t.mock.timers.tick(60_000);
  assert.equal(calls.length, 0);
  draft.version = 9;
  draft.start();
  assert.equal(await draft.save(), true);
  assert.equal(calls[0].version, 9);
});

test("manual save during an unchanged autosave still requests a manual revision checkpoint", async (t) => {
  let finish;
  const { draft, calls } = setup(t, (input) =>
    calls.length === 1
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : { ok: true, data: { version: input.version + 1 } },
  );
  draft.change("first");
  t.mock.timers.tick(10_000);
  await settle();
  const manual = draft.save();
  finish({ ok: true, data: { version: 2 } });
  assert.equal(await manual, true);
  assert.deepEqual(
    calls.map((call) => call.mode),
    ["autosave", "manual"],
  );
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("leaving before autosave preserves a recoverable local snapshot, and mismatched versions cannot overwrite", async (t) => {
  const storage = memoryStorage();
  const { draft, calls, states } = setup(t);
  assert.equal(draft.attachStorage(storage, "actor:post"), null);
  draft.change("unsaved");
  draft.stop();
  const snapshot = JSON.parse(storage.getItem("actor:post"));
  assert.deepEqual(snapshot, { version: 1, document: "unsaved" });
  draft.start();
  draft.version = 8;
  draft.restore(snapshot.document, snapshot.version);
  assert.equal(states.at(-1).state, "conflict");
  assert.equal(await draft.save(), false);
  assert.equal(calls.length, 0);
  assert.equal(JSON.parse(storage.getItem("actor:post")).version, 1);
});

test("recovery saves use the current version and remove backup only when all local edits are saved", async (t) => {
  const storage = memoryStorage();
  let finish;
  const { draft, calls } = setup(t, (input) =>
    calls.length === 1
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : { ok: true, data: { version: input.version + 1 } },
  );
  draft.attachStorage(storage, "actor:post");
  draft.restore("recovered", 1);
  t.mock.timers.tick(10_000);
  await settle();
  draft.change("newer");
  finish({ ok: true, data: { version: 2 } });
  await settle();
  assert.deepEqual(JSON.parse(storage.getItem("actor:post")), { version: 2, document: "newer" });
  assert.equal(await draft.save(), true);
  assert.equal(storage.getItem("actor:post"), null);
});

test("invalid or unavailable session storage does not block normal saves", async (t) => {
  const { draft } = setup(t);
  assert.equal(draft.attachStorage({ getItem: () => "{invalid", setItem() {}, removeItem() {} }, "post"), null);
  assert.equal(
    draft.attachStorage(
      {
        getItem: () => {
          throw Error("blocked");
        },
        setItem() {
          throw Error("blocked");
        },
        removeItem() {},
      },
      "post",
    ),
    null,
  );
  draft.change("local");
  assert.equal(await draft.save(), true);
});

test("a storage failure reports recovery unavailability while preserving ordinary persistence", async () => {
  let warnings = 0;
  const draft = createDraftPersistence({
    document: "initial",
    version: 1,
    request: async () => ({ ok: true, data: { version: 2 } }),
    onState() {},
    onBackupFailure: () => warnings++,
  });
  draft.attachStorage(
    {
      getItem: () => null,
      setItem: () => {
        throw Error("quota");
      },
      removeItem() {},
    },
    "post",
  );
  draft.change("local");
  assert.equal(warnings, 1);
  assert.equal(await draft.save(), true);
  draft.stop();
});

test("typing then undoing removes the local backup without a request, while manual save still checkpoints", async (t) => {
  const storage = memoryStorage();
  const { draft, calls, states } = setup(t);
  draft.attachStorage(storage, "actor:post");
  draft.change("temporary edit");
  assert.deepEqual(JSON.parse(storage.getItem("actor:post")), { version: 1, document: "temporary edit" });
  t.mock.timers.tick(4_000);
  draft.change("initial");
  t.mock.timers.tick(10_000);
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(draft.dirty, false);
  assert.equal(storage.getItem("actor:post"), null);
  assert.equal(states.at(-1).state, "saved");
  assert.equal(await draft.save(), true);
  assert.deepEqual(calls, [{ document: "initial", version: 1, mode: "manual" }]);
});

test("structurally equal nested documents skip requests, but formatting and metadata edits persist", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const document = {
    ...createBlogDocument("Nested document"),
    body: {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Formatting matters",
                      marks: [{ type: "bold" }, { type: "link", attrs: { href: "https://example.com" } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
  const calls = [];
  const draft = createDraftPersistence({
    document,
    version: 1,
    request: async (input) => {
      calls.push(input);
      return { ok: true, data: { version: input.version + 1 } };
    },
    onState() {},
  });
  t.after(() => draft.stop());
  draft.change(structuredClone(document));
  assert.equal(await draft.save("autosave"), true);
  assert.equal(calls.length, 0, "object identity is not content identity");
  const formatted = structuredClone(document);
  formatted.body.content[0].content[0].content[0].content[0].marks[0] = { type: "italic" };
  draft.change(formatted);
  assert.equal(await draft.save("autosave"), true);
  assert.deepEqual(calls[0].document, formatted);
  const metadata = { ...formatted, title: "A different title" };
  draft.change(metadata);
  assert.equal(await draft.save("autosave"), true);
  assert.deepEqual(calls[1], { document: metadata, version: 2, mode: "autosave" });
  draft.change(structuredClone(metadata));
  assert.equal(await draft.save("autosave"), true);
  assert.equal(calls.length, 2);
});

test("reverting to the original document during an in-flight save must overwrite the newly saved document", async (t) => {
  let finish;
  const storage = memoryStorage();
  const { draft, calls } = setup(t, (input) =>
    calls.length === 1
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : { ok: true, data: { version: input.version + 1 } },
  );
  draft.attachStorage(storage, "actor:post");
  draft.change("submitted edit");
  const saving = draft.save("autosave");
  await settle();
  draft.change("initial");
  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(calls.length, 1, "autosave must not overlap the in-flight request");
  assert.equal(draft.dirty, true);
  assert.equal(JSON.parse(storage.getItem("actor:post")).document, "initial");
  finish({ ok: true, data: { version: 7 } });
  await saving;
  await settle();
  t.mock.timers.tick(10_000);
  await settle();
  assert.deepEqual(calls, [
    { document: "submitted edit", version: 1, mode: "autosave" },
    { document: "initial", version: 7, mode: "autosave" },
  ]);
  assert.equal(draft.dirty, false);
  assert.equal(storage.getItem("actor:post"), null);
});

test("editing and undoing to the in-flight snapshot becomes clean on acknowledgement without another request", async (t) => {
  let finish;
  const storage = memoryStorage();
  const { draft, calls } = setup(
    t,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  draft.attachStorage(storage, "actor:post");
  draft.change("submitted edit");
  const saving = draft.save("autosave");
  await settle();
  draft.change("temporary newer edit");
  draft.change("submitted edit");
  finish({ ok: true, data: { version: 8 } });
  assert.equal(await saving, true);
  assert.equal(draft.dirty, false);
  assert.equal(storage.getItem("actor:post"), null);
  t.mock.timers.tick(120_000);
  await settle();
  assert.equal(calls.length, 1);
});

test("concurrent manual flushes serialize slow saves and include edits made during the flush", async (t) => {
  const replies = [];
  const { draft, calls } = setup(t, () => new Promise((resolve) => replies.push(resolve)));
  draft.change("autosaved");
  t.mock.timers.tick(10_000);
  await settle();
  draft.change("edited while autosaving");
  const first = draft.save();
  const second = draft.save();
  assert.equal(calls.length, 1);
  replies.shift()({ ok: true, data: { version: 5 } });
  await settle();
  assert.equal(calls.length, 2, "both callers share one manual request");
  assert.deepEqual(calls[1], { document: "edited while autosaving", version: 5, mode: "manual" });
  draft.change("edited during manual save");
  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(calls.length, 2);
  replies.shift()({ ok: true, data: { version: 11 } });
  await settle();
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2], { document: "edited during manual save", version: 11, mode: "manual" });
  replies.shift()({ ok: true, data: { version: 12 } });
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(draft.version, 12);
  assert.equal(draft.dirty, false);
  t.mock.timers.tick(120_000);
  await settle();
  assert.equal(calls.length, 3);
});

test("a committed save with a lost response cannot mark an undo clean or overwrite the remote version", async (t) => {
  const storage = memoryStorage();
  let remote = { document: "initial", version: 1 };
  const { draft, calls, states } = setup(t, (input) => {
    if (input.version !== remote.version) return { ok: false, code: "CONFLICT", message: "Reload the saved version." };
    remote = { document: input.document, version: input.version + 1 };
    throw Error("response lost after commit");
  });
  draft.attachStorage(storage, "actor:post");
  draft.change("committed remotely");
  assert.equal(await draft.save("autosave"), false);
  draft.change("initial");
  t.mock.timers.tick(10_000);
  await settle();
  assert.deepEqual(calls, [
    { document: "committed remotely", version: 1, mode: "autosave" },
    { document: "initial", version: 1, mode: "autosave" },
  ]);
  assert.deepEqual(remote, { document: "committed remotely", version: 2 });
  assert.equal(states.at(-1).state, "conflict");
  assert.equal(draft.dirty, true);
  assert.deepEqual(JSON.parse(storage.getItem("actor:post")), { version: 1, document: "initial" });
  draft.change("more local work");
  t.mock.timers.tick(120_000);
  await settle();
  assert.equal(await draft.save(), false);
  assert.equal(calls.length, 2);
});

test("failed requests preserve an undo backup until a confirmed retry reestablishes the saved snapshot", async (t) => {
  const storage = memoryStorage();
  const { draft, calls } = setup(t, (input) =>
    calls.length === 1
      ? { ok: false, code: "UNAVAILABLE", message: "Try again." }
      : { ok: true, data: { version: input.version + 1 } },
  );
  draft.attachStorage(storage, "actor:post");
  draft.change("possibly saved");
  assert.equal(await draft.save("autosave"), false);
  draft.change("initial");
  assert.equal(storage.getItem("actor:post") !== null, true);
  assert.equal(await draft.save("autosave"), true);
  assert.equal(calls.length, 2, "only an acknowledged request can reestablish a safe baseline");
  assert.equal(storage.getItem("actor:post"), null);
  draft.change("another edit");
  draft.change("initial");
  assert.equal(await draft.save("autosave"), true);
  assert.equal(calls.length, 2, "deduplication resumes after the successful retry");
});

test("same-version recovery equal to the saved document clears its backup without a request", async (t) => {
  const storage = memoryStorage();
  storage.setItem("actor:post", JSON.stringify({ version: 1, document: "initial" }));
  const { draft, calls } = setup(t);
  const snapshot = draft.attachStorage(storage, "actor:post");
  draft.restore(snapshot.document, snapshot.version);
  t.mock.timers.tick(10_000);
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(draft.dirty, false);
  assert.equal(storage.getItem("actor:post"), null);
});

test("mismatched recovery remains conflicted even when its content equals the current server document", async (t) => {
  const storage = memoryStorage();
  const { draft, calls, states } = setup(t);
  draft.attachStorage(storage, "actor:post");
  draft.restore("initial", 3);
  t.mock.timers.tick(120_000);
  await settle();
  assert.equal(await draft.save("autosave"), false);
  assert.equal(await draft.save(), false);
  assert.equal(calls.length, 0);
  assert.equal(draft.dirty, true);
  assert.equal(states.at(-1).state, "conflict");
  assert.deepEqual(JSON.parse(storage.getItem("actor:post")), { version: 3, document: "initial" });
});

test("stopping during a slow request preserves newer local work and restart resumes autosave", async (t) => {
  let finish;
  const storage = memoryStorage();
  const { draft, calls, states } = setup(t, (input) =>
    calls.length === 1
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : { ok: true, data: { version: input.version + 1 } },
  );
  draft.attachStorage(storage, "actor:post");
  draft.change("submitted");
  const saving = draft.save("autosave");
  await settle();
  draft.change("newer unsaved");
  draft.stop();
  const stateCount = states.length;
  finish({ ok: true, data: { version: 2 } });
  assert.equal(await saving, false);
  t.mock.timers.tick(120_000);
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(states.length, stateCount, "unmounted editors must not receive state callbacks");
  assert.equal(JSON.parse(storage.getItem("actor:post")).document, "newer unsaved");
  draft.start();
  t.mock.timers.tick(10_000);
  await settle();
  assert.deepEqual(calls[1], { document: "newer unsaved", version: 2, mode: "autosave" });
  assert.equal(draft.dirty, false);
  assert.equal(storage.getItem("actor:post"), null);
});

test("deduplication never deletes a replacement recovery snapshot owned by another writer", async (t) => {
  const storage = memoryStorage();
  const { draft, calls } = setup(t);
  draft.attachStorage(storage, "actor:post");
  draft.change("temporary");
  draft.change("initial");
  const replacement = JSON.stringify({ version: 1, document: "another writer's unsaved work" });
  storage.setItem("actor:post", replacement);
  assert.equal(await draft.save("autosave"), true);
  assert.equal(calls.length, 0);
  assert.equal(storage.getItem("actor:post"), replacement);
});

test("a failed manual checkpoint on an unchanged document is retried rather than deduplicated", async (t) => {
  const { draft, calls, states } = setup(t, (input) => {
    if (calls.length === 1) throw Error("offline");
    return { ok: true, data: { version: input.version + 1 } };
  });
  assert.equal(await draft.save(), false);
  assert.equal(states.at(-1).state, "error");
  t.mock.timers.tick(120_000);
  await settle();
  assert.equal(calls.length, 1, "a failed checkpoint must not retry in a loop");
  assert.equal(await draft.save(), true);
  assert.deepEqual(calls, [
    { document: "initial", version: 1, mode: "manual" },
    { document: "initial", version: 1, mode: "manual" },
  ]);
  assert.equal(draft.dirty, false);
});

test("an unchanged autosave cancels its old deadline before a later editing session starts", async (t) => {
  const { draft, calls } = setup(t);
  draft.change("temporary");
  t.mock.timers.tick(9_000);
  draft.change("initial");
  t.mock.timers.tick(10_000);
  await settle();
  assert.equal(calls.length, 0);
  t.mock.timers.tick(31_000);
  for (let edit = 0; edit < 12; edit++) {
    draft.change(`later edit ${edit}`);
    t.mock.timers.tick(edit === 11 ? 4_999 : 5_000);
    await settle();
    assert.equal(calls.length, 0, "the reverted session's deadline must not save the new session early");
  }
  t.mock.timers.tick(1);
  await settle();
  assert.deepEqual(calls, [{ document: "later edit 11", version: 1, mode: "autosave" }]);
});

test("edits made while an unchanged autosave completes remain dirty, recoverable, and scheduled", async (t) => {
  const storage = memoryStorage();
  const { draft, calls } = setup(t);
  draft.attachStorage(storage, "actor:post");
  draft.change("initial");
  const saving = draft.save("autosave");
  draft.change("newer before completion");
  assert.equal(await saving, true);
  assert.equal(calls.length, 0);
  assert.equal(draft.dirty, true);
  assert.deepEqual(JSON.parse(storage.getItem("actor:post")), { version: 1, document: "newer before completion" });
  t.mock.timers.tick(9_999);
  await settle();
  assert.equal(calls.length, 0);
  t.mock.timers.tick(1);
  await settle();
  assert.deepEqual(calls, [{ document: "newer before completion", version: 1, mode: "autosave" }]);
  assert.equal(draft.dirty, false);
  assert.equal(storage.getItem("actor:post"), null);
});

for (const outcome of ["saved", "error", "conflict"]) {
  test(`approved agent draft uses existing autosave and preserves ${outcome} feedback`, async (t) => {
    const { agentDocumentFingerprint, agentReplacement } = await import("../lib/blog/agentArtifacts.ts");
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const before = { ...createBlogDocument("Original"), authorName: "Editor" };
    const proposed = {
      ...before,
      title: "Revised",
      excerpt: "New excerpt",
      seoTitle: "Search title",
      body: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Complete replacement" }] }],
      },
    };
    const artifact = {
      schemaVersion: 1,
      agentId: "optimizer",
      agentVersion: 1,
      summary: "Optimized",
      content: { document: proposed },
      inputArtifactIds: [],
      baseDocumentFingerprint: agentDocumentFingerprint(before),
    };
    const calls = [],
      states = [];
    const persistence = createDraftPersistence({
      document: before,
      version: 7,
      onState: (state) => states.push(state),
      request: async (input) => {
        calls.push(input);
        if (outcome === "error") throw new Error("offline");
        if (outcome === "conflict") return { ok: false, code: "CONFLICT", message: "Reload the saved version." };
        return { ok: true, data: { version: 8 } };
      },
    });
    t.after(() => persistence.stop());
    t.mock.timers.tick(10_000);
    await settle();
    assert.equal(calls.length, 0, "receiving a proposal must not save it");
    const approved = agentReplacement(artifact, before);
    persistence.change(approved);
    t.mock.timers.tick(10_000);
    await settle();
    assert.deepEqual(calls, [{ document: { ...proposed, authorName: "Editor" }, version: 7, mode: "autosave" }]);
    assert.equal(states.at(-1), outcome);
    assert.equal(persistence.dirty, outcome !== "saved");
    if (outcome !== "saved") {
      t.mock.timers.tick(60_000);
      await settle();
      assert.equal(calls.length, 1, "failed/conflicted approval must not retry or overwrite newer work silently");
    }
  });
}
