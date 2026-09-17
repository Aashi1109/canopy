/**
 * Resolves a tool's shipped declaration against its admin-authored database row.
 *
 * Rules, in full:
 *  - no row, or a row that has never been published -> the code values win;
 *  - otherwise every field is COALESCE(row, spec), per field, never
 *    all-or-nothing;
 *  - `contentDoc` is untrusted jsonb: it is validated, and anything this code
 *    cannot understand degrades to the spec's content instead of throwing.
 *    A page render must survive a bad row.
 *
 * No caching lives here on purpose — that belongs to the catalogue layer.
 */

import { z } from "zod";

import { isCategoryKey, type CategoryKey } from "./categories.ts";
import type { ToolContent, ToolSpec } from "./spec.ts";
// Type-only: erased at runtime, so this module never opens a database
// connection and stays importable from plain unit tests.
import type { ToolContentRow } from "@canopy/database";

export type { ToolContentRow };

export function hasDraftToolContent(row: ToolContentRow | null): boolean {
  if (!row || row.publishedAt !== null) return false;
  // Seed rows contain no overrides; unpublished alone does not mean draft.
  return (
    [row.category, row.seoTitle, row.seoDescription].some((value) => Boolean(value?.trim())) ||
    Boolean(row.keywords?.some((keyword) => keyword.trim())) ||
    row.contentDoc != null
  );
}

/** The only `contentDoc` / `docVersion` shape this code understands. */
export const TOOL_CONTENT_DOC_VERSION = 1;

export type ResolvedToolContent = {
  readonly toolId: string;
  readonly category: CategoryKey;
  readonly keywords: readonly string[];
  /** Always populated; falls back to the spec's title, then its name. */
  readonly seoTitle: string;
  /** Always populated; falls back to the spec's description. */
  readonly seoDescription: string;
  /** Body copy only — read `seoTitle` above rather than `content.seoTitle`. */
  readonly content: ToolContent;
};

const contentDocSchema = z.object({
  version: z.literal(TOOL_CONTENT_DOC_VERSION),
  howToUse: z.array(z.string()),
  limitations: z.array(z.string()).optional(),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  examples: z
    .array(
      z.object({
        label: z.string(),
        text: z.string(),
        secondary: z.string().optional(),
      }),
    )
    .optional(),
  relatedToolIds: z.array(z.string()).optional(),
});

const warnedToolIds = new Set<string>();

function warnOnce(toolId: string, reason: string): void {
  if (warnedToolIds.has(toolId)) return;
  warnedToolIds.add(toolId);
  console.warn(`[tool-content] ignoring stored content doc: ${reason}`, {
    toolId,
  });
}

/** Mirrors the manifest merge idiom: blank stored text is not an override. */
function coalesceText(stored: string | null, fallback: string): string {
  return typeof stored === "string" && stored.trim() ? stored.trim() : fallback;
}

/**
 * An explicit empty array is a *fallback*, not an override: a tool with zero
 * keywords is always an editing accident, and the same rule already applies to
 * blank stored names in the manifest merge.
 */
function coalesceKeywords(stored: readonly string[] | null, fallback: readonly string[]): readonly string[] {
  if (!Array.isArray(stored)) return fallback;
  const cleaned = stored
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return cleaned.length > 0 ? cleaned : fallback;
}

function coalesceContent(spec: ToolSpec, row: ToolContentRow): ToolContent {
  if (row.contentDoc === null || row.contentDoc === undefined) return spec.content;

  if (row.docVersion !== TOOL_CONTENT_DOC_VERSION) {
    warnOnce(spec.toolId, `unsupported docVersion ${String(row.docVersion)}`);
    return spec.content;
  }

  const parsed = contentDocSchema.safeParse(row.contentDoc);
  if (!parsed.success) {
    warnOnce(spec.toolId, parsed.error.issues[0]?.message ?? "invalid shape");
    return spec.content;
  }

  const { version: _version, ...content } = parsed.data;
  return content;
}

function fromSpec(spec: ToolSpec): ResolvedToolContent {
  return {
    toolId: spec.toolId,
    category: spec.category,
    keywords: spec.keywords,
    seoTitle: spec.content.seoTitle ?? spec.name,
    seoDescription: spec.description,
    content: spec.content,
  };
}

export function resolveContent(spec: ToolSpec, row: ToolContentRow | null): ResolvedToolContent {
  const base = fromSpec(spec);
  if (row === null || row.publishedAt === null) return base;

  return {
    toolId: spec.toolId,
    category: isCategoryKey(row.category) ? row.category : spec.category,
    keywords: coalesceKeywords(row.keywords, spec.keywords),
    seoTitle: coalesceText(row.seoTitle, base.seoTitle),
    seoDescription: coalesceText(row.seoDescription, base.seoDescription),
    content: coalesceContent(spec, row),
  };
}

/**
 * Batch form for listing pages. Keyed by `toolId`, in spec order; a row whose
 * `toolId` matches no spec is dropped silently, exactly as an unknown stored
 * entry is in `mergeToolManifest`.
 */
export function resolveContentMap(
  specs: readonly ToolSpec[],
  rows: readonly ToolContentRow[],
): Map<string, ResolvedToolContent> {
  const rowById = new Map<string, ToolContentRow>();
  for (const row of rows) {
    if (!rowById.has(row.toolId)) rowById.set(row.toolId, row);
  }

  return new Map(specs.map((spec) => [spec.toolId, resolveContent(spec, rowById.get(spec.toolId) ?? null)]));
}
