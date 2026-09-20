"use client";

import { memo, useMemo } from "react";
import "katex/dist/katex.min.css";
import { renderMarkdown, type MarkdownOptions } from "@/lib/markdown/render";
import { RichContent } from "./RichContent";

/** Read-only Markdown, independent of editors, Assistant, and application integrations. */
export const MarkdownPreview = memo(function MarkdownPreview({
  markdown,
  className,
  minimumHeadingLevel = 1,
  breaks = false,
}: MarkdownOptions & { markdown: string; className?: string }) {
  const html = useMemo(
    () => renderMarkdown(markdown, { minimumHeadingLevel, breaks }),
    [markdown, minimumHeadingLevel, breaks],
  );
  return <RichContent html={html} className={className} />;
});
