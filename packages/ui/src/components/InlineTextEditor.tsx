"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Pencil } from "lucide-react";

import { Button } from "#components/button";
import { Input } from "#components/input";
import { Textarea } from "#components/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#components/tooltip";
import { cn } from "#lib/utils";

export interface InlineTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}

export function InlineTextEditor({
  value,
  onChange,
  label,
  multiline = false,
  required = false,
  maxLength,
  disabled = false,
  className,
}: InlineTextEditorProps) {
  const [editing, setEditing] = useState(false);
  const [suppressHover, setSuppressHover] = useState(false);
  const originalValue = useRef(value);
  const editor = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const display = useRef<HTMLSpanElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const pointerDown = useRef(false);
  const pendingBlur = useRef(false);
  const feedbackId = useId();
  const keyboardHint = `Enter to finish${multiline ? " · Shift+Enter for new line" : ""} · Esc to cancel`;
  const error =
    required && !value.trim()
      ? `${label} is required.`
      : maxLength !== undefined && value.length > maxLength
        ? `${label} must be ${maxLength} characters or fewer.`
        : null;

  useLayoutEffect(() => {
    if (!editing) return;
    editor.current?.focus({ preventScroll: true });
    editor.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    let frame = 0;
    const press = () => {
      pointerDown.current = true;
    };
    const release = () => {
      pointerDown.current = false;
      // Let the outside click land before removing the helper changes layout.
      frame = requestAnimationFrame(() => {
        if (pendingBlur.current && document.activeElement !== editor.current) setEditing(false);
        pendingBlur.current = false;
      });
    };
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
    window.addEventListener("blur", release);
    return () => {
      cancelAnimationFrame(frame);
      pointerDown.current = false;
      pendingBlur.current = false;
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("pointercancel", release, true);
      window.removeEventListener("blur", release);
    };
  }, [editing]);

  useLayoutEffect(() => {
    const element = editor.current;
    if (!(element instanceof HTMLTextAreaElement)) return;
    const resize = () => {
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    };
    resize();
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      resize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [editing, value]);

  function beginEditing() {
    if (disabled || editing) return;
    setSuppressHover(false);
    originalValue.current = value;
    setEditing(true);
  }

  function finishEditing(restoreFocus: boolean) {
    if (error) return;
    // A stationary pointer must not highlight the pencil when it remounts.
    if (restoreFocus) setSuppressHover(true);
    setEditing(false);
    if (restoreFocus) requestAnimationFrame(() => display.current?.focus({ preventScroll: true }));
  }

  const editorProps = {
    "aria-label": label,
    "aria-describedby": feedbackId,
    "aria-invalid": Boolean(error),
    className:
      "block field-sizing-content h-auto min-h-0 w-auto min-w-[2ch] max-w-full resize-none overflow-hidden rounded-sm border-0 bg-transparent p-0 shadow-none ring-1 ring-primary/50 focus-visible:ring-2",
    style: { font: "inherit", letterSpacing: "inherit", color: "inherit" },
    disabled,
    required,
    maxLength,
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    onBlur: () => {
      if (error) return;
      if (pointerDown.current) pendingBlur.current = true;
      else finishEditing(false);
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onChange(originalValue.current);
        setEditing(false);
        requestAnimationFrame(() => editButton.current?.focus());
      } else if (event.key === "Enter" && (!multiline || !event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        finishEditing(true);
      }
    },
  };

  return (
    <TooltipProvider>
      <span
        className={cn("group/inline-editor relative block min-w-0 outline-none", editing && "pr-9", className)}
        data-slot="inline-text-editor"
        ref={display}
        tabIndex={-1}
        onPointerMove={() => setSuppressHover(false)}
        onPointerLeave={() => setSuppressHover(false)}
      >
        {editing ? (
          <>
            {multiline ? (
              <Textarea
                {...editorProps}
                ref={(element) => {
                  editor.current = element;
                }}
                rows={1}
              />
            ) : (
              <Input
                {...editorProps}
                ref={(element) => {
                  editor.current = element;
                }}
              />
            )}
            <span
              className={cn(
                "mt-1 block font-sans text-xs font-normal tracking-normal",
                error
                  ? "text-destructive"
                  : "w-fit max-w-full rounded border border-border bg-card px-2 py-1 text-muted-foreground shadow-sm",
              )}
              id={feedbackId}
              role={error ? "alert" : undefined}
            >
              {error ?? keyboardHint}
            </span>
          </>
        ) : (
          <Tooltip open={disabled ? false : undefined}>
            <TooltipTrigger asChild>
              <span className={cn("relative inline-block max-w-full align-top", !disabled && "pr-9")}>
                <span
                  className={cn(
                    "block min-h-[1lh] whitespace-pre-wrap break-words rounded-sm",
                    !disabled && "cursor-text",
                    !disabled && !suppressHover && "hover:bg-muted/60",
                  )}
                  onDoubleClick={beginEditing}
                >
                  {value || <span className="text-muted-foreground">{label}</span>}
                </span>
                {!disabled && (
                  <Button
                    aria-label={`Edit ${label}`}
                    className={cn(
                      "absolute right-0 top-[0.5lh] size-8 -translate-y-1/2 opacity-0 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
                      suppressHover
                        ? "hover:bg-transparent active:bg-transparent"
                        : "group-hover/inline-editor:opacity-100",
                    )}
                    onClick={beginEditing}
                    onFocus={() => setSuppressHover(false)}
                    ref={editButton}
                    size="icon-xs"
                    variant="ghost"
                  >
                    <Pencil aria-hidden="true" className="size-3.5" />
                  </Button>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Double-click text or use the pencil to edit</TooltipContent>
          </Tooltip>
        )}
      </span>
    </TooltipProvider>
  );
}
