import type { Editor, EditorEvents, JSONContent } from "@tiptap/core";
import { createTable } from "@tiptap/extension-table";

export function createBlogTable(editor: Editor, columns: number, rows: number): JSONContent {
  if (![columns, rows].every((value) => Number.isInteger(value) && value >= 1 && value <= 20))
    throw new RangeError("Table columns and rows must each be between 1 and 20.");
  return createTable(editor.schema, rows, columns, true).toJSON();
}

/** Keep an upload attached to its starting cursor while the article remains editable. */
export function captureBlogInsertion(editor: Editor, atEnd = false, blockPosition?: number) {
  let bookmark = editor.state.selection.getBookmark();
  const originalImage = editor.state.doc.nodeAt(editor.state.selection.from);
  let disposed = false;
  let blockDeleted = false;
  function map({ transaction, appendedTransactions }: EditorEvents["transaction"]) {
    for (const change of [transaction, ...(appendedTransactions ?? [])]) {
      bookmark = bookmark.map(change.mapping);
      if (blockPosition !== undefined) {
        const mapped = change.mapping.mapResult(blockPosition, 1);
        blockDeleted ||= mapped.deleted;
        blockPosition = mapped.pos;
      }
    }
  }
  function dispose() {
    disposed = true;
    editor.off("transaction", map);
    editor.off("destroy", dispose);
  }
  editor.on("transaction", map);
  editor.on("destroy", dispose);
  return {
    insert(content: JSONContent | JSONContent[]) {
      if (disposed || editor.isDestroyed || !editor.isEditable) {
        dispose();
        return false;
      }
      let position: number | { from: number; to: number } = atEnd
        ? editor.state.doc.content.size
        : bookmark.resolve(editor.state.doc);
      if (blockPosition !== undefined) {
        const block = editor.state.doc.nodeAt(blockPosition);
        if (blockDeleted || !block || editor.state.doc.resolve(blockPosition).depth !== 0) {
          dispose();
          return false;
        }
        position =
          block.type.name === "paragraph" && block.content.size === 0
            ? { from: blockPosition, to: blockPosition + block.nodeSize }
            : blockPosition + block.nodeSize;
      }
      dispose();
      return editor.commands.insertContentAt(
        typeof position === "number" ? position : { from: position.from, to: position.to },
        content,
        { errorOnInvalidContent: true },
      );
    },
    updateImage(attributes: { alt: string; caption: string }) {
      if (disposed || editor.isDestroyed || !editor.isEditable || originalImage?.type.name !== "image") {
        dispose();
        return false;
      }
      const selection = bookmark.resolve(editor.state.doc);
      const image = editor.state.doc.nodeAt(selection.from);
      dispose();
      if (selection.empty || image !== originalImage) return false;
      return editor.commands.command(({ tr }) => {
        tr.setNodeMarkup(selection.from, undefined, { ...image.attrs, ...attributes });
        return true;
      });
    },
    dispose,
  };
}
