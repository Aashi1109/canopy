"use client";

import { memo, useMemo } from "react";

import { highlightJson } from "@/components/JsonResultRenderer";
import { CODE_HIGHLIGHT_MAX_CHARS, codeLowlight, highlightCode } from "@/lib/markdown/codeHighlight";
import styles from "./codeHighlight.module.css";

export const SyntaxHighlight = memo(function SyntaxHighlight({
  code,
  language,
  editor = false,
}: {
  code: string;
  language: string;
  editor?: boolean;
}) {
  const normalizedLanguage = language.trim().toLowerCase();
  const content = useMemo(() => {
    if (code.length > CODE_HIGHLIGHT_MAX_CHARS || !codeLowlight.registered(normalizedLanguage)) return code;
    if (normalizedLanguage === "json") return highlightJson(code);
    return <span dangerouslySetInnerHTML={{ __html: highlightCode(code, normalizedLanguage) }} />;
  }, [code, normalizedLanguage]);
  const languageStyle = ["typescript", "ts", "javascript", "js", "jsx", "tsx"].includes(normalizedLanguage)
    ? styles.typescript
    : ["xml", "html"].includes(normalizedLanguage)
      ? styles.xml
      : ["markdown", "md", "mkdown", "mkd"].includes(normalizedLanguage)
        ? styles.markdown
        : ["csv", "tsv"].includes(normalizedLanguage)
          ? styles.delimited
          : "";

  return <span className={`${styles.highlight} ${languageStyle} ${editor ? styles.editor : ""}`}>{content}</span>;
});
