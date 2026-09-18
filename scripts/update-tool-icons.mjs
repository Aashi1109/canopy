#!/usr/bin/env node
// node scripts/update-tool-icons.mjs [--dry-run] [--missing-only] [--manifest path/to/manifest.json]
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import pg from "pg";
import { Cache, CACHE_NAMESPACES, closeRedis } from "@canopy/cache";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

export function planToolIconUpdates(manifest, tools, cloudName) {
  if (typeof cloudName !== "string" || !/^[A-Za-z0-9_-]+$/.test(cloudName)) {
    throw new Error("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME or CLOUDINARY_CLOUD_NAME is required.");
  }
  if (!Array.isArray(manifest?.icons)) throw new Error("Manifest must contain an icons array.");
  const seen = new Set();
  return manifest.icons.map((icon, index) => {
    if (
      !icon ||
      typeof icon.slug !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(icon.slug) ||
      icon.format !== "svg" ||
      ![icon.version, icon.width, icon.height].every((n) => Number.isSafeInteger(n) && n > 0) ||
      icon.width > 2147483647 ||
      icon.height > 2147483647 ||
      typeof icon.publicId !== "string" ||
      !icon.publicId.split("/").every((part) => /^[A-Za-z0-9_-]+$/.test(part)) ||
      icon.publicId.split("/").at(-1) !== icon.slug ||
      icon.secureUrl !== `https://res.cloudinary.com/${cloudName}/image/upload/v${icon.version}/${icon.publicId}.svg`
    ) {
      throw new Error(`Invalid successful icon at index ${index}: check SVG metadata and Cloudinary delivery cloud.`);
    }
    if (seen.has(icon.slug)) throw new Error(`Duplicate manifest slug: ${icon.slug}`);
    seen.add(icon.slug);
    const matches = tools.filter((tool) => tool.slug === icon.slug);
    if (matches.length !== 1) {
      throw new Error(`${matches.length ? "Ambiguous" : "Missing"} database slug: ${icon.slug}. No icons updated.`);
    }
    return {
      tool_id: matches[0].tool_id,
      icon_url: `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/f_png,c_fill,w_256,h_256,q_auto/v${encodeURIComponent(icon.version)}/${icon.publicId.split("/").map(encodeURIComponent).join("/")}.png`,
    };
  });
}

export async function assignToolIcons(client, rows, { missingOnly = false } = {}) {
  if (!rows.length) return [];
  const result = await client.query(
    `
    UPDATE managed_tools AS tools
    SET icon_url = updates.icon_url, updated_at = NOW()
    FROM unnest($1::text[], $2::text[]) AS updates(tool_id, icon_url)
    WHERE tools.tool_id = updates.tool_id
      AND tools.icon_url IS DISTINCT FROM updates.icon_url
      AND (NOT $3::boolean OR tools.icon_url IS NULL)
    RETURNING tools.tool_id
  `,
    [rows.map((row) => row.tool_id), rows.map((row) => row.icon_url), missingOnly],
  );
  return result.rows;
}

async function main() {
  const { values } = parseArgs({
    options: {
      manifest: { type: "string", default: path.join(ROOT, "tmp/cloudinary-tool-icons.json") },
      "dry-run": { type: "boolean", default: false },
      "missing-only": { type: "boolean", default: false },
    },
  });
  for (const file of [".env.local", ".env"]) {
    dotenv.config({ path: path.join(ROOT, file), quiet: true, override: false });
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const manifest = JSON.parse(await readFile(values.manifest, "utf8"));
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() || process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    await client.query("BEGIN");
    try {
      const { rows: tools } = await client.query("SELECT tool_id, slug FROM managed_tools");
      const rows = planToolIconUpdates(manifest, tools, cloudName);
      if (values["dry-run"]) {
        for (const row of rows) console.log(`${row.tool_id} -> ${row.icon_url}`);
        console.log(`Dry run: ${rows.length} successful icons matched; no database writes.`);
      } else if (!rows.length) {
        console.log("No successful icons to update.");
      } else {
        const updated = await assignToolIcons(client, rows, { missingOnly: values["missing-only"] });
        console.log(`Updated ${updated.length} icons; ${rows.length - updated.length} unchanged.`);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    if (!values["dry-run"]) {
      await Promise.all([
        new Cache(CACHE_NAMESPACES.CATALOG).delete("all"),
        new Cache(CACHE_NAMESPACES.ECOSYSTEM).delete("all"),
      ]);
    }
  } finally {
    closeRedis();
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    let message = error.message;
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) message = message.replaceAll(databaseUrl, "[redacted]");
    console.error(message);
    process.exitCode = 1;
  });
}
