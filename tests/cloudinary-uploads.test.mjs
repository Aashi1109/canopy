import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { cloudinaryFolder } from "../lib/cloudinary/paths.ts";

const originalEnv = Object.fromEntries(
  ["NODE_ENV", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].map((key) => [
    key,
    process.env[key],
  ]),
);
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-key";
process.env.CLOUDINARY_API_SECRET = "test-secret";
const uploads = [];
globalThis.__cloudinaryUploadTest = uploads;
const sourceUrl = new URL("../lib/tool-framework/cloudinary.ts", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === sourceUrl && specifier === "cloudinary")
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`
        export const v2 = { config() {}, uploader: { async upload(source, options) {
          globalThis.__cloudinaryUploadTest.push(options);
          return { public_id: options.public_id, version: 1, width: 1, height: 1 };
        } } };
      `)}`,
      };
    return next(specifier, context);
  },
});
const { uploadToolIcon } = await import(sourceUrl);
hooks.deregister();
test.after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete globalThis.__cloudinaryUploadTest;
});

test("every environment keeps tool icon IDs and asset folders under its Canopy base", async () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const environment of ["production", "development", "test"]) {
    process.env.NODE_ENV = environment;
    const result = await uploadToolIcon("media.extract-pdf-pages", png, "image/png");
    assert.equal(result.ok, true);
    const expectedFolder = `Canopy/${environment}/tool-icons`;
    assert.equal(uploads.at(-1).asset_folder, expectedFolder);
    assert.equal(result.row.publicId, `${expectedFolder}/media.extract-pdf-pages`);
    assert.equal(uploads.at(-1).overwrite, true);
  }
  const count = uploads.length;
  delete process.env.NODE_ENV;
  await assert.rejects(uploadToolIcon("media.extract-pdf-pages", png, "image/png"), /NODE_ENV/);
  assert.equal(uploads.length, count);
});

test("upload folders require an environment and reject paths outside the base", () => {
  for (const environment of [undefined, "", "PROD", "../production"]) {
    if (environment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = environment;
    assert.throws(() => cloudinaryFolder("blog"), /NODE_ENV/);
  }
  process.env.NODE_ENV = "production";
  assert.equal(cloudinaryFolder("platform/assets/default/icons"), "Canopy/production/platform/assets/default/icons");
  for (const folder of ["", "/blog", "../blog", "blog/../icons", "blog//icons", "blog\\icons"]) {
    assert.throws(() => cloudinaryFolder(folder), /folder/);
  }
});
