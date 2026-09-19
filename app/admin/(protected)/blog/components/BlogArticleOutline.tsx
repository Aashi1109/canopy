"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ListTree, X } from "lucide-react";
import { Button, Popover, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/index.tsx";

import styles from "./BlogArticleOutline.module.css";

type Heading = { position: number; level: number; text: string };

export function BlogArticleOutline({ editor, title }: { editor: Editor | null; title: string }) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activePosition, setActivePosition] = useState(-1);
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const suppressed = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelId = useId();

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const scroll = editor.view.dom.closest<HTMLElement>("[data-blog-editor-scroll]");
    if (!scroll) return;
    let entries: Heading[] = [];
    let frame = 0;

    function updateActive() {
      if (!scroll || !editor || editor.isDestroyed) return;
      // Scroll offsets round to CSS pixels while text layout can land on a fractional pixel.
      const top = scroll.getBoundingClientRect().top + 24 + 2;
      let position = -1;
      for (const entry of entries) {
        if (entry.position < 0) continue;
        const element = editor.view.nodeDOM(entry.position);
        if (element instanceof HTMLElement && element.getBoundingClientRect().top <= top) position = entry.position;
      }
      if (scroll.scrollTop > 0 && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2) {
        position = entries.at(-1)?.position ?? -1;
      }
      setActivePosition(position);
    }

    function updateHeadings() {
      if (!editor || editor.isDestroyed) return;
      entries = [{ position: -1, level: 1, text: title.trim() || "Untitled post" }];
      editor.state.doc.descendants((node, position) => {
        if (node.type.name === "heading" && (node.attrs.level === 2 || node.attrs.level === 3)) {
          entries.push({ position, level: node.attrs.level, text: node.textContent.trim() || "Untitled section" });
        }
      });
      setHeadings(entries);
      if (entries.length < 2) {
        setOpen(false);
        pinned.current = false;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateActive);
    }

    updateHeadings();
    editor.on("update", updateHeadings);
    scroll.addEventListener("scroll", updateActive, { passive: true });
    const resize = new ResizeObserver(updateActive);
    resize.observe(scroll);
    resize.observe(editor.view.dom);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("update", updateHeadings);
      scroll.removeEventListener("scroll", updateActive);
      resize.disconnect();
    };
  }, [editor, title]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  function reveal() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (!suppressed.current) setOpen(true);
  }

  function close(restoreFocus = false) {
    pinned.current = false;
    suppressed.current = true;
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      const engaged = [trigger.current, content.current].some(
        (element) => element?.matches(":hover") || element?.contains(document.activeElement),
      );
      if (!pinned.current && !engaged) setOpen(false);
      suppressed.current = false;
    }, 150);
  }

  function navigate(heading: Heading) {
    if (!editor || editor.isDestroyed) return;
    const scroll = editor.view.dom.closest<HTMLElement>("[data-blog-editor-scroll]");
    if (!scroll) return;
    const element = heading.position < 0 ? null : editor.view.nodeDOM(heading.position);
    if (heading.position >= 0 && !(element instanceof HTMLElement)) return;
    const top =
      element instanceof HTMLElement
        ? scroll.scrollTop + element.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 24
        : 0;
    scroll.scrollTo({
      top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
    close(true);
  }

  if (!editor || headings.length < 2) return null;

  return (
    <div className={styles.rail}>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <Popover.Trigger asChild>
          <Button
            ref={trigger}
            variant="ghost"
            size="icon"
            className={styles.trigger}
            aria-label="Article outline"
            onPointerEnter={(event) => {
              if (event.pointerType !== "touch") reveal();
            }}
            onPointerLeave={scheduleClose}
            onFocus={reveal}
            onBlur={scheduleClose}
            onClick={(event) => {
              event.preventDefault();
              if (pinned.current) close();
              else {
                suppressed.current = false;
                pinned.current = true;
                setOpen(true);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close(true);
              }
              if (event.key === "ArrowDown" && open) {
                event.preventDefault();
                content.current?.querySelector<HTMLButtonElement>("nav button")?.focus();
              }
            }}
          >
            <ListTree className={styles.mobileIcon} aria-hidden="true" />
            <span className={styles.markers} aria-hidden="true">
              {headings.map((heading) => (
                <span
                  className={styles.marker}
                  key={heading.position}
                  data-level={heading.level}
                  data-active={heading.position === activePosition}
                />
              ))}
            </span>
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            ref={content}
            side="left"
            align="center"
            sideOffset={4}
            collisionPadding={12}
            className={styles.popover}
            aria-labelledby={labelId}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onPointerEnter={reveal}
            onPointerLeave={scheduleClose}
            onFocusCapture={reveal}
            onBlurCapture={scheduleClose}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              close(true);
            }}
          >
            <div className={styles.header}>
              <h2 id={labelId}>In this guide</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Close article outline" onClick={() => close(true)}>
                    <X aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close outline (Escape)</TooltipContent>
              </Tooltip>
            </div>
            <nav aria-label="Article sections" className={styles.list}>
              {headings.map((heading) => (
                <Button
                  key={heading.position}
                  variant="link"
                  size="sm"
                  className={styles.item}
                  data-level={heading.level}
                  aria-current={heading.position === activePosition ? "location" : undefined}
                  onClick={() => navigate(heading)}
                >
                  {heading.text}
                </Button>
              ))}
            </nav>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
