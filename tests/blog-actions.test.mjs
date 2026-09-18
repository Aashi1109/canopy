import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { BlogError } from "../lib/blog/mutations.ts";
import { AuthorizationError } from "../lib/admin/index.ts";
import { createBlogDocument, BlogValidationError } from "../lib/blog/document.ts";
import { BlogImageUploadError } from "../lib/blog/images.ts";

const url = new URL("../app/admin/(protected)/blog/actions.ts", import.meta.url).href;
const names = [
  "createBlogPost",
  "duplicateBlogPost",
  "saveBlogDraft",
  "publishBlogPost",
  "scheduleBlogPost",
  "cancelBlogSchedule",
  "retryBlogSchedule",
  "unpublishBlogPost",
  "trashBlogPost",
  "restoreTrashedBlogPost",
  "restoreBlogRevision",
  "saveBlogTerm",
];
const reads = ["getBlogPost", "getBlogRevision", "listBlogPosts", "listBlogRevisions", "listBlogTaxonomy"];
const state = {
  actor: "session-admin",
  calls: [],
  captured: [],
  error: null,
  data: { id: "post-id" },
  sessionError: null,
  BlogError,
  BlogImageUploadError,
};
globalThis.__blogActionTest = state;
const stub = (source) => ({
  shortCircuit: true,
  url: `data:text/javascript,${encodeURIComponent(source)}`,
});
const functions = (exports) =>
  exports
    .map(
      (name) =>
        `export const ${name} = async (...args) => {const s=globalThis.__blogActionTest;s.calls.push({name:${JSON.stringify(name)},args});if(s.error)throw s.error;return s.data;};`,
    )
    .join("\n");
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === url) {
      if (specifier === "@sentry/core")
        return stub(
          "export function captureException(error){globalThis.__blogActionTest.captured.push(error);} export function getActiveSpan(){return undefined;}",
        );
      if (specifier.endsWith("/admin/access"))
        return stub(
          "export async function getActorUserId(){const s=globalThis.__blogActionTest;if(s.sessionError)throw s.sessionError;return s.actor;}",
        );
      if (specifier.endsWith("/blog/mutations"))
        return stub(`export const BlogError=globalThis.__blogActionTest.BlogError;${functions(names)}`);
      if (specifier.endsWith("/blog/queries")) return stub(functions(reads));
      if (specifier.endsWith("/blog/images"))
        return stub(
          `export const BlogImageUploadError=globalThis.__blogActionTest.BlogImageUploadError;${functions(["prepareBlogImageUpload", "completeBlogImageUpload"])}`,
        );
      if (specifier.endsWith("/blog/document")) return next(`${specifier}.ts`, context);
    }
    if (specifier === "@/lib/config/config.ts")
      return next(new URL("../lib/config/config.ts", import.meta.url).href, context);
    if (specifier === "@/lib/admin/index.ts")
      return next(new URL("../lib/admin/index.ts", import.meta.url).href, context);
    return next(specifier, context);
  },
});
const actions = await import(url);

function reset() {
  state.calls = [];
  state.captured = [];
  state.error = null;
  state.sessionError = null;
  state.data = { id: "post-id" };
}
test.after(() => {
  hooks.deregister();
  delete globalThis.__blogActionTest;
});
test("blog action identity always comes from session and unknown operations cannot dispatch", async () => {
  reset();
  assert.equal((await actions.mutateBlogAction("create", { title: "Post" })).ok, true);
  assert.deepEqual(state.calls, [{ name: "createBlogPost", args: ["session-admin", { title: "Post" }] }]);
  for (const operation of ["__proto__", "constructor", "toString", "unknown"]) {
    assert.equal((await actions.mutateBlogAction(operation, {})).code, "VALIDATION");
  }
  assert.equal(state.calls.length, 1);
});
test("known failures are actionable while unexpected database/provider details stay private", async () => {
  reset();
  for (const [error, code] of [
    [new BlogError("CONFLICT", "Reload latest version"), "CONFLICT"],
    [new BlogValidationError("Excerpt is required"), "VALIDATION"],
    [new AuthorizationError("Private role data"), "FORBIDDEN"],
    [new Error("postgres://secret@example.invalid password=hidden"), "TEMPORARY_FAILURE"],
  ]) {
    state.error = error;
    state.captured = [];
    const result = await actions.mutateBlogAction("save", {});
    assert.equal(result.code, code);
    assert.deepEqual(state.captured, code === "TEMPORARY_FAILURE" ? [error] : []);
    assert.doesNotMatch(JSON.stringify(result), /secret|password=hidden|Private role data/);
    if (code === "TEMPORARY_FAILURE") assert.equal(result.message, "[hidden] password=[hidden]");
  }
});
test("blog actions return original unexpected messages with their existing fallbacks", async () => {
  reset();
  for (const [invoke, fallback] of [
    [() => actions.mutateBlogAction("save", {}), "The change could not be saved. Try again."],
    [() => actions.readBlogAction({ operation: "post", postId: "post" }), "The change could not be saved. Try again."],
    [
      () => actions.prepareBlogImageUploadAction({ name: "image.png", size: 100, type: "image/png" }),
      "The image upload failed unexpectedly. Try uploading the image again.",
    ],
  ]) {
    state.error = new Error("Connection timed out");
    const result = await invoke();
    assert.equal(result.ok, false);
    assert.equal(result.message, "Connection timed out");
    assert.equal("stack" in result, false);
    state.error = new Error("");
    assert.equal((await invoke()).message, fallback);
  }
});
test("missing session control flow escapes the action error mapping before any operation", async () => {
  reset();
  state.sessionError = new Error("NEXT_REDIRECT");
  await assert.rejects(actions.mutateBlogAction("publish", {}), /NEXT_REDIRECT/);
  await assert.rejects(actions.readBlogAction({ operation: "post", postId: "post" }), /NEXT_REDIRECT/);
  assert.equal(state.calls.length, 0);
});
test("private preview renders validated content and keeps revision reads bound to post and actor", async () => {
  reset();
  const document = createBlogDocument("Private");
  document.body = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "<script>secret draft</script>" }] }],
  };
  state.data = { document };
  const result = await actions.readBlogAction({
    operation: "preview",
    postId: "post",
    revisionId: "rev",
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.robots, "noindex, nofollow");
  assert.match(result.data.html, /&lt;script&gt;/);
  assert.deepEqual(state.calls, [{ name: "getBlogRevision", args: ["session-admin", "post", "rev"] }]);
  state.data = null;
  assert.equal((await actions.readBlogAction({ operation: "preview", postId: "missing" })).code, "NOT_FOUND");
});
test("read rejects forged identity and image actions bind metadata to the session actor", async () => {
  reset();
  assert.equal(
    (await actions.readBlogAction({ operation: "post", postId: "post", actor: "forged" })).code,
    "VALIDATION",
  );
  assert.equal(state.calls.length, 0);
  const input = { name: "image.png", size: 100, type: "image/png" };
  assert.equal((await actions.prepareBlogImageUploadAction(input)).ok, true);
  const completion = { publicId: "signed-image", token: "signed-token" };
  assert.equal((await actions.completeBlogImageUploadAction(completion)).ok, true);
  assert.deepEqual(state.calls, [
    { name: "prepareBlogImageUpload", args: ["session-admin", input] },
    { name: "completeBlogImageUpload", args: ["session-admin", completion] },
  ]);
  reset();
  state.sessionError = new Error("NEXT_REDIRECT");
  await assert.rejects(actions.prepareBlogImageUploadAction(input), /NEXT_REDIRECT/);
  await assert.rejects(actions.completeBlogImageUploadAction(completion), /NEXT_REDIRECT/);
  assert.equal(state.calls.length, 0);
});

test("image upload actions preserve safe upload diagnostics and do not report draft-save failures", async () => {
  reset();
  for (const [error, code, message] of [
    [
      new BlogImageUploadError("UPLOAD_NOT_CONFIGURED", "Configure Cloudinary for image uploads."),
      "UPLOAD_NOT_CONFIGURED",
      "Configure Cloudinary for image uploads.",
    ],
    [new BlogImageUploadError("UPLOAD_REJECTED", "Choose another image."), "UPLOAD_REJECTED", "Choose another image."],
    [
      new BlogImageUploadError("UPLOAD_FINALIZATION_FAILED", "Image upload could not be recorded. Retry."),
      "UPLOAD_FINALIZATION_FAILED",
      "Image upload could not be recorded. Retry.",
    ],
    [new AuthorizationError("private role data"), "FORBIDDEN"],
    [new BlogValidationError("Use a JPEG, PNG or WebP image."), "VALIDATION", "Use a JPEG, PNG or WebP image."],
    [new Error("cloudinary://key:credential-secret@private"), "UPLOAD_TEMPORARY_FAILURE"],
  ]) {
    state.error = error;
    for (const action of [actions.prepareBlogImageUploadAction, actions.completeBlogImageUploadAction]) {
      const result = await action({});
      assert.equal(result.ok, false);
      assert.equal(result.code, code);
      if (message) assert.equal(result.message, message);
      assert.doesNotMatch(JSON.stringify(result), /credential-secret|private|could not be saved/);
    }
  }
});
