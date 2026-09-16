import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { transformSync } from "next/dist/build/swc/index.js";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { history, undo } from "@tiptap/pm/history";
import { EditorState } from "@tiptap/pm/state";
import { BlogImageNode } from "../app/admin/(protected)/blog/lib/imageNode.ts";

const componentState = {
  values: [],
  index: 0,
  effects: [],
  dirty: false,
  unmounted: false,
  updatesAfterUnmount: 0,
};
globalThis.__blogImageViewTest = componentState;
const stub = (source) => ({
  shortCircuit: true,
  url: `data:text/javascript,${encodeURIComponent(source)}`,
});
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/BlogImageView.tsx")) {
      if (specifier === "react")
        return stub(`
        const s = globalThis.__blogImageViewTest;
        export function useState(initial) {
          const i = s.index++;
          if (!(i in s.values)) s.values[i] = typeof initial === 'function' ? initial() : initial;
          return [s.values[i], value => {
            if (s.unmounted) s.updatesAfterUnmount++;
            const next = typeof value === 'function' ? value(s.values[i]) : value;
            if (!Object.is(next, s.values[i])) { s.values[i] = next; s.dirty = true; }
          }];
        }
        export function useRef(initial) { return useState(() => ({ current: initial }))[0]; }
        export function useId() { return 'image-test'; }
        export function useEffect(callback, deps) {
          const i = s.index++, previous = s.values[i];
          if (!previous || !deps || deps.some((value, j) => !Object.is(value, previous.deps[j]))) {
            s.values[i] = { deps, cleanup: previous?.cleanup };
            s.effects.push(() => { previous?.cleanup?.(); s.values[i].cleanup = callback(); });
          }
        }
      `);
      if (specifier === "@tiptap/react") return stub("export function NodeViewWrapper() {};");
      if (specifier === "@smarttools/ui")
        return stub(`
        ${["Button", "Input", "Label", "Tooltip", "TooltipContent", "TooltipProvider", "TooltipTrigger"].map((name) => `export function ${name}() {}`).join(" ")}
        export const Popover = { Root() {}, Anchor() {}, Portal() {}, Content() {} };
      `);
    }
    if (specifier === "./BlogImageCropDialog.tsx")
      return {
        url: "data:text/javascript,export function BlogImageCropDialog() { return null; }",
        shortCircuit: true,
      };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".css")) return { format: "module", shortCircuit: true, source: "export default {};" };
    if (url.endsWith(".png"))
      return {
        format: "module",
        shortCircuit: true,
        source: 'export default {src:"/test-logo.png"};',
      };
    if (!url.endsWith(".tsx")) return next(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: transformSync(readFileSync(new URL(url), "utf8"), {
        filename: new URL(url).pathname,
        jsc: {
          parser: { syntax: "typescript", tsx: true },
          transform: { react: { runtime: "automatic" } },
        },
        module: { type: "es6" },
      }).code,
    };
  },
});
const { BlogImageView, resizedImageWidth, uploadBlogImageReplacement } =
  await import("../app/admin/(protected)/blog/components/BlogImageView.tsx");
test.after(() => {
  hooks.deregister();
  delete globalThis.__blogImageViewTest;
});

test("image resizing follows its anchored edge and stays within the document width", () => {
  assert.equal(resizedImageWidth(50, 80, 800, "left"), 60);
  assert.equal(resizedImageWidth(50, -80, 800, "left"), 40);
  assert.equal(resizedImageWidth(50, 80, 800, "center"), 70);
  assert.equal(resizedImageWidth(50, -80, 800, "center"), 30);
  assert.equal(resizedImageWidth(50, -80, 800, "right"), 60);
  assert.equal(resizedImageWidth(50, 80, 800, "right"), 40);
  assert.equal(resizedImageWidth(50, 99999, 800, "left"), 100);
  assert.equal(resizedImageWidth(50, -99999, 800, "left"), 10);
  assert.equal(resizedImageWidth(50, 3, 800, "left"), 50);
  assert.equal(resizedImageWidth(50, 4, 800, "left"), 51);
  assert.equal(resizedImageWidth(50, 100, 0, "center"), 50);
});

const source = {
  publicId: "smarttools/blog/original",
  version: 1,
  format: "png",
  width: 800,
  height: 600,
  alt: "Original description",
  caption: "Original caption",
  displayWidth: 45,
  alignment: "right",
};
const cropped = {
  publicId: "smarttools/blog/cropped",
  version: 2,
  format: "png",
  width: 400,
  height: 300,
  alt: "",
  caption: "",
};
const schema = getSchema([StarterKit, BlogImageNode]);
function imageEditor() {
  let state = EditorState.create({
    doc: schema.node("doc", null, [schema.node("image", source)]),
    plugins: [history()],
  });
  const dispatch = (transaction) => {
    state = state.apply(transaction);
  };
  const editor = {
    isEditable: true,
    isDestroyed: false,
    get state() {
      return state;
    },
    view: { dispatch },
  };
  return {
    editor,
    getPos: () => 0,
    updateAttributes: (attrs) =>
      dispatch(state.tr.setNodeMarkup(0, undefined, { ...state.doc.nodeAt(0).attrs, ...attrs })),
  };
}

function imageViewHarness(t, selected = false) {
  Object.assign(componentState, {
    values: [],
    index: 0,
    effects: [],
    dirty: false,
    unmounted: false,
    updatesAfterUnmount: 0,
  });
  const base = imageEditor();
  const calls = { select: 0, focus: 0, changes: 0 };
  const listeners = new Map();
  const props = {
    ...base,
    node: base.editor.state.doc.nodeAt(0),
    selected,
    extension: { options: { cloudName: "demo", onUploadImage: async () => cropped } },
    updateAttributes(attrs) {
      calls.changes++;
      base.updateAttributes(attrs);
      props.node = base.editor.state.doc.nodeAt(0);
    },
    deleteNode() {},
  };
  props.editor.commands = {
    setNodeSelection() {
      calls.select++;
      props.selected = true;
    },
    focus() {
      calls.focus++;
    },
  };
  props.editor.view.focus = () => {
    calls.focus++;
  };
  props.editor.on = (event, listener) => listeners.set(event, listener);
  props.editor.off = (event) => listeners.delete(event);
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const document = { activeElement: null };
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  const walk = (node) =>
    Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  function render() {
    let nodes;
    for (let pass = 0; pass < 10; pass++) {
      componentState.index = 0;
      componentState.dirty = false;
      componentState.effects = [];
      nodes = walk(BlogImageView(props));
      for (const effect of componentState.effects) effect();
      if (!componentState.dirty)
        return {
          root: nodes.find((node) => node.type.name === "Root").props,
          figure: nodes.find((node) => node.type === "figure").props,
          image: nodes.find((node) => node.type === "img").props,
          button: nodes.find((node) => node.props["aria-label"]?.startsWith("Edit image:")).props,
          panel: nodes.find((node) => node.props["aria-label"] === "Image settings").props,
          resize: nodes.find((node) => node.props.role === "slider")?.props,
          wrapper: nodes.find((node) => node.type.name === "NodeViewWrapper").props,
        };
    }
    assert.fail("Image view did not settle after its effects");
  }
  function unmount() {
    if (componentState.unmounted) return;
    for (const value of componentState.values) value?.cleanup?.();
    componentState.unmounted = true;
  }
  t.after(() => {
    unmount();
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  return { render, props, calls, document, unmount };
}

test("image hover shows settings without selecting or editing and bridges to focused controls", (t) => {
  const h = imageViewHarness(t);
  assert.equal(h.render().root.open, false);
  h.render().figure.onPointerEnter({ pointerType: "mouse" });
  assert.equal(h.render().root.open, true);
  let autofocusPrevented = false;
  h.render().panel.onOpenAutoFocus({
    preventDefault() {
      autofocusPrevented = true;
    },
  });
  assert.equal(autofocusPrevented, true);
  assert.deepEqual(h.calls, { select: 0, focus: 0, changes: 0 });

  h.render().figure.onPointerLeave();
  t.mock.timers.tick(100);
  h.render().panel.onPointerEnter();
  t.mock.timers.tick(250);
  assert.equal(h.render().root.open, true);
  const field = {};
  h.render().panel.ref.current = { contains: (node) => node === field };
  h.document.activeElement = field;
  h.render().panel.onFocusCapture();
  h.render().panel.onPointerLeave();
  t.mock.timers.tick(250);
  assert.equal(h.render().root.open, true);
  h.document.activeElement = null;
  h.render().panel.onBlurCapture();
  t.mock.timers.tick(250);
  assert.equal(h.render().root.open, false);
  assert.deepEqual(h.calls, { select: 0, focus: 0, changes: 0 });

  h.render().figure.onPointerEnter({ pointerType: "touch" });
  assert.equal(h.render().root.open, false);
  h.render().button.onClick();
  assert.equal(h.render().root.open, true);
  assert.deepEqual(h.calls, { select: 1, focus: 1, changes: 0 });
  h.render().root.onOpenChange(false);
  assert.equal(h.render().root.open, false);
  h.props.node = h.props.editor.state.doc.nodeAt(0);
  assert.equal(h.render().root.open, false);
  h.render().figure.onPointerEnter({ pointerType: "mouse" });
  assert.equal(h.render().root.open, true);
  h.render().panel.onEscapeKeyDown();
  h.render().root.onOpenChange(false);
  assert.equal(h.render().root.open, false);
  h.render().button.onFocus();
  assert.equal(h.render().root.open, true);
  h.render().root.onOpenChange(false);
  h.props.selected = false;
  h.render();
  h.props.selected = true;
  assert.equal(h.render().root.open, true);
});

test("image drag dismisses controls, resizing keeps them open, and unmount cancels hover work", (t) => {
  const h = imageViewHarness(t);
  h.render().figure.onPointerEnter({ pointerType: "mouse" });
  assert.equal(h.render().root.open, true);
  h.render().image.onDragStart();
  assert.equal(h.render().root.open, false);
  h.props.selected = true;
  assert.equal(h.render().root.open, false);
  h.render().figure.onPointerEnter({ pointerType: "mouse" });
  assert.equal(h.render().root.open, false);
  h.render().image.onDragEnd();
  h.render().button.onClick();
  assert.equal(h.render().root.open, true);
  h.render().wrapper.ref.current = { getBoundingClientRect: () => ({ width: 800 }) };
  const event = {
    pointerId: 1,
    button: 0,
    clientX: 100,
    preventDefault() {},
    stopPropagation() {},
    currentTarget: {
      setPointerCapture() {},
      hasPointerCapture: () => true,
      releasePointerCapture() {},
    },
  };
  h.render().resize.onPointerDown(event);
  h.render().figure.onPointerLeave();
  t.mock.timers.tick(300);
  assert.equal(h.render().root.open, true);
  h.render().resize.onPointerMove({ ...event, clientX: 60 });
  h.render().resize.onPointerUp(event);
  assert.equal(h.calls.changes, 1);
  assert.equal(h.props.editor.state.doc.nodeAt(0).attrs.displayWidth, 50);

  h.render().figure.onPointerEnter({ pointerType: "mouse" });
  h.render().figure.onPointerLeave();
  h.unmount();
  t.mock.timers.tick(1000);
  assert.equal(componentState.updatesAfterUnmount, 0);
});

test("cropping uploads a new image, preserves current descriptions and layout, and undoes independently", async () => {
  const props = imageEditor();
  props.updateAttributes({ caption: "Updated caption" });
  const beforeCrop = props.editor.state.doc.toJSON();
  const file = new File(["cropped"], "crop.png", { type: "image/png" });
  let uploaded;
  await uploadBlogImageReplacement(
    file,
    source,
    props,
    async (input) => {
      uploaded = input;
      return cropped;
    },
    () => true,
  );
  assert.equal(uploaded, file);
  assert.deepEqual(
    { ...props.editor.state.doc.nodeAt(0).attrs },
    {
      ...cropped,
      alt: source.alt,
      caption: "Updated caption",
      displayWidth: 45,
      alignment: "right",
    },
  );
  assert.equal(undo(props.editor.state, props.editor.view.dispatch), true);
  assert.deepEqual(props.editor.state.doc.toJSON(), beforeCrop);
  assert.equal(undo(props.editor.state, props.editor.view.dispatch), true);
  assert.equal(props.editor.state.doc.nodeAt(0).attrs.caption, source.caption);
});

test("failed uploads leave the current inline image unchanged and reject for retry", async () => {
  for (const upload of [
    async () => null,
    async () => {
      throw new Error("Offline");
    },
  ]) {
    const props = imageEditor();
    const original = props.editor.state.doc.toJSON();
    await assert.rejects(uploadBlogImageReplacement(new File(["crop"], "crop.png"), source, props, upload, () => true));
    assert.deepEqual(props.editor.state.doc.toJSON(), original);
  }
});

test("cropping refuses stale, removed, read-only and unmounted inline images before and after upload", async () => {
  for (const timing of ["before", "during"]) {
    for (const invalidate of [
      (props) => props.updateAttributes({ publicId: "another-image" }),
      (props) => props.updateAttributes({ version: 10 }),
      (props) => {
        props.removed = true;
      },
      (props) => {
        props.editor.view.dispatch(props.editor.state.tr.delete(0, 1));
      },
      (props) => {
        props.editor.isEditable = false;
      },
      (props) => {
        props.editor.isDestroyed = true;
      },
      (props) => {
        props.mounted = false;
      },
    ]) {
      const props = { ...imageEditor(), mounted: true };
      props.getPos = () => (props.removed ? undefined : 0);
      if (timing === "before") invalidate(props);
      let uploads = 0;
      let expected = props.editor.state.doc.toJSON();
      await assert.rejects(
        uploadBlogImageReplacement(
          new File(["crop"], "crop.png"),
          source,
          props,
          async () => {
            uploads++;
            if (timing === "during") invalidate(props);
            expected = props.editor.state.doc.toJSON();
            return cropped;
          },
          () => props.mounted,
        ),
      );
      assert.equal(uploads, timing === "before" ? 0 : 1);
      assert.deepEqual(props.editor.state.doc.toJSON(), expected);
    }
  }
});
