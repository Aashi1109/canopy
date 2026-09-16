import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { AuthorizationError } from "@smarttools/control-plane";

const sourceUrl = new URL("../lib/blog/images.ts", import.meta.url).href;
const fixture = { events: [], uploads: [], denyAt: 0, permissionChecks: 0, response: null, failUpload: false, uploadError: null, failAudit: false, transactionCalls: 0, failTransactionAt: 0, AuthorizationError };
globalThis.__blogImageTest = fixture;
const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === sourceUrl) {
      if (specifier === "@smarttools/database") return { shortCircuit: true, url: moduleUrl(`
        export const db = { async transaction(callback) {
          const fixture = globalThis.__blogImageTest;
          fixture.events.push("transaction");
          if (++fixture.transactionCalls === fixture.failTransactionAt) throw new Error("postgres://private password=secret");
          const result = await callback({});
          fixture.events.push("commit");
          return result;
        } };
      `) };
      if (specifier === "../admin/adminMutations.ts") return { shortCircuit: true, url: moduleUrl(`
        const fixture = globalThis.__blogImageTest;
        export async function requireTransactionPermission(_transaction, actor, resource, action) {
          fixture.events.push(["permission", actor, resource, action]);
          if (++fixture.permissionChecks === fixture.denyAt) throw new fixture.AuthorizationError("Missing permission: blog.edit");
        }
        export async function writeAudit(_transaction, actor, action, targetType, targetId, metadata) {
          if (fixture.failAudit) throw new Error("Audit unavailable");
          fixture.events.push(["audit", actor, action, targetType, targetId, metadata]);
        }
      `) };
      if (specifier === "cloudinary") return { shortCircuit: true, url: moduleUrl(`
        const fixture = globalThis.__blogImageTest;
        export const v2 = { uploader: { async upload(source, options) {
          fixture.events.push("upload"); fixture.uploads.push({ source, options });
          if (fixture.uploadError) throw fixture.uploadError;
          if (fixture.failUpload) throw new Error("credential-secret-provider-error");
          return { public_id: options.public_id, version: 1234,
            resource_type: "image", type: "upload", format: "png", width: 1, height: 1,
            secure_url: "https://res.cloudinary.com/" + options.cloud_name + "/image/upload/v1234/" + options.public_id + ".png", ...fixture.response };
        } } };
      `) };
    }
    return nextResolve(specifier, context);
  },
});
const { uploadBlogImage, BlogImageUploadError } = await import(sourceUrl);
hooks.deregister();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKo8AAAAASUVORK5CYII=", "base64");
const file = () => new File([png], "original.png", {type:"image/png"});
const savedEnv = Object.fromEntries(["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].map((key) => [key, process.env[key]]));
test.beforeEach(() => {
  Object.assign(fixture, {events:[], uploads:[], denyAt:0, permissionChecks:0, response:null,failUpload:false,uploadError:null,failAudit:false,transactionCalls:0,failTransactionAt:0});
  process.env.CLOUDINARY_CLOUD_NAME = "blog-cloud";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
});
test.after(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  delete globalThis.__blogImageTest;
});

test("uploads immutable versioned assets with permission checks and audit attribution", async () => {
  const first = await uploadBlogImage("admin-1", file());
  const second = await uploadBlogImage("admin-1", file());
  assert.match(first.publicId, /^smarttools\/blog\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first.publicId, second.publicId);
  assert.deepEqual({...first,publicId:"id"}, {publicId:"id",version:1234,format:"png",width:1,height:1,alt:"",caption:""});
  const { options } = fixture.uploads[0];
  assert.equal(options.overwrite, false);
  assert.equal(options.resource_type, "image");
  assert.equal(options.cloud_name, "blog-cloud");
  assert.equal(options.timeout, undefined, "use the upload SDK's standard timeout rather than a shortened override");
  assert.match(fixture.uploads[0].source, /^data:image\/png;base64,/);
  assert.deepEqual(fixture.events[1], ["permission","admin-1","blog","edit"]);
  assert.equal(fixture.events[3], "upload");
  const audit = fixture.events.find((event) => Array.isArray(event) && event[0] === "audit");
  assert.equal(audit[1], "admin-1");
  assert.equal(audit[2], "blog.image.upload");
  assert.equal(audit[4], first.publicId);
  assert.doesNotMatch(JSON.stringify(audit), /test-secret|test-key|original\.png/);
});

test("forbidden uploads never contact Cloudinary", async () => {
  fixture.denyAt = 1;
  await assert.rejects(() => uploadBlogImage("reader", file()), /permission/);
  assert.equal(fixture.uploads.length, 0);
});

test("revoked permissions and failed audit do not return a successful asset", async () => {
  fixture.denyAt = 2;
  await assert.rejects(() => uploadBlogImage("admin", file()), /permission/);
  assert.equal(fixture.uploads.length, 1);
  assert.equal(fixture.events.some((event) => Array.isArray(event) && event[0] === "audit"), false);
  fixture.denyAt = 0; fixture.failAudit = true;
  await assert.rejects(() => uploadBlogImage("admin", file()), error => error.code === "UPLOAD_FINALIZATION_FAILED" && /recorded/i.test(error.message) && !error.message.includes("Audit unavailable"));
});

test("file size, MIME type and raster signature are validated before network upload", async () => {
  for (const input of [null, {}, new File([], "empty.png", {type:"image/png"}), new File([new Uint8Array(5 * 1024 * 1024 + 1)],"large.png",{type:"image/png"}), new File(["<svg></svg>"],"bad.png",{type:"image/png"}), new File([png],"bad.jpg",{type:"image/jpeg"}),new File([png],"bad.svg",{type:"image/svg+xml"}),new File(["RIFF1234WEBP"],"bad.webp",{type:"image/webp"})]) {
    await assert.rejects(() => uploadBlogImage("admin", input));
  }
  assert.equal(fixture.uploads.length, 0);
});

test("runtime credentials are read on each upload and missing config is actionable", async () => {
  delete process.env.CLOUDINARY_API_SECRET;
  await assert.rejects(() => uploadBlogImage("admin", file()), error => error instanceof BlogImageUploadError && error.code === "UPLOAD_NOT_CONFIGURED" && /Cloudinary/.test(error.message));
  assert.equal(fixture.uploads.length, 0);
  process.env.CLOUDINARY_API_SECRET = "changed-secret";
  await uploadBlogImage("admin", file());
  assert.equal(fixture.uploads[0].options.api_secret, "changed-secret");
});

test("recognizes JPEG and WebP signatures and permits the exact byte limit", async () => {
  const webp = Buffer.alloc(20);
  webp.write("RIFF", 0); webp.writeUInt32LE(12, 4); webp.write("WEBPVP8X", 8);
  const boundaryPng = Buffer.alloc(5 * 1024 * 1024); png.copy(boundaryPng);
  for (const [bytes, type] of [[Buffer.from([0xff,0xd8,0xff,0xe0]), "image/jpeg"], [webp,"image/webp"], [boundaryPng,"image/png"]]) {
    await uploadBlogImage("admin", new File([bytes], "image", { type }));
  }
  assert.equal(fixture.uploads.length, 3);
  webp.writeUInt32LE(99, 4);
  await assert.rejects(() => uploadBlogImage("admin", new File([webp], "image", {type:"image/webp"})), /content/);
});

test("provider failures do not expose credentials and invalid provider metadata is rejected", async () => {
  fixture.failUpload = true;
  await assert.rejects(() => uploadBlogImage("admin", file()), (error) => error.code === "UPLOAD_TEMPORARY_FAILURE" && !error.message.includes("credential-secret"));
  fixture.failUpload = false;
  for (const response of [{public_id:"different"}, {format:"svg"}, {version:0}, {width:-1}, {resource_type:"raw"}, {type:"private"}, {secure_url:"https://evil.example/image.png"}]) {
    fixture.response = response;
    await assert.rejects(() => uploadBlogImage("admin", file()), error => error.code === "UPLOAD_INVALID_RESPONSE" && /retry/i.test(error.message));
  }
});

test("provider failures distinguish file rejection, account configuration, and temporary transport failures safely", async () => {
  for (const [providerError, code] of [
    [{ http_code: 400, message: "Invalid image credential-secret" }, "UPLOAD_REJECTED"],
    [{ http_code: 413, message: "Limit credential-secret" }, "UPLOAD_REJECTED"],
    [{ http_code: 401, message: "Invalid API key credential-secret" }, "UPLOAD_CONFIGURATION_ERROR"],
    [{ http_code: 403, message: "Disabled account credential-secret" }, "UPLOAD_CONFIGURATION_ERROR"],
    [{ http_code: 429, message: "Limit credential-secret" }, "UPLOAD_TEMPORARY_FAILURE"],
    [{ http_code: 499, message: "Timeout credential-secret" }, "UPLOAD_TEMPORARY_FAILURE"],
    [{ http_code: 500, message: "Internal credential-secret" }, "UPLOAD_TEMPORARY_FAILURE"],
    [{ code: "ECONNRESET", message: "Network credential-secret" }, "UPLOAD_TEMPORARY_FAILURE"],
  ]) {
    fixture.uploadError = providerError;
    await assert.rejects(() => uploadBlogImage("admin", file()), error => {
      assert.equal(error instanceof BlogImageUploadError, true);
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /credential-secret|test-secret|test-key/);
      return true;
    });
  }
});

test("database outages stay actionable while permission revocation remains forbidden", async () => {
  fixture.failTransactionAt = 1;
  await assert.rejects(() => uploadBlogImage("admin", file()), error => error.code === "UPLOAD_TEMPORARY_FAILURE" && /access/i.test(error.message) && !error.message.includes("password"));
  assert.equal(fixture.uploads.length, 0);
  fixture.transactionCalls = 0;
  fixture.failTransactionAt = 2;
  await assert.rejects(() => uploadBlogImage("admin", file()), error => error.code === "UPLOAD_FINALIZATION_FAILED" && !error.message.includes("password"));
  assert.equal(fixture.uploads.length, 1);
  fixture.failTransactionAt = 0;
  fixture.permissionChecks = 0;
  fixture.denyAt = 2;
  await assert.rejects(() => uploadBlogImage("admin", file()), AuthorizationError);
});

test("known upload transport failures expose only safe diagnostic codes with recovery guidance", async () => {
  for (const [providerError, diagnostic, guidance] of [
    [{ code: "ENOTFOUND" }, "ENOTFOUND", /DNS/i],
    [{ error: { code: "ENOTFOUND", message: "credential-secret-private-provider-detail" } }, "ENOTFOUND", /DNS/i],
    [{ code: "EAI_AGAIN" }, "EAI_AGAIN", /DNS/i],
    [{ code: "ECONNREFUSED" }, "ECONNREFUSED", /connection|firewall/i],
    [{ code: "ECONNRESET" }, "ECONNRESET", /connection|firewall/i],
    [{ code: "ETIMEDOUT" }, "ETIMEDOUT", /timed out/i],
    [{ code: "ESOCKETTIMEDOUT" }, "ESOCKETTIMEDOUT", /timed out/i],
    [{ http_code: 499 }, "HTTP 499", /timed out/i],
    [{ error: { http_code: 499, message: "credential-secret-private-provider-detail" } }, "HTTP 499", /timed out/i],
    [{ code: "CERT_HAS_EXPIRED" }, "CERT_HAS_EXPIRED", /certificate/i],
    [{ code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" }, "UNABLE_TO_VERIFY_LEAF_SIGNATURE", /certificate/i],
    [{ code: "DEPTH_ZERO_SELF_SIGNED_CERT" }, "DEPTH_ZERO_SELF_SIGNED_CERT", /certificate/i],
    [{ code: "SELF_SIGNED_CERT_IN_CHAIN" }, "SELF_SIGNED_CERT_IN_CHAIN", /certificate/i],
    [{ code: "ERR_TLS_CERT_ALTNAME_INVALID" }, "ERR_TLS_CERT_ALTNAME_INVALID", /certificate/i],
    [{ http_code: 429 }, "HTTP 429", /rate.limit|wait/i],
    [{ http_code: 420 }, "HTTP 420", /rate.limit|wait/i],
  ]) {
    fixture.uploadError = { ...providerError, message: "credential-secret-private-provider-detail", hostname: "private-hostname", stack: "private-stack" };
    await assert.rejects(() => uploadBlogImage("admin", file()), error => {
      assert.equal(error.code, "UPLOAD_TEMPORARY_FAILURE");
      assert.ok(error.message.includes(diagnostic));
      assert.match(error.message, guidance);
      assert.doesNotMatch(error.message, /credential-secret|private-hostname|private-stack/);
      return true;
    });
  }
  fixture.uploadError = { code: "private-secret-unrecognized-code", http_code: "private-secret", message: "private-secret" };
  await assert.rejects(() => uploadBlogImage("admin", file()), error => error.code === "UPLOAD_TEMPORARY_FAILURE" && !error.message.includes("private-secret"));
});
