export const STORAGE_KEY = "canopy.saved-tools.v1";
export type SavedTool = { toolId: string; name: string; href: string; category: string };
export type SavedMutation = { userId: string; operation: "merge" | "save" | "remove"; toolIds: string[] };
type SavedResponse = { userId: string | null; savedTools: string[]; tools?: SavedTool[] };
type LocalBookmarks = { ids: string[]; imports: Record<string, string[]> };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type Snapshot = {
  userId: string | null | undefined;
  ids: string[];
  tools: SavedTool[];
  status: "loading" | "ready" | "error";
  pending: boolean;
  error: string;
};
const initial = (): Snapshot => ({
  userId: undefined,
  ids: [],
  tools: [],
  status: "loading",
  pending: false,
  error: "",
});
const isIds = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 500 &&
  value.every((id) => typeof id === "string" && /^[a-z][a-z0-9-]*\.[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id));

function readLocal(storage: Storage): LocalBookmarks {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { ids: [], imports: {} };
  const parsed: unknown = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("ids" in parsed) ||
    !isIds(parsed.ids) ||
    !("imports" in parsed) ||
    !parsed.imports ||
    typeof parsed.imports !== "object" ||
    Array.isArray(parsed.imports) ||
    Object.values(parsed.imports).some((value) => !isIds(value))
  ) {
    throw new Error("Invalid local bookmarks");
  }
  return { ids: [...new Set(parsed.ids)], imports: { ...parsed.imports } as Record<string, string[]> };
}

export async function requestSavedTools(operation?: SavedMutation): Promise<SavedResponse> {
  const response = await fetch("/api/user-preferences/saved-tools", {
    method: operation ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    ...(operation ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(operation) } : {}),
  });
  if (!response.ok) throw new Error("Saved tools request failed");
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("userId" in data) ||
    (data.userId !== null && typeof data.userId !== "string") ||
    !("savedTools" in data) ||
    !isIds(data.savedTools)
  )
    throw new Error("Invalid saved tools response");
  if (
    !operation &&
    (!("tools" in data) ||
      !Array.isArray(data.tools) ||
      !data.tools.every((tool: unknown) => {
        if (!tool || typeof tool !== "object") return false;
        const t = tool as Record<string, unknown>;
        return (
          isIds([t.toolId]) &&
          typeof t.name === "string" &&
          typeof t.category === "string" &&
          typeof t.href === "string" &&
          /^\/(devtools|media|paperwork)\/[a-z0-9-]+$/.test(t.href)
        );
      }))
  )
    throw new Error("Invalid saved tools catalog");
  return data as SavedResponse;
}

/** Account imports remain locally staged until acknowledged; never reuse them for another account. */
export class SavedToolsStore {
  private storage: Storage;
  private request: (operation?: SavedMutation) => Promise<SavedResponse>;
  private snapshot = initial();
  private listeners = new Set<() => void>();
  private epoch = 0;
  private busy = false;

  constructor(storage: Storage, request = requestSavedTools) {
    this.storage = storage;
    this.request = request;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private write(value: LocalBookmarks) {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(value));
  }
  invalidate = () => {
    this.epoch++;
    this.busy = false;
    this.snapshot = initial();
    this.listeners.forEach((listener) => listener());
  };

  refresh = async () => {
    if (this.busy) return;
    this.busy = true;
    const epoch = ++this.epoch;
    this.set({ status: "loading", error: "", ids: [], userId: undefined });
    try {
      let response = await this.request();
      if (epoch !== this.epoch) return;
      const tools = response.tools ?? [];
      this.set({ userId: response.userId, tools });
      let local = readLocal(this.storage);
      if (response.userId) {
        const owner = response.userId;
        const staged = Object.hasOwn(local.imports, owner) ? local.imports[owner] : [];
        const imported = [...new Set([...local.ids, ...staged])];
        if (imported.length) {
          // Persist ownership BEFORE network I/O. A failed or ambiguous response
          // can be retried only by this account, including after logout/reload.
          this.write({ ids: [], imports: { ...local.imports, [owner]: imported } });
          response = await this.request({ userId: owner, operation: "merge", toolIds: imported });
          if (epoch !== this.epoch) return;
          if (response.userId !== owner) throw new Error("Account changed");
          local = readLocal(this.storage);
          const remaining = (Object.hasOwn(local.imports, owner) ? local.imports[owner] : []).filter(
            (id) => !imported.includes(id),
          );
          if (remaining.length) local.imports[owner] = remaining;
          else delete local.imports[owner];
          this.write(local);
        }
        this.set({ ids: response.savedTools, status: "ready", error: "" });
      } else {
        this.set({ ids: local.ids, status: "ready", error: "" });
      }
    } catch {
      if (epoch === this.epoch)
        this.set({
          status: "error",
          error:
            "Couldn’t load or sync Saved. Check your connection and browser storage, then try again. Local bookmarks have not been discarded.",
        });
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  };

  change = async (toolId: string, save: boolean): Promise<boolean> => {
    if (this.busy || this.snapshot.status !== "ready" || !this.snapshot.tools.some((tool) => tool.toolId === toolId))
      return false;
    this.busy = true;
    const epoch = this.epoch;
    this.set({ pending: true, error: "" });
    try {
      const userId = this.snapshot.userId;
      let ids: string[];
      if (userId) {
        const response = await this.request({ userId, operation: save ? "save" : "remove", toolIds: [toolId] });
        if (epoch !== this.epoch) return false;
        if (response.userId !== userId) {
          this.invalidate();
          return false;
        }
        ids = response.savedTools;
      } else if (userId === null) {
        const local = readLocal(this.storage);
        ids = save ? [...new Set([toolId, ...local.ids])] : local.ids.filter((id) => id !== toolId);
        this.write({ ...local, ids });
      } else return false;
      if (epoch !== this.epoch) return false;
      this.set({ ids });
      return true;
    } catch {
      if (epoch === this.epoch)
        this.set({
          error:
            "Couldn’t confirm the change. Check your connection and browser storage, then retry. If your session ended, reload Saved or sign in again.",
        });
      return false;
    } finally {
      if (epoch === this.epoch) {
        this.busy = false;
        this.set({ pending: false });
      }
    }
  };
}
