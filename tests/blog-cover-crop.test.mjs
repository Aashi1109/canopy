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
      export function useState(initial) { const i = s.index++; if (!(i in s.values)) s.values[i] = typeof initial === 'function' ? initial() : initial; return [s.values[i], value => { s.values[i] = typeof value === 'function' ? value(s.values[i]) : value; }]; }
      export function useRef(initial) { return useState(() => ({current: initial}))[0]; }
      export function useEffect() {} export function useId() { return 'test'; }
    `);
    if (specifier === "next/navigation") return stub("export function useRouter() { return {}; }");
    if (specifier === "next/link") return stub("export default function Link() {}");
    if (specifier === "@tiptap/react")
      return stub(
        "export function useEditor() { return {get isEditable() {return globalThis.__coverCropTest.editable}}; } export function ReactNodeViewRenderer() {} export function EditorContent() {}",
      );
    if (specifier === "@tiptap/starter-kit") return stub("export default {configure() { return {}; }};");
    if (specifier === "@tiptap/extension-table") return stub("export const TableKit = {configure() { return {}; }};");
    if (specifier === "@canopy/ui")
      return stub(
        `export const toast = Object.assign(() => {}, {error() {}, success() {}, dismiss() {}}); ${["AlertBanner", "AlertDialog", "AlertDialogContent", "AlertDialogHeader", "AlertDialogTitle", "AlertDialogDescription", "AlertDialogFooter", "AlertDialogCancel", "Button", "FileUploadZone", "Input", "Label", "Textarea", "Toaster"].map((name) => `export function ${name}() {}`).join(" ")} export const Popover = {Root() {}, Trigger() {}, Portal() {}, Content() {}, Arrow() {}};`,
      );
    if (specifier === "../actions")
      return stub(
        "export async function mutateBlogAction() {} export async function uploadBlogImageAction(form) { const s = globalThis.__coverCropTest; s.uploads.push(form.get('file')); return s.upload(); }",
      );
    if (specifier === "../lib/draftPersistence")
      return stub(
        "export function createDraftPersistence() { return {change(value) {globalThis.__coverCropTest.changes.push(value)}}; }",
      );
    if (specifier === "../lib/useBlogTaxonomyOptions")
      return stub("export function useBlogTaxonomyOptions(kind, initial) { return initial; }");
    if (specifier === "../lib/imageNode")
      return stub(
        "export const BlogImageNode = {extend() {return {configure() {return {}}}}}; export function blogEditorImageSource(image) {return 'https://example.test/' + image.publicId;}",
      );
    if (specifier === "../lib/formattingExtensions") return stub("export const blogFormattingExtensions = [];");
    if (specifier === "@/lib/blog/codeHighlight") return stub("export const blogLowlight = {};");
    if (specifier === "@/lib/blog/math") return stub("export const normalizeBlogMath = node => node;");
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

test("cover hover preserves focus and stays open across the panel, while explicit activation focuses settings", (t) => {
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
  let focused = 0;
  const inside = {};
  const document = {
    activeElement: null,
    getElementById: () => ({
      focus() {
        focused++;
      },
    }),
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  render().trigger.onPointerEnter({ pointerType: "mouse" });
  assert.equal(render().root.open, true);
  let prevented = false;
  render().panel.onOpenAutoFocus({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(focused, 0);
  render().trigger.onPointerLeave();
  t.mock.timers.tick(100);
  render().panel.onPointerEnter();
  t.mock.timers.tick(250);
  assert.equal(render().root.open, true);
  render().panel.onPointerLeave();
  t.mock.timers.tick(250);
  assert.equal(render().root.open, false);

  render().trigger.onPointerEnter({ pointerType: "touch" });
  assert.equal(render().root.open, false);
  render().trigger.onClick({ preventDefault() {} });
  assert.equal(render().root.open, true);
  prevented = false;
  render().panel.onOpenAutoFocus({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, false);
  render().root.onOpenChange(false);
  render().trigger.onPointerEnter({ pointerType: "mouse" });
  render().trigger.onClick({ preventDefault() {} });
  assert.equal(render().root.open, true);
  assert.equal(focused, 1);

  render().panel.ref.current = { contains: (element) => element === inside };
  document.activeElement = inside;
  render().panel.onFocusCapture();
  render().panel.onPointerLeave();
  t.mock.timers.tick(250);
  assert.equal(render().root.open, true);
  document.activeElement = null;
  render().panel.onBlurCapture();
  t.mock.timers.tick(250);
  assert.equal(render().root.open, false);
  assert.equal(state.changes.length, 0);
});
