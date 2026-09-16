/**
 * Settings descriptors for the tool framework.
 *
 * Hand-rolled rather than zod on purpose: every field carries the UI metadata
 * (label, help text, choices, bounds, conditional visibility) that a schema
 * validator throws away, and the renderer needs that metadata more than it
 * needs a parser combinator.
 *
 * `parseSettings` is a trust boundary. `raw` arrives from `postMessage` and
 * from HTTP, so it is `unknown`, it is never trusted, and parsing never throws:
 * anything that does not coerce cleanly falls back to the declared default.
 */

import type { WatermarkPosition } from "./workerProtocol";

export type { WatermarkPosition };

/**
 * A page selection as the user expressed it, not as resolved page numbers.
 *
 * `"odd"` and `"even"` cannot be enumerated without a page count, and settings
 * are parsed long before a document is loaded. So the intent is carried through
 * verbatim and resolved by the run file, where the real page count exists —
 * see `resolvePageNumbers` in `lib/tool-framework/media/pdfDocument.ts`.
 *
 * Storing `[]` here instead would silently turn "odd pages" into "no pages".
 */
export type PageSelection = "all" | "odd" | "even" | readonly number[];

export type SettingRow = { readonly key: string; readonly value: string };

export type FieldChoice = {
  readonly label: string;
  readonly value: string;
  readonly aspectRatio?: number;
};

export type PresetChoice = FieldChoice & { readonly detail?: string };

type Base = {
  label: string;
  help?: string;
  pane?: "main" | "side";
  span?: 1 | 2 | "full";
  visibleWhen?: { key: string; equals: string | number | boolean };
};

export type FieldSpec =
  | (Base & {
      kind: "text";
      default: string;
      placeholder?: string;
      maxLength?: number;
    })
  | (Base & { kind: "textarea"; default: string; rows?: number })
  | (Base & { kind: "password"; default: string; placeholder?: string })
  | (Base & {
      kind: "number";
      default: number;
      min?: number;
      max?: number;
      step?: number;
      suffix?: string;
      leadingIcon?: "rotate-cw";
    })
  | (Base & {
      kind: "slider";
      default: number;
      min: number;
      max: number;
      step?: number;
      suffix?: string;
    })
  | (Base & { kind: "toggle"; default: boolean })
  | (Base & {
      kind: "select";
      default: string;
      choices: readonly FieldChoice[];
    })
  | (Base & {
      kind: "preset";
      default: string;
      choices: readonly PresetChoice[];
    })
  | (Base & { kind: "color"; default: string; allowTransparent?: boolean })
  | (Base & { kind: "date"; default: string })
  | (Base & { kind: "position"; default: WatermarkPosition })
  | (Base & { kind: "pages"; default: PageSelection; presets?: boolean })
  | (Base & {
      kind: "rows";
      default: readonly SettingRow[];
      keyLabel: string;
      valueLabel: string;
    });

export type FieldKind = FieldSpec["kind"];

export type SettingValue = string | number | boolean | PageSelection | readonly SettingRow[];

export type SettingsSpec = { readonly fields: Readonly<Record<string, FieldSpec>> };

export type ValueOf<F extends FieldSpec> = F extends { kind: "number" | "slider" }
  ? number
  : F extends { kind: "toggle" }
    ? boolean
    : F extends { kind: "position" }
      ? WatermarkPosition
      : F extends { kind: "pages" }
        ? PageSelection
        : F extends { kind: "rows" }
          ? readonly SettingRow[]
          : string;

export type SettingsOf<S extends SettingsSpec> = {
  readonly [K in keyof S["fields"]]: ValueOf<S["fields"][K]>;
};

/**
 * Exhaustive by construction: adding a member to `WatermarkPosition` makes this
 * record fail to type-check until it is listed here too.
 */
const POSITIONS: Readonly<Record<WatermarkPosition, true>> = {
  "top-left": true,
  "top-center": true,
  "top-right": true,
  "middle-left": true,
  "middle-center": true,
  "middle-right": true,
  "bottom-left": true,
  "bottom-center": true,
  "bottom-right": true,
};

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_PART = /^(\d+)(?:\s*-\s*(\d+))?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceString(raw: unknown): string | null {
  return typeof raw === "string" ? raw : null;
}

function coerceNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function coerceBoolean(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return null;
}

function clamp(value: number, min?: number, max?: number): number {
  const lowerBounded = min === undefined ? value : Math.max(min, value);
  return max === undefined ? lowerBounded : Math.min(max, lowerBounded);
}

function coercePageList(raw: unknown): readonly number[] | null {
  if (!Array.isArray(raw)) return null;
  const pages: number[] = [];
  const seen = new Set<number>();
  for (const entry of raw) {
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 1) {
      return null;
    }
    if (seen.has(entry)) continue;
    seen.add(entry);
    pages.push(entry);
  }
  return pages.length > 0 ? pages : null;
}

function coerceRows(raw: unknown): readonly SettingRow[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: SettingRow[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) return null;
    const key = coerceString(entry.key);
    const value = coerceString(entry.value);
    if (key === null || value === null) return null;
    rows.push({ key, value });
  }
  return rows;
}

/**
 * Parses a page-selection expression: `"all"`, `"odd"`, `"even"`, or a list of
 * numbers and ranges such as `"1,3,5-9"`. Returns `[]` when the expression is
 * unusable so callers can fall back to their own default.
 *
 * `pageCount` is optional because settings are often parsed before a document
 * is loaded. Without it, `"odd"`/`"even"` cannot be enumerated and return `[]`.
 */
export function parsePageSelection(input: string, pageCount?: number): number[] | "all" {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return [];
  if (normalized === "all") return "all";

  const total =
    typeof pageCount === "number" && Number.isInteger(pageCount) && pageCount > 0
      ? pageCount
      : null;

  if (normalized === "odd" || normalized === "even") {
    if (total === null) return [];
    const wantEven = normalized === "even";
    const pages: number[] = [];
    for (let page = wantEven ? 2 : 1; page <= total; page += 2) pages.push(page);
    return pages;
  }

  const pages: number[] = [];
  const seen = new Set<number>();
  for (const rawPart of normalized.split(",")) {
    const match = PAGE_PART.exec(rawPart.trim());
    if (!match) return [];
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start < 1 || start > end) return [];
    if (total !== null && end > total) return [];
    if (end - start > 100_000) return [];
    for (let page = start; page <= end; page += 1) {
      if (seen.has(page)) continue;
      seen.add(page);
      pages.push(page);
    }
  }
  return pages;
}

function parseField(field: FieldSpec, raw: unknown): SettingValue {
  switch (field.kind) {
    case "text":
    case "password": {
      const value = coerceString(raw);
      if (value === null) return field.default;
      return field.kind === "text" && field.maxLength !== undefined
        ? value.slice(0, field.maxLength)
        : value;
    }
    case "textarea":
      return coerceString(raw) ?? field.default;
    case "number":
    case "slider": {
      const value = coerceNumber(raw);
      return value === null ? field.default : clamp(value, field.min, field.max);
    }
    case "toggle":
      return coerceBoolean(raw) ?? field.default;
    case "select":
    case "preset": {
      const value = coerceString(raw);
      return value !== null && field.choices.some((choice) => choice.value === value)
        ? value
        : field.default;
    }
    case "color": {
      const value = coerceString(raw)?.trim();
      if (!value) return field.default;
      if (field.allowTransparent && value.toLowerCase() === "transparent") {
        return "transparent";
      }
      return HEX_COLOR.test(value) ? value : field.default;
    }
    case "date": {
      const value = coerceString(raw)?.trim();
      if (!value || !ISO_DATE.test(value)) return field.default;
      // Date.parse("2026-02-30") rolls over to March 2 rather than failing, so
      // round-trip the parsed date to reject impossible calendar days.
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return field.default;
      return parsed.toISOString().slice(0, 10) === value ? value : field.default;
    }
    case "position": {
      const value = coerceString(raw);
      return value !== null && Object.hasOwn(POSITIONS, value)
        ? (value as WatermarkPosition)
        : field.default;
    }
    case "pages": {
      if (raw === "all" || raw === "odd" || raw === "even") return raw;
      const fromList = coercePageList(raw);
      if (fromList) return fromList;
      const text = coerceString(raw);
      if (text === null) return field.default;
      const normalized = text.trim().toLowerCase();
      // Carried through unresolved — the run file enumerates these against the
      // real page count. Resolving to [] here would mean "no pages".
      if (normalized === "odd" || normalized === "even") return normalized;
      const parsed = parsePageSelection(text);
      return parsed === "all" || parsed.length > 0 ? parsed : field.default;
    }
    case "rows":
      return coerceRows(raw) ?? field.default;
  }
}

export function parseSettings<S extends SettingsSpec>(spec: S, raw: unknown): SettingsOf<S> {
  const source = isRecord(raw) ? raw : {};
  const parsed: Record<string, SettingValue> = {};
  // Only declared keys are read, so unknown keys in `raw` are ignored.
  for (const [key, field] of Object.entries(spec.fields)) {
    // Own properties only — never read a value through a poisoned prototype.
    parsed[key] = parseField(field, Object.hasOwn(source, key) ? source[key] : undefined);
  }
  return parsed as SettingsOf<S>;
}
