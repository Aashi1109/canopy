// Word segmentation, text statistics, and HTML escaping.
// Verbatim extraction from lib/devtools/format-json.ts (region 4).

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function words(value: string): string[] {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

export function textMetrics(
  value: string,
  options: {
    countHyphenated?: boolean;
    excludeEmails?: boolean;
    ignoreNumbers?: boolean;
  } = {},
): {
  words: number;
  characters: number;
  charactersWithoutSpaces: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  bytes: number;
} {
  const initialTokens = value.trim() ? value.trim().split(/\s+/u) : [];
  const filteredTokens = initialTokens.filter((token) => {
    if (options.ignoreNumbers && /^\p{N}+(?:[.,]\p{N}+)*$/u.test(token)) return false;
    if (options.excludeEmails && /^[^\s@]+@[^\s@]+\.[^\s@]+[.!?,;:]?$/u.test(token)) return false;
    return true;
  });
  const wordCount =
    options.countHyphenated === false
      ? filteredTokens.reduce(
          (total, token) => total + token.split(/[-‐‑‒–—]+/u).filter(Boolean).length,
          0,
        )
      : filteredTokens.length;
  return {
    words: wordCount,
    characters: Array.from(value).length,
    charactersWithoutSpaces: Array.from(value.replace(/\s/gu, "")).length,
    sentences: (value.match(/[^.!?]+[.!?]+(?:\s|$)/gu) ?? []).length,
    paragraphs: value.trim() ? value.trim().split(/(?:\r?\n){2,}/u).length : 0,
    lines: value ? value.split(/\r\n|\r|\n/u).length : 0,
    bytes: new TextEncoder().encode(value).length,
  };
}
