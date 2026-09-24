import { expect, test } from "vitest";
import { SavedToolsStore, STORAGE_KEY } from "../components/ui/lib/saved-tools.ts";

const tools = ["devtools.json-formatter", "media.merge-pdf"].map((toolId) => ({
  toolId,
  name: toolId,
  href: `/${toolId.replace(".", "/")}`,
  category: "Tools",
}));
function setup({ userId = null, savedTools = [], failMerge = false } = {}) {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const account = { userId, savedTools, failMerge };
  const calls = [];
  const request = async (operation) => {
    calls.push(operation);
    if (operation) {
      expect(operation.userId).toBe(account.userId);
      if (account.failMerge) throw new Error("Offline");
      account.savedTools =
        operation.operation === "remove"
          ? account.savedTools.filter((id) => !operation.toolIds.includes(id))
          : [...new Set([...account.savedTools, ...operation.toolIds])];
    }
    return { userId: account.userId, savedTools: account.savedTools, tools };
  };
  return { store: new SavedToolsStore(storage, request), account, storage, values, calls };
}

test("guest save, deduplication, removal and reload use localStorage only", async () => {
  const { store, storage, calls } = setup();
  await store.refresh();
  await store.change(tools[0].toolId, true);
  await store.change(tools[0].toolId, true);
  expect(store.getSnapshot().ids).toEqual([tools[0].toolId]);
  expect(JSON.parse(storage.getItem(STORAGE_KEY)).ids).toEqual([tools[0].toolId]);
  await store.refresh();
  expect(store.getSnapshot().ids).toEqual([tools[0].toolId]);
  await store.change(tools[0].toolId, false);
  expect(store.getSnapshot().ids).toEqual([]);
  expect(calls.filter(Boolean).length).toBe(0);
});

test("sign-in unions guest and account lists without duplicates; success clears staged import", async () => {
  const { store, account, storage } = setup();
  await store.refresh();
  await store.change(tools[0].toolId, true);
  account.userId = "user-a";
  account.savedTools = [tools[0].toolId, tools[1].toolId];
  await store.refresh();
  expect(new Set(store.getSnapshot().ids)).toEqual(new Set(tools.map((t) => t.toolId)));
  expect(JSON.parse(storage.getItem(STORAGE_KEY))).toEqual({ ids: [], imports: {} });
});

test("failed merge remains staged for its owner and cannot leak to another account", async () => {
  const { store, account, storage } = setup();
  await store.refresh();
  await store.change(tools[0].toolId, true);
  account.userId = "user-a";
  account.failMerge = true;
  await store.refresh();
  expect(store.getSnapshot().error).toBeTruthy();
  expect(JSON.parse(storage.getItem(STORAGE_KEY)).imports["user-a"]).toEqual([tools[0].toolId]);
  account.userId = "user-b";
  account.failMerge = false;
  account.savedTools = [];
  await store.refresh();
  expect(store.getSnapshot().ids).toEqual([]);
  account.userId = "user-a";
  await store.refresh();
  expect(store.getSnapshot().ids).toEqual([tools[0].toolId]);
});

test("logout does not copy account bookmarks into guest storage", async () => {
  const { store, account } = setup({ userId: "user-a", savedTools: [tools[0].toolId] });
  await store.refresh();
  account.userId = null;
  account.savedTools = [];
  await store.refresh();
  expect(store.getSnapshot().ids).toEqual([]);
});

test("storage failures and malformed storage do not claim a successful save", async () => {
  const { store, storage } = setup();
  storage.setItem(STORAGE_KEY, "{invalid");
  await store.refresh();
  expect(store.getSnapshot().error).toBeTruthy();
  storage.setItem(STORAGE_KEY, JSON.stringify({ ids: [], imports: {} }));
  await store.refresh();
  storage.setItem = () => {
    throw new Error("Quota exceeded");
  };
  expect(await store.change(tools[0].toolId, true)).toBe(false);
  expect(store.getSnapshot().ids).toEqual([]);
  expect(store.getSnapshot().error).toBeTruthy();
});

test("failed account mutation retains the confirmed list", async () => {
  const { store, account } = setup({ userId: "user-a", savedTools: [tools[0].toolId] });
  await store.refresh();
  account.failMerge = true;
  expect(await store.change(tools[0].toolId, false)).toBe(false);
  expect(store.getSnapshot().ids).toEqual([tools[0].toolId]);
});

test("delayed responses cannot reveal the previous account after invalidation", async () => {
  let resolve;
  const store = new SavedToolsStore(
    { getItem: () => null, setItem: () => {} },
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const refresh = store.refresh();
  store.invalidate();
  resolve({ userId: "old-user", savedTools: [tools[0].toolId], tools });
  await refresh;
  expect(store.getSnapshot().ids).toEqual([]);
  expect(store.getSnapshot().userId).toBe(undefined);
});
