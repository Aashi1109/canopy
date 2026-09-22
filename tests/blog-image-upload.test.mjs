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
    if (context.parentURL === helperUrl && specifier === "@sentry/nextjs") {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`
          export const captureException = (error) => globalThis.__blogDirectUploadTest.errors.push(error);
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
  alt: "image",
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
const uploaded = {
  public_id: image.publicId,
  version: image.version,
  format: image.format,
  width: image.width,
  height: image.height,
  bytes: 128,
  resource_type: "image",
  type: "upload",
  secure_url: `https://res.cloudinary.com/test-cloud/image/upload/v${image.version}/${image.publicId}.png`,
};
const response = () =>
  new Response(JSON.stringify({ ...uploaded, asset_id: "provider-extra-field", signature: "provider-signature" }));
function png(size = 24) {
  const bytes = new Uint8Array(size);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  return new File([bytes], "image.png", { type: "image/png" });
}
function setup(t) {
  const calls = { prepare: [], complete: [], fetch: [] };
  state.errors = [];
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

test("a 1.51 MiB image uploads directly and forwards only image metadata with its completion ticket", async (t) => {
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
  assert.deepEqual(calls.complete, [{ ...completion, uploaded }]);
});

test("completion waits for a successful upload response", async (t) => {
  const calls = setup(t);
  let release;
  let entered;
  const uploading = new Promise((resolve) => {
    entered = resolve;
  });
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  t.mock.method(globalThis, "fetch", () => {
    entered();
    return pending;
  });
  const result = uploadBlogImageDirect(png());
  await uploading;
  assert.equal(calls.complete.length, 0);
  release(response());
  assert.deepEqual(await result, { ok: true, data: image });
  assert.deepEqual(calls.complete, [{ ...completion, uploaded }]);
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

const invalidMetadata = [
  ["null response", null],
  ["array response", [uploaded]],
  ["empty response", {}],
  ...Object.keys(uploaded).map((field) => [
    `missing ${field}`,
    Object.fromEntries(Object.entries(uploaded).filter(([key]) => key !== field)),
  ]),
  ...[
    ["public_id", "different/image"],
    ["version", 0],
    ["version", 1.5],
    ["version", Number.MAX_SAFE_INTEGER + 1],
    ["version", "1"],
    ["format", "svg"],
    ["width", 0],
    ["width", 30_001],
    ["width", 1.5],
    ["width", "640"],
    ["height", 0],
    ["height", 30_001],
    ["height", 1.5],
    ["height", "480"],
    ["bytes", 0],
    ["bytes", 5 * 1024 * 1024 + 1],
    ["bytes", 1.5],
    ["bytes", "128"],
    ["resource_type", "video"],
    ["type", "private"],
    ["secure_url", uploaded.secure_url.replace("https:", "http:")],
    ["secure_url", uploaded.secure_url.replace("test-cloud", "other-cloud")],
    ["secure_url", uploaded.secure_url.replace("res.cloudinary.com", "res.cloudinary.com.invalid")],
    ["secure_url", uploaded.secure_url.replace("/v1/", "/v2/")],
    ["secure_url", uploaded.secure_url.replace("/upload/", "/upload/c_scale,w_20/")],
    ["secure_url", `${uploaded.secure_url}?download=true`],
    ["secure_url", `${uploaded.secure_url}#fragment`],
  ].map(([field, value]) => [`invalid ${field}: ${JSON.stringify(value)}`, { ...uploaded, [field]: value }]),
];

for (const [name, metadata] of invalidMetadata) {
  test(`${name} fails locally before background completion`, async (t) => {
    const calls = setup(t);
    t.mock.method(globalThis, "fetch", (...args) => {
      calls.fetch.push(args);
      return new Response(JSON.stringify(metadata));
    });
    const result = await uploadBlogImageDirect(png());
    assert.equal(result.ok, false);
    assert.match(result.message, /incomplete|invalid|try uploading again/i);
    assert.equal(calls.fetch.length, 1);
    assert.equal(calls.complete.length, 0);
    assert.equal(state.errors.length, 0);
  });
}

for (const metadata of [
  ...["png", "jpg", "jpeg", "webp"].map((format) => ({ ...uploaded, format })),
  { ...uploaded, version: Number.MAX_SAFE_INTEGER, width: 30_000, height: 30_000, bytes: 5 * 1024 * 1024 },
  { ...uploaded, width: 1, height: 1, bytes: 1 },
]) {
  const providerMetadata = {
    ...metadata,
    secure_url: `https://res.cloudinary.com/test-cloud/image/upload/v${metadata.version}/${metadata.public_id}.${metadata.format}`,
  };
  test(`valid ${metadata.format} metadata accepts ${metadata.width}×${metadata.height} and ${metadata.bytes} bytes`, async (t) => {
    const calls = setup(t);
    t.mock.method(globalThis, "fetch", () => new Response(JSON.stringify(providerMetadata)));
    assert.deepEqual(await uploadBlogImageDirect(png()), {
      ok: true,
      data: {
        ...image,
        version: metadata.version,
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
      },
    });
    assert.deepEqual(calls.complete, [{ ...completion, uploaded: providerMetadata }]);
    assert.equal(state.errors.length, 0);
  });
}

test("prepare failure remains a failure and does not upload or complete", async (t) => {
  const calls = setup(t);
  state.prepare = async () => ({ ok: false, message: "You do not have permission to upload images." });
  assert.deepEqual(await uploadBlogImageDirect(png()), {
    ok: false,
    message: "You do not have permission to upload images.",
  });
  assert.equal(calls.fetch.length, 0);
  assert.equal(calls.complete.length, 0);
  assert.equal(state.errors.length, 0);
});

for (const [name, complete] of [
  ["failed", async () => ({ ok: false, message: "private server failure" })],
  [
    "rejected",
    async () => {
      throw new Error("private server error");
    },
  ],
]) {
  test(`${name} background completion preserves the uploaded image and reports one generic error`, async (t) => {
    const calls = setup(t);
    state.complete = (...args) => {
      calls.complete.push(...args);
      return complete();
    };
    assert.deepEqual(await uploadBlogImageDirect(png()), { ok: true, data: image });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls.complete, [{ ...completion, uploaded }]);
    assert.equal(state.errors.length, 1);
    assert.ok(state.errors[0] instanceof Error);
    assert.doesNotMatch(state.errors[0].message, /private|server failure|server error/);
  });
}

test("success uses verified provider metadata without a response signature or completion result", async (t) => {
  const calls = setup(t);
  t.mock.method(globalThis, "fetch", (...args) => {
    calls.fetch.push(args);
    return new Response(JSON.stringify(uploaded));
  });
  state.complete = async (metadata) => {
    calls.complete.push(metadata);
    return { ok: true, data: { ...image, alt: "completion result must not replace the image", width: 1 } };
  };
  assert.deepEqual(await uploadBlogImageDirect(png()), { ok: true, data: image });
  assert.equal(calls.fetch.length, 1);
  assert.deepEqual(calls.complete, [{ ...completion, uploaded }]);
  assert.equal(state.errors.length, 0);
});

for (const [name, alt] of [
  ["  article_header--final.png", "article header final"],
  ["notes.2026.JPEG", "notes.2026"],
  ["line\tbreak\u0000image.webp", "line break image"],
]) {
  test(`image alt text is normalized from the signed completion name ${JSON.stringify(name)}`, async (t) => {
    setup(t);
    state.prepare = async () => ({ ...prepared, data: { ...prepared.data, completion: { ...completion, name } } });
    assert.deepEqual(await uploadBlogImageDirect(png()), { ok: true, data: { ...image, alt } });
  });
}

for (const stage of ["prepare", "fetch"]) {
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
    release(stage === "prepare" ? prepared : response());
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.complete.length, 0);
    if (stage === "prepare") assert.equal(calls.fetch.length, 0);
    assert.deepEqual(await result, failed);
  });
}

for (const rejects of [false, true]) {
  test(`pending completion returns success, clears the deadline, and preserves success after a late ${rejects ? "rejection" : "failure"}`, async (t) => {
    const calls = setup(t);
    const timer = {};
    const cleared = [];
    t.mock.method(globalThis, "setTimeout", (_callback, delay) => {
      assert.equal(delay, 120_000);
      return timer;
    });
    t.mock.method(globalThis, "clearTimeout", (handle) => cleared.push(handle));
    let entered;
    const reachedCompletion = new Promise((resolve) => {
      entered = resolve;
    });
    let release;
    const pending = new Promise((resolve, reject) => {
      release = rejects ? reject : resolve;
    });
    state.complete = (metadata) => {
      calls.complete.push(metadata);
      entered();
      return pending;
    };
    const result = uploadBlogImageDirect(png());
    await reachedCompletion;
    const returned = await Promise.race([
      result,
      new Promise((resolve) => setImmediate(() => resolve("still waiting for completion"))),
    ]);
    assert.deepEqual(returned, { ok: true, data: image });
    assert.deepEqual(cleared, [timer]);
    assert.equal(state.errors.length, 0);
    release(rejects ? new Error("private late rejection") : { ok: false, message: "private late failure" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(await result, returned);
    assert.equal(calls.fetch[0][1].signal.aborted, false);
    assert.deepEqual(calls.complete, [{ ...completion, uploaded }]);
    assert.equal(state.errors.length, 1);
    assert.ok(state.errors[0] instanceof Error);
    assert.doesNotMatch(state.errors[0].message, /private|late rejection|late failure/);
    assert.deepEqual(cleared, [timer]);
  });
}
