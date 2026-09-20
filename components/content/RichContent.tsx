"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckboxControl, Toaster } from "@/components/ui/index.tsx";
import { MermaidDiagram } from "./MermaidDiagram";
import { CopyCode } from "./CopyCode";
import codeStyles from "./codeHighlight.module.css";
import bodyStyles from "./body.module.css";
import contentStyles from "./content.module.css";

/** Enhance trusted renderer HTML. Untrusted HTML must stay inside SandboxedHtmlPreview. */
export function RichContent({
  html,
  className,
  showToaster = false,
}: {
  html: string;
  className?: string;
  showToaster?: boolean;
}) {
  const body = useRef<HTMLDivElement>(null);
  // Preserve enhancement containers when portal state causes a React render.
  const markup = useMemo(() => ({ __html: html }), [html]);
  const [diagrams, setDiagrams] = useState<{ source: string; container: HTMLElement }[]>([]);
  const [checkboxes, setCheckboxes] = useState<{ checked: boolean; container: HTMLElement }[]>([]);
  const [codeBlocks, setCodeBlocks] = useState<{ code: string; container: HTMLElement }[]>([]);

  useEffect(() => {
    const entries = Array.from(body.current?.querySelectorAll<HTMLElement>("pre > code") ?? [])
      .filter((code) => !/\blanguage-mermaid\b/i.test(code.className))
      .map((code) => {
        const pre = code.parentElement!;
        const container = code.ownerDocument.createElement("div");
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
    const entries = Array.from(
      body.current?.querySelectorAll<HTMLElement>(
        '[data-task-checkbox], li > input[type="checkbox"]:first-child, li > p > input[type="checkbox"]:first-child',
      ) ?? [],
    ).map((fallback) => {
      const container = fallback.ownerDocument.createElement("span");
      const nativeCheckbox = fallback.matches('input[type="checkbox"]');
      if (nativeCheckbox) container.dataset.markdownTaskCheckbox = "";
      fallback.before(container);
      fallback.hidden = true;
      return {
        checked: nativeCheckbox ? (fallback as HTMLInputElement).checked : fallback.dataset.taskCheckbox === "true",
        container,
        fallback,
      };
    });
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
      const container = code.ownerDocument.createElement("div");
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
      {showToaster && <Toaster position="top-right" />}
      <div
        ref={body}
        className={`${bodyStyles.body} ${contentStyles.content} ${codeStyles.highlight}${className ? ` ${className}` : ""}`}
        dangerouslySetInnerHTML={markup}
      />
      {codeBlocks.map(({ code, container }, index) =>
        createPortal(<CopyCode code={code} />, container, `code-${index}`),
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
