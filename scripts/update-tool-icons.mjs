#!/usr/bin/env node
// node scripts/update-tool-icons.mjs [--dry-run] [--manifest path/to/manifest.json]
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import postgres from "postgres";

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
      icon.secureUrl !==
        `https://res.cloudinary.com/${cloudName}/image/upload/v${icon.version}/${icon.publicId}.svg`
    ) {
      throw new Error(
        `Invalid successful icon at index ${index}: check SVG metadata and Cloudinary delivery cloud.`,
      );
    }
    if (seen.has(icon.slug)) throw new Error(`Duplicate manifest slug: ${icon.slug}`);
    seen.add(icon.slug);
    const matches = tools.filter((tool) => tool.slug === icon.slug);
    if (matches.length !== 1) {
      throw new Error(
        `${matches.length ? "Ambiguous" : "Missing"} database slug: ${icon.slug}. No icons updated.`,
      );
    }
    return {
      tool_id: matches[0].tool_id,
      public_id: icon.publicId,
      version: String(icon.version),
      format: icon.format,
      width: icon.width,
      height: icon.height,
    };
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      manifest: { type: "string", default: path.join(ROOT, "tmp/cloudinary-tool-icons.json") },
      "dry-run": { type: "boolean", default: false },
    },
  });
  for (const file of [".env.local", ".env"]) {
    dotenv.config({ path: path.join(ROOT, file), quiet: true, override: false });
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const manifest = JSON.parse(await readFile(values.manifest, "utf8"));
  const cloudName =
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() ||
    process.env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() && cloudName) {
    console.log(
      `Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=${cloudName} in the app environment to display imported icons.`,
    );
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
  try {
    await sql.begin(async (tx) => {
      const tools = await tx`SELECT tool_id, slug FROM managed_tools`;
      const rows = planToolIconUpdates(manifest, tools, cloudName);
      if (values["dry-run"]) {
        for (const row of rows) console.log(`${row.tool_id} -> ${row.public_id}`);
        console.log(`Dry run: ${rows.length} successful icons matched; no database writes.`);
        return;
      }
      if (!rows.length) {
        console.log("No successful icons to update.");
        return;
      }
      const updated = await tx`
        INSERT INTO tool_icons ${tx(rows, "tool_id", "public_id", "version", "format", "width", "height")}
        ON CONFLICT (tool_id) DO UPDATE SET
          public_id = EXCLUDED.public_id, version = EXCLUDED.version,
          format = EXCLUDED.format, width = EXCLUDED.width, height = EXCLUDED.height,
          updated_at = NOW()
        WHERE (tool_icons.public_id, tool_icons.version, tool_icons.format, tool_icons.width, tool_icons.height)
          IS DISTINCT FROM (EXCLUDED.public_id, EXCLUDED.version, EXCLUDED.format, EXCLUDED.width, EXCLUDED.height)
        RETURNING tool_id
      `;
      console.log(
        `Updated ${updated.length} icons; ${rows.length - updated.length} already current.`,
      );
    });
  } finally {
    await sql.end();
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
