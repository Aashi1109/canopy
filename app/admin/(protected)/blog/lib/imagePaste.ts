import type { Editor, JSONContent } from "@tiptap/core";
import { Plugin, PluginKey, type SelectionBookmark } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { BlogImage } from "@/lib/blog/document";
import { captureBlogInsertion } from "./editorInsertion.ts";

/** Upload clipboard files through the same validated path as the image picker. */
export function pasteBlogImages(
  editor: Editor,
  event: ClipboardEvent,
  upload: (file: File) => Promise<BlogImage | null>,
  reportError: (message: string) => void,
): boolean {
  if (editor.isDestroyed || !editor.isEditable || !event.clipboardData) return false;
  const data = event.clipboardData;
  const items = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  // Browsers expose the same files in both collections; prefer items, never concatenate.
  const files = items.length ? items : Array.from(data.files ?? []).filter((file) => file.type.startsWith("image/"));
  if (!files.length) return false;
  event.preventDefault();
  const destination = captureBlogInsertion(editor);
  const key = new PluginKey<SelectionBookmark>(`blogImageUpload-${crypto.randomUUID()}`);
  const urls: string[] = [];
  let active = true;
  function cleanup() {
    if (!active) return;
    active = false;
    editor.off("destroy", cancel);
    editor.off("update", checkEditable);
    editor.unregisterPlugin(key);
    for (const url of urls) URL.revokeObjectURL(url);
  }
  function cancel() {
    destination.dispose();
    cleanup();
  }
  function checkEditable() {
    if (active && !editor.isEditable) {
      cancel();
      reportError("The article is no longer editable. Paste your images again when editing is available.");
    }
  }
  function preview() {
    const container = document.createElement("span");
    container.className = "blog-image-upload-preview";
    container.contentEditable = "false";
    container.draggable = false;
    container.setAttribute("data-blog-image-upload", "");
    container.setAttribute("role", "status");
    for (const [index, url] of urls.entries()) {
      const item = document.createElement("span");
      item.className = "blog-image-upload-preview__item";
      const image = document.createElement("img");
      image.src = url;
      image.alt = "Pasted image preview";
      image.draggable = false;
      const status = document.createElement("span");
      status.className = "blog-image-upload-preview__status";
      status.textContent = files.length === 1 ? "Uploading image…" : `Uploading image ${index + 1} of ${files.length}…`;
      item.append(image, status);
      container.append(item);
    }
    return container;
  }
  void (async () => {
    try {
      for (const file of files) urls.push(URL.createObjectURL(file));
      editor.on("destroy", cancel);
      editor.on("update", checkEditable);
      editor.registerPlugin(
        new Plugin<SelectionBookmark>({
          key,
          state: {
            init: () => editor.state.selection.getBookmark(),
            apply: (transaction, bookmark) => bookmark.map(transaction.mapping),
          },
          props: {
            decorations(state) {
              const bookmark = key.getState(state);
              return active && editor.isEditable && bookmark
                ? DecorationSet.create(state.doc, [
                    Decoration.widget(bookmark.resolve(state.doc).from, preview, {
                      side: 1,
                      key: urls[0],
                      ignoreSelection: true,
                      stopEvent: () => true,
                    }),
                  ])
                : DecorationSet.empty;
            },
          },
          // setEditable(false, false) does not emit an update event.
          view: () => ({
            update: () => {
              if (!editor.isEditable) queueMicrotask(checkEditable);
            },
          }),
        }),
      );
      const images: JSONContent[] = [];
      for (const file of files) {
        checkEditable();
        if (!active || editor.isDestroyed) return;
        const image = await upload(file);
        checkEditable();
        if (!active || editor.isDestroyed) return;
        // Keep the upload error visible and leave the original selection untouched.
        if (!image) return;
        images.push({ type: "image", attrs: { ...image } });
      }
      if (!editor.isDestroyed && !destination.insert(images)) {
        reportError("Couldn’t insert the images. Select a place in the article and paste again.");
      }
    } catch {
      if (active && !editor.isDestroyed) reportError("Couldn’t paste the images. Try a smaller image or paste again.");
    } finally {
      destination.dispose();
      cleanup();
    }
  })();
  return true;
}
