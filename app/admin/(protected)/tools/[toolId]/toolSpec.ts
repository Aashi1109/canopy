/**
 * SERVER ONLY. Loads the shipped declaration for one tool so the editor can
 * show what each database field falls back to.
 *
 * A tool's existence is a folder on disk, so this is a lookup by folder name
 * (never an enumeration, and never a tool named in code). A folder that does
 * not ship — Paperwork tools, or a stale row — resolves to `null`, and the
 * editor says so rather than failing.
 */

import { definitionKeyOf } from "../../../../../lib/tool-framework/catalog";
import type { ToolContent, ToolSpec } from "../../../../../lib/tool-framework/spec";

export type InheritedToolContent = {
  readonly category: string;
  readonly keywords: readonly string[];
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly content: ToolContent | null;
};

function isToolSpec(value: unknown): value is ToolSpec {
  if (typeof value !== "object" || value === null) return false;
  const spec = value as Partial<ToolSpec>;
  return (
    typeof spec.toolId === "string" &&
    typeof spec.category === "string" &&
    typeof spec.content === "object" &&
    spec.content !== null
  );
}

export async function loadToolSpec(toolId: string): Promise<ToolSpec | null> {
  const definitionKey = definitionKeyOf(toolId);
  if (!definitionKey) return null;
  try {
    const loaded: unknown = await import(`../../../../../tools/${definitionKey}/definition`);
    const value =
      typeof loaded === "object" && loaded !== null && "default" in loaded
        ? (loaded as { default: unknown }).default
        : null;
    return isToolSpec(value) ? value : null;
  } catch {
    return null;
  }
}

/** What the public pages show when the database row overrides nothing. */
export function inheritedContent(
  spec: ToolSpec | null,
  name: string,
  description: string,
): InheritedToolContent {
  return {
    category: spec?.category ?? "",
    keywords: spec?.keywords ?? [],
    seoTitle: spec?.content.seoTitle ?? name,
    seoDescription: description,
    content: spec?.content ?? null,
  };
}
