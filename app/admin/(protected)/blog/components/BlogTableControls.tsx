"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Editor, EditorEvents } from "@tiptap/core";
import type { Command } from "@tiptap/pm/state";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteTable,
  mergeCells,
  splitCell,
  toggleHeaderColumn,
  toggleHeaderRow,
} from "@tiptap/pm/tables";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Columns3,
  Copy,
  Ellipsis,
  Plus,
  Rows3,
  Trash2,
} from "lucide-react";
import {
  Button,
  Input,
  Label,
  Popover,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@smarttools/ui";
import {
  appendBlogTableAxis,
  blogTableChangeFits,
  deleteBlogTableAxis,
  duplicateBlogTableAxis,
  formatBlogTableCells,
  getBlogTableContext,
  getBlogTableDragDelta,
  getBlogTableStateAtCell,
  moveBlogTableAxis,
  resizeBlogTableAxis,
  selectBlogTableAxis,
  setBlogTableColumnWidth,
  type BlogTableAxis,
} from "../lib/tableEditing";
import tableStyles from "./BlogEditor.module.css";
import { BlogColorPalette } from "./BlogColorPalette";

type Position = CSSProperties & { "--rail-length"?: string };
type Layout = {
  row: Position;
  column: Position;
  addRow: Position | null;
  addColumn: Position | null;
  cell: Position;
  cellPosition: number;
  selection: CSSProperties | null;
  width: number;
};
type EdgeDrag = {
  axis: BlogTableAxis;
  pointerId: number;
  button: HTMLButtonElement;
  origin: number;
  step: number;
  count: number;
  position: number;
  doc: Editor["state"]["doc"];
  bounds: DOMRect;
  clip: { left: number; top: number; right: number; bottom: number };
  edges: number[];
  delta: number;
  moved: boolean;
  atLimit: boolean;
};
const PALETTE = [
  ["White", "#ffffff"],
  ["Gray", "#f3f4f6"],
  ["Blue", "#dbeafe"],
  ["Green", "#dcfce7"],
  ["Yellow", "#fef3c7"],
  ["Pink", "#fce7f3"],
] as const;
const touchTargets =
  "[@media(pointer:coarse)]:[&_button]:min-h-11 [@media(pointer:coarse)]:[&_button]:min-w-11 [@media(pointer:coarse)]:[&_input]:min-h-11";
const menuClass = `z-[70] w-64 max-w-[var(--radix-popover-content-available-width)] max-h-[min(560px,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-2 text-foreground shadow-lg ${touchTargets}`;

/** Table geometry comes from the live editor; portals keep handles outside its scroll clip. */
export function BlogTableControls({ editor, disabled = false }: { editor: Editor | null; disabled?: boolean }) {
  const id = useId();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [open, setOpen] = useState<BlogTableAxis | "cell" | null>(null);
  const [width, setWidth] = useState("");
  const [error, setError] = useState("");
  const returnFocus = useRef(false);
  const menuAnchor = useRef<number | null>(null);
  const hoveredCell = useRef<number | null>(null);
  const drag = useRef<EdgeDrag | null>(null);
  const suppressClick = useRef(false);
  const [dragPreview, setDragPreview] = useState<EdgeDrag | null>(null);
  function cancelDrag() {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    suppressClick.current = active.moved;
    setDragPreview(null);
    if (active.button.hasPointerCapture(active.pointerId)) active.button.releasePointerCapture(active.pointerId);
  }
  useEffect(() => {
    if (!editor || disabled) {
      setLayout(null);
      setOpen(null);
      return;
    }
    let frame = 0;
    let hoveredTable: Element | null = null;
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    function measure() {
      frame = 0;
      const controlsFocused = document.activeElement?.closest(`[data-blog-table-controls="${id}"]`);
      const anchor = menuAnchor.current ?? hoveredCell.current;
      if (
        !editor ||
        editor.isDestroyed ||
        !editor.isEditable ||
        (anchor === null && !editor.isFocused && !controlsFocused)
      ) {
        setLayout(null);
        return;
      }
      const targetState = anchor === null ? editor.state : getBlogTableStateAtCell(editor.state, anchor);
      const context = targetState && getBlogTableContext(targetState);
      if (!context) {
        setLayout(null);
        setOpen(null);
        return;
      }
      const tableNode = editor.view.nodeDOM(context.tableStart - 1);
      const table =
        tableNode instanceof Element
          ? tableNode.matches("table")
            ? tableNode
            : tableNode.querySelector("table")
          : null;
      const cellPosition =
        anchor ?? context.tableStart + context.map.map[context.top * context.map.width + context.left];
      const cell = editor.view.nodeDOM(cellPosition);
      if (!table || !(cell instanceof Element)) {
        setLayout(null);
        return;
      }
      const bounds = table.getBoundingClientRect();
      const box = cell.getBoundingClientRect();
      const focusedContext = getBlogTableContext(editor.state);
      const showSelection =
        !!focusedContext &&
        focusedContext.tableStart === context.tableStart &&
        (editor.isFocused || !!controlsFocused || menuAnchor.current !== null);
      const selectedContext = showSelection ? focusedContext : context;
      const firstCell = editor.view.nodeDOM(
        selectedContext.tableStart +
          selectedContext.map.map[selectedContext.top * selectedContext.map.width + selectedContext.left],
      );
      const lastCell = editor.view.nodeDOM(
        selectedContext.tableStart +
          selectedContext.map.map[(selectedContext.bottom - 1) * selectedContext.map.width + selectedContext.right - 1],
      );
      const first = firstCell instanceof Element ? firstCell.getBoundingClientRect() : box;
      const last = lastCell instanceof Element ? lastCell.getBoundingClientRect() : box;
      const selection = {
        left: Math.min(first.left, last.left),
        top: Math.min(first.top, last.top),
        right: Math.max(first.right, last.right),
        bottom: Math.max(first.bottom, last.bottom),
      };
      const scroller = table.closest(".tableWrapper");
      const editorScroll = editor.view.dom.closest("[data-blog-editor-scroll]")?.getBoundingClientRect();
      const viewport = {
        left: Math.max(4, editorScroll?.left ?? 0),
        right: Math.min(window.innerWidth - 4, editorScroll?.right ?? window.innerWidth),
        top: Math.max(4, editorScroll?.top ?? 0),
        bottom: Math.min(window.innerHeight - 4, editorScroll?.bottom ?? window.innerHeight),
      };
      const tableClip = scroller?.getBoundingClientRect() ?? bounds;
      const clip = {
        left: Math.max(viewport.left, tableClip.left),
        right: Math.min(viewport.right, tableClip.right),
        top: Math.max(viewport.top, tableClip.top),
        bottom: Math.min(viewport.bottom, tableClip.bottom),
      };
      const target = coarsePointer.matches ? 44 : 24;
      if (
        viewport.right - viewport.left < target ||
        viewport.bottom - viewport.top < target ||
        bounds.right <= clip.left ||
        bounds.left >= clip.right ||
        bounds.bottom <= clip.top ||
        bounds.top >= clip.bottom
      ) {
        setLayout(null);
        return;
      }
      const fit = (left: number, top: number, width: number, height: number): Position => ({
        left: Math.max(viewport.left, Math.min(viewport.right - width, left)),
        top: Math.max(viewport.top, Math.min(viewport.bottom - height, top)),
        width,
        height,
      });
      const horizontal = (left: number, right: number, center: number): Position => ({
        ...fit(
          (left + right - Math.max(target, right - left)) / 2,
          center - target / 2,
          Math.max(target, right - left),
          target,
        ),
        "--rail-length": `${right - left}px`,
      });
      const vertical = (top: number, bottom: number, center: number): Position => ({
        ...fit(
          center - target / 2,
          (top + bottom - Math.max(target, bottom - top)) / 2,
          target,
          Math.max(target, bottom - top),
        ),
        "--rail-length": `${bottom - top}px`,
      });
      const left = Math.max(bounds.left, clip.left);
      const right = Math.min(bounds.right, clip.right);
      const top = Math.max(bounds.top, clip.top);
      const bottom = Math.min(bounds.bottom, clip.bottom);
      const active =
        box.right > clip.left && box.left < clip.right && box.bottom > clip.top && box.top < clip.bottom
          ? box
          : { left, right, top, bottom };
      const gap = target / 2 + 2;
      const selected = {
        left: Math.max(selection.left, clip.left),
        top: Math.max(selection.top, clip.top),
        right: Math.min(selection.right, clip.right),
        bottom: Math.min(selection.bottom, clip.bottom),
      };
      setLayout({
        row: vertical(Math.max(active.top, clip.top), Math.min(active.bottom, clip.bottom), left - gap),
        column: horizontal(Math.max(active.left, clip.left), Math.min(active.right, clip.right), bounds.top - gap),
        addColumn: bounds.right <= clip.right + 1 ? vertical(top, bottom, right + gap) : null,
        addRow: bounds.bottom <= clip.bottom + 1 ? horizontal(left, right, bounds.bottom + gap) : null,
        cell: fit(selected.right - target / 2, (selected.top + selected.bottom - target) / 2, target, target),
        cellPosition,
        selection:
          showSelection && selected.right > selected.left && selected.bottom > selected.top
            ? {
                left: selected.left,
                top: selected.top,
                width: selected.right - selected.left,
                height: selected.bottom - selected.top,
                borderTopWidth: selection.top < clip.top ? 0 : 2,
                borderBottomWidth: selection.bottom > clip.bottom ? 0 : 2,
                borderLeftWidth: selection.left < clip.left ? 0 : 2,
                borderRightWidth: selection.right > clip.right ? 0 : 2,
              }
            : null,
        width: Math.round(box.width / Number(editor.state.doc.nodeAt(cellPosition)?.attrs.colspan || 1)),
      });
    }
    function queue() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    function geometryChanged() {
      cancelDrag();
      queue();
    }
    function pointer(event: PointerEvent) {
      if (!editor || editor.isDestroyed || menuAnchor.current !== null || drag.current) return;
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest(`[data-blog-table-controls="${id}"]`)) return;
      const table = element?.closest("table");
      if (table && editor.view.dom.contains(table)) {
        const cell = element?.closest("td, th") ?? table.querySelector("td, th");
        if (cell) {
          const position = editor.view.posAtDOM(cell, 0) - 1;
          if (hoveredCell.current === position) return;
          if (getBlogTableStateAtCell(editor.state, position)) {
            hoveredTable = table;
            if (hoveredCell.current !== position) {
              hoveredCell.current = position;
              queue();
            }
            return;
          }
        }
      }
      // The rails sit outside the table; keep the target while crossing that gap.
      const bounds = hoveredTable?.isConnected ? hoveredTable.getBoundingClientRect() : null;
      const margin = coarsePointer.matches ? 48 : 28;
      if (
        bounds &&
        event.clientX >= bounds.left - margin &&
        event.clientX <= bounds.right + margin &&
        event.clientY >= bounds.top - margin &&
        event.clientY <= bounds.bottom + margin
      )
        return;
      if (hoveredCell.current !== null) {
        hoveredCell.current = null;
        hoveredTable = null;
        queue();
      }
    }
    function focus() {
      if (
        !document.activeElement?.closest(`[data-blog-table-controls="${id}"]`) &&
        !editor?.view.dom.contains(document.activeElement)
      ) {
        hoveredCell.current = null;
        hoveredTable = null;
      }
      queue();
    }
    function transaction({ transaction, appendedTransactions }: EditorEvents["transaction"]) {
      for (const change of [transaction, ...(appendedTransactions ?? [])]) {
        if (change.docChanged) cancelDrag();
        for (const anchor of [menuAnchor, hoveredCell]) {
          if (anchor.current === null) continue;
          const mapped = change.mapping.mapResult(anchor.current, 1);
          const name = change.doc.nodeAt(mapped.pos)?.type.name;
          anchor.current = !mapped.deleted && (name === "tableCell" || name === "tableHeader") ? mapped.pos : null;
        }
      }
      queue();
    }
    function keyboard(event: KeyboardEvent) {
      if (drag.current) return;
      hoveredCell.current = null;
      hoveredTable = null;
      queue();
      if (!event.altKey || !event.shiftKey || !editor || !getBlogTableContext(editor.state)) return;
      const axis =
        event.code === "KeyR" ? "row" : event.code === "KeyC" ? "column" : event.code === "KeyT" ? "cell" : null;
      if (!axis) return;
      event.preventDefault();
      const initial = getBlogTableContext(editor.state)!;
      menuAnchor.current = initial.tableStart + initial.map.map[initial.top * initial.map.width + initial.left];
      if (axis !== "cell") selectBlogTableAxis(axis)(editor.state, (transaction) => editor.view.dispatch(transaction));
      setError("");
      const position = menuAnchor.current!;
      const cell = editor.view.nodeDOM(position);
      setWidth(
        String(
          cell instanceof Element
            ? Math.round(
                cell.getBoundingClientRect().width / Number(editor.state.doc.nodeAt(position)?.attrs.colspan || 1),
              )
            : 100,
        ),
      );
      setOpen(axis);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && drag.current) {
        event.preventDefault();
        cancelDrag();
      }
    }
    queue();
    editor.on("transaction", transaction);
    editor.on("focus", queue);
    editor.on("blur", queue);
    const observer = new ResizeObserver(geometryChanged);
    observer.observe(editor.view.dom);
    window.addEventListener("resize", geometryChanged);
    window.addEventListener("scroll", geometryChanged, true);
    window.addEventListener("focusin", focus);
    window.addEventListener("pointermove", pointer, { passive: true });
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", cancelDrag);
    coarsePointer.addEventListener("change", queue);
    editor.view.dom.addEventListener("keydown", keyboard);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("transaction", transaction);
      editor.off("focus", queue);
      editor.off("blur", queue);
      observer.disconnect();
      window.removeEventListener("resize", geometryChanged);
      window.removeEventListener("scroll", geometryChanged, true);
      window.removeEventListener("focusin", focus);
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", cancelDrag);
      cancelDrag();
      coarsePointer.removeEventListener("change", queue);
      editor.view.dom.removeEventListener("keydown", keyboard);
    };
  }, [editor, disabled, id]);

  if (!editor || !layout || disabled || !editor.isEditable) return null;
  const currentEditor = editor;
  const targetState = getBlogTableStateAtCell(editor.state, layout.cellPosition);
  const commandState = open ? editor.state : targetState;
  const context = commandState && getBlogTableContext(commandState);
  if (!context) return null;
  function run(command: Command, keepOpen = false, fromTarget = false) {
    if (!currentEditor.isEditable || currentEditor.isDestroyed || disabled) return;
    const state =
      fromTarget || !open ? getBlogTableStateAtCell(currentEditor.state, layout!.cellPosition) : currentEditor.state;
    if (!state) return;
    let tooLarge = false;
    const success = command(state, (transaction) => {
      if (transaction.doc.nodeSize >= currentEditor.state.doc.nodeSize && !blogTableChangeFits(transaction.doc)) {
        tooLarge = true;
        return;
      }
      currentEditor.view.dispatch(transaction);
    });
    if (tooLarge || !success) {
      if (!open) {
        menuAnchor.current = layout!.cellPosition;
        currentEditor.view.dispatch(currentEditor.state.tr.setSelection(state.selection));
      }
      setError(
        tooLarge
          ? "This table would exceed the article limits. Use fewer columns or remove some content first."
          : "This change is unavailable. Select another cell, split merged cells, or reduce the table size.",
      );
      setOpen(open ?? "cell");
      return;
    }
    setError("");
    if (!keepOpen) {
      menuAnchor.current = null;
      setOpen(null);
      currentEditor.commands.focus();
    }
  }
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, axis: BlogTableAxis) {
    if (event.button !== 0) return;
    suppressClick.current = false;
    const state = getBlogTableStateAtCell(currentEditor.state, layout!.cellPosition);
    const target = state && getBlogTableContext(state);
    if (!target) return;
    const node = currentEditor.view.nodeDOM(target.tableStart - 1);
    const table = node instanceof Element ? (node.matches("table") ? node : node.querySelector("table")) : null;
    const last = currentEditor.view.nodeDOM(target.tableStart + target.map.map.at(-1)!);
    if (!table || !(last instanceof Element)) return;
    const cell = target.table.nodeAt(target.map.map.at(-1)!)!;
    const box = last.getBoundingClientRect();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    menuAnchor.current = null;
    hoveredCell.current = layout!.cellPosition;
    setOpen(null);
    const scroll = currentEditor.view.dom.closest("[data-blog-editor-scroll]")?.getBoundingClientRect();
    const clip = {
      left: Math.max(0, scroll?.left ?? 0),
      top: Math.max(0, scroll?.top ?? 0),
      right: Math.min(window.innerWidth, scroll?.right ?? window.innerWidth),
      bottom: Math.min(window.innerHeight, scroll?.bottom ?? window.innerHeight),
    };
    const edges = Array.from(
      table.querySelectorAll(axis === "row" ? ":scope > tbody > tr, :scope > tr" : ":scope > colgroup > col"),
      (element) => {
        const rect = element.getBoundingClientRect();
        return axis === "row" ? rect.top : rect.left;
      },
    );
    const count = axis === "row" ? target.map.height : target.map.width;
    const bounds = table.getBoundingClientRect();
    const step = Math.max(
      24,
      edges.length === count
        ? (axis === "row" ? bounds.bottom : bounds.right) - edges.at(-1)!
        : axis === "row"
          ? box.height / cell.attrs.rowspan
          : box.width / cell.attrs.colspan,
    );
    drag.current = {
      axis,
      pointerId: event.pointerId,
      button: event.currentTarget,
      origin: axis === "row" ? event.clientY : event.clientX,
      step,
      count,
      position: layout!.cellPosition,
      doc: currentEditor.state.doc,
      bounds,
      clip,
      edges,
      delta: 0,
      moved: false,
      atLimit: false,
    };
  }
  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active || event.pointerId !== active.pointerId) return;
    const distance = (active.axis === "row" ? event.clientY : event.clientX) - active.origin;
    if (!active.moved && Math.abs(distance) < 4) return;
    event.preventDefault();
    const delta = getBlogTableDragDelta({
      axis: active.axis,
      distance,
      step: active.step,
      count: active.count,
      edges: active.edges,
      end: active.axis === "row" ? active.bounds.bottom : active.bounds.right,
    });
    const atLimit =
      delta === 0 &&
      ((distance < 0 && active.count === 1) || (distance > 0 && active.axis === "column" && active.count === 100));
    if (active.moved && active.delta === delta && active.atLimit === atLimit) return;
    const next = { ...active, moved: true, delta, atLimit };
    drag.current = next;
    setDragPreview(next);
  }
  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active || event.pointerId !== active.pointerId) return;
    cancelDrag();
    if (active.moved && active.delta && active.doc === currentEditor.state.doc)
      run(resizeBlogTableAxis(active.axis, active.delta), false, true);
  }
  function item(label: string, icon: ReactNode, command: Command, blocked = false) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start font-normal"
        disabled={blocked}
        onClick={() => run(command)}
      >
        {icon}
        {label}
      </Button>
    );
  }
  function resizeColumn() {
    const value = Number(width);
    if (!Number.isInteger(value) || value < 25 || value > 10000) {
      setError("Enter a whole-number width from 25 to 10,000 pixels.");
      return;
    }
    run(setBlogTableColumnWidth(value), true);
  }
  function styles() {
    return (
      <div className="space-y-2 border-t border-border px-1 pt-3">
        <p className="text-xs font-normal">Background color</p>
        <BlogColorPalette
          colors={PALETTE}
          label="Background color"
          onChange={(backgroundColor) => run(formatBlogTableCells({ backgroundColor }), true)}
        />
        <div className="flex items-center gap-1" role="group" aria-label="Cell text alignment">
          {(
            [
              ["left", AlignLeft],
              ["center", AlignCenter],
              ["right", AlignRight],
            ] as const
          ).map(([align, Icon]) => (
            <Tooltip key={align}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Align cells ${align}`}
                  onClick={() => run(formatBlogTableCells({ align }), true)}
                >
                  <Icon aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Align {align}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    );
  }
  function menu(axis: BlogTableAxis | "cell", position: Position, label: string, icon?: ReactNode) {
    const row = axis === "row";
    const shortcut = `Alt+Shift+${row ? "R" : axis === "column" ? "C" : "T"}`;
    const canDuplicate = axis === "cell" || duplicateBlogTableAxis(axis)(commandState!);
    return (
      <Popover.Root
        open={open === axis}
        onOpenChange={(value) => {
          setError("");
          if (value) {
            const selected = axis === "cell" ? getBlogTableContext(currentEditor.state) : null;
            menuAnchor.current = selected
              ? selected.tableStart + selected.map.map[selected.top * selected.map.width + selected.left]
              : layout!.cellPosition;
            if (axis !== "cell") run(selectBlogTableAxis(axis), true, true);
            setWidth(String(layout!.width));
          } else menuAnchor.current = null;
          setOpen(value ? axis : null);
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Popover.Trigger asChild>
              <Button
                style={position}
                variant="ghost"
                size="icon-xs"
                className={axis === "cell" ? tableStyles.tableCellHandle : tableStyles.tableRail}
                data-orientation={row ? "vertical" : "horizontal"}
                data-active={open === axis}
                aria-label={label}
                aria-keyshortcuts={shortcut}
                onMouseDown={(event) => event.preventDefault()}
              >
                {icon}
              </Button>
            </Popover.Trigger>
          </TooltipTrigger>
          <TooltipContent>
            {label} ({shortcut})
          </TooltipContent>
        </Tooltip>
        <Popover.Portal>
          <Popover.Content
            data-blog-table-controls={id}
            aria-label={label}
            className={menuClass}
            side={row ? "right" : "bottom"}
            align="start"
            sideOffset={6}
            collisionPadding={12}
            onEscapeKeyDown={() => {
              returnFocus.current = true;
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (returnFocus.current && !currentEditor.isDestroyed) currentEditor.commands.focus();
              returnFocus.current = false;
            }}
          >
            {error && (
              <p role="alert" className="sticky top-0 z-10 mb-2 bg-card px-2 py-1 text-xs text-destructive">
                {error}
              </p>
            )}
            <p className="px-2 pb-2 text-xs font-medium">
              {axis === "cell"
                ? "Selected cells"
                : `${row ? "Row" : "Column"} ${(row ? context!.top : context!.left) + 1}`}
            </p>
            {axis !== "cell" ? (
              <>
                {item(
                  `Move ${axis} ${row ? "up" : "left"}`,
                  row ? <ArrowUp /> : <ArrowLeft />,
                  moveBlogTableAxis(axis, -1),
                  !moveBlogTableAxis(axis, -1)(commandState!),
                )}
                {item(
                  `Move ${axis} ${row ? "down" : "right"}`,
                  row ? <ArrowDown /> : <ArrowRight />,
                  moveBlogTableAxis(axis, 1),
                  !moveBlogTableAxis(axis, 1)(commandState!),
                )}
                <div className="my-2 border-t border-border" />
                {item(`Insert ${axis} ${row ? "above" : "left"}`, <Plus />, row ? addRowBefore : addColumnBefore)}
                {item(`Insert ${axis} ${row ? "below" : "right"}`, <Plus />, row ? addRowAfter : addColumnAfter)}
                {item(`Duplicate ${axis}`, <Copy />, duplicateBlogTableAxis(axis), !canDuplicate)}
                {context!.merged && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    Split merged cells before duplicating a row or column.
                  </p>
                )}
                {!context!.merged && !canDuplicate && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    Duplication would exceed the article or 100-column limit.
                  </p>
                )}
                {item(
                  `Toggle header ${axis}`,
                  row ? <Rows3 /> : <Columns3 />,
                  row ? toggleHeaderRow : toggleHeaderColumn,
                )}
                {item(`Delete ${axis}`, <Trash2 />, deleteBlogTableAxis(axis))}
                {!row && (
                  <div className="my-2 border-t border-border px-1 pt-3">
                    <Label htmlFor={`${id}-column-width`}>Column width (px)</Label>
                    <div className="mt-1 flex gap-2">
                      <Input
                        id={`${id}-column-width`}
                        type="number"
                        min={25}
                        max={10000}
                        size="sm"
                        value={width}
                        onChange={(event) => setWidth(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            resizeColumn();
                          }
                        }}
                      />
                      <Button size="sm" variant="outline" className="font-normal" onClick={resizeColumn}>
                        Apply
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Drag a column boundary or enter a width.</p>
                  </div>
                )}
              </>
            ) : (
              <>
                {item("Merge selected cells", <Columns3 />, mergeCells, !mergeCells(currentEditor.state))}
                {item("Split merged cell", <Columns3 />, splitCell, !splitCell(currentEditor.state))}
                {item("Delete table", <Trash2 />, deleteTable)}
              </>
            )}
            {styles()}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }
  function edge(label: string, axis: BlogTableAxis, position: Position) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            style={position}
            variant="ghost"
            size="icon-xs"
            className={tableStyles.tableRail}
            data-resize={axis}
            data-orientation={axis === "row" ? "horizontal" : "vertical"}
            aria-label={label}
            onPointerDown={(event) => startDrag(event, axis)}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={cancelDrag}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              const suppressed = suppressClick.current && event.detail !== 0;
              suppressClick.current = false;
              if (!suppressed) run(appendBlogTableAxis(axis));
            }}
          >
            <Plus aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {label}. Drag to add or remove {axis}s.
        </TooltipContent>
      </Tooltip>
    );
  }
  const previewEdge = dragPreview
    ? dragPreview.delta < 0 && dragPreview.edges.length === dragPreview.count
      ? dragPreview.edges[dragPreview.count + dragPreview.delta]
      : (dragPreview.axis === "row" ? dragPreview.bounds.bottom : dragPreview.bounds.right) +
        dragPreview.delta * dragPreview.step
    : 0;
  const previewStyle = dragPreview
    ? {
        left: Math.max(
          dragPreview.clip.left,
          dragPreview.axis === "row" ? dragPreview.bounds.left : Math.min(dragPreview.bounds.right, previewEdge),
        ),
        top: Math.max(
          dragPreview.clip.top,
          dragPreview.axis === "row" ? Math.min(dragPreview.bounds.bottom, previewEdge) : dragPreview.bounds.top,
        ),
        right:
          window.innerWidth -
          Math.min(
            dragPreview.clip.right,
            dragPreview.axis === "row" ? dragPreview.bounds.right : Math.max(dragPreview.bounds.right, previewEdge),
          ),
        bottom:
          window.innerHeight -
          Math.min(
            dragPreview.clip.bottom,
            dragPreview.axis === "row" ? Math.max(dragPreview.bounds.bottom, previewEdge) : dragPreview.bounds.bottom,
          ),
      }
    : undefined;
  return createPortal(
    <div data-blog-table-controls={id} className={tableStyles.tableControls}>
      <TooltipProvider>
        {layout.selection && <div aria-hidden="true" className={tableStyles.tableSelection} style={layout.selection} />}
        {menu("row", layout.row, "Row options", <Ellipsis aria-hidden="true" className="rotate-90" />)}
        {menu("column", layout.column, "Column options", <Ellipsis aria-hidden="true" />)}
        {layout.selection && menu("cell", layout.cell, "Selected cell options")}
        {layout.addRow && edge("Add row at bottom", "row", layout.addRow)}
        {layout.addColumn && edge("Add column at right", "column", layout.addColumn)}
        {dragPreview && (
          <>
            {!!dragPreview.delta && (
              <div
                aria-hidden="true"
                className={tableStyles.tableDragPreview}
                data-removing={dragPreview.delta < 0}
                style={previewStyle}
              />
            )}
            <div
              role="status"
              className={tableStyles.tableDragStatus}
              style={{
                left: Math.max(
                  8,
                  Math.min(
                    window.innerWidth - 288,
                    dragPreview.axis === "row" ? dragPreview.bounds.left : dragPreview.bounds.right + 8,
                  ),
                ),
                top: Math.max(
                  8,
                  Math.min(
                    window.innerHeight - 72,
                    dragPreview.axis === "row" ? previewEdge + 12 : dragPreview.bounds.top,
                  ),
                ),
              }}
            >
              {dragPreview.atLimit
                ? dragPreview.count === 1
                  ? `Keep at least one ${dragPreview.axis}.`
                  : "A table can have at most 100 columns."
                : dragPreview.delta < 0
                  ? `Remove ${-dragPreview.delta} ${dragPreview.axis}${dragPreview.delta === -1 ? "" : "s"} and their contents. Release to apply; Undo restores them.`
                  : dragPreview.delta > 0
                    ? `Add ${dragPreview.delta} ${dragPreview.axis}${dragPreview.delta === 1 ? "" : "s"}. Release to apply.`
                    : "Drag further to add or remove. Escape cancels."}
            </div>
          </>
        )}
      </TooltipProvider>
    </div>,
    document.body,
  );
}
