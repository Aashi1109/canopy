import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { assignToolIcons, planToolIconUpdates } from "../scripts/update-tool-icons.mjs";

const cloudName = "demo";
const icon = {
  slug: "json-editor",
  publicId: "Canopy/platform/assets/default/icons/json-editor",
  version: 123,
  format: "svg",
  width: 104,
  height: 88,
  secureUrl: "https://res.cloudinary.com/demo/image/upload/v123/Canopy/platform/assets/default/icons/json-editor.svg",
};
const tools = [{ tool_id: "json_editor_v2", slug: "json-editor" }];

test("maps only successful uploads to database IDs with their complete delivery URLs", () => {
  assert.deepEqual(planToolIconUpdates({ icons: [icon], failures: [{ slug: "missing-tool" }] }, tools, cloudName), [
    {
      tool_id: "json_editor_v2",
      icon_url:
        "https://res.cloudinary.com/demo/image/upload/f_png,c_fill,w_256,h_256,q_auto/v123/Canopy/platform/assets/default/icons/json-editor.png",
    },
  ]);
  assert.deepEqual(planToolIconUpdates({ icons: [], failures: [{ slug: "missing-tool" }] }, [], cloudName), []);
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
    planToolIconUpdates({ icons: [icon] }, [...tools, { tool_id: "other-id", slug: "json-editor" }], cloudName),
  );
});

test(
  "icon seeding preserves assigned icons while explicit updates still replace them",
  {
    skip: process.env.TOOL_ICON_TEST_DATABASE_URL
      ? false
      : "set TOOL_ICON_TEST_DATABASE_URL to a disposable PostgreSQL database",
  },
  async () => {
    const sql = postgres(process.env.TOOL_ICON_TEST_DATABASE_URL, { max: 1 });
    try {
      await sql.begin(async (tx) => {
        await tx`CREATE TEMP TABLE managed_tools (
          tool_id text PRIMARY KEY, icon_url text, updated_at timestamptz NOT NULL DEFAULT NOW()
        ) ON COMMIT DROP`;
        const [row] = planToolIconUpdates({ icons: [icon] }, tools, cloudName);
        await tx`INSERT INTO managed_tools (tool_id, icon_url) VALUES
          (${row.tool_id}, 'https://example.com/custom.png'), ('another-tool', NULL)`;
        const before = await tx`SELECT * FROM managed_tools WHERE tool_id = ${row.tool_id}`;
        const missing = { ...row, tool_id: "another-tool" };
        const unknown = { ...row, tool_id: "unknown-tool" };
        assert.deepEqual(Array.from(await assignToolIcons(tx, [row, missing, unknown], { missingOnly: true })), [
          { tool_id: missing.tool_id },
        ]);
        assert.deepEqual(await tx`SELECT * FROM managed_tools WHERE tool_id = ${row.tool_id}`, before);
        assert.equal((await assignToolIcons(tx, [row, missing], { missingOnly: true })).length, 0);
        assert.equal((await assignToolIcons(tx, [row])).length, 1);
        assert.equal(
          (await tx`SELECT icon_url FROM managed_tools WHERE tool_id = ${row.tool_id}`)[0].icon_url,
          row.icon_url,
        );
        assert.equal((await tx`SELECT * FROM managed_tools`).length, 2);
        assert.equal((await assignToolIcons(tx, [row])).length, 0);
        assert.deepEqual(await assignToolIcons(tx, [], { missingOnly: true }), []);
      });
    } finally {
      await sql.end();
    }
  },
);
