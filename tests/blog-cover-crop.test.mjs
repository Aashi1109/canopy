import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { transformSync } from "next/dist/build/swc/index.js";

const state = { values: [], index: 0, changes: [], uploads: [], editable: true };
globalThis.__coverCropTest = state;
const stub = (source) => ({
  shortCircuit: true,
  url: `data:text/javascript,${encodeURIComponent(source)}`,
});
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (!context.parentURL?.endsWith("/BlogEditor.tsx")) return next(specifier, context);
    if (specifier === "react")
      return stub(`
      const s = globalThis.__coverCropTest;
      export function useState(initial) { const i = s.index++; if (!(i in s.values)) s.values[i] = typeof initial === 'function' ? initial() : initial; return [s.values[i], value => { if (s.unmounted) s.updatesAfterUnmount++; const next = typeof value === 'function' ? value(s.values[i]) : value; if (!Object.is(next, s.values[i])) { s.values[i] = next; s.dirty = true; } }]; }
      export function useRef(initial) { return useState(() => ({current: initial}))[0]; }
      export function useEffect(callback, deps) { if (!s.runEffects) return; const i = s.index++, previous = s.values[i]; if (!previous || !deps || deps.some((value, j) => !Object.is(value, previous.deps[j]))) { s.values[i] = {deps, cleanup: previous?.cleanup}; s.effects.push(() => { previous?.cleanup?.(); s.values[i].cleanup = callback(); }); } }
      export function useId() { return 'test'; }
    `);
    if (specifier === "next/navigation") return stub("export function useRouter() { return {}; }");
    if (specifier === "next/link") return stub("export default function Link() {}");
    if (specifier === "@tiptap/react")
      return stub(
        "const editor = {get isEditable() {return globalThis.__coverCropTest.editable}, setEditable() {}}; export function useEditor() { return editor; } export function ReactNodeViewRenderer() {} export function EditorContent() {}",
      );
    if (specifier === "@tiptap/starter-kit") return stub("export default {configure() { return {}; }};");
    if (specifier === "@tiptap/extension-table") return stub("export const TableKit = {configure() { return {}; }};");
    if (specifier === "@/components/ui/index.tsx")
      return stub(
        `export const toast = Object.assign(() => {}, {error(message) {globalThis.__coverCropTest.errors?.push(message);}, success() {}, dismiss() {}}); ${["BackButton", "DropdownMenuItem", "AlertBanner", "AlertDialog", "AlertDialogContent", "AlertDialogHeader", "AlertDialogTitle", "AlertDialogDescription", "AlertDialogFooter", "AlertDialogCancel", "Button", "FileUploadZone", "Input", "Label", "Textarea", "Toaster"].map((name) => `export function ${name}() {}`).join(" ")} export const Popover = {Root() {}, Trigger() {}, Portal() {}, Content() {}, Arrow() {}};`,
      );
    if (specifier === "@/components/ui/components/toast")
      return stub("export function createToastManager() { return {add() {}, close() {}}; }");
    if (specifier === "../actions") return stub("export async function mutateBlogAction() {}");
    if (specifier === "../lib/imageUpload.ts")
      return stub(
        "export async function uploadBlogImageDirect(file) { const s = globalThis.__coverCropTest; s.uploads.push(file); return s.upload(); }",
      );
    if (specifier === "../lib/draftPersistence")
      return stub(
        "export function createDraftPersistence() { return {start() {}, stop() {}, attachStorage() {return null;}, change(value) {globalThis.__coverCropTest.changes.push(value)}}; }",
      );
    if (specifier === "../lib/useBlogTaxonomyOptions")
      return stub("export function useBlogTaxonomyOptions(kind, initial) { return initial; }");
    if (specifier === "../lib/imageNode")
      return stub(
        "export const BlogImageNode = {extend() {return {configure() {return {}}}}}; export function blogEditorImageSource(image) {return 'https://example.test/' + image.publicId;}",
      );
    if (specifier === "../lib/formattingExtensions") return stub("export const blogFormattingExtensions = [];");
    if (specifier === "@/lib/markdown/codeHighlight") return stub("export const codeLowlight = {};");
    if (specifier === "@/lib/blog/math") return stub("export const normalizeBlogMath = node => node;");
    if (specifier === "@/lib/blog/utils")
      return { shortCircuit: true, url: new URL("../lib/blog/utils.ts", import.meta.url).href };
    if (specifier === "../lib/mathExtensions") return stub("export const BlogInlineMath = {}, BlogBlockMath = {};");
    if (specifier === "../lib/imagePaste") return stub("export function pasteBlogImages() {}");
    if (specifier === "../lib/tableEditing") return stub("export const BlogTableCell = {}, BlogTableHeader = {};");
    if (specifier.endsWith(".css")) return stub("export default {};");
    if (specifier.startsWith("./Blog")) {
      const name = specifier.slice(2);
      return stub(
        `export function ${name}() {} ${name === "BlogFormattingToolbar" ? "export function BlogBlockMenu() {}" : ""}`,
      );
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith("/BlogEditor.tsx")) return next(url, context);
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
const { BlogEditor } = await import("../app/admin/(protected)/blog/components/BlogEditor.tsx");
test.after(() => {
  hooks.deregister();
  delete globalThis.__coverCropTest;
});

test("cover crop preserves metadata and current draft, rejects failures and stale images, and cancels without mutation", async () => {
  const original = {
    publicId: "original",
    version: 1,
    format: "png",
    width: 800,
    height: 600,
    alt: "Cover description",
    caption: "Credit",
  };
  const cropped = {
    ...original,
    publicId: "cropped",
    width: 400,
    height: 300,
    alt: "",
    caption: "",
  };
  const props = {
    actorId: "admin",
    canEdit: true,
    cloudName: "demo",
    categories: { items: [] },
    tags: { items: [] },
    tools: [],
    post: {
      id: "post",
      slug: "story",
      version: 1,
      draftDocument: {
        title: "Story",
        excerpt: "",
        authorName: "Team",
        category: null,
        tags: [],
        relatedToolIds: [],
        body: { type: "doc" },
        coverImage: original,
      },
    },
  };
  const file = new File(["crop"], "crop.png", { type: "image/png" });
  const walk = (node) =>
    Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  function render() {
    state.index = 0;
    return walk(BlogEditor(props));
  }
  const button = (nodes, label) =>
    nodes.find((node) => node.type.name === "Button" && [node.props.children].flat().includes(label));
  const dialog = () => render().find((node) => node.type.name === "BlogImageCropDialog");
  function reset() {
    state.values = [];
    state.changes = [];
    state.uploads = [];
    state.editable = true;
    state.upload = async () => ({ ok: true, data: cropped });
  }

  reset();
  button(render(), "Crop cover").props.onClick();
  assert.ok(dialog());
  dialog().props.onClose();
  assert.equal(dialog(), undefined);
  assert.equal(state.changes.length, 0);
  assert.equal(state.uploads.length, 0);

  button(render(), "Crop cover").props.onClick();
  state.upload = async () => ({ ok: false, message: "Upload failed" });
  await assert.rejects(dialog().props.onApply(file));
  assert.equal(state.changes.length, 0);
  state.upload = async () => ({ ok: true, data: cropped });
  const title = render().find((node) => node.props.id === "blog-title");
  title.props.onChange({ target: { value: "Updated title" } });
  await dialog().props.onApply(file);
  assert.equal(state.changes.at(-1).title, "Updated title");
  assert.deepEqual(state.changes.at(-1).coverImage, {
    ...cropped,
    alt: original.alt,
    caption: original.caption,
  });

  reset();
  button(render(), "Crop cover").props.onClick();
  const apply = dialog().props.onApply;
  button(render(), "Remove cover").props.onClick();
  await assert.rejects(apply(file));
  assert.equal(state.uploads.length, 0);
  assert.equal(state.changes.at(-1).coverImage, null);

  reset();
  button(render(), "Crop cover").props.onClick();
  state.upload = async () => {
    state.editable = false;
    return { ok: true, data: cropped };
  };
  await assert.rejects(dialog().props.onApply(file));
  assert.equal(state.changes.length, 0);
});

test("cover settings open only on activation and remain open until dismissed", (t) => {
  state.values = [];
  state.changes = [];
  state.editable = true;
  const props = {
    actorId: "admin",
    canEdit: true,
    cloudName: "demo",
    categories: { items: [] },
    tags: { items: [] },
    tools: [],
    post: {
      id: "post",
      slug: "story",
      version: 1,
      draftDocument: {
        title: "Story",
        excerpt: "",
        authorName: "Team",
        category: null,
        tags: [],
        relatedToolIds: [],
        body: { type: "doc" },
        coverImage: {
          publicId: "cover",
          version: 1,
          format: "png",
          width: 800,
          height: 600,
          alt: "Cover",
          caption: "",
        },
      },
    },
  };
  const walk = (node) =>
    Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  function render() {
    state.index = 0;
    const nodes = walk(BlogEditor(props));
    return {
      trigger: nodes.find((node) => node.props.id === "blog-edit-cover").props,
      panel: nodes.find((node) => node.props["aria-label"] === "Cover image settings").props,
      root: nodes.find((node) => node.type.name === "Root").props,
    };
  }
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { getElementById: () => ({ focus() {} }) },
  });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  assert.equal(render().root.open, false);
  for (const pointerType of ["mouse", "pen", "touch"]) {
    render().trigger.onPointerEnter?.({ pointerType });
    render().trigger.onFocus?.({});
    t.mock.timers.tick(1000);
    assert.equal(render().root.open, false);
  }
  render().trigger.onClick({ preventDefault() {} });
  assert.equal(render().root.open, true);
  render().trigger.onPointerLeave?.();
  render().panel.onPointerLeave?.();
  render().panel.onBlurCapture?.();
  t.mock.timers.tick(1000);
  assert.equal(render().root.open, true);
  render().root.onOpenChange(false);
  assert.equal(render().root.open, false);
  render().trigger.onPointerEnter?.({ pointerType: "mouse" });
  t.mock.timers.tick(1000);
  assert.equal(render().root.open, false);
  assert.equal(state.changes.length, 0);
});

const savedCover = {
  publicId: "saved-cover",
  version: 1,
  format: "png",
  width: 800,
  height: 600,
  alt: "Saved description",
  caption: "Credit",
};
const uploadedCover = {
  ...savedCover,
  publicId: "uploaded-cover",
  version: 2,
  alt: "Uploaded description",
  caption: "",
};

function coverUploadHarness(t, coverImage = null) {
  Object.assign(state, {
    values: [],
    index: 0,
    changes: [],
    uploads: [],
    errors: [],
    effects: [],
    editable: true,
    runEffects: true,
    unmounted: false,
    updatesAfterUnmount: 0,
  });
  let finish;
  state.upload = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const originalGlobals = ["window", "document"].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: {}, addEventListener() {}, removeEventListener() {} },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {}, getElementById: () => ({ focus() {} }) },
  });
  const created = [];
  const revoked = [];
  t.mock.method(URL, "createObjectURL", (file) => {
    created.push(file);
    return `blob:cover-preview-${created.length}`;
  });
  t.mock.method(URL, "revokeObjectURL", (url) => revoked.push(url));
  const props = {
    actorId: "admin",
    canEdit: true,
    cloudName: "demo",
    categories: { items: [] },
    tags: { items: [] },
    tools: [],
    post: {
      id: "post",
      slug: "story",
      version: 1,
      draftDocument: {
        title: "Story",
        excerpt: "",
        authorName: "Team",
        category: null,
        tags: [],
        relatedToolIds: [],
        body: { type: "doc" },
        coverImage,
      },
    },
  };
  const walk = (node) =>
    Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  function render() {
    state.index = 0;
    state.effects = [];
    const nodes = walk(BlogEditor(props));
    for (const effect of state.effects) effect();
    return nodes;
  }
  function unmount() {
    if (state.unmounted) return;
    for (const value of state.values) value?.cleanup?.();
    state.unmounted = true;
  }
  t.after(() => {
    unmount();
    state.runEffects = false;
    for (const [name, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const file = new File(["local image"], "cover.png", { type: "image/png" });
  return {
    render,
    unmount,
    file,
    created,
    revoked,
    select() {
      render()
        .find((node) => node.props["aria-label"] === "Cover image file")
        .props.onChange({
          target: { files: [file], value: "cover.png" },
        });
    },
    async finish(result) {
      finish(result);
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test("a new cover shows its local preview immediately and persists only the completed image", async (t) => {
  const h = coverUploadHarness(t);
  h.select();
  const pending = h.render();
  assert.equal(pending.find((node) => node.type === "img").props.src, "blob:cover-preview-1");
  assert.equal(pending.find((node) => node.type === "img").props.srcSet, undefined);
  assert.equal(
    pending.find((node) => node.props.id === "blog-add-cover"),
    undefined,
  );
  assert.deepEqual(h.created, [h.file]);
  assert.deepEqual(state.uploads, [h.file]);
  assert.equal(state.changes.length, 0);
  assert.deepEqual(h.revoked, []);

  pending
    .find((node) => node.props.id === "blog-title")
    .props.onChange({ target: { value: "Updated while uploading" } });
  assert.equal(state.changes.at(-1).coverImage, null);
  await h.finish({ ok: true, data: uploadedCover });
  const delivered = h.render().find((node) => node.type === "img").props;
  assert.equal(
    delivered.src,
    "https://res.cloudinary.com/demo/image/upload/c_limit,w_800/q_auto/f_auto/v2/uploaded-cover.png",
  );
  assert.equal(
    delivered.srcSet,
    [320, 640, 800]
      .map(
        (width) =>
          `https://res.cloudinary.com/demo/image/upload/c_limit,w_${width}/q_auto/f_auto/v2/uploaded-cover.png ${width}w`,
      )
      .join(", "),
  );
  assert.ok(delivered.sizes);
  assert.equal(delivered.width, 800);
  assert.equal(delivered.height, 600);
  assert.equal(state.changes.at(-1).title, "Updated while uploading");
  assert.deepEqual(state.changes.at(-1).coverImage, uploadedCover);
  assert.deepEqual(h.revoked, ["blob:cover-preview-1"]);
  h.unmount();
  assert.deepEqual(h.revoked, ["blob:cover-preview-1"]);
});

for (const original of [null, savedCover]) {
  test(`failed ${original ? "replacement restores the saved cover" : "first cover restores the upload control"} and releases its preview`, async (t) => {
    const h = coverUploadHarness(t, original);
    h.select();
    assert.equal(h.render().find((node) => node.type === "img").props.src, "blob:cover-preview-1");
    await h.finish({ ok: false, message: "Upload failed" });
    const restored = h.render();
    if (original)
      assert.equal(
        restored.find((node) => node.type === "img").props.src,
        "https://res.cloudinary.com/demo/image/upload/c_limit,w_800/q_auto/f_auto/v1/saved-cover.png",
      );
    else {
      assert.equal(
        restored.find((node) => node.type === "img"),
        undefined,
      );
      assert.ok(restored.find((node) => node.props.id === "blog-add-cover"));
    }
    assert.equal(state.changes.length, 0);
    assert.deepEqual(state.errors, ["Upload failed"]);
    assert.deepEqual(h.revoked, ["blob:cover-preview-1"]);
  });
}

test("unmount releases an uploading cover preview and ignores late upload success", async (t) => {
  const h = coverUploadHarness(t, savedCover);
  h.select();
  h.render();
  h.unmount();
  assert.deepEqual(h.revoked, ["blob:cover-preview-1"]);
  await h.finish({ ok: true, data: uploadedCover });
  assert.equal(state.changes.length, 0);
  assert.equal(state.updatesAfterUnmount, 0);
  assert.deepEqual(h.revoked, ["blob:cover-preview-1"]);
});

test("cover cropping previews locally while pending and retains saved descriptions on completion", async (t) => {
  const h = coverUploadHarness(t, savedCover);
  h.render()
    .find((node) => node.type.name === "Button" && [node.props.children].flat().includes("Crop cover"))
    .props.onClick();
  const cropDialog = h.render().find((node) => node.type.name === "BlogImageCropDialog");
  assert.equal(cropDialog.props.src, "https://example.test/saved-cover");
  const applying = cropDialog.props.onApply(h.file);
  assert.equal(h.render().find((node) => node.type === "img").props.src, "blob:cover-preview-1");
  assert.equal(state.changes.length, 0);
  await h.finish({ ok: true, data: uploadedCover });
  await applying;
  assert.deepEqual(state.changes.at(-1).coverImage, {
    ...uploadedCover,
    alt: savedCover.alt,
    caption: savedCover.caption,
  });
  assert.equal(
    h.render().find((node) => node.type === "img").props.src,
    "https://res.cloudinary.com/demo/image/upload/c_limit,w_800/q_auto/f_auto/v2/uploaded-cover.png",
  );
  assert.deepEqual(h.revoked, ["blob:cover-preview-1"]);
});
