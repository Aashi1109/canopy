import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { history, undo } from "@tiptap/pm/history";
import { EditorState, NodeSelection } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import { BlogImageNode, blogEditorImageSource } from "../app/admin/(protected)/blog/lib/imageNode.ts";
import { createDraftPersistence } from "../app/admin/(protected)/blog/lib/draftPersistence.ts";
import { createBlogDocument, validateBlogDocument } from "../lib/blog/document.ts";

const image = {
  publicId: "smarttools/blog/95c40d91-c008-4474-965b-71ec2e4f2b81",
  version: 1234,
  format: "webp",
  width: 800,
  height: 600,
  alt: 'A diagram with "labels"',
  caption: "First line\nSecond line",
  displayWidth: 45,
  alignment: "right",
};
const schema = getSchema([StarterKit, BlogImageNode.configure({ cloudName: "blog-cloud" })]);
const parse = schema.nodes.image.spec.parseDOM.find((rule) => rule.tag === "figure[data-blog-image]").getAttrs;
function figure(metadata, src = blogEditorImageSource(image, "blog-cloud"), extra = {}) {
  return {
    getAttribute(name) {
      return name === "data-blog-image" ? metadata : (extra[name] ?? null);
    },
    querySelector() {
      return src === null
        ? null
        : {
            getAttribute(name) {
              return name === "src" ? src : null;
            },
          };
    },
  };
}

test("native image drops move the image in either direction, preserve metadata, and undo as one edit", () => {
  assert.equal(schema.nodes.image.spec.draggable, true);
  const before = schema.nodes.paragraph.create(null, schema.text("Before"));
  const after = schema.nodes.paragraph.create(null, schema.text("After"));
  const imageNode = schema.nodes.image.create(image);
  const original = schema.nodes.doc.create(null, [before, imageNode, after]);
  for (const target of [0, original.content.size]) {
    let state = EditorState.create({
      doc: original,
      selection: NodeSelection.create(original, before.nodeSize),
      plugins: [history()],
    });
    const view = {
      editable: true,
      get state() {
        return state;
      },
      dragging: { slice: state.selection.content(), move: true, node: state.selection },
      someProp() {},
      posAtCoords() {
        return { pos: target };
      },
      focus() {},
      dispatch(transaction) {
        state = state.apply(transaction);
      },
    };
    const event = Object.assign(new Event("drop", { cancelable: true }), {
      dataTransfer: {},
      clientX: 0,
      clientY: 0,
      altKey: false,
      ctrlKey: false,
    });
    // Exercise ProseMirror's installed drop handler, including source removal and position mapping.
    EditorView.prototype.dispatchEvent.call(view, event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(view.dragging, null);
    assert.deepEqual(
      state.doc.toJSON(),
      schema.nodes.doc.create(null, target === 0 ? [imageNode, before, after] : [before, after, imageNode]).toJSON(),
    );
    assert.ok(state.selection instanceof NodeSelection);
    assert.deepEqual({ ...state.selection.node.attrs }, image);
    assert.equal(
      undo(state, (transaction) => {
        state = state.apply(transaction);
      }),
      true,
    );
    assert.deepEqual(state.doc.toJSON(), original.toJSON());
    assert.equal(undo(state), false);
  }
});

test("the installed image node serializes and parses clipboard metadata without losing image layout", () => {
  const rendered = schema.nodes.image.spec.toDOM(schema.nodes.image.create(image));
  assert.equal(rendered[0], "figure");
  assert.equal(rendered[2][0], "img");
  const parsed = parse(figure(rendered[1]["data-blog-image"], rendered[2][1].src));
  assert.deepEqual(parsed, image);
  assert.deepEqual(schema.nodes.image.create(parsed).toJSON().attrs, schema.nodes.image.create(image).toJSON().attrs);
});

test("validated clipboard metadata cannot be overridden by arbitrary HTML attributes", () => {
  const parsed = parse(
    figure(JSON.stringify(image), undefined, {
      publicId: "external",
      version: "-1",
      width: "-1",
      alt: "changed",
      displayWidth: "999",
      alignment: "absolute",
    }),
  );
  assert.deepEqual(parsed, image);
  const { displayWidth, alignment, ...legacyImage } = image;
  assert.deepEqual(parse(figure(JSON.stringify(legacyImage))), {
    ...legacyImage,
    displayWidth: 100,
    alignment: "center",
  });
});

test("maximum-length Unicode descriptions fit the bounded clipboard metadata", () => {
  const maximum = { ...image, alt: "汉".repeat(500), caption: "汉".repeat(1000) };
  const rendered = schema.nodes.image.spec.toDOM(schema.nodes.image.create(maximum));
  const metadata = rendered[1]["data-blog-image"];
  assert.ok(new TextEncoder().encode(metadata).length <= 6144);
  assert.deepEqual(parse(figure(metadata, rendered[2][1].src)), maximum);
});

test("clipboard parsing rejects untrusted URLs, malformed metadata, and values outside the image contract", () => {
  for (const src of [
    null,
    "https://external.invalid/picture.png",
    blogEditorImageSource(image, "another-cloud"),
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
  ]) {
    assert.equal(parse(figure(JSON.stringify(image), src)), false);
  }
  for (const metadata of [
    "",
    "{",
    "null",
    "[]",
    " ".repeat(6145),
    JSON.stringify({ ...image, padding: "汉".repeat(2100) }),
    '{"__proto__":{},' + JSON.stringify(image).slice(1),
  ]) {
    assert.equal(parse(figure(metadata)), false);
  }
  for (const attrs of [
    { publicId: "../outside" },
    { version: 0 },
    { version: 1.5 },
    { format: "svg" },
    { width: 30001 },
    { height: -1 },
    { displayWidth: 9 },
    { displayWidth: 101 },
    { displayWidth: 33.5 },
    { alignment: "absolute" },
    { alt: "a".repeat(501) },
    { caption: "c".repeat(1001) },
    { alt: "\u0000" },
    { caption: "\ud800" },
    { src: "https://external.invalid/image.png" },
  ])
    assert.equal(parse(figure(JSON.stringify({ ...image, ...attrs }))), false, JSON.stringify(attrs));
});

test("copied image JSON survives the plain Server Action payload and backend validation", async () => {
  const parsed = parse(figure(JSON.stringify(image)));
  const body = schema.node("doc", null, [schema.nodes.image.create(parsed)]).toJSON();
  const document = { ...createBlogDocument("Clipboard test"), body };
  let saved;
  const persistence = createDraftPersistence({
    document,
    version: 1,
    onState() {},
    request: async (input) => {
      assert.equal(Object.getPrototypeOf(input.document.body.content[0].attrs), Object.prototype);
      saved = validateBlogDocument(input.document, { cloudName: "blog-cloud" });
      return { ok: true, data: { version: 2 } };
    },
  });
  persistence.change(document);
  assert.equal(await persistence.save(), true);
  persistence.stop();
  assert.deepEqual(saved.body.content[0].attrs, image);
});
