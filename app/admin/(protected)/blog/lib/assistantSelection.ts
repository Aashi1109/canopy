import type { Editor, EditorEvents, JSONContent } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";

/** JSON storage can reorder keys and omit default attributes without changing the article. */
export function assistantBodyMatches(editor: Editor, body: JSONContent | undefined) {
  if (!body) return false;
  try {
    return editor.state.doc.eq(editor.schema.nodeFromJSON(body));
  } catch {
    return false;
  }
}

/** Locate an unambiguous quoted passage in a known unchanged document. */
export function findAssistantPassage(editor: Editor, quote: string) {
  let text = "";
  const positions: number[] = [];
  editor.state.doc.descendants((node, position) => {
    if (!node.isTextblock) return;
    if (text) {
      text += "\n";
      positions.push(position);
    }
    node.descendants((child, offset) => {
      if (!child.isText || !child.text) return;
      for (let index = 0; index < child.text.length; index += 1) {
        text += child.text[index];
        positions.push(position + 1 + offset + index);
      }
    });
    return false;
  });
  const start = text.indexOf(quote);
  if (!quote || start < 0 || text.indexOf(quote, start + 1) >= 0) return null;
  const from = positions[start];
  const to = positions[start + quote.length - 1] + 1;
  return editor.state.doc.textBetween(from, to, "\n") === quote ? { from, to } : null;
}

export function canCaptureAssistantInsertion(editor: Editor) {
  return editor.state.doc.content.content.every(
    (node) =>
      node.type.name === "paragraph" && node.content.content.every((child) => child.isText && !child.text?.trim()),
  );
}

/** Empty-document additions are anchored to the whole empty document, not its cursor. */
export function captureAssistantInsertion(editor: Editor) {
  if (!canCaptureAssistantInsertion(editor)) return null;
  return captureAssistantSelection(editor, { from: 0, to: editor.state.doc.content.size });
}

/** A proposal follows its original passage, never the current cursor or a text search. */
export function captureAssistantSelection(
  editor: Editor,
  range: { from: number; to: number } = editor.state.selection,
) {
  let { from, to } = range;
  const original = editor.state.doc.slice(from, to);
  const emptyInsertion = from === 0 && to === editor.state.doc.content.size && canCaptureAssistantInsertion(editor);
  let disposed = false;
  let deleted = false;
  function map({ transaction, appendedTransactions }: EditorEvents["transaction"]) {
    for (const change of [transaction, ...(appendedTransactions ?? [])]) {
      const start = change.mapping.mapResult(from, 1);
      const end = change.mapping.mapResult(to, -1);
      deleted ||= start.deletedAcross || end.deletedAcross;
      from = start.pos;
      to = end.pos;
    }
  }
  function dispose() {
    disposed = true;
    editor.off("transaction", map);
    editor.off("destroy", dispose);
  }
  function valid() {
    return (
      !disposed &&
      !deleted &&
      !editor.isDestroyed &&
      from < to &&
      to <= editor.state.doc.content.size &&
      (!emptyInsertion ||
        (from === 0 && to === editor.state.doc.content.size && canCaptureAssistantInsertion(editor))) &&
      editor.state.doc.slice(from, to).eq(original)
    );
  }
  editor.on("transaction", map);
  editor.on("destroy", dispose);
  return {
    get range() {
      return valid() ? { from, to, text: editor.state.doc.textBetween(from, to, "\n") } : null;
    },
    valid,
    apply(body: JSONContent | undefined, mode: "replace" | "insert" | "delete") {
      if (!valid() || !editor.isEditable || (emptyInsertion && mode !== "insert")) return false;
      try {
        const chain = editor.chain().command(({ tr }) => {
          closeHistory(tr);
          return true;
        });
        if (mode === "delete") {
          let deleteFrom = from;
          let deleteTo = to;
          const $from = editor.state.doc.resolve(from);
          const $to = editor.state.doc.resolve(to);
          // Include fully selected wrappers so deleting a section leaves no empty heading,
          // paragraph, or list item. Partial selections retain their surrounding blocks.
          for (let depth = $from.depth; depth > 0 && deleteFrom === $from.start(depth); depth -= 1) {
            deleteFrom = $from.before(depth);
          }
          for (let depth = $to.depth; depth > 0 && deleteTo === $to.end(depth); depth -= 1) {
            deleteTo = $to.after(depth);
          }
          chain.deleteRange({ from: deleteFrom, to: deleteTo });
        } else {
          if (!body) return false;
          const document = editor.schema.nodeFromJSON(body);
          document.check();
          if (document.type.name !== "doc" || !document.childCount) return false;
          const position = mode === "replace" || emptyInsertion ? { from, to } : editor.state.doc.resolve(to).after(1);
          const inline =
            mode === "replace" &&
            document.childCount === 1 &&
            document.firstChild?.type.name === "paragraph" &&
            editor.state.doc.resolve(from).sameParent(editor.state.doc.resolve(to));
          chain.insertContentAt(position, inline ? (body.content![0].content ?? []) : (body.content ?? []), {
            errorOnInvalidContent: true,
          });
        }
        const applied = chain.run();
        if (applied) {
          editor.commands.command(({ tr }) => {
            closeHistory(tr);
            return true;
          });
          dispose();
        }
        return applied;
      } catch {
        return false;
      }
    },
    dispose,
  };
}
