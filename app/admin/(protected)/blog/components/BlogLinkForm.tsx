"use client";

import { useId, useState, type Ref } from "react";
import { Check, Plus, Unlink, X } from "lucide-react";
import type { Editor } from "@tiptap/core";
import { Button, Input, Label, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/index.tsx";
import { safeLink } from "@/lib/blog/links";
import { applyBlogLink, removeBlogLink } from "../lib/linkEditing";

type LinkFormProps = {
  title: string;
  url: string;
  error: string;
  help: string;
  onUrlChange: (url: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  inputRef?: Ref<HTMLInputElement>;
  submitLabel?: string;
  text?: string;
  onTextChange?: (text: string) => void;
  onRemove?: () => void;
};

// The assistant's reference-link form, shared with the article editor.
export function BlogLinkForm({
  title,
  url,
  error,
  help,
  onUrlChange,
  onSubmit,
  onCancel,
  inputRef,
  submitLabel = "Add link",
  text,
  onTextChange,
  onRemove,
}: LinkFormProps) {
  const id = useId();
  return (
    <div
      className="flex w-full flex-col gap-3"
      onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) event.stopPropagation();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-normal">{title}</h3>
        {onRemove && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="input-icon"
                className="text-destructive hover:text-destructive"
                aria-label="Remove link"
                onClick={onRemove}
              >
                <Unlink aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove link</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-url`}>URL</Label>
        <Input
          ref={inputRef}
          id={`${id}-url`}
          value={url}
          placeholder="https://example.com/article"
          aria-invalid={!!error}
          aria-describedby={`${id}-help`}
          onChange={(event) => onUrlChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <p
          id={`${id}-help`}
          role={error ? "alert" : undefined}
          className={`text-caption ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {error || help}
        </p>
      </div>
      {onTextChange && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-text`}>Link text</Label>
          <Input
            id={`${id}-text`}
            value={text ?? ""}
            placeholder="Use the URL as text"
            onChange={(event) => onTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="flex-1" onClick={onCancel}>
          <X aria-hidden="true" /> Cancel
        </Button>
        <Button type="button" size="sm" className="flex-1" onClick={onSubmit}>
          {onRemove ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

// Editor commands and selection state stay separate from the shared form UI.
export function BlogEditorLinkForm({
  editor,
  onClose,
  onInsert,
}: {
  editor: Editor;
  onClose: () => void;
  onInsert?: (href: string, text: string) => boolean;
}) {
  const [url, setUrl] = useState(() => (onInsert ? "" : String(editor.getAttributes("link").href ?? "")));
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const existing = !onInsert && editor.isActive("link");
  const inserting = !!onInsert || (editor.state.selection.empty && !existing);
  function finish() {
    onClose();
    editor.commands.focus();
  }
  return (
    <BlogLinkForm
      title={existing ? "Edit link" : "Add a link"}
      url={url}
      error={error}
      help="Use a web address, email link, /path, or #anchor."
      onUrlChange={(value) => {
        setUrl(value);
        setError("");
      }}
      text={text}
      onTextChange={inserting ? setText : undefined}
      submitLabel={existing ? "Save link" : "Add link"}
      onCancel={finish}
      onRemove={
        existing
          ? () => {
              if (removeBlogLink(editor)) finish();
            }
          : undefined
      }
      onSubmit={() => {
        let href: string;
        try {
          href = safeLink(url.trim());
        } catch {
          setError("Enter a valid web address, email link, /path, or #anchor.");
          return;
        }
        if (onInsert ? onInsert(href, text.trim() || href) : applyBlogLink(editor, href, text)) finish();
        else setError("Links cannot be added to this selection. Select ordinary text and try again.");
      }}
    />
  );
}
