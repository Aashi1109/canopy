import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const state = {};
globalThis.__blogDirectUploadTest = state;
const helperUrl = new URL("../app/admin/(protected)/blog/lib/imageUpload.ts", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === helperUrl && specifier === "../actions.ts") {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`
        export const prepareBlogImageUploadAction = (...args) => globalThis.__blogDirectUploadTest.prepare(...args);
        export const completeBlogImageUploadAction = (...args) => globalThis.__blogDirectUploadTest.complete(...args);
      `)}`,
      };
    }
    return next(specifier, context);
  },
});
const { uploadBlogImageDirect } = await import(helperUrl);
hooks.deregister();
test.after(() => {
  delete globalThis.__blogDirectUploadTest;
});

const image = {
  publicId: "production/blog/test",
  version: 1,
  format: "png",
  width: 640,
  height: 480,
  alt: "",
  caption: "",
};
const completion = {
  publicId: image.publicId,
  timestamp: 123,
  name: "image.png",
  size: 24,
  type: "image/png",
  token: "server-signed-token",
};
const prepared = {
  ok: true,
  data: {
    uploadUrl: "https://api.cloudinary.com/v1_1/test-cloud/image/upload",
    fields: { public_id: image.publicId, timestamp: "123", api_key: "public-key", signature: "signed-fields" },
    completion,
  },
};
const response = () =>
  new Response(JSON.stringify({ public_id: image.publicId, secure_url: "untrusted-provider-url" }));
function png(size = 24) {
  const bytes = new Uint8Array(size);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  return new File([bytes], "image.png", { type: "image/png" });
}
function setup(t) {
  const calls = { prepare: [], complete: [], fetch: [] };
  state.prepare = async (metadata) => {
    calls.prepare.push(metadata);
    return prepared;
  };
  state.complete = async (metadata) => {
    calls.complete.push(metadata);
    return { ok: true, data: image };
  };
  t.mock.method(globalThis, "fetch", async (...args) => {
    calls.fetch.push(args);
    return response();
  });
  return calls;
}

test("a 1.51 MiB image uploads its original bytes directly and finalizes only signed metadata", async (t) => {
  const calls = setup(t);
  const file = png(Math.round(1.51 * 1024 * 1024));
  assert.deepEqual(await uploadBlogImageDirect(file), { ok: true, data: image });
  assert.deepEqual(calls.prepare, [{ name: file.name, size: file.size, type: file.type }]);
  const [url, request] = calls.fetch[0];
  assert.equal(url, prepared.data.uploadUrl);
  assert.equal(request.method, "POST");
  assert.equal(request.credentials, "omit");
  assert.equal(request.redirect, "error");
  assert.equal(request.signal.aborted, false);
  assert.equal(request.body.get("file"), file);
  assert.deepEqual(await request.body.get("file").arrayBuffer(), await file.arrayBuffer());
  assert.deepEqual([...request.body.keys()].sort(), [...Object.keys(prepared.data.fields), "file"].sort());
  for (const [name, value] of Object.entries(prepared.data.fields)) assert.equal(request.body.get(name), value);
  assert.deepEqual(calls.complete, [completion]);
});

test("invalid or mismatched files fail before signing", async (t) => {
  const calls = setup(t);
  for (const file of [
    new File([], "empty.png", { type: "image/png" }),
    png(5 * 1024 * 1024 + 1),
    new File(["script"], "image.svg", { type: "image/svg+xml" }),
    new File(["bad"], "image.png", { type: "image/png" }),
  ]) {
    assert.equal((await uploadBlogImageDirect(file)).ok, false);
  }
  assert.equal(calls.prepare.length, 0);
  assert.equal(calls.fetch.length, 0);
});

for (const [name, provider, expected] of [
  [
    "network failure",
    () => {
      throw new Error("secret provider internals");
    },
    /connection/,
  ],
  ["rejected upload", () => new Response("secret provider internals", { status: 403 }), /rejected/],
  ["rate limit", () => new Response("secret provider internals", { status: 429 }), /busy/],
  ["provider outage", () => new Response("secret provider internals", { status: 503 }), /temporarily unavailable/],
  ["malformed JSON", () => new Response("secret provider internals"), /try uploading again/i],
  ["mismatched upload", () => new Response(JSON.stringify({ public_id: "different" })), /incomplete/],
]) {
  test(`${name} returns a friendly retry message without finalizing`, async (t) => {
    const calls = setup(t);
    t.mock.method(globalThis, "fetch", provider);
    const result = await uploadBlogImageDirect(png());
    assert.equal(result.ok, false);
    assert.match(result.message, expected);
    assert.doesNotMatch(result.message, /secret|internals/);
    assert.equal(calls.complete.length, 0);
  });
}

test("prepare and completion failures remain failures", async (t) => {
  const calls = setup(t);
  state.prepare = async () => ({ ok: false, message: "You do not have permission to upload images." });
  assert.deepEqual(await uploadBlogImageDirect(png()), {
    ok: false,
    message: "You do not have permission to upload images.",
  });
  assert.equal(calls.fetch.length, 0);
  state.prepare = async () => prepared;
  state.complete = async () => ({ ok: false, message: "The upload could not be saved. Try uploading again." });
  assert.deepEqual(await uploadBlogImageDirect(png()), {
    ok: false,
    message: "The upload could not be saved. Try uploading again.",
  });
  state.complete = async () => {
    throw new Error("private server error");
  };
  const result = await uploadBlogImageDirect(png());
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.message, /private server error/);
});

for (const stage of ["prepare", "fetch", "complete"]) {
  test(`120-second deadline bounds ${stage} and prevents late continuation or success`, async (t) => {
    const calls = setup(t);
    let expire;
    t.mock.method(globalThis, "setTimeout", (callback, delay) => {
      assert.equal(delay, 120_000);
      expire = callback;
      return 1;
    });
    t.mock.method(globalThis, "clearTimeout", () => {});
    let release;
    let entered;
    const reachedStage = new Promise((resolve) => {
      entered = resolve;
    });
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    if (stage === "fetch")
      t.mock.method(globalThis, "fetch", (...args) => {
        calls.fetch.push(args);
        entered();
        return pending;
      });
    else {
      state[stage] = (...args) => {
        calls[stage].push(...args);
        entered();
        return pending;
      };
    }
    const result = uploadBlogImageDirect(png());
    await reachedStage;
    expire();
    const failed = await result;
    assert.equal(failed.ok, false);
    assert.match(failed.message, /timed out/);
    if (calls.fetch.length) assert.equal(calls.fetch[0][1].signal.aborted, true);
    release(stage === "prepare" ? prepared : stage === "fetch" ? response() : { ok: true, data: image });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.complete.length, stage === "complete" ? 1 : 0);
    if (stage === "prepare") assert.equal(calls.fetch.length, 0);
    assert.deepEqual(await result, failed);
  });
}
