import assert from "node:assert/strict";
import test from "node:test";
import { planToolIconUpdates } from "../scripts/update-tool-icons.mjs";

const cloudName = "demo";
const icon = {
  slug: "json-editor",
  publicId: "Canopy/platform/assets/default/icons/json-editor",
  version: 123,
  format: "svg",
  width: 104,
  height: 88,
  secureUrl:
    "https://res.cloudinary.com/demo/image/upload/v123/Canopy/platform/assets/default/icons/json-editor.svg",
};
const tools = [{ tool_id: "json_editor_v2", slug: "json-editor" }];

test("maps only successful uploads to database IDs while retaining Cloudinary metadata", () => {
  assert.deepEqual(
    planToolIconUpdates({ icons: [icon], failures: [{ slug: "missing-tool" }] }, tools, cloudName),
    [
      {
        tool_id: "json_editor_v2",
        public_id: icon.publicId,
        version: "123",
        format: "svg",
        width: 104,
        height: 88,
      },
    ],
  );
  assert.deepEqual(
    planToolIconUpdates({ icons: [], failures: [{ slug: "missing-tool" }] }, [], cloudName),
    [],
  );
});

test("rejects invalid manifests, duplicate slugs, and inconsistent Cloudinary metadata", () => {
  for (const manifest of [null, {}, { icons: {} }, { icons: [null] }, { icons: [icon, icon] }]) {
    assert.throws(() => planToolIconUpdates(manifest, tools, cloudName));
  }
  for (const patch of [
    { slug: "JSON-editor" },
    { slug: "../json-editor" },
    { slug: "json--editor" },
    { format: "png" },
    { version: 0 },
    { version: "123" },
    { version: Number.MAX_SAFE_INTEGER + 1 },
    { width: -1 },
    { width: 2147483648 },
    { height: 1.5 },
    { height: 2147483648 },
    { publicId: "icons/../json-editor" },
    { publicId: "icons//json-editor" },
    { publicId: "icons/other-tool" },
    { secureUrl: icon.secureUrl.replace("https:", "http:") },
    { secureUrl: icon.secureUrl.replace("/demo/", "/other-cloud/") },
    { secureUrl: icon.secureUrl.replace("/v123/", "/v124/") },
    { secureUrl: icon.secureUrl.replace(".svg", ".png") },
    { secureUrl: `${icon.secureUrl}?download=true` },
  ]) {
    assert.throws(
      () => planToolIconUpdates({ icons: [{ ...icon, ...patch }] }, tools, cloudName),
      JSON.stringify(patch),
    );
  }
  for (const invalidCloud of [undefined, "", "demo/other", "demo.example"]) {
    assert.throws(() => planToolIconUpdates({ icons: [icon] }, tools, invalidCloud));
  }
});

test("requires exactly one database match for every successful slug", () => {
  assert.throws(() => planToolIconUpdates({ icons: [icon] }, [], cloudName));
  assert.throws(() =>
    planToolIconUpdates(
      { icons: [icon] },
      [...tools, { tool_id: "other-id", slug: "json-editor" }],
      cloudName,
    ),
  );
});
