import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, test, vi } from "vitest";

// The seed script is re-imported to re-run its top-level orchestration; vi.mock
// persists across vi.resetModules(), so the spawnSync stub stays in effect.
vi.mock("node:child_process", () => ({
  spawnSync: (...args) => globalThis.__seedIconProcess(...args),
}));

test("db seed uploads and assigns icons after catalog seeding, stopping on failures", async () => {
  const argv = process.argv;
  const calls = [];
  const manifests = new Set();
  let failingStep;
  globalThis.__seedIconProcess = (executable, args, options) => {
    expect(executable).toBe(process.execPath);
    expect(options.stdio).toBe("inherit");
    calls.push(args);
    const outputIndex = args.indexOf("--output");
    if (outputIndex !== -1) manifests.add(args[outputIndex + 1]);
    return { status: calls.length === failingStep ? 1 : 0 };
  };
  try {
    process.argv = [argv[0], "seed.mjs", "--icons-dir", "/tmp/custom icons"];
    vi.resetModules();
    await import("@/scripts/seed.mjs");
    expect(calls.length).toBe(3);
    expect(calls[0][0].endsWith("/db/scripts/seed.mjs")).toBeTruthy();
    expect(calls[1][0].endsWith("/scripts/upload-tool-icons.mjs")).toBeTruthy();
    expect(calls[2][0].endsWith("/scripts/update-tool-icons.mjs")).toBeTruthy();
    expect(calls[1][calls[1].indexOf("--dir") + 1]).toBe("/tmp/custom icons");
    expect(calls[2][calls[2].indexOf("--manifest") + 1]).toBe([...manifests][0]);
    expect(calls[2].includes("--missing-only")).toBeTruthy();
    for (failingStep of [1, 2, 3]) {
      calls.length = 0;
      vi.resetModules();
      await expect(import("@/scripts/seed.mjs")).rejects.toThrow(/failed/);
      expect(calls.length).toBe(failingStep);
    }
  } finally {
    process.argv = argv;
    delete globalThis.__seedIconProcess;
    for (const manifest of manifests) await rm(dirname(manifest), { recursive: true, force: true });
  }
});
