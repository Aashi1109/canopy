import { expect, test, afterEach, vi, onTestFinished } from "vitest";
import { createRequire } from "node:module";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { createDraftPersistence } from "../app/admin/(protected)/blog/lib/draftPersistence.ts";
import { blogFormattingExtensions } from "../app/admin/(protected)/blog/lib/formattingExtensions.ts";
import { createBlogDocument } from "../lib/blog/document.ts";

function setup(request) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
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
  onTestFinished(() => draft.stop());
  return { draft, calls, states };
}
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

afterEach(() => {
  vi.useRealTimers();
});

test("editor drafts reach React Server Actions during autosave and manual save without losing formatting", async () => {
  // The installed Flight encoder needs the bundler hook even for plain argument encoding.
  const previousWebpackRequire = globalThis.__webpack_require__;
  globalThis.__webpack_require__ = { u() {} };
  onTestFinished(() => {
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
  onTestFinished(() => draft.stop());
  for (const mode of ["autosave", "manual"]) {
    draft.change({ ...document, title: `${document.title} ${mode}` });
    expect(await draft.save(mode), `${mode} must cross the Server Action boundary`).toBe(true);
    expect(draft.dirty).toBe(false);
    expect(payloads.at(-1)).toEqual([
      "save",
      {
        postId: "post-1",
        document: JSON.parse(JSON.stringify({ ...document, title: `${document.title} ${mode}` })),
        version: payloads.length,
        mode,
      },
    ]);
  }
  expect(states.includes("error")).toBe(false);
  expect(draft.version).toBe(3);
});

test("autosave waits ten seconds after the final edit and sends only the latest document", async () => {
  const { draft, calls } = setup();
  draft.change("one");
  vi.advanceTimersByTime(9_000);
  await settle();
  expect(calls.length).toBe(0);
  draft.change("two");
  vi.advanceTimersByTime(9_999);
  await settle();
  expect(calls.length).toBe(0);
  vi.advanceTimersByTime(1);
  await settle();
  expect(calls).toEqual([{ document: "two", version: 1, mode: "autosave" }]);
  vi.advanceTimersByTime(120_000);
  await settle();
  expect(calls.length, "the old deadline must not create another request").toBe(1);
});

test("continuous typing saves at sixty seconds across repeated cycles without resetting the deadline", async () => {
  const { draft, calls } = setup();
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let edit = 0; edit < 12; edit++) {
      draft.change(`${cycle}:${edit}`);
      vi.advanceTimersByTime(edit === 11 ? 4_999 : 5_000);
      await settle();
      expect(calls.length, "typing must not trigger an early idle save").toBe(cycle);
    }
    vi.advanceTimersByTime(1);
    await settle();
    expect(calls[cycle]).toEqual({ document: `${cycle}:11`, version: cycle + 1, mode: "autosave" });
  }
});

test("manual save waits for an autosave and flushes newer edits using the returned version", async () => {
  let finish;
  const { draft, calls } = setup((input) =>
    calls.length === 1
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : { ok: true, data: { version: input.version + 1 } },
  );
  draft.change("first");
  vi.advanceTimersByTime(10_000);
  draft.change("newer");
  const flushed = draft.save();
  await settle();
  expect(calls.length).toBe(1);
  finish({ ok: true, data: { version: 4 } });
  expect(await flushed).toBe(true);
  expect(calls[1]).toEqual({ document: "newer", version: 4, mode: "manual" });
  expect(draft.dirty).toBe(false);
});

test("conflict stays sticky while typing and never overwrites the remote revision", async () => {
  const { draft, calls, states } = setup(() => ({
    ok: false,
    code: "CONFLICT",
    message: "Reload the saved version.",
  }));
  draft.change("local");
  expect(await draft.save()).toBe(false);
  draft.change("still local");
  vi.advanceTimersByTime(60_000);
  await settle();
  expect(await draft.save()).toBe(false);
  expect(calls.length).toBe(1);
  expect(states.at(-1).state).toBe("conflict");
  expect(draft.dirty).toBe(true);
});

test("failed requests preserve edits, do not loop, and can be retried explicitly", async () => {
  let fail = true;
  const { draft, calls, states } = setup((input) => {
    if (fail) throw Error("offline");
    return { ok: true, data: { version: input.version + 1 } };
  });
  draft.change("local");
  expect(await draft.save()).toBe(false);
  expect(states.at(-1).state).toBe("error");
  vi.advanceTimersByTime(60_000);
  expect(calls.length).toBe(1);
  fail = false;
  expect(await draft.save()).toBe(true);
  expect(draft.dirty).toBe(false);
});

test("teardown cancels autosave and publication version changes feed the next save", async () => {
  const { draft, calls } = setup();
  draft.change("local");
  draft.stop();
  vi.advanceTimersByTime(60_000);
  expect(calls.length).toBe(0);
  draft.version = 9;
  draft.start();
  expect(await draft.save()).toBe(true);
  expect(calls[0].version).toBe(9);
});

test("manual save during an unchanged autosave still requests a manual revision checkpoint", async () => {
  let finish;
  const { draft, calls } = setup((input) =>
    calls.length === 1
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : { ok: true, data: { version: input.version + 1 } },
  );
  draft.change("first");
  vi.advanceTimersByTime(10_000);
  await settle();
  const manual = draft.save();
  finish({ ok: true, data: { version: 2 } });
  expect(await manual).toBe(true);
  expect(calls.map((call) => call.mode)).toEqual(["autosave", "manual"]);
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("leaving before autosave preserves a recoverable local snapshot, and mismatched versions cannot overwrite", async () => {
  const storage = memoryStorage();
  const { draft, calls, states } = setup();
  expect(draft.attachStorage(storage, "actor:post")).toBe(null);
  draft.change("unsaved");
  draft.stop();
  const snapshot = JSON.parse(storage.getItem("actor:post"));
  expect(snapshot).toEqual({ version: 1, document: "unsaved" });
  draft.start();
  draft.version = 8;
  draft.restore(snapshot.document, snapshot.version);
  expect(states.at(-1).state).toBe("conflict");
  expect(await draft.save()).toBe(false);
  expect(calls.length).toBe(0);
  expect(JSON.parse(storage.getItem("actor:post")).version).toBe(1);
});

test("recovery saves use the current version and remove backup only when all local edits are saved", async () => {
  const storage = memoryStorage();
  let finish;
  const { draft, calls } = setup((input) =>
    calls.length === 1
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : { ok: true, data: { version: input.version + 1 } },
  );
  draft.attachStorage(storage, "actor:post");
  draft.restore("recovered", 1);
  vi.advanceTimersByTime(10_000);
  await settle();
  draft.change("newer");
  finish({ ok: true, data: { version: 2 } });
  await settle();
  expect(JSON.parse(storage.getItem("actor:post"))).toEqual({ version: 2, document: "newer" });
  expect(await draft.save()).toBe(true);
  expect(storage.getItem("actor:post")).toBe(null);
});

test("invalid or unavailable session storage does not block normal saves", async () => {
  const { draft } = setup();
  expect(draft.attachStorage({ getItem: () => "{invalid", setItem() {}, removeItem() {} }, "post")).toBe(null);
  expect(
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
  ).toBe(null);
  draft.change("local");
  expect(await draft.save()).toBe(true);
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
  expect(warnings).toBe(1);
  expect(await draft.save()).toBe(true);
  draft.stop();
});

test("typing then undoing removes the local backup without a request, while manual save still checkpoints", async () => {
  const storage = memoryStorage();
  const { draft, calls, states } = setup();
  draft.attachStorage(storage, "actor:post");
  draft.change("temporary edit");
  expect(JSON.parse(storage.getItem("actor:post"))).toEqual({ version: 1, document: "temporary edit" });
  vi.advanceTimersByTime(4_000);
  draft.change("initial");
  vi.advanceTimersByTime(10_000);
  await settle();
  expect(calls.length).toBe(0);
  expect(draft.dirty).toBe(false);
  expect(storage.getItem("actor:post")).toBe(null);
  expect(states.at(-1).state).toBe("saved");
  expect(await draft.save()).toBe(true);
  expect(calls).toEqual([{ document: "initial", version: 1, mode: "manual" }]);
});

test("structurally equal nested documents skip requests, but formatting and metadata edits persist", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
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
  onTestFinished(() => draft.stop());
  draft.change(structuredClone(document));
  expect(await draft.save("autosave")).toBe(true);
  expect(calls.length, "object identity is not content identity").toBe(0);
  const formatted = structuredClone(document);
  formatted.body.content[0].content[0].content[0].content[0].marks[0] = { type: "italic" };
  draft.change(formatted);
  expect(await draft.save("autosave")).toBe(true);
  expect(calls[0].document).toEqual(formatted);
  const metadata = { ...formatted, title: "A different title" };
  draft.change(metadata);
  expect(await draft.save("autosave")).toBe(true);
  expect(calls[1]).toEqual({ document: metadata, version: 2, mode: "autosave" });
  draft.change(structuredClone(metadata));
  expect(await draft.save("autosave")).toBe(true);
  expect(calls.length).toBe(2);
});

test("reverting to the original document during an in-flight save must overwrite the newly saved document", async () => {
  let finish;
  const storage = memoryStorage();
  const { draft, calls } = setup((input) =>
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
  vi.advanceTimersByTime(60_000);
  await settle();
  expect(calls.length, "autosave must not overlap the in-flight request").toBe(1);
  expect(draft.dirty).toBe(true);
  expect(JSON.parse(storage.getItem("actor:post")).document).toBe("initial");
  finish({ ok: true, data: { version: 7 } });
  await saving;
  await settle();
  vi.advanceTimersByTime(10_000);
  await settle();
  expect(calls).toEqual([
    { document: "submitted edit", version: 1, mode: "autosave" },
    { document: "initial", version: 7, mode: "autosave" },
  ]);
  expect(draft.dirty).toBe(false);
  expect(storage.getItem("actor:post")).toBe(null);
});

test("editing and undoing to the in-flight snapshot becomes clean on acknowledgement without another request", async () => {
  let finish;
  const storage = memoryStorage();
  const { draft, calls } = setup(
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
  expect(await saving).toBe(true);
  expect(draft.dirty).toBe(false);
  expect(storage.getItem("actor:post")).toBe(null);
  vi.advanceTimersByTime(120_000);
  await settle();
  expect(calls.length).toBe(1);
});

test("concurrent manual flushes serialize slow saves and include edits made during the flush", async () => {
  const replies = [];
  const { draft, calls } = setup(() => new Promise((resolve) => replies.push(resolve)));
  draft.change("autosaved");
  vi.advanceTimersByTime(10_000);
  await settle();
  draft.change("edited while autosaving");
  const first = draft.save();
  const second = draft.save();
  expect(calls.length).toBe(1);
  replies.shift()({ ok: true, data: { version: 5 } });
  await settle();
  expect(calls.length, "both callers share one manual request").toBe(2);
  expect(calls[1]).toEqual({ document: "edited while autosaving", version: 5, mode: "manual" });
  draft.change("edited during manual save");
  vi.advanceTimersByTime(60_000);
  await settle();
  expect(calls.length).toBe(2);
  replies.shift()({ ok: true, data: { version: 11 } });
  await settle();
  expect(calls.length).toBe(3);
  expect(calls[2]).toEqual({ document: "edited during manual save", version: 11, mode: "manual" });
  replies.shift()({ ok: true, data: { version: 12 } });
  expect(await Promise.all([first, second])).toEqual([true, true]);
  expect(draft.version).toBe(12);
  expect(draft.dirty).toBe(false);
  vi.advanceTimersByTime(120_000);
  await settle();
  expect(calls.length).toBe(3);
});

test("a committed save with a lost response cannot mark an undo clean or overwrite the remote version", async () => {
  const storage = memoryStorage();
  let remote = { document: "initial", version: 1 };
  const { draft, calls, states } = setup((input) => {
    if (input.version !== remote.version) return { ok: false, code: "CONFLICT", message: "Reload the saved version." };
    remote = { document: input.document, version: input.version + 1 };
    throw Error("response lost after commit");
  });
  draft.attachStorage(storage, "actor:post");
  draft.change("committed remotely");
  expect(await draft.save("autosave")).toBe(false);
  draft.change("initial");
  vi.advanceTimersByTime(10_000);
  await settle();
  expect(calls).toEqual([
    { document: "committed remotely", version: 1, mode: "autosave" },
    { document: "initial", version: 1, mode: "autosave" },
  ]);
  expect(remote).toEqual({ document: "committed remotely", version: 2 });
  expect(states.at(-1).state).toBe("conflict");
  expect(draft.dirty).toBe(true);
  expect(JSON.parse(storage.getItem("actor:post"))).toEqual({ version: 1, document: "initial" });
  draft.change("more local work");
  vi.advanceTimersByTime(120_000);
  await settle();
  expect(await draft.save()).toBe(false);
  expect(calls.length).toBe(2);
});

test("failed requests preserve an undo backup until a confirmed retry reestablishes the saved snapshot", async () => {
  const storage = memoryStorage();
  const { draft, calls } = setup((input) =>
    calls.length === 1
      ? { ok: false, code: "UNAVAILABLE", message: "Try again." }
      : { ok: true, data: { version: input.version + 1 } },
  );
  draft.attachStorage(storage, "actor:post");
  draft.change("possibly saved");
  expect(await draft.save("autosave")).toBe(false);
  draft.change("initial");
  expect(storage.getItem("actor:post") !== null).toBe(true);
  expect(await draft.save("autosave")).toBe(true);
  expect(calls.length, "only an acknowledged request can reestablish a safe baseline").toBe(2);
  expect(storage.getItem("actor:post")).toBe(null);
  draft.change("another edit");
  draft.change("initial");
  expect(await draft.save("autosave")).toBe(true);
  expect(calls.length, "deduplication resumes after the successful retry").toBe(2);
});

test("same-version recovery equal to the saved document clears its backup without a request", async () => {
  const storage = memoryStorage();
  storage.setItem("actor:post", JSON.stringify({ version: 1, document: "initial" }));
  const { draft, calls } = setup();
  const snapshot = draft.attachStorage(storage, "actor:post");
  draft.restore(snapshot.document, snapshot.version);
  vi.advanceTimersByTime(10_000);
  await settle();
  expect(calls.length).toBe(0);
  expect(draft.dirty).toBe(false);
  expect(storage.getItem("actor:post")).toBe(null);
});

test("mismatched recovery remains conflicted even when its content equals the current server document", async () => {
  const storage = memoryStorage();
  const { draft, calls, states } = setup();
  draft.attachStorage(storage, "actor:post");
  draft.restore("initial", 3);
  vi.advanceTimersByTime(120_000);
  await settle();
  expect(await draft.save("autosave")).toBe(false);
  expect(await draft.save()).toBe(false);
  expect(calls.length).toBe(0);
  expect(draft.dirty).toBe(true);
  expect(states.at(-1).state).toBe("conflict");
  expect(JSON.parse(storage.getItem("actor:post"))).toEqual({ version: 3, document: "initial" });
});

test("stopping during a slow request preserves newer local work and restart resumes autosave", async () => {
  let finish;
  const storage = memoryStorage();
  const { draft, calls, states } = setup((input) =>
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
  expect(await saving).toBe(false);
  vi.advanceTimersByTime(120_000);
  await settle();
  expect(calls.length).toBe(1);
  expect(states.length, "unmounted editors must not receive state callbacks").toBe(stateCount);
  expect(JSON.parse(storage.getItem("actor:post")).document).toBe("newer unsaved");
  draft.start();
  vi.advanceTimersByTime(10_000);
  await settle();
  expect(calls[1]).toEqual({ document: "newer unsaved", version: 2, mode: "autosave" });
  expect(draft.dirty).toBe(false);
  expect(storage.getItem("actor:post")).toBe(null);
});

test("deduplication never deletes a replacement recovery snapshot owned by another writer", async () => {
  const storage = memoryStorage();
  const { draft, calls } = setup();
  draft.attachStorage(storage, "actor:post");
  draft.change("temporary");
  draft.change("initial");
  const replacement = JSON.stringify({ version: 1, document: "another writer's unsaved work" });
  storage.setItem("actor:post", replacement);
  expect(await draft.save("autosave")).toBe(true);
  expect(calls.length).toBe(0);
  expect(storage.getItem("actor:post")).toBe(replacement);
});

test("a failed manual checkpoint on an unchanged document is retried rather than deduplicated", async () => {
  const { draft, calls, states } = setup((input) => {
    if (calls.length === 1) throw Error("offline");
    return { ok: true, data: { version: input.version + 1 } };
  });
  expect(await draft.save()).toBe(false);
  expect(states.at(-1).state).toBe("error");
  vi.advanceTimersByTime(120_000);
  await settle();
  expect(calls.length, "a failed checkpoint must not retry in a loop").toBe(1);
  expect(await draft.save()).toBe(true);
  expect(calls).toEqual([
    { document: "initial", version: 1, mode: "manual" },
    { document: "initial", version: 1, mode: "manual" },
  ]);
  expect(draft.dirty).toBe(false);
});

test("an unchanged autosave cancels its old deadline before a later editing session starts", async () => {
  const { draft, calls } = setup();
  draft.change("temporary");
  vi.advanceTimersByTime(9_000);
  draft.change("initial");
  vi.advanceTimersByTime(10_000);
  await settle();
  expect(calls.length).toBe(0);
  vi.advanceTimersByTime(31_000);
  for (let edit = 0; edit < 12; edit++) {
    draft.change(`later edit ${edit}`);
    vi.advanceTimersByTime(edit === 11 ? 4_999 : 5_000);
    await settle();
    expect(calls.length, "the reverted session's deadline must not save the new session early").toBe(0);
  }
  vi.advanceTimersByTime(1);
  await settle();
  expect(calls).toEqual([{ document: "later edit 11", version: 1, mode: "autosave" }]);
});

test("edits made while an unchanged autosave completes remain dirty, recoverable, and scheduled", async () => {
  const storage = memoryStorage();
  const { draft, calls } = setup();
  draft.attachStorage(storage, "actor:post");
  draft.change("initial");
  const saving = draft.save("autosave");
  draft.change("newer before completion");
  expect(await saving).toBe(true);
  expect(calls.length).toBe(0);
  expect(draft.dirty).toBe(true);
  expect(JSON.parse(storage.getItem("actor:post"))).toEqual({ version: 1, document: "newer before completion" });
  vi.advanceTimersByTime(9_999);
  await settle();
  expect(calls.length).toBe(0);
  vi.advanceTimersByTime(1);
  await settle();
  expect(calls).toEqual([{ document: "newer before completion", version: 1, mode: "autosave" }]);
  expect(draft.dirty).toBe(false);
  expect(storage.getItem("actor:post")).toBe(null);
});

for (const outcome of ["saved", "error", "conflict"]) {
  test(`approved agent draft uses existing autosave and preserves ${outcome} feedback`, async () => {
    const { agentDocumentFingerprint, agentReplacement } = await import("../lib/blog/agentArtifacts.ts");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
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
    onTestFinished(() => persistence.stop());
    vi.advanceTimersByTime(10_000);
    await settle();
    expect(calls.length, "receiving a proposal must not save it").toBe(0);
    const approved = agentReplacement(artifact, before);
    persistence.change(approved);
    vi.advanceTimersByTime(10_000);
    await settle();
    expect(calls).toEqual([{ document: { ...proposed, authorName: "Editor" }, version: 7, mode: "autosave" }]);
    expect(states.at(-1)).toBe(outcome);
    expect(persistence.dirty).toBe(outcome !== "saved");
    if (outcome !== "saved") {
      vi.advanceTimersByTime(60_000);
      await settle();
      expect(calls.length, "failed/conflicted approval must not retry or overwrite newer work silently").toBe(1);
    }
  });
}
