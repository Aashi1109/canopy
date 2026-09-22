import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { v2 as cloudinary } from "cloudinary";
import { AuthorizationError } from "../lib/admin/index.ts";
import { createBlogDocument, renderBlogDocument } from "../lib/blog/document.ts";

const sourceUrl = new URL("../lib/blog/images.ts", import.meta.url).href;
const fixture = { AuthorizationError, utils: cloudinary.utils };
globalThis.__blogImageTest = fixture;
const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === sourceUrl) {
      const modules = {
        "../../db/index.ts": `export const db = { async transaction(callback) {
          const f = globalThis.__blogImageTest;
          f.events.push("transaction");
          if (++f.transactions === f.failTransactionAt) throw new Error("postgres://secret password=private");
          const result = await callback({}); f.events.push("commit"); return result;
        } };`,
        "../admin/adminMutations.ts": `
          const f = globalThis.__blogImageTest;
          export async function requireTransactionPermission(_transaction, actor, resource, action) {
            f.events.push(["permission", actor, resource, action]);
            if (++f.permissions === f.denyAt) throw new f.AuthorizationError("Missing permission: blog.edit");
          }
          export async function writeAudit(...args) {
            if (f.failAudit) throw new Error("private audit failure");
            f.events.push(["audit", ...args.slice(1)]);
          }`,
        cloudinary: `const f = globalThis.__blogImageTest;
          export const v2 = { utils: f.utils, api: { async resource(publicId, options) {
            f.events.push("resource"); f.lookups.push({publicId, options});
            throw new Error("Completion must not call the Cloudinary Admin API");
          } } };`,
      };
      if (modules[specifier]) return { shortCircuit: true, url: moduleUrl(modules[specifier]) };
    }
    return nextResolve(specifier, context);
  },
});
const { prepareBlogImageUpload, completeBlogImageUpload, BlogImageUploadError } = await import(sourceUrl);
hooks.deregister();
const metadata = (name = "original.png") => ({ name, size: 128, type: "image/png" });
const uploadResponse = (completion, overrides = {}) => ({
  public_id: completion.publicId,
  version: 1234,
  format: "png",
  width: 1,
  height: 1,
  bytes: 128,
  resource_type: "image",
  type: "upload",
  secure_url: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/v1234/${completion.publicId}.png`,
  ...overrides,
});
const uploadPayload = (completion, overrides = {}) => ({
  ...completion,
  uploaded: uploadResponse(completion, overrides),
});
const savedEnv = Object.fromEntries(
  ["NODE_ENV", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].map((key) => [
    key,
    process.env[key],
  ]),
);
test.beforeEach(() => {
  Object.assign(fixture, {
    events: [],
    lookups: [],
    transactions: 0,
    permissions: 0,
    denyAt: 0,
    failTransactionAt: 0,
    failAudit: false,
  });
  process.env.NODE_ENV = "development";
  process.env.CLOUDINARY_CLOUD_NAME = "blog-cloud";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
});
test.after(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete globalThis.__blogImageTest;
});

test("preparation signs immutable environment-scoped upload fields without transferring bytes", async () => {
  for (const environment of ["production", "development", "test"]) {
    process.env.NODE_ENV = environment;
    const result = await prepareBlogImageUpload("admin", metadata());
    const { api_key, signature, ...signed } = result.fields;
    assert.equal(result.uploadUrl, "https://api.cloudinary.com/v1_1/blog-cloud/image/upload");
    assert.equal(api_key, "test-key");
    assert.equal(signature, cloudinary.utils.api_sign_request(signed, "test-secret"));
    assert.equal(signed.asset_folder, `Canopy/${environment}/blog`);
    assert.match(signed.public_id, new RegExp(`^Canopy/${environment}/blog/[0-9a-f-]{36}$`));
    assert.equal(signed.overwrite, "false");
    assert.equal(signed.type, "upload");
    assert.equal(signed.allowed_formats, "jpg,jpeg,png,webp");
    assert.equal(result.completion.publicId, signed.public_id);
    assert.equal(String(result.completion.timestamp), signed.timestamp);
    assert.deepEqual(
      { ...result.completion, publicId: undefined, timestamp: undefined, token: undefined },
      { ...metadata(), publicId: undefined, timestamp: undefined, token: undefined },
    );
    assert.doesNotMatch(JSON.stringify(result), /test-secret|api_secret/);
  }
  const first = await prepareBlogImageUpload("admin", metadata());
  const second = await prepareBlogImageUpload("admin", metadata());
  assert.notEqual(first.completion.publicId, second.completion.publicId);
  assert.equal(fixture.lookups.length, 0);
});

test("preparation rejects invalid metadata before signing and requires edit permission", async () => {
  for (const input of [
    null,
    [],
    {},
    { ...metadata(), extra: true },
    { ...metadata(), size: 0 },
    { ...metadata(), size: 5 * 1024 * 1024 + 1 },
    { ...metadata(), size: 1.5 },
    { ...metadata(), type: "image/svg+xml" },
    { ...metadata(), name: "" },
    { ...metadata(), name: "a".repeat(4097) },
    { ...metadata(), name: "\ud800" },
  ]) {
    await assert.rejects(() => prepareBlogImageUpload("admin", input));
  }
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    await prepareBlogImageUpload("admin", { ...metadata(), type, size: 5 * 1024 * 1024 });
  }
  fixture.denyAt = fixture.permissions + 1;
  await assert.rejects(() => prepareBlogImageUpload("reader", metadata()), AuthorizationError);
  assert.equal(fixture.lookups.length, 0);
});

test("completion accepts supplied upload metadata without a resource lookup and authorizes and audits once", async () => {
  const { completion } = await prepareBlogImageUpload("admin", metadata());
  fixture.events = [];
  const transactionsBefore = fixture.transactions;
  const image = await completeBlogImageUpload("admin", uploadPayload(completion, { width: 640, height: 480 }));
  assert.deepEqual(image, {
    publicId: completion.publicId,
    version: 1234,
    format: "png",
    width: 640,
    height: 480,
    alt: "original",
    caption: "",
  });
  assert.equal(fixture.lookups.length, 0);
  assert.equal(fixture.transactions - transactionsBefore, 1);
  assert.deepEqual(fixture.events, [
    "transaction",
    ["permission", "admin", "blog", "edit"],
    [
      "audit",
      "admin",
      "blog.image.upload",
      "blog-image",
      completion.publicId,
      {
        publicId: completion.publicId,
        version: 1234,
        format: "png",
        width: 640,
        height: 480,
      },
    ],
    "commit",
  ]);
  assert.doesNotMatch(JSON.stringify(fixture.events), /test-secret|test-key|original\.png/);
});

test("completion rejects ticket tampering, other users, unknown fields, and invalid tokens before audit", async () => {
  const { completion } = await prepareBlogImageUpload("admin", metadata());
  for (const changed of [
    { publicId: completion.publicId.replace(/.$/, "z") },
    { timestamp: completion.timestamp - 1 },
    { name: "other.png" },
    { size: 129 },
    { type: "image/jpeg" },
    { token: "0".repeat(64) },
    { token: "short" },
    { width: 1 },
    { secure_url: "https://evil.example/image.png" },
    { secure_url: undefined },
  ]) {
    await assert.rejects(() => completeBlogImageUpload("admin", { ...uploadPayload(completion), ...changed }));
  }
  await assert.rejects(() => completeBlogImageUpload("other-user", uploadPayload(completion)));
  assert.equal(fixture.lookups.length, 0);
});

test("completion rejects expired, future, and other-environment tickets", async (t) => {
  const now = Date.now();
  const clock = t.mock.method(Date, "now", () => now);
  const { completion } = await prepareBlogImageUpload("admin", metadata());
  clock.mock.mockImplementation(() => now + 601_000);
  await assert.rejects(() => completeBlogImageUpload("admin", uploadPayload(completion)), /expired|restart|again/i);
  clock.mock.mockImplementation(() => now - 1_000);
  await assert.rejects(() => completeBlogImageUpload("admin", uploadPayload(completion)));
  clock.mock.mockImplementation(() => now);
  process.env.NODE_ENV = "production";
  await assert.rejects(() => completeBlogImageUpload("admin", uploadPayload(completion)));
  assert.equal(fixture.lookups.length, 0);
});

test("supplied upload bytes and image metadata are validated before audit", async () => {
  const { completion } = await prepareBlogImageUpload("admin", metadata());
  for (const response of [
    { bytes: 0 },
    { bytes: 5 * 1024 * 1024 + 1 },
    { bytes: 1.5 },
    { bytes: undefined },
    { bytes: "128" },
    { public_id: "different" },
    { format: "svg" },
    { format: undefined },
    { version: 0 },
    { version: 1.5 },
    { version: Number.MAX_SAFE_INTEGER + 1 },
    { width: -1 },
    { width: "1" },
    { height: 30001 },
    { height: undefined },
    { resource_type: "raw" },
    { type: "private" },
    { secure_url: "https://evil.example/image.png" },
    { secure_url: uploadResponse(completion).secure_url.replace("blog-cloud", "other-cloud") },
    { secure_url: uploadResponse(completion).secure_url.replace("/v1234/", "/v9999/") },
    { secure_url: uploadResponse(completion).secure_url + "?download=true" },
    { secure_url: undefined },
  ]) {
    await assert.rejects(
      () => completeBlogImageUpload("admin", uploadPayload(completion, response)),
      BlogImageUploadError,
    );
  }
  for (const uploaded of [
    undefined,
    null,
    [],
    "uploaded",
    1,
    {},
    new Date(),
    { ...uploadResponse(completion), extra: true },
  ]) {
    await assert.rejects(
      () => completeBlogImageUpload("admin", { ...completion, uploaded }),
      (error) => error.code === "UPLOAD_INVALID_RESPONSE",
    );
  }
  assert.equal(
    fixture.events.some((event) => Array.isArray(event) && event[0] === "audit"),
    false,
  );
  assert.equal(fixture.lookups.length, 0);
  assert.equal(
    (await completeBlogImageUpload("admin", uploadPayload(completion, { bytes: 5 * 1024 * 1024 }))).alt,
    "original",
  );
});

test("default alt text preserves Unicode, length bounds, and HTML escaping", async () => {
  for (const [name, expected] of [
    ["  Local-PDF__guide.PNG", "Local PDF guide"],
    ["Résumé_日本語-📷.webp", "Résumé 日本語 📷"],
    ["report.v2-final.jpeg", "report.v2 final"],
    ["no-extension", "no extension"],
    ["line\nwith\tspaces\u0000and\u007fcontrols.png", "line with spaces and controls"],
    ["a".repeat(499) + "📷.png", "a".repeat(499)],
    ["📷".repeat(251) + ".png", "📷".repeat(250)],
  ]) {
    const { completion } = await prepareBlogImageUpload("admin", metadata(name));
    const image = await completeBlogImageUpload("admin", uploadPayload(completion));
    assert.equal(image.alt, expected);
    assert.ok(image.alt.length <= 500 && image.alt.isWellFormed());
  }
  const { completion } = await prepareBlogImageUpload("admin", metadata('\"><img src=x onerror=alert(1)>.png'));
  const image = await completeBlogImageUpload("admin", uploadPayload(completion));
  const document = createBlogDocument("Image filename");
  document.body.content = [{ type: "image", attrs: image }];
  const { html } = renderBlogDocument(document, { cloudName: "blog-cloud" });
  assert.match(html, /alt="&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;"/);
  assert.equal((html.match(/<img /g) ?? []).length, 1);
});

test("revoked permissions and audit failures never return successful assets", async () => {
  const { completion } = await prepareBlogImageUpload("admin", metadata());
  fixture.events = [];
  fixture.denyAt = fixture.permissions + 1;
  await assert.rejects(() => completeBlogImageUpload("admin", uploadPayload(completion)), AuthorizationError);
  assert.deepEqual(fixture.events, ["transaction", ["permission", "admin", "blog", "edit"]]);
  fixture.denyAt = 0;
  fixture.failAudit = true;
  fixture.events = [];
  await assert.rejects(
    () => completeBlogImageUpload("admin", uploadPayload(completion)),
    (error) => error.code === "UPLOAD_FINALIZATION_FAILED" && !/private/.test(error.message),
  );
  assert.deepEqual(fixture.events, ["transaction", ["permission", "admin", "blog", "edit"]]);
  assert.equal(fixture.lookups.length, 0);
});

test("credentials and database failures remain sanitized and configuration is read at runtime", async () => {
  const { completion: oldCompletion } = await prepareBlogImageUpload("admin", metadata());
  delete process.env.CLOUDINARY_API_SECRET;
  for (const operation of [
    () => prepareBlogImageUpload("admin", metadata()),
    () => completeBlogImageUpload("admin", uploadPayload(oldCompletion)),
  ]) {
    await assert.rejects(operation, (error) => error.code === "UPLOAD_NOT_CONFIGURED");
  }
  process.env.CLOUDINARY_API_SECRET = "changed-secret";
  await assert.rejects(
    () => completeBlogImageUpload("admin", uploadPayload(oldCompletion)),
    /authorization is invalid/i,
  );
  const { completion } = await prepareBlogImageUpload("admin", metadata());
  await completeBlogImageUpload("admin", uploadPayload(completion));
  fixture.failTransactionAt = fixture.transactions + 1;
  await assert.rejects(
    () => prepareBlogImageUpload("admin", metadata()),
    (error) => error.code === "UPLOAD_TEMPORARY_FAILURE" && !/private/.test(error.message),
  );
  fixture.failTransactionAt = fixture.transactions + 1;
  await assert.rejects(
    () => completeBlogImageUpload("admin", uploadPayload(completion)),
    (error) => error.code === "UPLOAD_FINALIZATION_FAILED" && !/private/.test(error.message),
  );
  assert.equal(fixture.lookups.length, 0);
});
