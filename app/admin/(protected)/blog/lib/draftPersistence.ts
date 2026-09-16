export type DraftSaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";
type SaveResult =
  { ok: true; data: { version: number } } | { ok: false; code: string; message: string };

/** One writer per editor: coalesce autosaves, and flush newer edits before leaving or publishing. */
export function createDraftPersistence<T>(options: {
  document: T;
  version: number;
  request: (input: {
    document: T;
    version: number;
    mode: "manual" | "autosave";
  }) => Promise<SaveResult>;
  onState: (state: DraftSaveState, message: string) => void;
  onBackupFailure?: () => void;
}) {
  let document = options.document;
  let version = options.version;
  let generation = 0;
  let savedGeneration = 0;
  let conflict = false;
  let active = true;
  let pending: Promise<boolean> | null = null;
  let pendingMode: "manual" | "autosave" | null = null;
  let storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = null;
  let storageKey = "";
  let backupValue = "";
  let restoredVersion: number | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

  function clearTimers() {
    clearTimeout(idleTimer);
    clearTimeout(deadlineTimer);
    idleTimer = undefined;
    deadlineTimer = undefined;
  }
  function emit(state: DraftSaveState, message: string) {
    if (active) options.onState(state, message);
  }
  function remember() {
    if (!storage || !active) return;
    try {
      backupValue = JSON.stringify({ version: restoredVersion ?? version, document });
      storage.setItem(storageKey, backupValue);
    } catch {
      options.onBackupFailure?.();
    }
  }
  function forget() {
    try {
      if (backupValue && storage?.getItem(storageKey) === backupValue)
        storage.removeItem(storageKey);
    } catch {
      /* Private browser modes may disable storage. */
    }
  }
  function schedule() {
    if (!active || conflict) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      void save("autosave");
    }, 3_000);
    deadlineTimer ??= setTimeout(() => {
      void save("autosave");
    }, 30_000);
  }
  async function save(mode: "manual" | "autosave" = "manual"): Promise<boolean> {
    if (conflict || !active) return false;
    if (pending) {
      const waitedMode = pendingMode;
      if (!(await pending)) return false;
      return savedGeneration === generation && !(mode === "manual" && waitedMode === "autosave")
        ? true
        : save(mode);
    }
    if (mode === "autosave" && generation === savedGeneration) return true;
    clearTimers();
    const snapshot = document;
    const requestedGeneration = generation;
    emit("saving", "Saving draft…");
    pendingMode = mode;
    pending = (async () => {
      try {
        // Tiptap attributes have null prototypes; Server Actions require plain JSON objects.
        const result = await Promise.resolve().then(() =>
          options.request({ document: JSON.parse(JSON.stringify(snapshot)) as T, version, mode }),
        );
        if (!result.ok) {
          conflict = result.code === "CONFLICT";
          clearTimers();
          emit(conflict ? "conflict" : "error", result.message);
          return false;
        }
        version = result.data.version;
        restoredVersion = null;
        savedGeneration = requestedGeneration;
        const clean = savedGeneration === generation;
        if (clean) forget();
        else remember();
        emit(
          clean ? "saved" : "dirty",
          clean ? "Draft · All changes saved" : "Draft · Saving newer changes shortly",
        );
        if (!clean) schedule();
        return true;
      } catch {
        clearTimers();
        emit("error", "Couldn’t save. Your edits are still here. Retry save.");
        return false;
      } finally {
        pending = null;
        pendingMode = null;
      }
    })();
    const success = await pending;
    if (!active) return false;
    return success && mode === "manual" && savedGeneration !== generation ? save(mode) : success;
  }
  return {
    save,
    get version() {
      return version;
    },
    set version(value: number) {
      version = value;
    },
    get dirty() {
      return generation !== savedGeneration;
    },
    attachStorage(
      nextStorage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
      key: string,
    ): { version: number; document: unknown } | null {
      storage = nextStorage;
      storageKey = key;
      try {
        backupValue = storage.getItem(key) ?? "";
        if (!backupValue || backupValue.length > 2 * 1024 * 1024) return null;
        const value: unknown = JSON.parse(backupValue);
        if (
          !value ||
          typeof value !== "object" ||
          !("version" in value) ||
          !("document" in value) ||
          typeof value.version !== "number" ||
          !Number.isSafeInteger(value.version) ||
          value.version < 1
        )
          return null;
        return { version: value.version, document: value.document };
      } catch (error) {
        if (!(error instanceof SyntaxError)) options.onBackupFailure?.();
        return null;
      }
    },
    forgetBackup: forget,
    restore(value: T, baseVersion: number) {
      document = value;
      generation += 1;
      restoredVersion = baseVersion;
      remember();
      if (baseVersion !== version) {
        conflict = true;
        emit(
          "conflict",
          "The saved post changed after this local draft. Download a backup before reloading.",
        );
        return;
      }
      emit("dirty", "Recovered local draft · Unsaved changes");
      schedule();
    },
    change(value: T) {
      document = value;
      generation += 1;
      remember();
      if (conflict) return;
      emit("dirty", "Draft · Unsaved changes");
      schedule();
    },
    markConflict(message: string) {
      conflict = true;
      clearTimers();
      emit("conflict", message);
    },
    start() {
      active = true;
      if (generation !== savedGeneration) schedule();
    },
    stop() {
      active = false;
      clearTimers();
    },
  };
}
