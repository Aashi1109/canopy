import type { ReactNode } from "react";

import { typographyStyles } from "@/components/ui/components/typography";

const JSON_TOKEN_PATTERN =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

export function highlightJson(
  json: string,
  matches: readonly { start: number; end: number }[] = [],
  currentMatchStart?: number,
): ReactNode[] {
  const tokens: ReactNode[] = [];
  let cursor = 0;
  let matchCursor = 0;

  function highlightText(text: string, offset: number): ReactNode {
    if (!matches.length) return text;
    const parts: ReactNode[] = [];
    const end = offset + text.length;
    let position = offset;
    while (matchCursor < matches.length && matches[matchCursor].start < end) {
      const match = matches[matchCursor];
      if (match.end <= position) {
        matchCursor += 1;
        continue;
      }
      const start = Math.max(position, match.start);
      if (start > position) parts.push(json.slice(position, start));
      const matchEnd = Math.min(end, match.end);
      const current = match.start === currentMatchStart;
      parts.push(
        <mark
          className={`rounded-[2px] text-inherit ${current ? "bg-warning/35 ring-1 ring-inset ring-warning/60" : "bg-warning/20"}`}
          data-search-current={current || undefined}
          key={start}
        >
          {json.slice(start, matchEnd)}
        </mark>,
      );
      position = matchEnd;
      if (match.end > end) break;
      matchCursor += 1;
    }
    if (position < end) parts.push(json.slice(position, end));
    return parts;
  }

  for (const match of json.matchAll(JSON_TOKEN_PATTERN)) {
    const index = match.index;
    if (index > cursor) tokens.push(highlightText(json.slice(cursor, index), cursor));

    if (match[1]) {
      tokens.push(
        <span className={match[2] ? `${typographyStyles.strong} text-foreground` : "text-syntax-string"} key={index}>
          {highlightText(match[1], index)}
        </span>,
      );
      if (match[2]) tokens.push(highlightText(match[2], index + match[1].length));
    } else if (match[3] === "null") {
      tokens.push(
        <span className="text-violet-700 dark:text-violet-400" key={index}>
          {highlightText(match[3], index)}
        </span>,
      );
    } else if (match[3]) {
      tokens.push(
        <span className="text-primary" key={index}>
          {highlightText(match[3], index)}
        </span>,
      );
    } else {
      tokens.push(
        <span className="text-warning" key={index}>
          {highlightText(match[0], index)}
        </span>,
      );
    }

    cursor = index + match[0].length;
  }

  if (cursor < json.length) tokens.push(highlightText(json.slice(cursor), cursor));
  return tokens;
}
