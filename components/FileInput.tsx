export { textInputFileIssue, validateFileSelection } from "@/lib/tool-framework/fileSelection";
import { validateFileSelection } from "@/lib/tool-framework/fileSelection";

const FILE_IDS = new WeakMap<File, string>();

export function workspaceFileId(file: File): string {
  const existing = FILE_IDS.get(file);
  if (existing) return existing;
  const id = crypto.randomUUID();
  FILE_IDS.set(file, id);
  return id;
}
