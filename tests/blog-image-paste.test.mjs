import { expect, test, afterEach, vi } from "vitest";
import { setImmediate } from "node:timers/promises";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { pasteBlogImages } from "../app/admin/(protected)/blog/lib/imagePaste.ts";

const fail = () => {
  throw new Error("callback should not be called");
};

afterEach(() => {
  vi.restoreAllMocks();
});

const Image = Node.create({
  name: "image",
  group: "block",
  atom: true,
  addAttributes: () => ({ publicId: { default: "" }, alt: { default: "" } }),
});
const file = (name, type = "image/png") => new File(["image bytes"], name, { type });
const paragraph = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const uploaded = (name) => ({
  publicId: name,
  version: 1,
  format: "png",
  width: 100,
  height: 100,
  alt: "",
  caption: "",
});
function editorFor() {
  const editor = new Editor({
    element: null,
    extensions: [StarterKit, Image],
    content: { type: "doc", content: [paragraph("Before"), paragraph("After")] },
  });
  Object.defineProperty(editor, "isDestroyed", { configurable: true, value: false });
  editor.commands.setTextSelection(9);
  return editor;
}
function clipboard(files, items = files.map((image) => ({ kind: "file", type: image.type, getAsFile: () => image }))) {
  return {
    clipboardData: { files, items },
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

test("clipboard previews appear immediately, map through edits, and atomically become ordered images", async () => {
  const editor = editorFor();
  const originalPlugins = new Set(editor.state.plugins);
  const originalDocument = editor.getJSON();
  const urls = [];
  const revoked = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((image) => {
    const url = `blob:preview-${urls.length}`;
    urls.push([image.name, url]);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => revoked.push(url));
  const images = [file("one.png"), file("two.png")];
  const event = clipboard(images);
  const requests = [];
  let finish;
  const first = new Promise((resolve) => {
    finish = resolve;
  });
  const errors = [];
  expect(
    pasteBlogImages(
      editor,
      event,
      async (image) => {
        requests.push(image.name);
        if (requests.length === 1) await first;
        return uploaded(image.name);
      },
      (error) => errors.push(error),
    ),
  ).toBe(true);
  expect(event.defaultPrevented).toBe(true);
  const preview = editor.state.plugins.find((plugin) => !originalPlugins.has(plugin));
  expect(preview, "a preview decoration is registered before upload finishes").toBeTruthy();
  expect(preview.props.decorations(editor.state).find()[0].from).toBe(9);
  expect(editor.getJSON(), "previews are never document/autosave content").toEqual(originalDocument);
  expect(urls.map(([name]) => name)).toEqual(["one.png", "two.png"]);
  editor.commands.insertContentAt(1, { type: "text", text: "New " });
  expect(preview.props.decorations(editor.state).find()[0].from).toBe(13);
  editor.commands.setTextSelection(1);
  finish();
  await setImmediate();
  expect(requests).toEqual(["one.png", "two.png"]);
  expect(editor.getJSON().content.map((node) => node.type)).toEqual(["paragraph", "image", "image", "paragraph"]);
  expect(editor.state.doc.firstChild.textContent).toBe("New Before");
  expect(editor.state.doc.child(1).attrs.publicId).toBe("one.png");
  expect(editor.state.doc.child(2).attrs.publicId).toBe("two.png");
  expect(errors).toEqual([]);
  expect(editor.state.plugins.includes(preview)).toBe(false);
  expect(revoked.sort()).toEqual(urls.map(([, url]) => url).sort());
  editor.destroy();
});

test("preview mapping survives deletion of the original selected text without persisting temporary images", async () => {
  const editor = editorFor();
  editor.commands.setTextSelection({ from: 9, to: 14 });
  const existing = new Set(editor.state.plugins);
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  pasteBlogImages(editor, clipboard([file("pending.png")]), () => pending, fail);
  const preview = editor.state.plugins.find((plugin) => !existing.has(plugin));
  editor.commands.deleteSelection();
  expect(preview.props.decorations(editor.state).find().length).toBe(1);
  expect(preview.props.decorations(editor.state).find()[0].from).toBe(9);
  expect(editor.getJSON().content.filter((node) => node.type === "image").length).toBe(0);
  finish(uploaded("pending.png"));
  await setImmediate();
  expect(editor.getJSON().content.filter((node) => node.type === "image").length).toBe(1);
  expect(editor.state.plugins.includes(preview)).toBe(false);
  editor.destroy();
});

test("file-only clipboard works while text, missing data, and unrelated files retain normal paste", async () => {
  const editor = editorFor();
  let uploads = 0;
  const upload = async (image) => {
    uploads++;
    return uploaded(image.name);
  };
  for (const event of [
    clipboard([]),
    clipboard([file("notes.txt", "text/plain")]),
    { clipboardData: null },
    clipboard([], [{ kind: "string", type: "text/plain" }]),
  ]) {
    expect(pasteBlogImages(editor, event, upload, fail)).toBe(false);
    expect(event.defaultPrevented).not.toBe(true);
  }
  expect(pasteBlogImages(editor, clipboard([file("screenshot.png")], []), upload, fail)).toBe(true);
  await setImmediate();
  expect(uploads).toBe(1);
  editor.destroy();
});

test("failed uploads remove previews and leave the original selection intact while preserving the upload error", async () => {
  const editor = editorFor();
  const existing = editor.state.plugins;
  const revoked = [];
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => revoked.push(url));
  editor.commands.setTextSelection({ from: 1, to: 7 });
  const before = editor.getJSON();
  const errors = [];
  const requests = [];
  pasteBlogImages(
    editor,
    clipboard([file("first.png"), file("bad.gif", "image/gif"), file("last.png")]),
    async (image) => {
      requests.push(image.name);
      return image.type === "image/gif" ? null : uploaded(image.name);
    },
    (error) => errors.push(error),
  );
  await setImmediate();
  expect(requests).toEqual(["first.png", "bad.gif"]);
  expect(editor.getJSON()).toEqual(before);
  expect(errors).toEqual([]);
  expect(editor.state.plugins).toEqual(existing);
  expect(revoked.length).toBe(3);
  editor.destroy();
});

test("unavailable editors remove pending previews immediately and never write after disposal", async () => {
  const revoked = [];
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => revoked.push(url));
  for (const stop of ["read-only", "destroyed"]) {
    const editor = editorFor();
    const existing = editor.state.plugins;
    const before = editor.getJSON();
    let finish;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const errors = [];
    pasteBlogImages(
      editor,
      clipboard([file("pending.png"), file("next.png")]),
      async () => pending,
      (error) => errors.push(error),
    );
    if (stop === "read-only") editor.setEditable(false);
    else editor.emit("destroy");
    expect(editor.state.plugins, "remove preview without waiting for the network").toEqual(existing);
    expect(revoked.length).toBe(stop === "read-only" ? 2 : 4);
    Object.defineProperty(editor, "isDestroyed", {
      configurable: true,
      value: stop === "destroyed",
    });
    finish(uploaded("pending.png"));
    await setImmediate();
    expect(editor.getJSON()).toEqual(before);
    expect(pasteBlogImages(editor, clipboard([file("later.png")]), fail, fail)).toBe(false);
    if (stop === "read-only") expect(errors.length).toBe(1);
    else expect(errors.length).toBe(0);
    editor.destroy();
  }
});

test("silent read-only changes remove decorations and dispose preview resources through the plugin view", async () => {
  const editor = editorFor();
  const existing = new Set(editor.state.plugins);
  const revoked = [];
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => revoked.push(url));
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const errors = [];
  pasteBlogImages(
    editor,
    clipboard([file("pending.png")]),
    () => pending,
    (error) => errors.push(error),
  );
  const preview = editor.state.plugins.find((plugin) => !existing.has(plugin));
  const pluginView = preview.spec.view(editor.view);
  editor.setEditable(false, false);
  expect(preview.props.decorations(editor.state).find().length).toBe(0);
  pluginView.update(editor.view);
  await setImmediate();
  expect(editor.state.plugins.includes(preview)).toBe(false);
  expect(revoked.length).toBe(1);
  expect(errors.length).toBe(1);
  finish(uploaded("pending.png"));
  await setImmediate();
  expect(errors.length).toBe(1);
  expect(editor.state.doc.childCount).toBe(2);
  editor.destroy();
});

test("finishing one paste leaves a separate pending paste preview alive", async () => {
  const editor = editorFor();
  const existing = new Set(editor.state.plugins);
  let finishFirst, finishSecond;
  const first = new Promise((resolve) => {
    finishFirst = resolve;
  });
  const second = new Promise((resolve) => {
    finishSecond = resolve;
  });
  pasteBlogImages(editor, clipboard([file("first.png")]), () => first, fail);
  pasteBlogImages(editor, clipboard([file("second.png")]), () => second, fail);
  const previews = editor.state.plugins.filter((plugin) => !existing.has(plugin));
  expect(previews.length).toBe(2);
  finishFirst(uploaded("first.png"));
  await setImmediate();
  expect(editor.state.plugins.includes(previews[0])).toBe(false);
  expect(editor.state.plugins.includes(previews[1])).toBe(true);
  expect(previews[1].props.decorations(editor.state).find().length).toBe(1);
  finishSecond(uploaded("second.png"));
  await setImmediate();
  expect(
    editor
      .getJSON()
      .content.filter((node) => node.type === "image")
      .map((node) => node.attrs.publicId),
  ).toEqual(["first.png", "second.png"]);
  expect(editor.state.plugins.some((plugin) => previews.includes(plugin))).toBe(false);
  editor.destroy();
});

test("temporarily losing edit access cancels the paste even when edit access returns before upload completes", async () => {
  const editor = editorFor();
  const before = editor.getJSON();
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const errors = [];
  pasteBlogImages(
    editor,
    clipboard([file("pending.png")]),
    () => pending,
    (error) => errors.push(error),
  );
  editor.setEditable(false);
  editor.setEditable(true);
  finish(uploaded("pending.png"));
  await setImmediate();
  expect(editor.getJSON()).toEqual(before);
  expect(errors.length).toBe(1);
  expect(errors[0]).toMatch(/paste.*again/i);
  editor.destroy();
});

test("unexpected upload errors produce recoverable feedback without unhandled rejection", async () => {
  const editor = editorFor();
  const errors = [];
  pasteBlogImages(
    editor,
    clipboard([file("failed.png")]),
    async () => {
      throw new Error("network");
    },
    (error) => errors.push(error),
  );
  await setImmediate();
  expect(errors.length).toBe(1);
  expect(errors[0]).toMatch(/paste.*again/i);
  expect(editor.state.doc.childCount).toBe(2);
  editor.destroy();
});

test("insertion errors still report recovery and remove previews after the upload succeeds", async () => {
  const editor = editorFor();
  const existing = editor.state.plugins;
  const revoked = [];
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => revoked.push(url));
  vi.spyOn(editor, "commands", "get").mockImplementation(() => ({
    insertContentAt() {
      throw new Error("insertion unavailable");
    },
  }));
  const errors = [];
  pasteBlogImages(
    editor,
    clipboard([file("pending.png")]),
    async () => uploaded("pending.png"),
    (error) => errors.push(error),
  );
  await setImmediate();
  expect(errors.length).toBe(1);
  expect(errors[0]).toMatch(/paste.*again/i);
  expect(editor.state.plugins).toEqual(existing);
  expect(revoked.length).toBe(1);
  editor.destroy();
});
