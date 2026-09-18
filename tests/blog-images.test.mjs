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
            if (f.providerError) throw f.providerError;
            return {public_id: publicId, version: 1234, resource_type: "image", type: "upload",
              format: "png", width: 1, height: 1, bytes: 128,
              secure_url: "https://res.cloudinary.com/" + options.cloud_name + "/image/upload/v1234/" + publicId + ".png",
              ...f.response};
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
    providerError: null,
    response: null,
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

test("completion fetches authoritative provider data, rechecks permission, and audits after verification", async () => {
  const { completion } = await prepareBlogImageUpload("admin", metadata());
  fixture.events = [];
  const image = await completeBlogImageUpload("admin", completion);
  assert.deepEqual(
    { ...image, publicId: "id" },
    { publicId: "id", version: 1234, format: "png", width: 1, height: 1, alt: "original", caption: "" },
  );
  assert.deepEqual(fixture.lookups[0], {
    publicId: completion.publicId,
    options: {
      cloud_name: "blog-cloud",
      api_key: "test-key",
      api_secret: "test-secret",
      resource_type: "image",
      type: "upload",
      timeout: 30000,
    },
  });
  assert.deepEqual(fixture.events.slice(0, 4), [
    "transaction",
    ["permission", "admin", "blog", "edit"],
    "commit",
    "resource",
  ]);
  assert.equal(fixture.events.filter((item) => Array.isArray(item) && item[0] === "permission").length, 2);
  const audit = fixture.events.find((item) => Array.isArray(item) && item[0] === "audit");
  assert.deepEqual(audit.slice(1, 5), ["admin", "blog.image.upload", "blog-image", image.publicId]);
  assert.doesNotMatch(JSON.stringify(audit), /test-secret|test-key|original\.png/);
});

test("completion rejects metadata tampering, other users, unknown fields, and invalid tokens before provider access", async () => {
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
    await assert.rejects(() => completeBlogImageUpload("admin", { ...completion, ...changed }));
  }
  await assert.rejects(() => completeBlogImageUpload("other-user", completion));
  assert.equal(fixture.lookups.length, 0);
});

test("completion rejects expired, future, and other-environment tickets", async (t) => {
  const now = Date.now();
  const clock = t.mock.method(Date, "now", () => now);
  const { completion } = await prepareBlogImageUpload("admin", metadata());
  clock.mock.mockImplementation(() => now + 601_000);
  await assert.rejects(() => completeBlogImageUpload("admin", completion), /expired|restart|again/i);
  clock.mock.mockImplementation(() => now - 1_000);
  await assert.rejects(() => completeBlogImageUpload("admin", completion));
  clock.mock.mockImplementation(() => now);
  process.env.NODE_ENV = "production";
  await assert.rejects(() => completeBlogImageUpload("admin", completion));
  assert.equal(fixture.lookups.length, 0);
});

test("provider bytes and image metadata are validated before audit", async () => {
  const { completion } = await prepareBlogImageUpload("admin", metadata());
  for (const response of [
    { bytes: 0 },
    { bytes: 5 * 1024 * 1024 + 1 },
    { bytes: 1.5 },
    { bytes: undefined },
    { public_id: "different" },
    { format: "svg" },
    { version: 0 },
    { width: -1 },
    { height: 30001 },
    { resource_type: "raw" },
    { type: "private" },
    { secure_url: "https://evil.example/image.png" },
    { secure_url: undefined },
  ]) {
    fixture.response = response;
    await assert.rejects(() => completeBlogImageUpload("admin", completion));
  }
  assert.equal(
    fixture.events.some((event) => Array.isArray(event) && event[0] === "audit"),
    false,
  );
  fixture.response = { bytes: 5 * 1024 * 1024 };
  assert.equal((await completeBlogImageUpload("admin", completion)).alt, "original");
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
    const image = await completeBlogImageUpload("admin", completion);
    assert.equal(image.alt, expected);
    assert.ok(image.alt.length <= 500 && image.alt.isWellFormed());
  }
  const { completion } = await prepareBlogImageUpload("admin", metadata('\"><img src=x onerror=alert(1)>.png'));
  const image = await completeBlogImageUpload("admin", completion);
  const document = createBlogDocument("Image filename");
  document.body.content = [{ type: "image", attrs: image }];
  const { html } = renderBlogDocument(document, { cloudName: "blog-cloud" });
  assert.match(html, /alt="&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;"/);
  assert.equal((html.match(/<img /g) ?? []).length, 1);
});

test("revoked permissions and audit failures never return successful assets", async () => {
  const { completion } = await prepareBlogImageUpload("admin", metadata());
  fixture.denyAt = fixture.permissions + 1;
  await assert.rejects(() => completeBlogImageUpload("admin", completion), AuthorizationError);
  assert.equal(fixture.lookups.length, 0);
  fixture.denyAt = fixture.permissions + 2;
  await assert.rejects(() => completeBlogImageUpload("admin", completion), AuthorizationError);
  assert.equal(fixture.lookups.length, 1);
  fixture.denyAt = 0;
  fixture.failAudit = true;
  await assert.rejects(
    () => completeBlogImageUpload("admin", completion),
    (error) => error.code === "UPLOAD_FINALIZATION_FAILED",
  );
});

test("credentials and database failures remain sanitized and configuration is read at runtime", async () => {
  delete process.env.CLOUDINARY_API_SECRET;
  await assert.rejects(
    () => prepareBlogImageUpload("admin", metadata()),
    (error) => error.code === "UPLOAD_NOT_CONFIGURED",
  );
  process.env.CLOUDINARY_API_SECRET = "changed-secret";
  const { completion } = await prepareBlogImageUpload("admin", metadata());
  await completeBlogImageUpload("admin", completion);
  assert.equal(fixture.lookups[0].options.api_secret, "changed-secret");
  fixture.failTransactionAt = fixture.transactions + 1;
  await assert.rejects(
    () => completeBlogImageUpload("admin", completion),
    (error) => error.code === "UPLOAD_TEMPORARY_FAILURE" && !/private/.test(error.message),
  );
  fixture.failTransactionAt = fixture.transactions + 2;
  await assert.rejects(
    () => completeBlogImageUpload("admin", completion),
    (error) => error.code === "UPLOAD_FINALIZATION_FAILED" && !/private/.test(error.message),
  );
});

test("provider failures expose safe codes and recovery messages only", async () => {
  const { completion } = await prepareBlogImageUpload("admin", metadata());
  for (const [failure, code, message] of [
    [{ http_code: 400 }, "UPLOAD_REJECTED", /smaller|rejected/i],
    [{ http_code: 413 }, "UPLOAD_REJECTED", /smaller|rejected/i],
    [{ http_code: 401 }, "UPLOAD_CONFIGURATION_ERROR", /credentials|permissions/i],
    [{ http_code: 403 }, "UPLOAD_CONFIGURATION_ERROR", /credentials|permissions/i],
    [{ http_code: 404 }, "UPLOAD_REJECTED", /upload|again/i],
    [{ http_code: 429 }, "UPLOAD_TEMPORARY_FAILURE", /rate.limit|wait/i],
    [{ http_code: 499 }, "UPLOAD_TEMPORARY_FAILURE", /timed out/i],
    [{ code: "ECONNRESET" }, "UPLOAD_TEMPORARY_FAILURE", /connection|firewall/i],
    [{ code: "ENOTFOUND" }, "UPLOAD_TEMPORARY_FAILURE", /DNS/i],
    [{ code: "CERT_HAS_EXPIRED" }, "UPLOAD_TEMPORARY_FAILURE", /certificate/i],
    [{ code: "private-unknown" }, "UPLOAD_TEMPORARY_FAILURE", /retry/i],
  ]) {
    fixture.providerError = { error: { ...failure, message: "private-provider-secret", stack: "private-stack" } };
    await assert.rejects(
      () => completeBlogImageUpload("admin", completion),
      (error) => {
        assert.ok(error instanceof BlogImageUploadError);
        assert.equal(error.code, code);
        assert.match(error.message, message);
        assert.doesNotMatch(error.message, /private|test-secret|test-key/);
        return true;
      },
    );
  }
});
