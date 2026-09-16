import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { pasteBlogImages } from "../app/admin/(protected)/blog/lib/imagePaste.ts";

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

test("clipboard previews appear immediately, map through edits, and atomically become ordered images", async (t) => {
  const editor = editorFor();
  const originalPlugins = new Set(editor.state.plugins);
  const originalDocument = editor.getJSON();
  const urls = [];
  const revoked = [];
  t.mock.method(URL, "createObjectURL", (image) => {
    const url = `blob:preview-${urls.length}`;
    urls.push([image.name, url]);
    return url;
  });
  t.mock.method(URL, "revokeObjectURL", (url) => revoked.push(url));
  const images = [file("one.png"), file("two.png")];
  const event = clipboard(images);
  const requests = [];
  let finish;
  const first = new Promise((resolve) => {
    finish = resolve;
  });
  const errors = [];
  assert.equal(
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
    true,
  );
  assert.equal(event.defaultPrevented, true);
  const preview = editor.state.plugins.find((plugin) => !originalPlugins.has(plugin));
  assert.ok(preview, "a preview decoration is registered before upload finishes");
  assert.equal(preview.props.decorations(editor.state).find()[0].from, 9);
  assert.deepEqual(editor.getJSON(), originalDocument, "previews are never document/autosave content");
  assert.deepEqual(
    urls.map(([name]) => name),
    ["one.png", "two.png"],
  );
  editor.commands.insertContentAt(1, { type: "text", text: "New " });
  assert.equal(preview.props.decorations(editor.state).find()[0].from, 13);
  editor.commands.setTextSelection(1);
  finish();
  await setImmediate();
  assert.deepEqual(requests, ["one.png", "two.png"]);
  assert.deepEqual(
    editor.getJSON().content.map((node) => node.type),
    ["paragraph", "image", "image", "paragraph"],
  );
  assert.equal(editor.state.doc.firstChild.textContent, "New Before");
  assert.equal(editor.state.doc.child(1).attrs.publicId, "one.png");
  assert.equal(editor.state.doc.child(2).attrs.publicId, "two.png");
  assert.deepEqual(errors, []);
  assert.equal(editor.state.plugins.includes(preview), false);
  assert.deepEqual(revoked.sort(), urls.map(([, url]) => url).sort());
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
  pasteBlogImages(editor, clipboard([file("pending.png")]), () => pending, assert.fail);
  const preview = editor.state.plugins.find((plugin) => !existing.has(plugin));
  editor.commands.deleteSelection();
  assert.equal(preview.props.decorations(editor.state).find().length, 1);
  assert.equal(preview.props.decorations(editor.state).find()[0].from, 9);
  assert.equal(editor.getJSON().content.filter((node) => node.type === "image").length, 0);
  finish(uploaded("pending.png"));
  await setImmediate();
  assert.equal(editor.getJSON().content.filter((node) => node.type === "image").length, 1);
  assert.equal(editor.state.plugins.includes(preview), false);
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
    assert.equal(pasteBlogImages(editor, event, upload, assert.fail), false);
    assert.notEqual(event.defaultPrevented, true);
  }
  assert.equal(pasteBlogImages(editor, clipboard([file("screenshot.png")], []), upload, assert.fail), true);
  await setImmediate();
  assert.equal(uploads, 1);
  editor.destroy();
});

test("failed uploads remove previews and leave the original selection intact while preserving the upload error", async (t) => {
  const editor = editorFor();
  const existing = editor.state.plugins;
  const revoked = [];
  t.mock.method(URL, "revokeObjectURL", (url) => revoked.push(url));
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
  assert.deepEqual(requests, ["first.png", "bad.gif"]);
  assert.deepEqual(editor.getJSON(), before);
  assert.deepEqual(errors, []);
  assert.deepEqual(editor.state.plugins, existing);
  assert.equal(revoked.length, 3);
  editor.destroy();
});

test("unavailable editors remove pending previews immediately and never write after disposal", async (t) => {
  const revoked = [];
  t.mock.method(URL, "revokeObjectURL", (url) => revoked.push(url));
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
    assert.deepEqual(editor.state.plugins, existing, "remove preview without waiting for the network");
    assert.equal(revoked.length, stop === "read-only" ? 2 : 4);
    Object.defineProperty(editor, "isDestroyed", {
      configurable: true,
      value: stop === "destroyed",
    });
    finish(uploaded("pending.png"));
    await setImmediate();
    assert.deepEqual(editor.getJSON(), before);
    assert.equal(pasteBlogImages(editor, clipboard([file("later.png")]), assert.fail, assert.fail), false);
    if (stop === "read-only") assert.equal(errors.length, 1);
    else assert.equal(errors.length, 0);
    editor.destroy();
  }
});

test("silent read-only changes remove decorations and dispose preview resources through the plugin view", async (t) => {
  const editor = editorFor();
  const existing = new Set(editor.state.plugins);
  const revoked = [];
  t.mock.method(URL, "revokeObjectURL", (url) => revoked.push(url));
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
  assert.equal(preview.props.decorations(editor.state).find().length, 0);
  pluginView.update(editor.view);
  await setImmediate();
  assert.equal(editor.state.plugins.includes(preview), false);
  assert.equal(revoked.length, 1);
  assert.equal(errors.length, 1);
  finish(uploaded("pending.png"));
  await setImmediate();
  assert.equal(errors.length, 1);
  assert.equal(editor.state.doc.childCount, 2);
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
  pasteBlogImages(editor, clipboard([file("first.png")]), () => first, assert.fail);
  pasteBlogImages(editor, clipboard([file("second.png")]), () => second, assert.fail);
  const previews = editor.state.plugins.filter((plugin) => !existing.has(plugin));
  assert.equal(previews.length, 2);
  finishFirst(uploaded("first.png"));
  await setImmediate();
  assert.equal(editor.state.plugins.includes(previews[0]), false);
  assert.equal(editor.state.plugins.includes(previews[1]), true);
  assert.equal(previews[1].props.decorations(editor.state).find().length, 1);
  finishSecond(uploaded("second.png"));
  await setImmediate();
  assert.deepEqual(
    editor
      .getJSON()
      .content.filter((node) => node.type === "image")
      .map((node) => node.attrs.publicId),
    ["first.png", "second.png"],
  );
  assert.equal(
    editor.state.plugins.some((plugin) => previews.includes(plugin)),
    false,
  );
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
  assert.deepEqual(editor.getJSON(), before);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /paste.*again/i);
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
  assert.equal(errors.length, 1);
  assert.match(errors[0], /paste.*again/i);
  assert.equal(editor.state.doc.childCount, 2);
  editor.destroy();
});

test("insertion errors still report recovery and remove previews after the upload succeeds", async (t) => {
  const editor = editorFor();
  const existing = editor.state.plugins;
  const revoked = [];
  t.mock.method(URL, "revokeObjectURL", (url) => revoked.push(url));
  t.mock.method(
    editor,
    "commands",
    () => ({
      insertContentAt() {
        throw new Error("insertion unavailable");
      },
    }),
    { getter: true },
  );
  const errors = [];
  pasteBlogImages(
    editor,
    clipboard([file("pending.png")]),
    async () => uploaded("pending.png"),
    (error) => errors.push(error),
  );
  await setImmediate();
  assert.equal(errors.length, 1);
  assert.match(errors[0], /paste.*again/i);
  assert.deepEqual(editor.state.plugins, existing);
  assert.equal(revoked.length, 1);
  editor.destroy();
});
