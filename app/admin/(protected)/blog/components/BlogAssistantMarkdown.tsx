"use client";

import { memo, useMemo } from "react";
import "katex/dist/katex.min.css";
import { BlogArticleBody } from "@/components/blog/BlogArticleBody";
import articleStyles from "@/components/blog/article.module.css";
import contentStyles from "@/components/blog/content.module.css";
import highlightStyles from "@/components/blog/codeHighlight.module.css";
import { renderBlogMarkdown } from "../lib/markdownPaste";
import styles from "./BlogEditor.module.css";

export const BlogAssistantMarkdown = memo(function BlogAssistantMarkdown({ text }: { text: string }) {
  const html = useMemo(() => renderBlogMarkdown(text), [text]);
  return (
    <BlogArticleBody
      html={html}
      className={`${articleStyles.body} ${contentStyles.content} ${highlightStyles.highlight} ${styles.assistantMarkdown}`}
      showToaster={false}
    />
  );
});
