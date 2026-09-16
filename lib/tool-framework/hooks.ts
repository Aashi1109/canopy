/**
 * Loads a tool's optional pre-run hooks.
 *
 * It knows nothing about any individual tool: the folder key comes out of the
 * toolId, and the dynamic import below is a bundler context module over
 * `tools/*` — the static prefix and suffix let the bundler emit one chunk per
 * folder and fetch only the requested one. There is no map and no registry.
 *
 * The key is taken from the toolId, never from the public slug: a tool may
 * declare a slug that differs from its folder name, and a slug-derived path
 * resolves to nothing for every one of those.
 */

import { TOOL_SLUG_PATTERN } from "@smarttools/tool-catalog";

import type { ToolHooks, ToolPagesInspected, ToolSettingsChanged, ToolValidate } from "./run";

/** A folder without a hooks file is the normal case, not an error. */
function isMissingModule(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code: unknown = (error as { code?: unknown }).code;
  return (
    code === "MODULE_NOT_FOUND" ||
    code === "ERR_MODULE_NOT_FOUND" ||
    /cannot find module/i.test(error.message)
  );
}

function readHook<T>(module: unknown, name: string): T | undefined {
  if (typeof module !== "object" || module === null) return undefined;
  // Own properties only — never read a value through a poisoned prototype.
  if (!Object.hasOwn(module, name)) return undefined;
  const value: unknown = (module as Record<string, unknown>)[name];
  return typeof value === "function" ? (value as T) : undefined;
}

export async function loadToolHooks<S = Record<string, unknown>>(
  toolId: string,
): Promise<ToolHooks<S>> {
  const key = toolId.split(".")[1] ?? "";
  if (!TOOL_SLUG_PATTERN.test(key)) return {};

  let module: unknown;
  try {
    module = await import(`../../tools/${key}/hooks`);
  } catch (error: unknown) {
    // A broken hooks file is a bug and must surface; a missing one is not.
    if (isMissingModule(error)) return {};
    throw error;
  }

  return {
    validate: readHook<ToolValidate<S>>(module, "validate"),
    onPagesInspected: readHook<ToolPagesInspected<S>>(module, "onPagesInspected"),
    onSettingsChanged: readHook<ToolSettingsChanged<S>>(module, "onSettingsChanged"),
  };
}
