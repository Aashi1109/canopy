#!/usr/bin/env node
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function uploadToolIcons({
  dir = path.join(ROOT, "tmp/tools icon"),
  folder = "Canopy/platform/assets/default/icons",
  output = path.join(ROOT, "tmp/cloudinary-tool-icons.json"),
  dryRun = false,
  failedOnly = false,
  overwrite = false,
  concurrency = 5,
  client = cloudinary,
  log = console.log,
} = {}) {
  concurrency = Number(concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) {
    throw new Error("--concurrency must be an integer from 1 to 20.");
  }
  folder = folder.replace(/\/+$/, "");
  if (!folder.split("/").every((segment) => /^[A-Za-z0-9_-]+$/.test(segment))) {
    throw new Error(
      "--folder segments may contain only letters, digits, underscores, and hyphens.",
    );
  }
  dir = path.resolve(dir);
  output = path.resolve(output);
  const relativeOutput = path.relative(dir, output);
  if (
    !relativeOutput ||
    (!relativeOutput.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeOutput))
  ) {
    throw new Error("--output must be outside the SVG directory.");
  }
  let previous;
  if (failedOnly) {
    try {
      previous = JSON.parse(await readFile(output, "utf8"));
    } catch {
      throw new Error(`--failed-only requires a readable JSON manifest: ${output}`);
    }
    if (
      !previous ||
      previous.folder !== folder ||
      !Array.isArray(previous.icons) ||
      !Array.isArray(previous.failures)
    ) {
      throw new Error("Invalid retry manifest or folder mismatch.");
    }
    const entries = [...previous.icons, ...previous.failures];
    if (
      entries.some(
        (entry) =>
          !entry ||
          typeof entry.slug !== "string" ||
          !SLUG.test(entry.slug) ||
          entry.publicId !== `${folder}/${entry.slug}`,
      ) ||
      new Set(entries.map((entry) => entry.slug)).size !== entries.length
    ) {
      throw new Error("Invalid retry manifest: invalid or duplicate tool slugs/public IDs.");
    }
    if (!previous.failures.length) {
      log("No failed uploads to retry; manifest unchanged.");
      return previous;
    }
  }
  const files = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.svg$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (!files.length) throw new Error(`No SVG files found in ${dir}`);
  let icons = files.map((file) => {
    const slug = file.slice(0, -4);
    if (!SLUG.test(slug)) throw new Error(`Invalid tool slug: ${file}`);
    return { file, slug, publicId: `${folder}/${slug}` };
  });
  if (new Set(icons.map(({ slug }) => slug)).size !== icons.length) {
    throw new Error("Duplicate tool slugs in the SVG directory.");
  }
  if (failedOnly) {
    const failedSlugs = new Set(previous.failures.map(({ slug }) => slug));
    icons = icons.filter(({ slug }) => failedSlugs.has(slug));
    const available = new Set(icons.map(({ slug }) => slug));
    const missing = [...failedSlugs].filter((slug) => !available.has(slug));
    if (missing.length)
      throw new Error(`Missing SVG files for failed uploads: ${missing.join(", ")}`);
  }
  if (dryRun) {
    for (const { file, publicId } of icons) log(`${file} -> ${publicId}`);
    log(`Dry run: ${icons.length} SVGs; no uploads or manifest writes.`);
    return { icons, failures: [] };
  }

  const manifest = {
    ...previous,
    folder,
    generatedAt: new Date().toISOString(),
    icons: [...(previous?.icons ?? [])],
    failures: [...(previous?.failures ?? [])],
  };
  const previousSuccesses = manifest.icons.length;
  await mkdir(path.dirname(output), { recursive: true });
  async function upload({ file, slug, publicId }) {
    let stage = "upload";
    try {
      let svg = (await readFile(path.join(dir, file), "utf8")).replace(/^\uFEFF/, "").trimStart();
      const root = svg
        .replace(/^<\?xml\s[\s\S]*?\?>\s*/, "")
        .replace(/^(?:<!--[\s\S]*?-->\s*)*/, "");
      if (!/^<svg(?:\s|\/?>)/.test(root))
        throw new Error("File does not have an SVG root element.");
      // Cloudinary's SVG format detection expects an XML declaration.
      if (!/^<\?xml\s/.test(svg)) svg = `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
      const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
      let result = await client.uploader.upload(source, {
        resource_type: "image",
        allowed_formats: ["svg"],
        public_id: publicId,
        overwrite,
        ...(overwrite ? { invalidate: true } : {}),
      });
      if (result.existing) {
        stage = "existing-asset lookup";
        result = await client.api.resource(publicId, { resource_type: "image", type: "upload" });
      }
      if (
        result.public_id !== publicId ||
        result.format !== "svg" ||
        typeof result.secure_url !== "string" ||
        !result.secure_url.startsWith("https://") ||
        ![result.version, result.width, result.height].every(
          (value) => Number.isInteger(value) && value > 0,
        )
      ) {
        throw new Error("Cloudinary returned an unexpected asset or incomplete metadata.");
      }
      const icon = {
        slug,
        publicId: result.public_id,
        secureUrl: result.secure_url,
        version: result.version,
        format: result.format,
        width: result.width,
        height: result.height,
      };
      log(`OK ${slug}`);
      return { icon };
    } catch (error) {
      const failure = error?.error ?? error;
      let message =
        typeof failure?.message === "string" ? failure.message : "Upload or asset lookup failed";
      for (const key of ["CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "CLOUDINARY_URL"]) {
        const secret = process.env[key];
        if (secret)
          message = message
            .replaceAll(secret, "[redacted]")
            .replaceAll(encodeURIComponent(secret), "[redacted]");
      }
      message = message.replace(/[\r\n\t]/g, " ").slice(0, 400);
      const httpCode = Number.isInteger(failure?.http_code) ? failure.http_code : undefined;
      if (httpCode) message = `HTTP ${httpCode}: ${message}`;
      if (httpCode === 403)
        message +=
          ". Check API key permissions, the Cloudinary product environment, and account restrictions.";
      log(`FAILED ${slug} (${stage}): ${message}`);
      return {
        failure: { slug, publicId, stage, ...(httpCode ? { httpCode } : {}), error: message },
      };
    }
  }
  for (let index = 0; index < icons.length; index += concurrency) {
    const results = await Promise.all(icons.slice(index, index + concurrency).map(upload));
    for (const { icon, failure } of results) {
      const slug = (icon ?? failure).slug;
      manifest.failures = manifest.failures.filter((entry) => entry.slug !== slug);
      if (icon) manifest.icons.push(icon);
      else manifest.failures.push(failure);
    }
    manifest.icons.sort((a, b) => a.slug.localeCompare(b.slug));
    manifest.failures.sort((a, b) => a.slug.localeCompare(b.slug));
    // One atomic checkpoint per batch avoids concurrent manifest writes.
    const temporaryOutput = `${output}.${process.pid}.tmp`;
    await writeFile(temporaryOutput, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(temporaryOutput, output);
  }
  log(
    `${manifest.icons.length - previousSuccesses}/${icons.length} uploaded or already present this run; ${manifest.icons.length} total successful; ${manifest.failures.length} failed. Manifest: ${output}`,
  );
  return manifest;
}

async function main() {
  const { values } = parseArgs({
    options: {
      dir: { type: "string" },
      folder: { type: "string" },
      output: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "failed-only": { type: "boolean", default: false },
      overwrite: { type: "boolean", default: false },
      concurrency: { type: "string", default: "5" },
    },
  });
  if (!values["dry-run"]) {
    dotenv.config({ path: path.join(ROOT, ".env.local"), quiet: true, override: false });
    dotenv.config({ path: path.join(ROOT, ".env"), quiet: true, override: false });
    const required = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
  const result = await uploadToolIcons({
    ...values,
    dryRun: values["dry-run"],
    failedOnly: values["failed-only"],
  });
  if (result.failures.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
