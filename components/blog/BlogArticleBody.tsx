"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckboxControl, Toaster } from "@canopy/ui";
import { MermaidDiagram } from "./MermaidDiagram";
import { CopyBlogCode } from "./CopyBlogCode";
import codeStyles from "./codeHighlight.module.css";

/** Enhance validated article HTML while retaining readable code without JavaScript. */
export function BlogArticleBody({ html, className }: { html: string; className: string }) {
  const body = useRef<HTMLDivElement>(null);
  const [diagrams, setDiagrams] = useState<{ source: string; container: HTMLElement }[]>([]);
  const [checkboxes, setCheckboxes] = useState<{ checked: boolean; container: HTMLElement }[]>([]);
  const [codeBlocks, setCodeBlocks] = useState<{ code: string; container: HTMLElement }[]>([]);

  useEffect(() => {
    const entries = Array.from(body.current?.querySelectorAll<HTMLElement>("pre > code") ?? [])
      .filter((code) => !/\blanguage-mermaid\b/i.test(code.className))
      .map((code) => {
        const pre = code.parentElement!;
        const container = document.createElement("div");
        container.className = codeStyles.codeBlock;
        pre.before(container);
        container.append(pre);
        return { code: code.textContent ?? "", container, pre };
      });
    setCodeBlocks(entries);
    return () => {
      entries.forEach(({ container, pre }) => {
        container.before(pre);
        container.remove();
      });
    };
  }, [html]);

  useEffect(() => {
    const entries = Array.from(body.current?.querySelectorAll<HTMLElement>("[data-task-checkbox]") ?? []).map(
      (fallback) => {
        const container = document.createElement("span");
        fallback.before(container);
        fallback.hidden = true;
        return { checked: fallback.dataset.taskCheckbox === "true", container, fallback };
      },
    );
    setCheckboxes(entries);
    return () => {
      entries.forEach(({ container, fallback }) => {
        container.remove();
        fallback.hidden = false;
      });
    };
  }, [html]);

  useEffect(() => {
    const blocks = Array.from(
      body.current?.querySelectorAll<HTMLElement>('pre > code[class~="language-mermaid" i]') ?? [],
    );
    const entries = blocks.map((code) => {
      const pre = code.parentElement!;
      const container = document.createElement("div");
      pre.before(container);
      pre.hidden = true;
      return { source: code.textContent ?? "", container, pre };
    });
    setDiagrams(entries);
    return () => {
      entries.forEach(({ container, pre }) => {
        container.remove();
        pre.hidden = false;
      });
    };
  }, [html]);

  return (
    <>
      <Toaster position="top-right" />
      <div ref={body} className={className} dangerouslySetInnerHTML={{ __html: html }} />
      {codeBlocks.map(({ code, container }, index) =>
        createPortal(<CopyBlogCode code={code} />, container, `code-${index}`),
      )}
      {checkboxes.map(({ checked, container }, index) =>
        createPortal(
          <CheckboxControl
            checked={checked}
            aria-readonly="true"
            aria-label={checked ? "Completed" : "Not completed"}
            tabIndex={-1}
            className="flex size-4 cursor-default"
            onClick={(event) => event.preventDefault()}
          />,
          container,
          `checkbox-${index}`,
        ),
      )}
      {diagrams.map(({ source, container }, index) =>
        createPortal(<MermaidDiagram source={source} previewable />, container, String(index)),
      )}
    </>
  );
}
