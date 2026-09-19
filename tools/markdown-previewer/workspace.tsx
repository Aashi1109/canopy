"use client";

import { useCallback, useEffect, useRef } from "react";

import { BlogArticleBody } from "@/components/blog/BlogArticleBody";
import articleStyles from "@/components/blog/article.module.css";
import highlightStyles from "@/components/blog/codeHighlight.module.css";
import contentStyles from "@/components/blog/content.module.css";
import { ResultView } from "@/components/ResultView";
import { SandboxedHtmlPreview } from "@/components/SandboxedHtmlPreview";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import styles from "./Preview.module.css";

function scrollProgress(element: Element) {
  const distance = element.scrollHeight - element.clientHeight;
  return distance > 0 ? Math.max(0, Math.min(1, element.scrollTop / distance)) : 0;
}

export default function MarkdownWorkspace(props: WorkspaceProps) {
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewProgressRef = useRef(0);
  const sourceProgressRef = useRef(0);
  const expectedScroll = useRef(new WeakMap<Element, number>());
  const syncEnabled = props.settings.syncScroll !== false;
  const syncEnabledRef = useRef(syncEnabled);
  syncEnabledRef.current = syncEnabled;

  const setScroll = useCallback((element: Element | null | undefined, progress: number) => {
    if (!element || !element.clientHeight) return;
    const nextTop = progress * Math.max(0, element.scrollHeight - element.clientHeight);
    if (Math.abs(element.scrollTop - nextTop) < 1) return;
    element.scrollTop = nextTop;
    expectedScroll.current.set(element, element.scrollTop);
  }, []);

  const isSyncedScroll = (element: Element) => {
    const expected = expectedScroll.current.get(element);
    expectedScroll.current.delete(element);
    return expected !== undefined && Math.abs(element.scrollTop - expected) < 1;
  };

  // Restore the reading position after pane resizing or switching mobile tabs.
  const attachSource = useCallback(
    (element: HTMLTextAreaElement | null) => {
      sourceRef.current = element;
      if (!element) return;
      const observer = new ResizeObserver(() => {
        setScroll(element, syncEnabledRef.current ? previewProgressRef.current : sourceProgressRef.current);
      });
      observer.observe(element);
      return () => {
        observer.disconnect();
        sourceRef.current = null;
      };
    },
    [setScroll],
  );

  useEffect(() => {
    if (!syncEnabled) return;
    const source = sourceRef.current;
    const progress = source?.clientHeight ? scrollProgress(source) : sourceProgressRef.current;
    previewProgressRef.current = progress;
    setScroll(iframeRef.current?.contentDocument?.scrollingElement, progress);
  }, [setScroll, syncEnabled]);

  useEffect(() => {
    if (props.input.text) return;
    sourceProgressRef.current = 0;
    previewProgressRef.current = 0;
  }, [props.input.text]);

  return (
    <ToolWorkspace
      {...props}
      sourceRef={attachSource}
      onSourceScroll={(event) => {
        const source = event.currentTarget;
        if (!source.clientHeight || isSyncedScroll(source)) return;
        const progress = scrollProgress(source);
        sourceProgressRef.current = progress;
        if (!syncEnabled) return;
        previewProgressRef.current = progress;
        setScroll(iframeRef.current?.contentDocument?.scrollingElement, progress);
      }}
      renderResult={(result) =>
        result.render === "html" ? (
          <SandboxedHtmlPreview
            className="min-h-0"
            variant="document"
            html={result.html}
            iframeRef={iframeRef}
            scrollProgressRef={previewProgressRef}
            onScroll={(progress) => {
              const preview = iframeRef.current?.contentDocument?.scrollingElement;
              if (!preview?.clientHeight || isSyncedScroll(preview)) return;
              previewProgressRef.current = progress;
              if (!syncEnabled) return;
              sourceProgressRef.current = progress;
              setScroll(sourceRef.current, progress);
            }}
          >
            <article className={styles.preview}>
              <BlogArticleBody
                html={result.html}
                className={`${articleStyles.body} ${contentStyles.content} ${highlightStyles.highlight}`}
              />
            </article>
          </SandboxedHtmlPreview>
        ) : (
          <ResultView result={result} />
        )
      }
    />
  );
}
