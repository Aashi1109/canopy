import { autocompletion, closeBracketsKeymap } from "@codemirror/autocomplete";
import { EditorState, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { lintKeymap } from "@codemirror/lint";

const COMPLETION_OPTIONS = { activateOnTypingDelay: 150, maxRenderedOptions: 20 };
const loadedCompletions = new Map<string, Promise<{ automatic: Extension; manual: Extension }>>();

/** Imported only after page load and idle, when an editable editor is focused. */
export function loadCodeEditorCompletions(language: string) {
  const key = language === "mermaid" ? "mermaid" : "native";
  let loading = loadedCompletions.get(key);
  if (!loading) {
    loading = (async () => {
      const support: Extension[] = [keymap.of([...closeBracketsKeymap, ...lintKeymap])];
      if (key === "mermaid") {
        const { mermaidCompletionSource } = await import("./mermaidCompletions");
        support.push(EditorState.languageData.of(() => [{ autocomplete: mermaidCompletionSource }]));
      }
      return {
        automatic: [...support, autocompletion(COMPLETION_OPTIONS)],
        manual: [...support, autocompletion({ ...COMPLETION_OPTIONS, activateOnTyping: false })],
      };
    })().catch((error: unknown) => {
      loadedCompletions.delete(key);
      throw error;
    });
    loadedCompletions.set(key, loading);
  }
  return loading;
}
