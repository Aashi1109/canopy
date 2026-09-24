import { expect, test } from "vitest";
import pg from "pg";
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
  expect(planToolIconUpdates({ icons: [icon], failures: [{ slug: "missing-tool" }] }, tools, cloudName)).toEqual([
    {
      tool_id: "json_editor_v2",
      icon_url:
        "https://res.cloudinary.com/demo/image/upload/f_png,c_fill,w_256,h_256,q_auto/v123/Canopy/platform/assets/default/icons/json-editor.png",
    },
  ]);
  expect(planToolIconUpdates({ icons: [], failures: [{ slug: "missing-tool" }] }, [], cloudName)).toEqual([]);
});

test("rejects invalid manifests, duplicate slugs, and inconsistent Cloudinary metadata", () => {
  for (const manifest of [null, {}, { icons: {} }, { icons: [null] }, { icons: [icon, icon] }]) {
    expect(() => planToolIconUpdates(manifest, tools, cloudName)).toThrow();
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
    expect(() => planToolIconUpdates({ icons: [{ ...icon, ...patch }] }, tools, cloudName)).toThrow();
  }
  for (const invalidCloud of [undefined, "", "demo/other", "demo.example"]) {
    expect(() => planToolIconUpdates({ icons: [icon] }, tools, invalidCloud)).toThrow();
  }
});

test("requires exactly one database match for every successful slug", () => {
  expect(() => planToolIconUpdates({ icons: [icon] }, [], cloudName)).toThrow();
  expect(() =>
    planToolIconUpdates({ icons: [icon] }, [...tools, { tool_id: "other-id", slug: "json-editor" }], cloudName),
  ).toThrow();
});

test("bulk icon updates bind their values and skip an empty batch", async () => {
  const calls = [];
  const rows = [{ tool_id: "tool'id", icon_url: "https://example.com/icon's.png" }];
  const updated = [{ tool_id: rows[0].tool_id }];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      return { rows: updated };
    },
  };
  expect(await assignToolIcons(client, [])).toEqual([]);
  expect(calls.length).toBe(0);
  expect(await assignToolIcons(client, rows, { missingOnly: true })).toEqual(updated);
  expect(calls[0].values).toEqual([[rows[0].tool_id], [rows[0].icon_url], true]);
  expect(!calls[0].text.includes(rows[0].tool_id)).toBeTruthy();
  expect(!calls[0].text.includes(rows[0].icon_url)).toBeTruthy();
  await assignToolIcons(client, rows);
  expect(calls[1].values).toEqual([[rows[0].tool_id], [rows[0].icon_url], false]);
});

test(
  "icon seeding preserves assigned icons while explicit updates still replace them",
  {
    skip: process.env.TOOL_ICON_TEST_DATABASE_URL
      ? false
      : "set TOOL_ICON_TEST_DATABASE_URL to a disposable PostgreSQL database",
  },
  async () => {
    const client = new pg.Client({ connectionString: process.env.TOOL_ICON_TEST_DATABASE_URL });
    try {
      await client.connect();
      await client.query("BEGIN");
      try {
        await client.query(`CREATE TEMP TABLE managed_tools (
          tool_id text PRIMARY KEY, icon_url text, updated_at timestamptz NOT NULL DEFAULT NOW()
        ) ON COMMIT DROP`);
        const [row] = planToolIconUpdates({ icons: [icon] }, tools, cloudName);
        await client.query(
          `INSERT INTO managed_tools (tool_id, icon_url) VALUES
          ($1, 'https://example.com/custom.png'), ('another-tool', NULL)`,
          [row.tool_id],
        );
        const before = (await client.query("SELECT * FROM managed_tools WHERE tool_id = $1", [row.tool_id])).rows;
        const missing = { ...row, tool_id: "another-tool" };
        const unknown = { ...row, tool_id: "unknown-tool" };
        expect(await assignToolIcons(client, [row, missing, unknown], { missingOnly: true })).toEqual([
          { tool_id: missing.tool_id },
        ]);
        expect((await client.query("SELECT * FROM managed_tools WHERE tool_id = $1", [row.tool_id])).rows).toEqual(
          before,
        );
        expect((await assignToolIcons(client, [row, missing], { missingOnly: true })).length).toBe(0);
        expect((await assignToolIcons(client, [row])).length).toBe(1);
        expect(
          (await client.query("SELECT icon_url FROM managed_tools WHERE tool_id = $1", [row.tool_id])).rows[0].icon_url,
        ).toBe(row.icon_url);
        expect((await client.query("SELECT * FROM managed_tools")).rows.length).toBe(2);
        expect((await assignToolIcons(client, [row])).length).toBe(0);
        expect(await assignToolIcons(client, [], { missingOnly: true })).toEqual([]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } finally {
      await client.end();
    }
  },
);
