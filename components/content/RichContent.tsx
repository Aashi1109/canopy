"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckboxControl, Toaster } from "@/components/ui/index.tsx";
import { MermaidDiagram } from "./MermaidDiagram";
import { CopyCode } from "./CopyCode";
import codeStyles from "./codeHighlight.module.css";
import bodyStyles from "./body.module.css";
import contentStyles from "./content.module.css";

type Enhancement = {
  container: HTMLElement;
  original: HTMLElement;
} & ({ kind: "code"; source: string } | { kind: "diagram"; source: string } | { kind: "checkbox"; checked: boolean });

/** Enhance trusted renderer HTML. Untrusted HTML must stay inside SandboxedHtmlPreview. */
export function RichContent({
  html,
  className,
  showToaster = false,
  deferSections = false,
  highlightCode,
}: {
  html: string;
  className?: string;
  showToaster?: boolean;
  deferSections?: boolean;
  /** Trusted syntax markup from the tool's asynchronous highlighter. */
  highlightCode?: (code: string, language?: string) => Promise<string>;
}) {
  const body = useRef<HTMLDivElement>(null);
  // Preserve enhancement containers when portal state causes a React render.
  const markup = useMemo(() => ({ __html: html }), [html]);
  const [enhancements, setEnhancements] = useState<Enhancement[]>([]);

  useEffect(() => {
    const root = body.current;
    if (!root) return;
    const entries: Enhancement[] = [];
    let active = true;
    const deferredBlocks = deferSections
      ? Array.from(root.children).filter((element): element is HTMLElement =>
          element.matches("p, pre, blockquote, ul, ol, table, div, section"),
        )
      : [];
    if (deferredBlocks.length) {
      const styles = root.ownerDocument.defaultView!.getComputedStyle(root);
      const lineHeight = Number.parseFloat(styles.lineHeight) || 25.6;
      const charactersPerLine = Math.max(20, Math.floor(root.clientWidth / 8));
      for (const block of deferredBlocks) {
        const text = block.textContent ?? "";
        const lines = text.split("\n");
        const isCode = block.tagName === "PRE";
        const estimatedLines = isCode
          ? Math.max(1, lines.length - (text.endsWith("\n") ? 1 : 0))
          : Math.max(
              1,
              lines.reduce((total, line) => total + Math.ceil(line.length / charactersPerLine), 0),
            );
        const imageHeight = block.querySelector("img") ? 300 : 0;
        block.style.setProperty(
          "--content-intrinsic-block-size",
          `${Math.max(imageHeight, estimatedLines * (isCode ? 19.5 : lineHeight))}px`,
        );
      }
    }
    const targets = root.querySelectorAll<HTMLElement>(
      'pre > code, [data-task-checkbox], li > input[type="checkbox"]:first-child, li > p > input[type="checkbox"]:first-child',
    );
    const enhance = (element: HTMLElement) => {
      const document = element.ownerDocument;
      if (element.matches("pre > code")) {
        const pre = element.parentElement!;
        const container = document.createElement("div");
        const diagram = /\blanguage-mermaid\b/i.test(element.className);
        pre.before(container);
        if (diagram) pre.hidden = true;
        else {
          container.className = codeStyles.codeBlock;
          if (deferSections) {
            const estimate = Number.parseFloat(pre.style.getPropertyValue("--content-intrinsic-block-size"));
            if (Number.isFinite(estimate))
              container.style.setProperty("--content-intrinsic-block-size", `${estimate + 42}px`);
          }
          container.append(pre);
        }
        entries.push({
          kind: diagram ? "diagram" : "code",
          source: element.textContent ?? "",
          container,
          original: pre,
        });
      } else {
        const container = document.createElement("span");
        const nativeCheckbox = element.matches('input[type="checkbox"]');
        if (nativeCheckbox) container.dataset.markdownTaskCheckbox = "";
        element.before(container);
        element.hidden = true;
        entries.push({
          kind: "checkbox",
          checked: nativeCheckbox ? (element as HTMLInputElement).checked : element.dataset.taskCheckbox === "true",
          container,
          original: element,
        });
      }
    };

    // Keep the full document searchable and scrollable, but avoid mounting
    // thousands of interactive controls before their content is near the reader.
    const observer =
      (deferSections || html.length > 100_000) && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (changes) => {
              if (!active) return;
              const previousCount = entries.length;
              for (const change of changes) {
                if (!change.isIntersecting) continue;
                observer!.unobserve(change.target);
                enhance(change.target as HTMLElement);
              }
              if (entries.length !== previousCount) setEnhancements([...entries]);
            },
            { root: root.ownerDocument, rootMargin: "1000px 0px" },
          )
        : null;
    if (observer) targets.forEach((target) => observer.observe(target));
    else targets.forEach(enhance);
    setEnhancements([...entries]);

    // Limit visible code work as well as worker concurrency. A code block that
    // leaves the viewport while queued stays plain until the reader returns.
    type HighlightTarget = {
      element: HTMLElement;
      source: string;
      visible: boolean;
      queued: boolean;
      done: boolean;
      originalChildren?: ChildNode[];
    };
    const highlights = new Map<HTMLElement, HighlightTarget>();
    const pending: HighlightTarget[] = [];
    let inFlight = 0;
    let highlightObserver: IntersectionObserver | null = null;
    const highlightNext = () => {
      if (!active || !highlightCode) return;
      while (inFlight < 2 && pending.length) {
        const target = pending.shift()!;
        target.queued = false;
        if (!target.visible || target.done || !root.contains(target.element)) continue;
        target.done = true;
        inFlight += 1;
        highlightObserver?.unobserve(target.element);
        const language = /\blanguage-([^\s]+)/i.exec(target.element.className)?.[1];
        void Promise.resolve()
          .then(() => (active ? highlightCode(target.source, language) : ""))
          .then((highlighted) => {
            if (!active || !root.contains(target.element) || target.element.textContent !== target.source) return;
            const template = root.ownerDocument.createElement("template");
            template.innerHTML = highlighted;
            // Highlighting must never change source text or copy/selection output.
            if (template.content.textContent === target.source) {
              target.originalChildren = Array.from(target.element.childNodes);
              target.element.replaceChildren(template.content);
            }
          })
          .catch(() => {
            // Plain code remains readable and copyable if highlighting fails.
          })
          .finally(() => {
            inFlight -= 1;
            highlightNext();
          });
      }
    };
    if (highlightCode) {
      for (const element of targets) {
        if (!element.matches("pre > code") || /\blanguage-mermaid\b/i.test(element.className)) continue;
        highlights.set(element, {
          element,
          source: element.textContent ?? "",
          visible: false,
          queued: false,
          done: false,
        });
      }
      highlightObserver =
        typeof IntersectionObserver !== "undefined"
          ? new IntersectionObserver(
              (changes) => {
                if (!active) return;
                for (const change of changes) {
                  const target = highlights.get(change.target as HTMLElement)!;
                  target.visible = change.isIntersecting;
                  if (!target.visible || target.queued || target.done) continue;
                  target.queued = true;
                  pending.push(target);
                }
                highlightNext();
              },
              { root: root.ownerDocument, rootMargin: "600px 0px" },
            )
          : null;
      for (const target of highlights.values()) {
        if (highlightObserver) highlightObserver.observe(target.element);
        else {
          target.visible = true;
          target.queued = true;
          pending.push(target);
        }
      }
      if (!highlightObserver) highlightNext();
    }

    return () => {
      active = false;
      observer?.disconnect();
      highlightObserver?.disconnect();
      pending.length = 0;
      for (const target of highlights.values()) {
        if (target.originalChildren && root.contains(target.element))
          target.element.replaceChildren(...target.originalChildren);
      }
      for (const block of deferredBlocks) block.style.removeProperty("--content-intrinsic-block-size");
      for (const { kind, container, original } of entries) {
        if (kind === "code") container.before(original);
        else original.hidden = false;
        container.remove();
      }
    };
  }, [html, deferSections, highlightCode]);

  return (
    <>
      {showToaster && <Toaster position="top-right" />}
      <div
        ref={body}
        data-deferred-sections={deferSections ? "" : undefined}
        className={`${bodyStyles.body} ${contentStyles.content} ${codeStyles.highlight}${deferSections ? ` ${contentStyles.deferred}` : ""}${className ? ` ${className}` : ""}`}
        dangerouslySetInnerHTML={markup}
      />
      {enhancements.map((entry, index) =>
        createPortal(
          entry.kind === "code" ? (
            <CopyCode code={entry.source} />
          ) : entry.kind === "diagram" ? (
            <MermaidDiagram source={entry.source} previewable />
          ) : (
            <CheckboxControl
              checked={entry.checked}
              aria-readonly="true"
              aria-label={entry.checked ? "Completed" : "Not completed"}
              tabIndex={-1}
              className="flex size-4 cursor-default"
              onClick={(event) => event.preventDefault()}
            />
          ),
          entry.container,
          String(index),
        ),
      )}
    </>
  );
}
