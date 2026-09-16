import { NodeSelection, TextSelection, type Command } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";

/** Move only complete top-level blocks; never split a list, image, or table. */
export function moveBlogBlock(from: number, to: number): Command {
  return (state, dispatch) => {
    const { doc, selection } = state;
    if (![from, to].every((value) => Number.isInteger(value) && value >= 0 && value <= doc.content.size)) return false;
    if (doc.resolve(from).depth || doc.resolve(to).depth) return false;
    const node = doc.nodeAt(from);
    if (!node || to === from || to === from + node.nodeSize) return false;
    if (dispatch) {
      const destination = to > from ? to - node.nodeSize : to;
      const tr = state.tr.delete(from, from + node.nodeSize).insert(destination, node);
      if (selection.from >= from && selection.to <= from + node.nodeSize) {
        if (selection instanceof TextSelection) {
          tr.setSelection(
            TextSelection.create(tr.doc, destination + selection.anchor - from, destination + selection.head - from),
          );
        } else tr.setSelection(NodeSelection.create(tr.doc, destination));
      }
      dispatch(closeHistory(tr).scrollIntoView());
    }
    return true;
  };
}
