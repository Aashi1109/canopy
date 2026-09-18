"use client";

import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type {} from "@tiptap/starter-kit";
import type {} from "@tiptap/extension-table";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  CodeXml,
  Heading,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  MoreHorizontal,
  Pilcrow,
  Plus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  Underline,
  Undo2,
} from "lucide-react";
import type { BlogImage } from "@/lib/blog/document";
import { captureBlogInsertion, createBlogTable } from "../lib/editorInsertion";
import {
  Button,
  Input,
  Label,
  Popover,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/index.tsx";
import styles from "./BlogEditor.module.css";
import { BlogColorPalette } from "./BlogColorPalette";

const HIGHLIGHT_COLORS = [
  ["Green", "#dcfce7"],
  ["Blue", "#dbeafe"],
  ["Pink", "#fce7f3"],
  ["Purple", "#ede9fe"],
  ["Yellow", "#fef08a"],
] as const;

type Props = {
  editor: Editor | null;
  disabled?: boolean;
  imageRequest?: number;
  onImageRequestHandled?: () => void;
  onUploadImage: (file: File) => Promise<BlogImage | null>;
};
const menuClass =
  "z-50 max-h-[min(70vh,var(--radix-popover-content-available-height))] overflow-y-auto rounded-lg border border-border bg-card p-2 shadow-lg";

function EditorMenuItem(props: ComponentProps<typeof Button>) {
  return <Button size="xs" variant="ghost" className="justify-start text-sm font-normal" {...props} />;
}

function BlogTablePicker({
  onInsert,
  onBack,
  disabled,
  error,
}: {
  onInsert: (columns: number, rows: number) => void;
  onBack: () => void;
  disabled: boolean;
  error: string;
}) {
  const id = useId();
  const [size, setSize] = useState({ columns: "3", rows: "3" });
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const columns = Number(size.columns);
  const rows = Number(size.rows);
  const valid = [columns, rows].every((value) => Number.isInteger(value) && value >= 1 && value <= 20);
  const activeColumn = Math.max(1, Math.min(8, Math.floor(columns) || 1));
  const activeRow = Math.max(1, Math.min(8, Math.floor(rows) || 1));
  function choose(column: number, row: number) {
    setSize({ columns: String(column), rows: String(row) });
  }
  useEffect(() => {
    cells.current[18]?.focus();
  }, []);
  return (
    <div className="space-y-2 [@media(pointer:coarse)]:[&_input]:min-h-11 [@media(pointer:coarse)]:[&_button:not([role=gridcell])]:min-h-11">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold">Insert table</p>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {valid ? `${columns} × ${rows}` : "Choose a size"}
        </span>
      </div>
      <div
        role="grid"
        aria-label="Table size, columns by rows"
        aria-rowcount={8}
        aria-colcount={8}
        className="space-y-0.5"
      >
        {Array.from({ length: 8 }, (_, rowIndex) => (
          <div role="row" key={rowIndex} className="grid grid-cols-8 gap-0.5">
            {Array.from({ length: 8 }, (_, columnIndex) => {
              const column = columnIndex + 1;
              const row = rowIndex + 1;
              const active = column === activeColumn && row === activeRow;
              return (
                <Button
                  key={column}
                  ref={(element) => {
                    cells.current[rowIndex * 8 + columnIndex] = element;
                  }}
                  role="gridcell"
                  size="icon-sm"
                  variant="outline"
                  tabIndex={active ? 0 : -1}
                  aria-colindex={column}
                  aria-rowindex={row}
                  aria-selected={active}
                  aria-label={`${column} ${column === 1 ? "column" : "columns"}, ${row} ${row === 1 ? "row" : "rows"}`}
                  disabled={disabled}
                  data-highlighted={column <= columns && row <= rows}
                  className="aspect-square h-auto w-full min-w-0 rounded-sm p-0 data-[highlighted=true]:border-primary data-[highlighted=true]:bg-primary/15"
                  onPointerEnter={() => {
                    if (!disabled) choose(column, row);
                  }}
                  onFocus={() => choose(column, row)}
                  onClick={() => onInsert(column, row)}
                  onKeyDown={(event) => {
                    let nextColumn = column;
                    let nextRow = row;
                    switch (event.key) {
                      case "ArrowLeft":
                        nextColumn = Math.max(1, column - 1);
                        break;
                      case "ArrowRight":
                        nextColumn = Math.min(8, column + 1);
                        break;
                      case "ArrowUp":
                        nextRow = Math.max(1, row - 1);
                        break;
                      case "ArrowDown":
                        nextRow = Math.min(8, row + 1);
                        break;
                      case "Home":
                        nextColumn = 1;
                        if (event.ctrlKey || event.metaKey) nextRow = 1;
                        break;
                      case "End":
                        nextColumn = 8;
                        if (event.ctrlKey || event.metaKey) nextRow = 8;
                        break;
                      default:
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    choose(nextColumn, nextRow);
                    cells.current[(nextRow - 1) * 8 + nextColumn - 1]?.focus();
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-columns`} className="text-xs">
            Columns
          </Label>
          <Input
            id={`${id}-columns`}
            type="number"
            size="xs"
            min={1}
            max={20}
            step={1}
            value={size.columns}
            disabled={disabled}
            aria-invalid={!Number.isInteger(columns) || columns < 1 || columns > 20}
            onChange={(event) => setSize((previous) => ({ ...previous, columns: event.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-rows`} className="text-xs">
            Rows
          </Label>
          <Input
            id={`${id}-rows`}
            type="number"
            size="xs"
            min={1}
            max={20}
            step={1}
            value={size.rows}
            disabled={disabled}
            aria-invalid={!Number.isInteger(rows) || rows < 1 || rows > 20}
            onChange={(event) => setSize((previous) => ({ ...previous, rows: event.target.value }))}
          />
        </div>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">1–20 each · First row is a header.</p>
      {(error || !valid) && (
        <p role="alert" className="text-[13px] text-destructive">
          {error || "Enter whole numbers from 1 to 20 for columns and rows."}
        </p>
      )}
      <div className="flex justify-between gap-2">
        <Button size="xs" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button size="xs" disabled={disabled || !valid} onClick={() => onInsert(columns, rows)}>
          {valid ? `Insert ${columns} × ${rows}` : "Insert table"}
        </Button>
      </div>
    </div>
  );
}

/** One insertion menu serves both the toolbar and the inline Add a block control. */
export function BlogBlockMenu({
  editor,
  disabled = false,
  onUploadImage,
  imageRequest = 0,
  onImageRequestHandled,
  atEnd = false,
  blockPosition,
  onOpenChange,
}: Props & { atEnd?: boolean; blockPosition?: number; onOpenChange?: (open: boolean) => void }) {
  const id = useId();
  const inline = blockPosition !== undefined;
  const [open, setOpen] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [tableMode, setTableMode] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [editingImage, setEditingImage] = useState(false);
  const keepEditorFocus = useRef(false);
  const menu = useRef<HTMLDivElement>(null);
  const pendingInsertion = useRef<ReturnType<typeof captureBlogInsertion> | null>(null);
  function clearInsertion() {
    pendingInsertion.current?.dispose();
    pendingInsertion.current = null;
  }
  function changeOpen(value: boolean) {
    setOpen(value);
    onOpenChange?.(value);
    if (!value) clearInsertion();
  }
  function backToBlocks() {
    setImageMode(false);
    setTableMode(false);
    setError("");
    requestAnimationFrame(() => menu.current?.querySelector<HTMLButtonElement>("button")?.focus());
  }
  useEffect(() => () => pendingInsertion.current?.dispose(), []);
  useEffect(() => {
    if (!imageRequest || !editor) return;
    clearInsertion();
    pendingInsertion.current = captureBlogInsertion(editor);
    setEditingImage(true);
    setFile(null);
    setAlt(String(editor.getAttributes("image").alt ?? ""));
    setCaption(String(editor.getAttributes("image").caption ?? ""));
    setError("");
    setImageMode(true);
    setTableMode(false);
    setOpen(true);
    onImageRequestHandled?.();
  }, [imageRequest, editor, onImageRequestHandled]);
  function insert(type: string) {
    if (!editor || editor.isDestroyed || !editor.isEditable || disabled) return;
    if (type === "table") {
      pendingInsertion.current ??= captureBlogInsertion(editor, atEnd, blockPosition);
      setError("");
      setTableMode(true);
      return;
    }
    const content = { type: "paragraph" };
    const node =
      type === "bulletList" || type === "orderedList" || type === "taskList"
        ? {
            type,
            content: [
              {
                type: type === "taskList" ? "taskItem" : "listItem",
                ...(type === "taskList" ? { attrs: { checked: false } } : {}),
                content: [content],
              },
            ],
          }
        : type === "blockquote"
          ? { type, content: [content] }
          : type === "heading2" || type === "heading3"
            ? { type: "heading", attrs: { level: type === "heading2" ? 2 : 3 } }
            : { type };
    try {
      const insertion = pendingInsertion.current ?? captureBlogInsertion(editor, atEnd, blockPosition);
      const inserted = insertion.insert(node);
      if (!inserted) {
        setError("Couldn’t insert the block. Select a place in the article and try again.");
        return;
      }
      keepEditorFocus.current = true;
      editor.commands.focus();
      changeOpen(false);
    } catch {
      setError("Couldn’t insert the block. Select a place in the article and try again.");
    }
  }
  function insertTable(columns: number, rows: number) {
    if (!editor || editor.isDestroyed || !editor.isEditable || disabled) return;
    try {
      const table = createBlogTable(editor, columns, rows);
      const insertion = pendingInsertion.current ?? captureBlogInsertion(editor, atEnd, blockPosition);
      if (!insertion.insert(table)) {
        setError("Couldn’t insert the table. Select a place in the article and try again.");
        return;
      }
      keepEditorFocus.current = true;
      editor.commands.focus();
      changeOpen(false);
    } catch {
      setError("Couldn’t insert the table. Choose 1–20 columns and rows and try again.");
    }
  }
  return (
    <Popover.Root
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        clearInsertion();
        changeOpen(value);
        if (value) {
          if (editor) pendingInsertion.current = captureBlogInsertion(editor, atEnd, blockPosition);
          setImageMode(false);
          setTableMode(false);
          setError("");
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Popover.Trigger asChild>
            <Button
              size={inline ? "icon-xs" : atEnd ? "sm" : "xs"}
              variant="ghost"
              disabled={disabled || !editor}
              className={inline ? "text-muted-foreground" : atEnd ? styles.addBlock : styles.addContent}
              aria-label={inline ? "Add block here" : atEnd ? "Add a block" : "Add content"}
              onMouseDown={(event) => event.preventDefault()}
            >
              <Plus aria-hidden="true" />
              {!inline && (atEnd ? "Add a block" : "Add")}
            </Button>
          </Popover.Trigger>
        </TooltipTrigger>
        <TooltipContent>{inline ? "Add block here" : atEnd ? "Add a block" : "Add content"}</TooltipContent>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          ref={menu}
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className={
            tableMode
              ? `${menuClass} w-60 max-w-[calc(100vw-32px)] p-2.5`
              : imageMode
                ? `${menuClass} w-80 max-w-[calc(100vw-32px)] space-y-3 p-3`
                : `${menuClass} w-48 max-w-[calc(100vw-32px)]`
          }
          onFocusOutside={(event) => {
            if (imageMode || tableMode) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            if (keepEditorFocus.current) {
              event.preventDefault();
              keepEditorFocus.current = false;
            }
          }}
        >
          {tableMode ? (
            <BlogTablePicker
              disabled={disabled || !editor?.isEditable}
              error={error}
              onInsert={insertTable}
              onBack={backToBlocks}
            />
          ) : imageMode ? (
            <>
              <p className="text-[13px] font-semibold">{editingImage ? "Edit image" : "Insert image"}</p>
              {!editingImage && (
                <>
                  <Label className="text-[13px]" htmlFor={`${id}-image`}>
                    Article image
                  </Label>
                  <Input
                    size="sm"
                    id={`${id}-image`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={pending}
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">JPEG, PNG or WebP · Up to 5 MiB</p>
                </>
              )}
              <Label className="text-[13px]" htmlFor={`${id}-alt`}>
                Image description (required)
              </Label>
              <Input
                size="sm"
                id={`${id}-alt`}
                maxLength={500}
                value={alt}
                disabled={pending}
                onChange={(event) => setAlt(event.target.value)}
              />
              <Label className="text-[13px]" htmlFor={`${id}-caption`}>
                Caption (optional)
              </Label>
              <Input
                size="sm"
                id={`${id}-caption`}
                maxLength={1000}
                value={caption}
                disabled={pending}
                onChange={(event) => setCaption(event.target.value)}
              />
              {error && (
                <p role="alert" className="text-[13px] text-destructive">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="xs" disabled={pending} onClick={backToBlocks}>
                  Back
                </Button>
                <Button
                  size="xs"
                  loading={pending}
                  disabled={disabled || !alt.trim() || (!editingImage && !file)}
                  onClick={async () => {
                    if (!editor || editor.isDestroyed || !editor.isEditable || disabled) return;
                    if (editingImage) {
                      const updated = pendingInsertion.current?.updateImage({
                        alt: alt.trim(),
                        caption: caption.trim(),
                      });
                      clearInsertion();
                      if (!updated) {
                        setError("The original image changed. Go back, select it, and reopen its description.");
                        return;
                      }
                      keepEditorFocus.current = true;
                      editor.commands.focus();
                      changeOpen(false);
                      return;
                    }
                    if (!file) return;
                    setPending(true);
                    setError("");
                    const insertion = pendingInsertion.current ?? captureBlogInsertion(editor, atEnd, blockPosition);
                    pendingInsertion.current = insertion;
                    try {
                      const image = await onUploadImage(file);
                      if (!image) return;
                      const inserted = insertion.insert({
                        type: "image",
                        attrs: {
                          ...image,
                          alt: alt.trim(),
                          caption: caption.trim(),
                        },
                      });
                      if (!inserted) {
                        setError("Couldn’t insert the image. Select a place in the article and try again.");
                        return;
                      }
                      keepEditorFocus.current = true;
                      editor.commands.focus();
                      changeOpen(false);
                    } catch {
                      setError("Couldn’t insert the image. Try again.");
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  {editingImage ? "Save description" : "Insert image"}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col [&_button]:h-9 [@media(pointer:coarse)]:[&_button]:min-h-11">
              {error && (
                <p role="alert" className="max-w-64 px-2 text-[13px] text-destructive">
                  {error}
                </p>
              )}
              <div role="group" aria-label="Style" className="flex flex-col">
                <p className="px-2 py-1.5 text-[13px] font-semibold">Style</p>
                {(
                  [
                    ["paragraph", "Text", Pilcrow],
                    ["heading2", "Heading 2", Heading2],
                    ["heading3", "Heading 3", Heading3],
                    ["bulletList", "Bullet list", List],
                    ["orderedList", "Numbered list", ListOrdered],
                    ["taskList", "Checklist", ListChecks],
                    ["blockquote", "Quote", Quote],
                    ["codeBlock", "Code block", SquareCode],
                  ] as const
                ).map(([type, label, Icon]) => (
                  <EditorMenuItem key={type} aria-label={`Insert ${label.toLowerCase()}`} onClick={() => insert(type)}>
                    <Icon aria-hidden="true" />
                    {label}
                  </EditorMenuItem>
                ))}
              </div>
              <Separator className="my-2" />
              <div role="group" aria-label="Insert" className="flex flex-col">
                <p className="px-2 py-1.5 text-[13px] font-semibold">Insert</p>
                {(
                  [
                    ["table", "Table", Table2],
                    ["horizontalRule", "Divider", Minus],
                  ] as const
                ).map(([type, label, Icon]) => (
                  <EditorMenuItem key={type} aria-label={`Insert ${label.toLowerCase()}`} onClick={() => insert(type)}>
                    <Icon aria-hidden="true" />
                    {label}
                  </EditorMenuItem>
                ))}
              </div>
              <Separator className="my-2" />
              <div role="group" aria-label="Upload" className="flex flex-col">
                <p className="px-2 py-1.5 text-[13px] font-semibold">Upload</p>
                <EditorMenuItem
                  onClick={() => {
                    const selected = !inline && !atEnd && !!editor?.isActive("image");
                    if (editor) pendingInsertion.current ??= captureBlogInsertion(editor, atEnd, blockPosition);
                    setEditingImage(selected);
                    setFile(null);
                    setAlt(selected ? String(editor?.getAttributes("image").alt ?? "") : "");
                    setCaption(selected ? String(editor?.getAttributes("image").caption ?? "") : "");
                    setImageMode(true);
                  }}
                >
                  <ImagePlus aria-hidden="true" />
                  Image
                </EditorMenuItem>
              </div>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function BlogFormattingToolbar({
  editor,
  disabled = false,
  onUploadImage,
  imageRequest,
  onImageRequestHandled,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const returnToText = useRef(false);
  const [url, setUrl] = useState("");
  const toolbar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = toolbar.current;
    if (!root) return;
    function updateEntry() {
      const buttons = Array.from(root!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const visible = buttons.filter((button) => button.getClientRects().length);
      const entry =
        visible.find((button) => button === document.activeElement) ??
        visible.find((button) => button.tabIndex === 0) ??
        visible[0];
      buttons.forEach((button) => {
        button.tabIndex = button === entry ? 0 : -1;
      });
    }
    updateEntry();
    const observer = new ResizeObserver(updateEntry);
    observer.observe(root);
    root.addEventListener("focusin", updateEntry);
    return () => {
      observer.disconnect();
      root.removeEventListener("focusin", updateEntry);
    };
  }, [editor, expanded, disabled]);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      undo: current?.can().undo(),
      redo: current?.can().redo(),
      highlightColor: current?.isActive("highlight")
        ? String(current.getAttributes("highlight").color ?? "#fef08a")
        : null,
      canHighlight: current?.can().setMark("highlight"),
      active: Object.fromEntries(
        [
          "bold",
          "italic",
          "underline",
          "strike",
          "highlight",
          "superscript",
          "subscript",
          "code",
          "codeBlock",
          "blockquote",
        ].map((name) => [name, current?.isActive(name)]),
      ),
      align: String(
        current?.getAttributes("paragraph").textAlign ?? current?.getAttributes("heading").textAlign ?? "left",
      ),
    }),
  });
  const unavailable = disabled || !editor;
  function control(
    label: string,
    icon: ReactNode,
    run: () => void,
    active?: boolean,
    blocked = false,
    shortcut?: string,
  ) {
    return (
      <Tooltip key={label}>
        <TooltipTrigger asChild>
          <Button
            className={styles.formatButton}
            size="icon-xs"
            variant="ghost"
            aria-label={label}
            aria-pressed={active}
            aria-disabled={unavailable || blocked}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (!unavailable && !blocked) run();
            }}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {label}
          {shortcut ? ` (${shortcut})` : ""}
          {blocked ? " — no history available" : ""}
        </TooltipContent>
      </Tooltip>
    );
  }
  function menu(label: string, icon: ReactNode, options: [string, () => void, ReactNode?][]) {
    return (
      <Popover.Root>
        <Tooltip>
          <TooltipTrigger asChild>
            <Popover.Trigger asChild>
              <Button size="xs" variant="ghost" className={styles.formatMenu} disabled={unavailable} aria-label={label}>
                {icon}
                <ChevronDown aria-hidden="true" className="size-3" />
              </Button>
            </Popover.Trigger>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
        <Popover.Portal>
          <Popover.Content sideOffset={8} collisionPadding={16} className={menuClass}>
            <div className="flex flex-col">
              {options.map(([name, run, itemIcon]) => (
                <Popover.Close key={name} asChild>
                  <EditorMenuItem onClick={run}>
                    {itemIcon}
                    {name}
                  </EditorMenuItem>
                </Popover.Close>
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }
  return (
    <div
      ref={toolbar}
      className={styles.formatting}
      data-expanded={expanded}
      role="toolbar"
      aria-label="Article formatting"
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const buttons = Array.from(
          toolbar.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
        ).filter((button) => button.getClientRects().length);
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
        buttons.forEach((button, i) => {
          button.tabIndex = i === next ? 0 : -1;
        });
        buttons[next]?.focus();
      }}
    >
      <div className={styles.formatGroup} data-extra="true">
        {control("Undo", <Undo2 />, () => editor?.chain().focus().undo().run(), undefined, !state?.undo, "Ctrl/Cmd+Z")}
        {control(
          "Redo",
          <Redo2 />,
          () => editor?.chain().focus().redo().run(),
          undefined,
          !state?.redo,
          "Ctrl/Cmd+Shift+Z",
        )}
      </div>
      <span className={styles.separator} data-extra="true" />
      <div className={styles.formatGroup}>
        {menu("Text style", <Heading />, [
          ["Paragraph", () => editor?.chain().focus().setParagraph().run(), <Pilcrow aria-hidden="true" />],
          ...(
            [
              [2, Heading2],
              [3, Heading3],
              [4, Heading4],
              [5, Heading5],
              [6, Heading6],
            ] as const
          ).map(([level, Icon]): [string, () => void, ReactNode] => [
            `Heading ${level}`,
            () => editor?.chain().focus().setHeading({ level }).run(),
            <Icon aria-hidden="true" />,
          ]),
        ])}
        <div data-extra="true">
          {menu("List options", <List />, [
            ["Bullet list", () => editor?.chain().focus().toggleBulletList().run()],
            ["Numbered list", () => editor?.chain().focus().toggleOrderedList().run()],
            ["Checklist", () => editor?.chain().focus().toggleList("taskList", "taskItem").run()],
          ])}
        </div>
        <div data-extra="true" className={styles.formatGroup}>
          {control(
            "Quote",
            <Quote />,
            () => editor?.chain().focus().toggleBlockquote().run(),
            state?.active.blockquote,
          )}
          {control(
            "Code block",
            <SquareCode />,
            () => editor?.chain().focus().toggleCodeBlock().run(),
            state?.active.codeBlock,
          )}
        </div>
      </div>
      <span className={styles.separator} data-extra="true" />
      <div className={styles.formatGroup}>
        {control(
          "Bold",
          <Bold />,
          () => editor?.chain().focus().toggleBold().run(),
          state?.active.bold,
          false,
          "Ctrl/Cmd+B",
        )}
        {control(
          "Italic",
          <Italic />,
          () => editor?.chain().focus().toggleItalic().run(),
          state?.active.italic,
          false,
          "Ctrl/Cmd+I",
        )}
        <div data-extra="true" className={styles.formatGroup}>
          {control(
            "Strikethrough",
            <Strikethrough />,
            () => editor?.chain().focus().toggleStrike().run(),
            state?.active.strike,
          )}
          {control("Inline code", <CodeXml />, () => editor?.chain().focus().toggleCode().run(), state?.active.code)}
          {control(
            "Underline",
            <Underline />,
            () => editor?.chain().focus().toggleUnderline().run(),
            state?.active.underline,
            false,
            "Ctrl/Cmd+U",
          )}
          <Popover.Root open={highlightOpen && !unavailable} onOpenChange={setHighlightOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Popover.Trigger asChild>
                  <Button
                    aria-label="Highlight text"
                    aria-pressed={state?.active.highlight}
                    disabled={unavailable || !state?.canHighlight}
                    className={styles.formatButton}
                    size="icon-xs"
                    variant="ghost"
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <Highlighter />
                  </Button>
                </Popover.Trigger>
              </TooltipTrigger>
              <TooltipContent>Highlight color</TooltipContent>
            </Tooltip>
            <Popover.Portal>
              <Popover.Content
                aria-label="Highlight color"
                sideOffset={8}
                collisionPadding={12}
                className="z-[70] w-max max-w-[var(--radix-popover-content-available-width)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-2 text-foreground shadow-lg"
                onCloseAutoFocus={(event) => {
                  if (returnToText.current) {
                    event.preventDefault();
                    if (editor && !editor.isDestroyed) editor.view.focus();
                    returnToText.current = false;
                  }
                }}
              >
                <BlogColorPalette
                  colors={HIGHLIGHT_COLORS}
                  label="Highlight"
                  separateClear
                  value={state?.highlightColor ?? null}
                  disabled={unavailable}
                  onChange={(color) => {
                    if (!editor || editor.isDestroyed || !editor.isEditable || unavailable) return;
                    const chain = editor.chain().focus();
                    const applied = color
                      ? chain.setMark("highlight", { color }).run()
                      : chain.unsetMark("highlight").run();
                    if (applied) {
                      returnToText.current = true;
                      setHighlightOpen(false);
                    }
                  }}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        <Popover.Root
          open={linkOpen}
          onOpenChange={(open) => {
            setLinkOpen(open);
            if (open) setUrl(String(editor?.getAttributes("link").href ?? ""));
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Popover.Trigger asChild>
                <Button
                  aria-label="Insert or edit link"
                  disabled={unavailable}
                  className={styles.formatButton}
                  size="icon-xs"
                  variant="ghost"
                >
                  <Link2 />
                </Button>
              </Popover.Trigger>
            </TooltipTrigger>
            <TooltipContent>Link</TooltipContent>
          </Tooltip>
          <Popover.Portal>
            <Popover.Content sideOffset={8} collisionPadding={16} className={`${menuClass} w-80 space-y-3 p-4`}>
              <Label className="text-[13px]" htmlFor="blog-inline-link">
                Link URL
              </Label>
              <Input
                size="sm"
                id="blog-inline-link"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com"
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
                    setLinkOpen(false);
                  }}
                >
                  Remove
                </Button>
                <Button
                  size="xs"
                  disabled={!/^https?:\/\/\S+$/i.test(url)}
                  onClick={() => {
                    editor
                      ?.chain()
                      .focus()
                      .extendMarkRange("link")
                      .setLink({
                        href: url,
                        target: "_blank",
                        rel: "noopener noreferrer",
                      })
                      .run();
                    setLinkOpen(false);
                  }}
                >
                  Apply
                </Button>
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <span className={styles.separator} data-extra="true" />
      <div className={styles.formatGroup} data-extra="true">
        {control(
          "Superscript",
          <Superscript />,
          () => editor?.chain().focus().toggleMark("superscript").run(),
          state?.active.superscript,
        )}
        {control(
          "Subscript",
          <Subscript />,
          () => editor?.chain().focus().toggleMark("subscript").run(),
          state?.active.subscript,
        )}
      </div>
      <span className={styles.separator} data-extra="true" />
      <div className={styles.formatGroup} data-extra="true">
        {(
          [
            ["left", AlignLeft],
            ["center", AlignCenter],
            ["right", AlignRight],
            ["justify", AlignJustify],
          ] as const
        ).map(([align, Icon]) =>
          control(
            align === "justify" ? "Justify" : `Align ${align}`,
            <Icon />,
            () => {
              editor
                ?.chain()
                .focus()
                .updateAttributes("heading", { textAlign: align })
                .updateAttributes("paragraph", { textAlign: align })
                .run();
            },
            state?.align === align,
          ),
        )}
      </div>
      <span className={styles.separator} data-extra="true" />
      <Button
        className={styles.moreFormatting}
        variant="ghost"
        size="icon-sm"
        aria-label="More formatting"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <MoreHorizontal />
      </Button>
      <BlogBlockMenu
        editor={editor}
        disabled={disabled}
        onUploadImage={onUploadImage}
        imageRequest={imageRequest}
        onImageRequestHandled={onImageRequestHandled}
      />
    </div>
  );
}
