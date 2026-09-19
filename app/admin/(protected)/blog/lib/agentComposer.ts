import type { BlogComposerSelection } from "@/lib/blog/assistantTypes";

/** A slash command starts an empty token, never a URL or a filesystem path. */
export function agentSlashQuery(text: string, caret: number) {
  const before = text.slice(0, caret);
  const match = /(?:^|\s)\/([a-z-]*)$/i.exec(before);
  if (!match) return null;
  return { start: caret - match[1].length - 1, end: caret, query: match[1].toLowerCase() };
}

export function removeAgentSlash(text: string, token: { start: number; end: number }) {
  return { text: text.slice(0, token.start) + text.slice(token.end), caret: token.start };
}

export type ComposerSelection = BlogComposerSelection;
export function sameComposerSelection(a: ComposerSelection, b: ComposerSelection) {
  return (
    a.agentId === b.agentId &&
    (a.agentOffset ?? 0) === (b.agentOffset ?? 0) &&
    JSON.stringify(a.content) === JSON.stringify(b.content) &&
    a.attachmentIds.length === b.attachmentIds.length &&
    a.attachmentIds.every((id, index) => id === b.attachmentIds[index])
  );
}
