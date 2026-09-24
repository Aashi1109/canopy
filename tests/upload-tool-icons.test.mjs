import { expect, test, beforeEach, afterEach, onTestFinished } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { uploadToolIcons } from "../scripts/upload-tool-icons.mjs";

let previousEnv;
beforeEach(() => {
  previousEnv = process.env;
  process.env = { ...process.env, NODE_ENV: "development" };
});
afterEach(() => {
  process.env = previousEnv;
});

test("confines every upload and custom folder to the configured environment", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tool-icons-environment-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "icons");
  const output = path.join(root, "manifest.json");
  await mkdir(dir);
  await writeFile(path.join(dir, "json-editor.svg"), "<svg/>");
  const requests = [];
  const client = {
    uploader: {
      upload: async (_source, options) => {
        requests.push(options);
        return {
          public_id: options.public_id,
          secure_url: `https://res.cloudinary.com/demo/image/upload/v1/${options.public_id}.svg`,
          version: 1,
          format: "svg",
          width: 104,
          height: 88,
        };
      },
    },
  };
  for (const environment of ["production", "development", "test"]) {
    process.env.NODE_ENV = environment;
    for (const folder of [undefined, "custom/icons"]) {
      const result = await uploadToolIcons({ dir, output, folder, client, log() {} });
      const resolvedFolder = `Canopy/${environment}/${folder ?? "platform/assets/default/icons"}`;
      expect(result.folder).toBe(resolvedFolder);
      expect(requests.at(-1).asset_folder).toBe(resolvedFolder);
      expect(requests.at(-1).public_id).toBe(`${resolvedFolder}/json-editor`);
    }
  }
  const previousRequests = requests.length;
  for (const folder of ["../outside", "/outside", "valid/../../outside", "a\\outside"]) {
    await expect(uploadToolIcons({ dir, output, folder, client, log() {} })).rejects.toThrow();
  }
  for (const environment of [undefined, "", "PROD", "../production"]) {
    if (environment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = environment;
    await expect(uploadToolIcons({ dir, output, client, log() {} })).rejects.toThrow();
  }
  expect(requests.length).toBe(previousRequests);
});

test("uploads slug IDs, resolves existing assets, and retains successful URLs after a failure", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tool-icons-test-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
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
        expect(publicId).toBe("Canopy/development/smarttools/tool-icons/json-to-csv");
        expect(options).toEqual({ resource_type: "image", type: "upload" });
        return resource(publicId);
      },
    },
  };
  const dryRun = await uploadToolIcons({ dir, output, folder, client, dryRun: true, log() {} });
  expect(dryRun.icons.length).toBe(5);
  expect(requests.length).toBe(0);
  await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });

  const result = await uploadToolIcons({ dir, output, folder, client, concurrency: 1, log() {} });
  expect(result.icons.map(({ slug }) => slug)).toEqual(["json-editor", "json-to-csv"]);
  expect(result.icons[0].secureUrl).toBe(
    "https://res.cloudinary.com/demo/image/upload/v123/Canopy/development/smarttools/tool-icons/json-editor.svg",
  );
  expect(result.failures.map(({ slug }) => slug)).toEqual(["not-an-icon", "pdf-to-text", "xml-to-json"]);
  expect(result.failures[0].error).toMatch(/SVG root/);
  expect(result.failures[1].error).toMatch(/HTTP 429: Too many requests/);
  expect(result.failures[1].stage).toBe("upload");
  expect(result.failures[1].httpCode).toBe(429);
  expect(persistedBeforeFailure.icons.length).toBe(2);
  expect(JSON.parse(await readFile(output, "utf8"))).toEqual(result);
  expect(requests.length).toBe(4);
  for (const { source, options } of requests) {
    expect(source).toMatch(/^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(source.split(",")[1], "base64").toString("utf8");
    expect(svg).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<svg /);
    expect(svg.match(/<\?xml/g).length).toBe(1);
    expect(svg.includes('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBeTruthy();
    expect(options).toEqual({
      resource_type: "image",
      allowed_formats: ["svg"],
      public_id: options.public_id,
      asset_folder: `Canopy/development/${folder}`,
      overwrite: false,
    });
  }
  expect(requests.map(({ options }) => options.public_id)).toEqual(
    ["json-editor", "json-to-csv", "pdf-to-text", "xml-to-json"].map((slug) => `Canopy/development/${folder}/${slug}`),
  );
  const customFolder = await uploadToolIcons({
    dir,
    output,
    folder: "platform/assets/",
    dryRun: true,
    log() {},
  });
  expect(customFolder.icons[0].publicId).toBe("Canopy/development/platform/assets/json-editor");
  await expect(uploadToolIcons({ dir, output, folder: "../bad", dryRun: true })).rejects.toThrow();
  await expect(uploadToolIcons({ dir, output: path.join(dir, "manifest.json"), dryRun: true })).rejects.toThrow(
    /outside/,
  );
  for (const concurrency of [0, 21, 1.5, "invalid"]) {
    await expect(uploadToolIcons({ dir, output, concurrency, dryRun: true })).rejects.toThrow(/concurrency/);
  }
});

test("bounds concurrent uploads and saves a sorted manifest after mixed batch results", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tool-icons-parallel-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
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
  expect(maximum).toBe(2);
  expect(checkpoint.icons.map(({ slug }) => slug)).toEqual(["a"]);
  expect(checkpoint.failures.map(({ slug }) => slug)).toEqual(["b"]);
  expect(result.icons.map(({ slug }) => slug)).toEqual(["a", "c", "d", "e"]);
  expect(JSON.parse(await readFile(output, "utf8"))).toEqual(result);
});

test("identifies nested Admin 403 failures and redacts credentials from logs and manifest", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tool-icons-permission-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const originalEnv = process.env;
  process.env = { NODE_ENV: "development", CLOUDINARY_API_SECRET: "unit-test-secret" };
  onTestFinished(() => {
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
  expect(result.icons.length).toBe(0);
  expect(result.failures[0].stage).toBe("existing-asset lookup");
  expect(result.failures[0].httpCode).toBe(403);
  expect(result.failures[0].error).toMatch(/HTTP 403: Permission denied for \[redacted\]/);
  expect(result.failures[0].error).toMatch(/API key permissions/);
  const manifest = await readFile(output, "utf8");
  expect(`${manifest}\n${logs.join("\n")}`).not.toMatch(/unit-test-secret|must-not-be-logged/);
  expect(JSON.parse(manifest)).toEqual(result);
});

test("failed-only retries select recorded failures and preserve successful and pending records", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tool-icons-retry-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "icons");
  const output = path.join(root, "manifest.json");
  const subfolder = "retry/icons";
  const folder = `Canopy/development/${subfolder}`;
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
    folder: subfolder,
    client,
    failedOnly: true,
    dryRun: true,
    log() {},
  });
  expect(dryRun.icons.map(({ slug }) => slug)).toEqual(["b", "c", "d"]);
  expect(requests.length).toBe(0);
  expect(await readFile(output, "utf8")).toBe(original);
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
      subfolder,
    ],
    { env: { NODE_ENV: "development" } },
  );
  expect(stdout).toMatch(/b\.svg -> Canopy\/development\/retry\/icons\/b/);
  expect(stdout).not.toMatch(/[ae]\.svg ->/);
  expect(await readFile(output, "utf8")).toBe(original);

  const result = await uploadToolIcons({
    dir,
    output,
    folder: subfolder,
    client,
    failedOnly: true,
    concurrency: 1,
    log() {},
  });
  expect(requests).toEqual(["b", "c", "d"].map((slug) => `${folder}/${slug}`));
  expect(result.icons.find(({ slug }) => slug === "a")).toEqual(previousIcon);
  expect(result.icons.map(({ slug }) => slug)).toEqual(["a", "b", "d"]);
  expect(result.failures.map(({ slug }) => slug)).toEqual(["c"]);
  expect(result.failures[0].error).toMatch(/Retry still rejected/);
  expect(checkpoint.icons.map(({ slug }) => slug)).toEqual(["a", "b"]);
  expect(checkpoint.failures.map(({ slug }) => slug)).toEqual(["c", "d"]);
  expect(checkpoint.failures[0].error).toMatch(/Retry still rejected/);
  expect(checkpoint.failures[1]).toEqual(previous.failures[2]);
  expect(JSON.parse(await readFile(output, "utf8"))).toEqual(result);
});

test("failed-only rejects missing or invalid manifests and leaves a completed manifest untouched", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tool-icons-retry-validation-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "icons");
  const output = path.join(root, "manifest.json");
  const subfolder = "retry/icons";
  const folder = `Canopy/development/${subfolder}`;
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
  const options = { dir, output, folder: subfolder, client, failedOnly: true, log() {} };
  await expect(uploadToolIcons(options)).rejects.toThrow();
  await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
  const manifest = { folder, generatedAt: "2026-09-08T00:00:00.000Z", icons: [], failures: [] };
  for (const invalid of [
    "not json",
    JSON.stringify({ ...manifest, folder: "another/folder" }),
    JSON.stringify({ ...manifest, failures: "invalid" }),
    JSON.stringify({ ...manifest, failures: [{ slug: "a", publicId: "another/folder/a" }] }),
  ]) {
    await writeFile(output, invalid);
    await expect(uploadToolIcons(options)).rejects.toThrow();
    expect(await readFile(output, "utf8")).toBe(invalid);
  }
  const completed = `${JSON.stringify(manifest, null, 4)}\n`;
  await writeFile(output, completed);
  const result = await uploadToolIcons(options);
  expect(result.failures).toEqual([]);
  expect(await readFile(output, "utf8")).toBe(completed);
  expect(requests).toBe(0);
});
