"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/core";
import { AssistantLinkForm } from "@/components/assistant/AssistantLinkForm";
import { safeLink } from "@/lib/content/links";
import { applyBlogLink, removeBlogLink } from "../lib/linkEditing";

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
    <AssistantLinkForm
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
