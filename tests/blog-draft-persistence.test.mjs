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
  const { encodeReply } = createRequire(import.meta.url)(
    "next/dist/compiled/react-server-dom-webpack/client.browser",
  );
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
    draft.change(document);
    assert.equal(await draft.save(mode), true, `${mode} must cross the Server Action boundary`);
    assert.equal(draft.dirty, false);
    assert.deepEqual(payloads.at(-1), [
      "save",
      {
        postId: "post-1",
        document: JSON.parse(JSON.stringify(document)),
        version: payloads.length,
        mode,
      },
    ]);
  }
  assert.equal(states.includes("error"), false);
  assert.equal(draft.version, 3);
});

test("autosave coalesces typing after three seconds idle and stays bounded during continuous edits", async (t) => {
  const { draft, calls } = setup(t);
  draft.change("one");
  t.mock.timers.tick(2_000);
  draft.change("two");
  t.mock.timers.tick(2_999);
  assert.equal(calls.length, 0);
  t.mock.timers.tick(1);
  await settle();
  assert.deepEqual(calls, [{ document: "two", version: 1, mode: "autosave" }]);
  for (let i = 0; i < 15; i++) {
    draft.change(String(i));
    t.mock.timers.tick(2_000);
  }
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].document, "14");
  assert.equal(calls[1].version, 2);
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
  t.mock.timers.tick(3_000);
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
  t.mock.timers.tick(3_000);
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
  t.mock.timers.tick(3_000);
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
  assert.equal(
    draft.attachStorage({ getItem: () => "{invalid", setItem() {}, removeItem() {} }, "post"),
    null,
  );
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
