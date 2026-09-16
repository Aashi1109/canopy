export interface FindAndReplacePreviewSettings {
  readonly ci: boolean;
  readonly find: string;
  readonly regex: boolean;
  readonly replace: string;
}

export type ReplacementPreviewPart =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly found: string;
      readonly kind: "replacement";
      readonly replacement: string;
    }
  | {
      readonly hiddenMatchCount: number;
      readonly kind: "unpreviewed";
      readonly text: string;
    };

export interface ReplacementPreview {
  readonly count: number;
  readonly invalidPattern: boolean;
  readonly parts: readonly ReplacementPreviewPart[];
  readonly previewedCount: number;
  readonly truncated: boolean;
}

const MAX_PREVIEW_MATCHES = 200;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expandReplacement(replacement: string, match: RegExpExecArray, source: string): string {
  return replacement.replace(/\$(\$|&|`|'|<[^>]+>|\d{1,2})/g, (token, reference: string) => {
    if (reference === "$") return "$";
    if (reference === "&") return match[0];
    if (reference === "`") return source.slice(0, match.index);
    if (reference === "'") return source.slice(match.index + match[0].length);
    if (reference.startsWith("<")) {
      if (!match.groups) return token;
      const name = reference.slice(1, -1);
      return match.groups[name] ?? "";
    }
    const groupIndex = Number(reference);
    if (groupIndex > 0 && groupIndex < match.length) {
      return match[groupIndex] ?? "";
    }
    if (reference.length === 2) {
      const firstGroupIndex = Number(reference[0]);
      if (firstGroupIndex > 0 && firstGroupIndex < match.length) {
        return `${match[firstGroupIndex] ?? ""}${reference[1]}`;
      }
    }
    return token;
  });
}

export function buildReplacementPreview(source: string, settings: FindAndReplacePreviewSettings): ReplacementPreview {
  if (!settings.find) {
    return {
      count: 0,
      invalidPattern: false,
      parts: source ? [{ kind: "text", text: source }] : [],
      previewedCount: 0,
      truncated: false,
    };
  }

  let matcher: RegExp;
  try {
    matcher = new RegExp(settings.regex ? settings.find : escapeRegExp(settings.find), settings.ci ? "giu" : "gu");
  } catch {
    return {
      count: 0,
      invalidPattern: true,
      parts: source ? [{ kind: "text", text: source }] : [],
      previewedCount: 0,
      truncated: false,
    };
  }

  const parts: ReplacementPreviewPart[] = [];
  let cursor = 0;
  let count = 0;
  let hiddenStart: number | null = null;

  for (const match of source.matchAll(matcher)) {
    count += 1;
    if (count > MAX_PREVIEW_MATCHES) {
      hiddenStart ??= match.index;
      continue;
    }
    const index = match.index;
    if (index > cursor) {
      parts.push({ kind: "text", text: source.slice(cursor, index) });
    }
    parts.push({
      found: match[0],
      kind: "replacement",
      replacement: expandReplacement(settings.replace, match, source),
    });
    cursor = index + match[0].length;
  }

  if (hiddenStart !== null) {
    parts.push({
      hiddenMatchCount: count - MAX_PREVIEW_MATCHES,
      kind: "unpreviewed",
      text: source.slice(hiddenStart),
    });
  } else if (cursor < source.length) {
    parts.push({ kind: "text", text: source.slice(cursor) });
  }

  return {
    count,
    invalidPattern: false,
    parts,
    previewedCount: Math.min(count, MAX_PREVIEW_MATCHES),
    truncated: hiddenStart !== null,
  };
}
