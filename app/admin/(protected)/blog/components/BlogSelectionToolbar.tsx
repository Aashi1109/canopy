"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { posToDOMRect, type Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
  ArrowUp,
  ListPlus,
  List,
  ListOrdered,
  Quote,
  Minimize2,
  SlidersHorizontal,
  Smile,
  SpellCheck,
  TextCursorInput,
  CircleHelp,
  Bold,
  ChevronDown,
  CodeXml,
  Italic,
  Link2,
  MoreHorizontal,
  Sparkles,
  Strikethrough,
  Underline,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  Input,
  Popover,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/index.tsx";
import { captureAssistantSelection } from "../lib/assistantSelection";
import { BlogInlineAssistant, highlightInlineSelection } from "./BlogInlineAssistant";
import { BlogEditorLinkForm } from "./BlogLinkForm";
import { BlogHeadingMenuItems } from "./BlogHeadingMenuItems";
import { BlogColorPalette, BLOG_HIGHLIGHT_COLORS } from "./BlogColorPalette";
import styles from "./BlogSelectionToolbar.module.css";

type Props = {
  editor: Editor | null;
  disabled?: boolean;
  postId: string;
};

function selectedText(editor: Editor) {
  const { selection, doc } = editor.state;
  if (!(selection instanceof TextSelection) || selection.empty) return "";
  let protectedContent = false;
  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (node.isAtom && !node.isText && node.type.name !== "hardBreak") protectedContent = true;
  });
  const cellAt = (position: typeof selection.$from) => {
    for (let depth = position.depth; depth > 0; depth--) {
      if (["tableCell", "tableHeader"].includes(position.node(depth).type.name)) return position.before(depth);
    }
    return null;
  };
  if (protectedContent || cellAt(selection.$from) !== cellAt(selection.$to)) return "";
  return doc.textBetween(selection.from, selection.to, "\n").trim();
}

export function BlogSelectionToolbar({ editor, disabled = false, postId }: Props) {
  const toolbar = useRef<HTMLDivElement>(null);
  const dismissed = useRef(false);
  const [open, setOpen] = useState<string | null>(null);
  const [inline, setInline] = useState<{
    target: ReturnType<typeof captureAssistantSelection>;
    instruction: string;
  } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aiMenu, setAiMenu] = useState<"actions" | "prompt">("actions");
  const [dismissRequest, setDismissRequest] = useState(0);
  const inlineRef = useRef(inline);
  inlineRef.current = inline;
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      linkAtCursor: !!current && current.state.selection.empty && current.isActive("link"),
      cursor: current?.state.selection.from,
      bold: current?.isActive("bold"),
      italic: current?.isActive("italic"),
      underline: current?.isActive("underline"),
      heading: current?.isActive("heading") ? Number(current.getAttributes("heading").level) : null,
      highlight: current?.isActive("highlight")
        ? String(current.getAttributes("highlight").color ?? BLOG_HIGHLIGHT_COLORS[4][1])
        : null,
    }),
  });
  const options = useMemo(
    () => ({
      strategy: "fixed" as const,
      placement: "top" as const,
      offset: 8,
      flip: { padding: 12 },
      shift: { padding: 12 },
      scrollTarget: editor?.view.dom.closest<HTMLElement>("[data-blog-editor-scroll]") ?? undefined,
    }),
    [editor],
  );
  const shouldShow = useCallback(
    ({ editor: current, element }: { editor: Editor; element: HTMLElement }) =>
      !disabled &&
      !dismissed.current &&
      current.isEditable &&
      (!!inline ||
        ((!!selectedText(current) || (current.state.selection.empty && current.isActive("link"))) &&
          (current.view.hasFocus() ||
            element.contains(document.activeElement) ||
            !!document.activeElement?.closest("[data-blog-improve-menu]")))),
    [disabled, inline],
  );

  useEffect(() => {
    if (!editor) return;
    const editorElement = editor.view.dom;
    const reset = () => {
      if (inlineRef.current) {
        const range = inlineRef.current.target.range;
        if (
          !range ||
          (editor.view.hasFocus() &&
            (editor.state.selection.from !== range.from || editor.state.selection.to !== range.to))
        )
          setDismissRequest((value) => value + 1);
        return;
      }
      dismissed.current = false;
      setOpen(null);
      setAiMenu("actions");
    };
    const enterToolbar = (event: KeyboardEvent) => {
      if (
        event.altKey &&
        event.key === "F10" &&
        !disabled &&
        editor.isEditable &&
        (selectedText(editor) || editor.isActive("link"))
      ) {
        event.preventDefault();
        dismissed.current = false;
        editor.view.dispatch(editor.state.tr.setMeta("blogSelection", "show"));
        toolbar.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    const dismissOutside = (event: Event) => {
      if (
        !(event.target instanceof Node) ||
        (event.target instanceof Element && !!event.target.closest("[data-blog-improve-menu]")) ||
        editorElement.contains(event.target) ||
        toolbar.current?.contains(event.target)
      )
        return;
      if (inlineRef.current) {
        setDismissRequest((value) => value + 1);
        return;
      }

      setOpen(null);
      editor.view.dispatch(editor.state.tr.setMeta("blogSelection", "hide"));
    };
    editor.on("selectionUpdate", reset);
    editorElement.addEventListener("keydown", enterToolbar);
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    return () => {
      inlineRef.current?.target.dispose();
      editor.off("selectionUpdate", reset);
      editorElement.removeEventListener("keydown", enterToolbar);
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
    };
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor || disabled || inline || aiMenu !== "prompt") return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const clear = highlightInlineSelection(editor, from, to, styles.aiSelection);
    const frame = requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      editor.view.dispatch(
        editor.state.tr.setMeta("blogSelection", {
          type: "updateOptions",
          options: { options: { ...options, placement: "bottom" } },
        }),
      );
      editor.view.dispatch(editor.state.tr.setMeta("blogSelection", "show"));
      editor.view.dispatch(editor.state.tr.setMeta("blogSelection", "updatePosition"));
      toolbar.current?.querySelector<HTMLInputElement>("input")?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      clear();
    };
  }, [editor, disabled, inline, aiMenu, options]);

  if (!editor || disabled) return null;
  const currentEditor = editor;
  function improve(instruction: string) {
    if (!selectedText(currentEditor)) return;
    setInline({ target: captureAssistantSelection(currentEditor), instruction });
    setOpen("improve");
  }
  function closeInline(restore: boolean) {
    const target = inlineRef.current?.target;
    const range = target?.range;
    target?.dispose();
    inlineRef.current = null;
    setInline(null);
    setOpen(null);
    setAiMenu("actions");
    dismissed.current = true;
    if (restore && range) currentEditor.commands.setTextSelection(range);
    if (restore) currentEditor.view.focus();
    currentEditor.view.dispatch(currentEditor.state.tr.setMeta("blogSelection", "hide"));
  }
  function run(action: () => void) {
    if (currentEditor.isDestroyed || !currentEditor.isEditable || !selectedText(currentEditor)) return;
    setOpen(null);
    action();
  }
  function control(label: string, icon: ReactNode, action: () => void, active?: boolean) {
    return (
      <Tooltip key={label}>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={label}
            aria-pressed={active}
            disabled={!!inline}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(action)}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }
  function menu(id: string, label: string, trigger: ReactNode, content: ReactNode, className?: string) {
    return (
      <Popover.Root
        open={open === id}
        onOpenChange={(value) => {
          setOpen(value ? id : null);
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Popover.Trigger asChild>
              <Button
                size={id === "link" || id === "more" ? "icon-sm" : "sm"}
                variant="ghost"
                aria-label={label}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
              >
                {trigger}
              </Button>
            </Popover.Trigger>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={12}
          aria-label={label}
          className={`${styles.menu} ${className ?? ""}`}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.stopPropagation();
            if (inlineRef.current) {
              event.preventDefault();
              setDismissRequest((value) => value + 1);
            } else
              requestAnimationFrame(() =>
                toolbar.current?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.focus(),
              );
          }}
        >
          {content}
        </Popover.Content>
      </Popover.Root>
    );
  }
  const item = (label: string, action: () => void, icon?: ReactNode) => (
    <Button key={label} size="sm" variant="ghost" onClick={() => run(action)}>
      {icon}
      {label}
    </Button>
  );

  return (
    <TooltipProvider>
      <BubbleMenu
        editor={editor}
        ref={toolbar}
        pluginKey="blogSelection"
        updateDelay={100}
        appendTo={() => document.body}
        options={inline || aiMenu === "prompt" ? { ...options, placement: "bottom" } : options}
        getReferencedVirtualElement={() => {
          const range = inlineRef.current?.target.range ?? (aiMenu === "prompt" ? currentEditor.state.selection : null);
          return range ? { getBoundingClientRect: () => posToDOMRect(currentEditor.view, range.from, range.to) } : null;
        }}
        shouldShow={shouldShow}
        className={
          inline
            ? `${styles.toolbar} ${styles.inlineBubble}`
            : aiMenu === "prompt"
              ? `${styles.toolbar} ${styles.promptBubble}`
              : styles.toolbar
        }
        role={inline || aiMenu === "prompt" || state?.linkAtCursor ? "dialog" : "toolbar"}
        aria-label={
          inline
            ? "Improve selected text"
            : aiMenu === "prompt"
              ? "Ask AI"
              : state?.linkAtCursor
                ? "Edit link"
                : "Selected text formatting"
        }
        aria-keyshortcuts="Alt+F10"
        onKeyDown={(event) => {
          const key = (event.nativeEvent as KeyboardEvent).key;
          if (aiMenu === "prompt") {
            if (key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setAiMenu("actions");
              currentEditor.view.focus();
            }
            return;
          }
          if (inline) {
            if (key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setDismissRequest((value) => value + 1);
            }
            return;
          }
          if ((event.target as HTMLElement).closest("[data-radix-popper-content-wrapper]")) return;
          if (key === "Escape") {
            event.preventDefault();
            dismissed.current = true;
            currentEditor.view.focus();
            currentEditor.view.dispatch(currentEditor.state.tr.setMeta("blogSelection", "hide"));
            return;
          }
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
          const buttons = Array.from(toolbar.current?.querySelectorAll<HTMLButtonElement>(":scope > button") ?? []);
          const index = buttons.indexOf(event.target as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          const next =
            key === "Home"
              ? 0
              : key === "End"
                ? buttons.length - 1
                : (index + (key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
          buttons.forEach((button, i) => {
            button.tabIndex = i === next ? 0 : -1;
          });
          buttons[next]?.focus();
        }}
      >
        {inline ? (
          <BlogInlineAssistant
            editor={currentEditor}
            postId={postId}
            instruction={inline.instruction}
            target={inline.target}
            dismissRequest={dismissRequest}
            onClose={closeInline}
          />
        ) : aiMenu === "prompt" ? (
          <form
            className={styles.prompt}
            onSubmit={(event) => {
              event.preventDefault();
              if (prompt.trim()) improve(prompt.trim());
            }}
          >
            <Input
              autoFocus
              aria-label="AI instruction"
              placeholder="Ask AI to edit your selection…"
              value={prompt}
              maxLength={8000}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <Button size="icon-sm" aria-label="Send instruction" type="submit" disabled={!prompt.trim()}>
              <ArrowUp aria-hidden="true" />
            </Button>
          </form>
        ) : state?.linkAtCursor ? (
          <div className={styles.link}>
            <BlogEditorLinkForm
              key={state.cursor}
              editor={currentEditor}
              onClose={() => {
                dismissed.current = true;
                currentEditor.view.dispatch(currentEditor.state.tr.setMeta("blogSelection", "hide"));
              }}
            />
          </div>
        ) : (
          <>
            <DropdownMenu
              modal={false}
              open={open === "improve"}
              onOpenChange={(value) => setOpen(value ? "improve" : null)}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className={open === "improve" ? styles.improve : undefined}
                  aria-label="Improve selected text"
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <Sparkles aria-hidden="true" />
                  Improve
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                data-blog-improve-menu
                align="start"
                side="bottom"
                sideOffset={8}
                collisionPadding={12}
                className={`${styles.menu} ${styles.improveMenu}`}
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <SlidersHorizontal aria-hidden="true" />
                    Adjust tone
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    data-blog-improve-menu
                    aria-label="Adjust tone"
                    sideOffset={4}
                    collisionPadding={12}
                    className={`${styles.menu} ${styles.toneMenu}`}
                  >
                    {["Professional", "Friendly", "Confident", "Casual"].map((tone) => (
                      <DropdownMenuItem key={tone} onSelect={() => improve(`Change the tone to ${tone.toLowerCase()}`)}>
                        {tone}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {(
                  [
                    ["Fix spelling & grammar", SpellCheck],
                    ["Extend text", ListPlus],
                    ["Reduce text", Minimize2],
                    ["Simplify text", CircleHelp],
                    ["Emojify", Smile],
                  ] as const
                ).map(([label, Icon]) => (
                  <DropdownMenuItem key={label} onSelect={() => improve(label)}>
                    <Icon aria-hidden="true" />
                    {label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className={`${styles.menuDivider} m-0`} />
                <DropdownMenuItem onSelect={() => setAiMenu("prompt")}>
                  <Sparkles aria-hidden="true" />
                  Ask AI…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => improve("Complete sentence")}>
                  <TextCursorInput aria-hidden="true" />
                  Complete sentence
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className={styles.separator} aria-hidden="true" />
            {menu(
              "style",
              "Text style",
              <>
                <ChevronDown aria-hidden="true" />
                {state?.heading ? `H${state.heading}` : "Text"}
              </>,
              <BlogHeadingMenuItems editor={currentEditor} />,
              styles.headingMenu,
            )}
            {control(
              "Bold",
              <Bold aria-hidden="true" />,
              () => currentEditor.chain().focus().toggleBold().run(),
              state?.bold,
            )}
            {control(
              "Italic",
              <Italic aria-hidden="true" />,
              () => currentEditor.chain().focus().toggleItalic().run(),
              state?.italic,
            )}
            {control(
              "Underline",
              <Underline aria-hidden="true" />,
              () => currentEditor.chain().focus().toggleUnderline().run(),
              state?.underline,
            )}
            {menu(
              "link",
              "Insert or edit link",
              <Link2 aria-hidden="true" />,
              <BlogEditorLinkForm editor={currentEditor} onClose={() => setOpen(null)} />,
              styles.link,
            )}
            {menu(
              "more",
              "More formatting",
              <MoreHorizontal aria-hidden="true" />,
              <>
                {item(
                  "Strikethrough",
                  () => currentEditor.chain().focus().toggleStrike().run(),
                  <Strikethrough aria-hidden="true" />,
                )}
                {item(
                  "Inline code",
                  () => currentEditor.chain().focus().toggleCode().run(),
                  <CodeXml aria-hidden="true" />,
                )}
                {item(
                  "Bullet list",
                  () => currentEditor.chain().focus().toggleBulletList().run(),
                  <List aria-hidden="true" />,
                )}
                {item(
                  "Numbered list",
                  () => currentEditor.chain().focus().toggleOrderedList().run(),
                  <ListOrdered aria-hidden="true" />,
                )}
                {item(
                  "Quote",
                  () => currentEditor.chain().focus().toggleBlockquote().run(),
                  <Quote aria-hidden="true" />,
                )}
                <span className="px-3 py-2 text-xs font-semibold">Highlight color</span>
                <div className="px-3 pb-2">
                  <BlogColorPalette
                    label="Highlight"
                    value={state?.highlight}
                    colors={BLOG_HIGHLIGHT_COLORS}
                    onChange={(color) =>
                      run(() =>
                        color
                          ? currentEditor.chain().focus().setMark("highlight", { color }).run()
                          : currentEditor.chain().focus().unsetMark("highlight").run(),
                      )
                    }
                  />
                </div>
              </>,
            )}
          </>
        )}
      </BubbleMenu>
    </TooltipProvider>
  );
}
