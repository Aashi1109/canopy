"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { createPortal } from "react-dom";

export interface SandboxedHtmlPreviewProps {
  html: string;
  className?: string;
  variant?: "document" | "raw";
  iframeRef?: Ref<HTMLIFrameElement>;
  onScroll?: (progress: number) => void;
  scrollProgressRef?: RefObject<number>;
  children?: ReactNode;
}

// The parent renders trusted React controls into this document; submitted HTML
// still cannot run scripts, submit forms, or access the surrounding application.
const PREVIEW_DOCUMENT = `<!doctype html><html style="scroll-behavior: auto"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' https: http: data: blob:; form-action 'none'; base-uri 'none'"></head><body class="bg-card font-sans text-foreground antialiased"></body></html>`;

export function SandboxedHtmlPreview({
  html,
  className = "min-h-80",
  variant = "raw",
  iframeRef,
  onScroll,
  scrollProgressRef,
  children,
}: SandboxedHtmlPreviewProps) {
  const [previewBody, setPreviewBody] = useState<HTMLElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const onScrollRef = useRef(onScroll);

  useEffect(() => {
    onScrollRef.current = onScroll;
  }, [onScroll]);

  useEffect(() => () => cleanupRef.current?.(), []);

  const initializePreview = useCallback(
    (frame: HTMLIFrameElement) => {
      cleanupRef.current?.();
      const previewDocument = frame.contentDocument;
      const scrollElement = previewDocument?.scrollingElement;
      if (!previewDocument || !scrollElement) return;

      // Use the application's actual CSS modules and controls inside the frame.
      // Only copy styles from the trusted parent document, never from user HTML.
      const copiedStyles: Element[] = [];
      const copyStyles = () => {
        copiedStyles.splice(0).forEach((node) => node.remove());
        frame.ownerDocument.querySelectorAll("style, link[rel='stylesheet']").forEach((node) => {
          if (node instanceof HTMLLinkElement && new URL(node.href).origin !== location.origin) return;
          const clone = node.cloneNode(true) as Element;
          previewDocument.head.append(clone);
          copiedStyles.push(clone);
        });
      };
      copyStyles();
      const stylesObserver = new MutationObserver(copyStyles);
      stylesObserver.observe(frame.ownerDocument.head, { childList: true, subtree: true, characterData: true });

      const theme = getComputedStyle(frame);
      for (const token of theme) {
        if (token.startsWith("--")) {
          previewDocument.documentElement.style.setProperty(token, theme.getPropertyValue(token));
        }
      }
      previewDocument.documentElement.style.colorScheme = theme.colorScheme;
      setPreviewBody(previewDocument.body);

      let progress = scrollProgressRef?.current ?? 0;
      let restoredTop: number | null = null;
      const restoreScroll = () => {
        if (!frame.clientHeight) return;
        const desiredProgress = scrollProgressRef?.current ?? progress;
        const range = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
        const top = Math.min(1, Math.max(0, desiredProgress)) * range;
        if (Math.abs(scrollElement.scrollTop - top) > 0.5) {
          restoredTop = top;
          scrollElement.scrollTop = top;
        }
      };
      const handleScroll = () => {
        if (!frame.clientHeight) return;
        const range = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
        progress = range > 0 ? Math.min(1, Math.max(0, scrollElement.scrollTop / range)) : 0;
        if (restoredTop !== null && Math.abs(scrollElement.scrollTop - restoredTop) <= 1) {
          restoredTop = null;
          return;
        }
        restoredTop = null;
        onScrollRef.current?.(progress);
      };
      const handleLink = (event: MouseEvent) => {
        if (event.defaultPrevented || (event.type === "click" ? event.button !== 0 : event.button !== 1)) return;
        const link = (event.target as Element | null)?.closest?.("a[href]");
        if (!link) return;

        // A linked image or text link must never navigate the live preview frame.
        // Open destinations from the trusted parent without relaxing the sandbox.
        event.preventDefault();
        const href = link.getAttribute("href")?.trim();
        if (!href) return;
        try {
          if (href.startsWith("#")) {
            const id = decodeURIComponent(href.slice(1));
            const target = previewDocument.getElementById(id);
            if (!id) scrollElement.scrollTop = 0;
            else if (target) scrollElement.scrollTop += target.getBoundingClientRect().top;
            return;
          }
          const url = new URL(href, frame.ownerDocument.baseURI);
          if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) {
            frame.ownerDocument.defaultView?.open(url.href, "_blank", "noopener,noreferrer");
          }
        } catch {
          // Malformed URLs and fragments leave the document available for editing.
        }
      };

      restoreScroll();
      previewDocument.addEventListener("scroll", handleScroll, { passive: true });
      previewDocument.addEventListener("click", handleLink);
      previewDocument.addEventListener("auxclick", handleLink);
      const resizeObserver = new ResizeObserver(restoreScroll);
      resizeObserver.observe(previewDocument.body);
      resizeObserver.observe(frame);
      cleanupRef.current = () => {
        previewDocument.removeEventListener("scroll", handleScroll);
        previewDocument.removeEventListener("click", handleLink);
        previewDocument.removeEventListener("auxclick", handleLink);
        resizeObserver.disconnect();
        stylesObserver.disconnect();
      };
    },
    [scrollProgressRef],
  );

  return (
    <>
      <iframe
        ref={iframeRef}
        className={`min-w-0 w-full flex-1 border-0 bg-card ${className}`}
        onLoad={variant === "document" ? (event) => initializePreview(event.currentTarget) : undefined}
        sandbox={variant === "document" ? "allow-same-origin" : ""}
        srcDoc={variant === "document" ? PREVIEW_DOCUMENT : html}
        title="Generated HTML preview"
      />
      {variant === "document" && previewBody
        ? createPortal(children ?? <div dangerouslySetInnerHTML={{ __html: html }} />, previewBody)
        : null}
    </>
  );
}
