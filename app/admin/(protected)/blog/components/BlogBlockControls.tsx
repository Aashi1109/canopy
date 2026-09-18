"use client";

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Editor, EditorEvents } from "@tiptap/core";
import { GripVertical } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/index.tsx";
import type { BlogImage } from "@/lib/blog/document";
import { moveBlogBlock } from "../lib/blockMovement";
import { BlogBlockMenu } from "./BlogFormattingToolbar";
import styles from "./BlogEditor.module.css";

type Layout = { position: number; left: number; top: number; animate: boolean };
type Drop = { position: number; left: number; top: number; width: number };
type Drag = {
  from: number;
  doc: Editor["state"]["doc"];
  to: number;
  index: number;
  pointer?: { id: number; button: HTMLButtonElement; startY: number; x: number; y: number };
  moved: boolean;
};

export function BlogBlockControls({
  editor,
  disabled = false,
  onUploadImage,
}: {
  editor: Editor | null;
  disabled?: boolean;
  onUploadImage: (file: File) => Promise<BlogImage | null>;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const anchor = useRef<number | null>(null);
  const menuOpen = useRef(false);
  const drag = useRef<Drag | null>(null);
  const refresh = useRef<() => void>(() => {});
  const measureNow = useRef<() => void>(() => {});
  const [layout, setLayout] = useState<Layout | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [message, setMessage] = useState("");

  function cancel(message = "Move cancelled.") {
    const active = drag.current;
    drag.current = null;
    if (active?.pointer?.button.hasPointerCapture(active.pointer.id))
      active.pointer.button.releasePointerCapture(active.pointer.id);
    setDrop(null);
    if (active) setMessage(message);
    refresh.current();
  }

  useEffect(() => {
    if (!editor || disabled) {
      menuOpen.current = false;
      setLayout(null);
      cancel();
      return;
    }
    let frame = 0;
    const dom = editor.view.dom;
    const scroller = dom.closest<HTMLElement>("[data-blog-editor-scroll]");
    const mobileScroller = dom.closest<HTMLElement>("[data-blog-editor-workspace]");
    const scrollElement = scroller && getComputedStyle(scroller).overflowY !== "visible" ? scroller : mobileScroller;
    function blocks() {
      const result: { position: number; size: number; box: DOMRect }[] = [];
      editor!.state.doc.forEach((node, position) => {
        const element = editor!.view.nodeDOM(position);
        if (element instanceof HTMLElement)
          result.push({ position, size: node.nodeSize, box: element.getBoundingClientRect() });
      });
      return result;
    }
    function clip() {
      const bounds = scrollElement?.getBoundingClientRect();
      return {
        top: Math.max(0, bounds?.top ?? 0),
        bottom: Math.min(innerHeight, bounds?.bottom ?? innerHeight),
        left: Math.max(0, bounds?.left ?? 0),
        right: Math.min(innerWidth, bounds?.right ?? innerWidth),
      };
    }
    function measure() {
      frame = 0;
      if (editor!.isDestroyed || !editor!.isEditable) {
        setLayout(null);
        return;
      }
      const list = blocks();
      const active = drag.current;
      const bounds = clip();
      if (active) {
        if (active.pointer) {
          const { x, y, startY } = active.pointer;
          active.moved ||= Math.abs(y - startY) > 4;
          if (active.moved && scrollElement) {
            const speed = y < bounds.top + 40 ? -12 : y > bounds.bottom - 40 ? 12 : 0;
            if (speed) scrollElement.scrollTop += speed;
          }
          const index = list.findIndex((block) => y < block.box.top + block.box.height / 2);
          active.index = index < 0 ? list.length : index;
          if (x < bounds.left || x > bounds.right || y < bounds.top - 40 || y > bounds.bottom + 40) {
            active.to = active.from;
            setDrop(null);
            queue();
            return;
          }
        }
        const next = list[active.index];
        const previous = list[active.index - 1];
        active.to = next?.position ?? editor!.state.doc.content.size;
        const rect = dom.getBoundingClientRect();
        const top =
          previous && next
            ? (previous.box.bottom + next.box.top) / 2
            : (next?.box.top ?? previous?.box.bottom ?? rect.top);
        setDrop(
          active.moved && moveBlogBlock(active.from, active.to)(editor!.state)
            ? {
                position: active.to,
                left: rect.left,
                top: Math.max(bounds.top, Math.min(bounds.bottom - 2, top)),
                width: rect.width,
              }
            : null,
        );
        if (active.pointer) queue();
      }
      const target = list.find((block) => block.position === anchor.current);
      if (!target || target.box.bottom <= bounds.top || target.box.top >= bounds.bottom) {
        if (!active && !menuOpen.current) setLayout(null);
        return;
      }
      const table = editor!.state.doc.nodeAt(target.position)?.type.name === "table";
      const coarse = matchMedia("(pointer: coarse)").matches;
      const width = coarse ? 88 : 64;
      const gap = table && !coarse ? 28 : 4;
      const next = {
        position: target.position,
        left: Math.max(bounds.left + 4, dom.getBoundingClientRect().left - width - gap),
        top: Math.max(
          bounds.top + 2,
          Math.min(bounds.bottom - (coarse ? 44 : 32), target.box.top - (table && coarse ? 47 : 3)),
        ),
      };
      setLayout((previous) => ({
        ...next,
        // Glide between blocks, but keep scroll/resize tracking immediate.
        animate:
          !!previous &&
          (previous.position !== next.position ||
            (previous.animate && previous.left === next.left && previous.top === next.top)),
      }));
    }
    function queue() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    refresh.current = queue;
    measureNow.current = () => {
      cancelAnimationFrame(frame);
      measure();
    };
    function selected() {
      const { $from } = editor!.state.selection;
      anchor.current = $from.depth
        ? $from.before(1)
        : Math.min(
            $from.pos,
            Math.max(0, editor!.state.doc.content.size - (editor!.state.doc.lastChild?.nodeSize ?? 0)),
          );
    }
    function pointer(event: PointerEvent) {
      if (drag.current || menuOpen.current || root.current?.contains(event.target as Node)) return;
      const element = event.target instanceof Element ? event.target : null;
      if (element && dom.contains(element)) {
        const target = blocks().find((block) => {
          const node = editor!.view.nodeDOM(block.position);
          return node instanceof Element && node.contains(element);
        });
        if (target) anchor.current = target.position;
        queue();
      } else if (!root.current?.contains(document.activeElement)) {
        // Keep the controls reachable while crossing the small gap from text to gutter.
        const rect = dom.getBoundingClientRect();
        if (
          event.clientX >= rect.left - 140 &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        )
          return;
        if (editor!.isFocused) selected();
        else anchor.current = null;
        queue();
      }
    }
    function transaction({ transaction, appendedTransactions }: EditorEvents["transaction"]) {
      if (drag.current && editor!.state.doc !== drag.current.doc) cancel("Content changed. Pick up the block again.");
      for (const tr of [transaction, ...(appendedTransactions ?? [])]) {
        if (anchor.current !== null && tr.docChanged) {
          const mapped = tr.mapping.mapResult(anchor.current, 1);
          anchor.current = mapped.deleted ? null : mapped.pos;
        }
      }
      if (!drag.current && !menuOpen.current && editor!.isFocused && transaction.selectionSet) selected();
      queue();
    }
    function focus() {
      if (editor!.isFocused && !menuOpen.current && !drag.current) selected();
      queue();
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape" && drag.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
      if (event.altKey && event.shiftKey && event.code === "KeyB" && dom.contains(event.target as Node)) {
        event.preventDefault();
        selected();
        measure();
        requestAnimationFrame(() => handle.current?.focus());
      }
    }
    const observer = new ResizeObserver(queue);
    observer.observe(dom);
    if (scrollElement) observer.observe(scrollElement);
    editor.on("transaction", transaction);
    editor.on("focus", focus);
    editor.on("blur", queue);
    window.addEventListener("pointermove", pointer, { passive: true });
    window.addEventListener("scroll", queue, true);
    window.addEventListener("resize", queue);
    window.addEventListener("keydown", key, true);
    const blur = () => cancel();
    window.addEventListener("blur", blur);
    queue();
    return () => {
      refresh.current = () => {};
      measureNow.current = () => {};
      cancel();
      cancelAnimationFrame(frame);
      observer.disconnect();
      editor.off("transaction", transaction);
      editor.off("focus", focus);
      editor.off("blur", queue);
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("scroll", queue, true);
      window.removeEventListener("resize", queue);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", blur);
    };
  }, [editor, disabled]);

  if (!editor || disabled || !editor.isEditable) return null;
  function start(pointer?: Drag["pointer"]) {
    if (!editor || !layout || !editor.isEditable || menuOpen.current) return;
    const index = editor.state.doc.resolve(layout.position).index();
    drag.current = {
      from: layout.position,
      to: layout.position,
      index,
      doc: editor.state.doc,
      pointer,
      moved: !pointer,
    };
    setMessage("Block picked up. Use Up and Down to choose a position, Enter to drop, or Escape to cancel.");
    refresh.current();
  }
  function finish() {
    measureNow.current();
    const active = drag.current;
    if (!editor || !active) return;
    cancel("");
    if (
      active.moved &&
      editor.isEditable &&
      editor.state.doc === active.doc &&
      moveBlogBlock(active.from, active.to)(editor.state, (tr) => editor.view.dispatch(tr))
    ) {
      const size = active.doc.nodeAt(active.from)!.nodeSize;
      anchor.current = active.to > active.from ? active.to - size : active.to;
      setMessage("Block moved. Undo restores its previous position.");
      const moved = editor.view.nodeDOM(anchor.current);
      if (moved instanceof Element) moved.scrollIntoView({ block: "nearest" });
    } else setMessage("Block kept in its original position.");
    refresh.current();
  }
  function pointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    start({
      id: event.pointerId,
      button: event.currentTarget,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
    });
  }
  return createPortal(
    <TooltipProvider>
      <div className="sr-only" aria-live="polite">
        {message}
      </div>
      {layout && (
        <div
          ref={root}
          className={styles.blockControls}
          style={{ transform: `translate3d(${layout.left}px, ${layout.top}px, 0)` }}
          data-animate={layout.animate && !drag.current}
          data-blog-block-controls="true"
          role="group"
          aria-label="Block controls"
        >
          <BlogBlockMenu
            editor={editor}
            blockPosition={layout.position}
            onUploadImage={onUploadImage}
            onOpenChange={(value) => {
              menuOpen.current = value;
              refresh.current();
            }}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={handle}
                size="icon-xs"
                variant="ghost"
                className={styles.blockHandle}
                aria-label="Move block"
                aria-describedby={`${id}-help`}
                aria-keyshortcuts="Alt+Shift+B"
                onPointerDown={pointerDown}
                onPointerMove={(event) => {
                  const active = drag.current;
                  if (active?.pointer?.id === event.pointerId) {
                    active.pointer.x = event.clientX;
                    active.pointer.y = event.clientY;
                    refresh.current();
                  }
                }}
                onPointerUp={(event) => {
                  const active = drag.current;
                  if (active?.pointer?.id !== event.pointerId) return;
                  active.pointer.x = event.clientX;
                  active.pointer.y = event.clientY;
                  finish();
                }}
                onPointerCancel={() => cancel()}
                onLostPointerCapture={() => {
                  if (drag.current?.pointer) cancel();
                }}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
                    event.preventDefault();
                    if (drag.current) cancel();
                    else if (event.shiftKey) editor.commands.redo();
                    else editor.commands.undo();
                    editor.commands.focus();
                  }
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    if (drag.current) finish();
                    else start();
                  }
                  if (drag.current && !drag.current.pointer && ["ArrowUp", "ArrowDown"].includes(event.key)) {
                    event.preventDefault();
                    const active = drag.current;
                    const original = editor.state.doc.resolve(active.from).index();
                    const direction = event.key === "ArrowUp" ? -1 : 1;
                    let index = active.index + direction;
                    if (index === original || index === original + 1) index += direction;
                    active.index = Math.max(0, Math.min(editor.state.doc.childCount, index));
                    let position = 0;
                    for (let i = 0; i < Math.min(active.index, editor.state.doc.childCount - 1); i++)
                      position += editor.state.doc.child(i).nodeSize;
                    const destination = editor.view.nodeDOM(position);
                    if (destination instanceof Element) destination.scrollIntoView({ block: "nearest" });
                    setMessage(
                      `Drop at position ${active.index > original ? active.index : active.index + 1} of ${editor.state.doc.childCount}. Enter to drop; Escape to cancel.`,
                    );
                    refresh.current();
                  }
                }}
              >
                <GripVertical aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent collisionPadding={8}>Drag to move · Space, then ↑/↓ to move with keyboard</TooltipContent>
          </Tooltip>
          <span id={`${id}-help`} className="sr-only">
            Press Space to pick up, Up or Down to choose a position, Enter to drop, Escape to cancel. From the editor,
            press Alt Shift B to focus this handle.
          </span>
        </div>
      )}
      {drop && (
        <div
          className={styles.blockDropIndicator}
          style={{ left: drop.left, top: drop.top, width: drop.width }}
          aria-hidden="true"
        />
      )}
    </TooltipProvider>,
    document.body,
  );
}
