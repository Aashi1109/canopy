import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { uploadToolIcons } from "../scripts/upload-tool-icons.mjs";

test("uploads slug IDs, resolves existing assets, and retains successful URLs after a failure", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tool-icons-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "icons");
  const output = path.join(root, "manifest.json");
  const folder = "smarttools/tool-icons";
  await mkdir(dir);
  for (const slug of ["json-editor", "json-to-csv", "pdf-to-text", "xml-to-json"]) {
    await writeFile(path.join(dir, `${slug}.svg`), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  }
  await writeFile(
    path.join(dir, "json-editor.svg"),
    '\uFEFF  <?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>',
  );
  await writeFile(path.join(dir, "not-an-icon.svg"), "<html>This is not SVG</html>");
  const requests = [];
  let persistedBeforeFailure;
  const resource = (publicId) => ({
    public_id: publicId,
    secure_url: `https://res.cloudinary.com/demo/image/upload/v123/${publicId}.svg`,
    version: 123,
    format: "svg",
    width: 104,
    height: 88,
  });
  const client = {
    uploader: {
      upload: async (source, options) => {
        requests.push({ source, options });
        if (options.public_id.endsWith("/pdf-to-text")) {
          persistedBeforeFailure = JSON.parse(await readFile(output, "utf8"));
          throw { http_code: 429, message: "Too many requests" };
        }
        if (options.public_id.endsWith("/xml-to-json")) return { ...resource(options.public_id), version: undefined };
        return options.public_id.endsWith("/json-to-csv") ? { existing: true } : resource(options.public_id);
      },
    },
    api: {
      resource: async (publicId, options) => {
        assert.equal(publicId, "smarttools/tool-icons/json-to-csv");
        assert.deepEqual(options, { resource_type: "image", type: "upload" });
        return resource(publicId);
      },
    },
  };
  const dryRun = await uploadToolIcons({ dir, output, folder, client, dryRun: true, log() {} });
  assert.equal(dryRun.icons.length, 5);
  assert.equal(requests.length, 0);
  await assert.rejects(readFile(output), { code: "ENOENT" });

  const result = await uploadToolIcons({ dir, output, folder, client, concurrency: 1, log() {} });
  assert.deepEqual(
    result.icons.map(({ slug }) => slug),
    ["json-editor", "json-to-csv"],
  );
  assert.equal(
    result.icons[0].secureUrl,
    "https://res.cloudinary.com/demo/image/upload/v123/smarttools/tool-icons/json-editor.svg",
  );
  assert.deepEqual(
    result.failures.map(({ slug }) => slug),
    ["not-an-icon", "pdf-to-text", "xml-to-json"],
  );
  assert.match(result.failures[0].error, /SVG root/);
  assert.match(result.failures[1].error, /HTTP 429: Too many requests/);
  assert.equal(result.failures[1].stage, "upload");
  assert.equal(result.failures[1].httpCode, 429);
  assert.equal(persistedBeforeFailure.icons.length, 2);
  assert.deepEqual(JSON.parse(await readFile(output, "utf8")), result);
  assert.equal(requests.length, 4);
  for (const { source, options } of requests) {
    assert.match(source, /^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(source.split(",")[1], "base64").toString("utf8");
    assert.match(svg, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<svg /);
    assert.equal(svg.match(/<\?xml/g).length, 1);
    assert.ok(svg.includes('<svg xmlns="http://www.w3.org/2000/svg"/>'));
    assert.deepEqual(options, {
      resource_type: "image",
      allowed_formats: ["svg"],
      public_id: options.public_id,
      overwrite: false,
    });
  }
  assert.deepEqual(
    requests.map(({ options }) => options.public_id),
    ["json-editor", "json-to-csv", "pdf-to-text", "xml-to-json"].map((slug) => `${folder}/${slug}`),
  );
  const customFolder = await uploadToolIcons({
    dir,
    output,
    folder: "Canopy/platform/assets/",
    dryRun: true,
    log() {},
  });
  assert.equal(customFolder.icons[0].publicId, "Canopy/platform/assets/json-editor");
  await assert.rejects(uploadToolIcons({ dir, output, folder: "../bad", dryRun: true }), /segments/);
  await assert.rejects(uploadToolIcons({ dir, output: path.join(dir, "manifest.json"), dryRun: true }), /outside/);
  for (const concurrency of [0, 21, 1.5, "invalid"]) {
    await assert.rejects(uploadToolIcons({ dir, output, concurrency, dryRun: true }), /concurrency/);
  }
});

test("bounds concurrent uploads and saves a sorted manifest after mixed batch results", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tool-icons-parallel-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "icons");
  const output = path.join(root, "manifest.json");
  await mkdir(dir);
  for (const slug of ["a", "b", "c", "d", "e"]) await writeFile(path.join(dir, `${slug}.svg`), "<svg/>");
  let active = 0;
  let maximum = 0;
  let checkpoint;
  const client = {
    uploader: {
      upload: async (_source, { public_id }) => {
        active += 1;
        maximum = Math.max(maximum, active);
        try {
          if (public_id.endsWith("/c")) checkpoint = JSON.parse(await readFile(output, "utf8"));
          await setImmediate();
          if (public_id.endsWith("/b")) throw new Error("Rejected SVG");
          return {
            public_id,
            secure_url: `https://res.cloudinary.com/demo/image/upload/v1/${public_id}.svg`,
            version: 1,
            format: "svg",
            width: 104,
            height: 88,
          };
        } finally {
          active -= 1;
        }
      },
    },
  };
  const result = await uploadToolIcons({ dir, output, client, concurrency: 2, log() {} });
  assert.equal(maximum, 2);
  assert.deepEqual(
    checkpoint.icons.map(({ slug }) => slug),
    ["a"],
  );
  assert.deepEqual(
    checkpoint.failures.map(({ slug }) => slug),
    ["b"],
  );
  assert.deepEqual(
    result.icons.map(({ slug }) => slug),
    ["a", "c", "d", "e"],
  );
  assert.deepEqual(JSON.parse(await readFile(output, "utf8")), result);
});

test("identifies nested Admin 403 failures and redacts credentials from logs and manifest", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tool-icons-permission-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const originalEnv = process.env;
  process.env = { CLOUDINARY_API_SECRET: "unit-test-secret" };
  t.after(() => {
    process.env = originalEnv;
  });
  const dir = path.join(root, "icons");
  const output = path.join(root, "manifest.json");
  await mkdir(dir);
  await writeFile(path.join(dir, "json-editor.svg"), "<svg/>");
  const logs = [];
  const client = {
    uploader: { upload: async () => ({ existing: true }) },
    api: {
      resource: async () => {
        throw {
          error: { http_code: 403, message: "Permission denied for unit-test-secret" },
          request_options: { auth: "must-not-be-logged" },
        };
      },
    },
  };
  const result = await uploadToolIcons({ dir, output, client, log: (line) => logs.push(line) });
  assert.equal(result.icons.length, 0);
  assert.equal(result.failures[0].stage, "existing-asset lookup");
  assert.equal(result.failures[0].httpCode, 403);
  assert.match(result.failures[0].error, /HTTP 403: Permission denied for \[redacted\]/);
  assert.match(result.failures[0].error, /API key permissions/);
  const manifest = await readFile(output, "utf8");
  assert.doesNotMatch(`${manifest}\n${logs.join("\n")}`, /unit-test-secret|must-not-be-logged/);
  assert.deepEqual(JSON.parse(manifest), result);
});

test("failed-only retries select recorded failures and preserve successful and pending records", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tool-icons-retry-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "icons");
  const output = path.join(root, "manifest.json");
  const folder = "retry/icons";
  await mkdir(dir);
  for (const slug of ["a", "b", "c", "d", "e"]) await writeFile(path.join(dir, `${slug}.svg`), "<svg/>");
  const previousIcon = {
    slug: "a",
    publicId: `${folder}/a`,
    secureUrl: `https://res.cloudinary.com/demo/image/upload/v1/${folder}/a.svg`,
    version: 1,
    format: "svg",
    width: 104,
    height: 88,
  };
  const previous = {
    folder,
    generatedAt: "2026-09-08T00:00:00.000Z",
    icons: [previousIcon],
    failures: ["b", "c", "d"].map((slug) => ({
      slug,
      publicId: `${folder}/${slug}`,
      error: "Old failure",
    })),
  };
  const original = `${JSON.stringify(previous, null, 2)}\n`;
  await writeFile(output, original);
  const requests = [];
  let checkpoint;
  const client = {
    uploader: {
      upload: async (_source, { public_id }) => {
        requests.push(public_id);
        if (public_id.endsWith("/d")) checkpoint = JSON.parse(await readFile(output, "utf8"));
        if (public_id.endsWith("/c")) throw new Error("Retry still rejected");
        return {
          public_id,
          secure_url: `https://res.cloudinary.com/demo/image/upload/v2/${public_id}.svg`,
          version: 2,
          format: "svg",
          width: 104,
          height: 88,
        };
      },
    },
  };
  const dryRun = await uploadToolIcons({
    dir,
    output,
    folder,
    client,
    failedOnly: true,
    dryRun: true,
    log() {},
  });
  assert.deepEqual(
    dryRun.icons.map(({ slug }) => slug),
    ["b", "c", "d"],
  );
  assert.equal(requests.length, 0);
  assert.equal(await readFile(output, "utf8"), original);
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      path.join(import.meta.dirname, "../scripts/upload-tool-icons.mjs"),
      "--failed-only",
      "--dry-run",
      "--dir",
      dir,
      "--output",
      output,
      "--folder",
      folder,
    ],
    { env: {} },
  );
  assert.match(stdout, /b\.svg -> retry\/icons\/b/);
  assert.doesNotMatch(stdout, /[ae]\.svg ->/);
  assert.equal(await readFile(output, "utf8"), original);

  const result = await uploadToolIcons({
    dir,
    output,
    folder,
    client,
    failedOnly: true,
    concurrency: 1,
    log() {},
  });
  assert.deepEqual(
    requests,
    ["b", "c", "d"].map((slug) => `${folder}/${slug}`),
  );
  assert.deepEqual(
    result.icons.find(({ slug }) => slug === "a"),
    previousIcon,
  );
  assert.deepEqual(
    result.icons.map(({ slug }) => slug),
    ["a", "b", "d"],
  );
  assert.deepEqual(
    result.failures.map(({ slug }) => slug),
    ["c"],
  );
  assert.match(result.failures[0].error, /Retry still rejected/);
  assert.deepEqual(
    checkpoint.icons.map(({ slug }) => slug),
    ["a", "b"],
  );
  assert.deepEqual(
    checkpoint.failures.map(({ slug }) => slug),
    ["c", "d"],
  );
  assert.match(checkpoint.failures[0].error, /Retry still rejected/);
  assert.deepEqual(checkpoint.failures[1], previous.failures[2]);
  assert.deepEqual(JSON.parse(await readFile(output, "utf8")), result);
});

test("failed-only rejects missing or invalid manifests and leaves a completed manifest untouched", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tool-icons-retry-validation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "icons");
  const output = path.join(root, "manifest.json");
  const folder = "retry/icons";
  await mkdir(dir);
  await writeFile(path.join(dir, "a.svg"), "<svg/>");
  let requests = 0;
  const client = {
    uploader: {
      upload: async () => {
        requests += 1;
        throw new Error("Should not upload");
      },
    },
  };
  const options = { dir, output, folder, client, failedOnly: true, log() {} };
  await assert.rejects(uploadToolIcons(options));
  await assert.rejects(readFile(output), { code: "ENOENT" });
  const manifest = { folder, generatedAt: "2026-09-08T00:00:00.000Z", icons: [], failures: [] };
  for (const invalid of [
    "not json",
    JSON.stringify({ ...manifest, folder: "another/folder" }),
    JSON.stringify({ ...manifest, failures: "invalid" }),
    JSON.stringify({ ...manifest, failures: [{ slug: "a", publicId: "another/folder/a" }] }),
  ]) {
    await writeFile(output, invalid);
    await assert.rejects(uploadToolIcons(options));
    assert.equal(await readFile(output, "utf8"), invalid);
  }
  const completed = `${JSON.stringify(manifest, null, 4)}\n`;
  await writeFile(output, completed);
  const result = await uploadToolIcons(options);
  assert.deepEqual(result.failures, []);
  assert.equal(await readFile(output, "utf8"), completed);
  assert.equal(requests, 0);
});
