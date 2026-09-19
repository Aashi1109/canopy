import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { safeLink } from "../../../../../lib/blog/links.ts";

export function applyBlogLink(editor: Editor, href: string, text?: string): boolean {
  if (editor.isDestroyed || !editor.isEditable || !(editor.state.selection instanceof TextSelection)) return false;
  let url: string;
  try {
    url = safeLink(href.trim());
  } catch {
    return false;
  }
  const attrs = { href: url, target: "_blank", rel: "noopener noreferrer" };
  if (!editor.can().setLink(attrs)) return false;
  if (editor.state.selection.empty && !editor.isActive("link")) {
    return editor
      .chain()
      .insertContent({
        type: "text",
        text: text?.trim() || url,
        marks: [{ type: "link", attrs }],
      })
      .command(({ tr }) => {
        tr.removeStoredMark(editor.schema.marks.link);
        return true;
      })
      .run();
  }
  return editor.chain().extendMarkRange("link").setLink(attrs).run();
}

export function removeBlogLink(editor: Editor): boolean {
  if (editor.isDestroyed || !editor.isEditable || !(editor.state.selection instanceof TextSelection)) return false;
  return editor.chain().extendMarkRange("link").unsetLink().run();
}
