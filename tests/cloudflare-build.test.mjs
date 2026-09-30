import { existsSync, readFileSync, statSync } from "node:fs";
import { expect, test } from "vitest";
import { runCloudflare } from "../scripts/cloudflare.mjs";

const config = {
  vars: { APP_URL: "https://canopy.example" },
  env: {
    dev: {
      name: "canopy-dev",
      vars: { APP_URL: "https://canopy-dev.example.workers.dev" },
      routes: [],
      hyperdrive: [],
      services: [{ binding: "WORKER_SELF_REFERENCE", service: "canopy-dev" }],
      triggers: { crons: [] },
    },
  },
  routes: [
    { pattern: "canopy.example", custom_domain: true },
    { pattern: "admin.canopy.example", custom_domain: true },
  ],
};

const downloaderConfig = {
  name: "canopy-downloaders",
  env: {
    dev: {
      name: "canopy-downloaders-dev",
      vars: {
        DOWNLOADERS_ENABLED: "true",
        DOWNLOADERS_POOL_SIZE: "2",
        DOWNLOADERS_YOUTUBE_INSPECTION: "true",
        DOWNLOADERS_INSTAGRAM_INSPECTION: "true",
      },
      hyperdrive: [{ binding: "DB", id: "downloader-db" }],
      r2_buckets: [{ binding: "DOWNLOAD_FILES", bucket_name: "canopy-downloads-dev" }],
    },
  },
};

const previewCredentials = {
  DOWNLOADERS_CONTROL_SECRET: "fixture-control-secret-at-least-32-characters",
  DOWNLOADERS_GUEST_SECRET: "fixture-guest-secret-at-least-32-characters",
  DOWNLOADERS_NETWORK_SECRET: "fixture-network-secret-at-least-32-characters",
  DOWNLOADERS_R2_ACCOUNT_ID: "a".repeat(32),
  DOWNLOADERS_R2_BUCKET: "canopy-downloads-dev",
  DOWNLOADERS_R2_ACCESS_KEY_ID: "fixture-storage-key",
  DOWNLOADERS_R2_SECRET_ACCESS_KEY: "fixture-storage-secret",
};

function previewEnvironment(overrides = {}) {
  return Object.entries({ ...previewCredentials, ...overrides })
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function recordPreviewPreflight(fileContent, configuration = downloaderConfig) {
  const calls = [];
  let error;
  try {
    runCloudflare(["preview"], config, {
      downloaderConfig: configuration,
      environment: {},
      readFile: () => fileContent,
      execute(_command, args) {
        calls.push(args);
        return { status: 0 };
      },
    });
  } catch (failure) {
    error = failure;
  }
  return { calls, error };
}

function recordRun(
  mode,
  configuration = config,
  results = [],
  fileContent = "SYNTHETIC_RUNTIME_SECRET=fixture-only",
  environmentOverrides = {},
) {
  const calls = [];
  const environment = {
    APP_URL: "https://stale.example",
    SKIP_NEXT_APP_BUILD: "true",
    INHERITED_APP_SECRET: "must-not-leak",
    PATH: "/fixture/bin",
    HOME: "/fixture/home",
    CLOUDFLARE_API_TOKEN: "deployment-only",
    WRANGLER_CI_MATCH_TAG: "expected-worker-tag",
    WRANGLER_CI_OVERRIDE_NAME: "canopy",
    WRANGLER_OUTPUT_FILE_PATH: "/fixture/deployment.json",
    WRANGLER_OUTPUT_FILE_DIRECTORY: "/fixture",
    WORKERS_CI_BRANCH: "production",
    ...environmentOverrides,
  };
  const status = runCloudflare(Array.isArray(mode) ? mode : [mode], configuration, {
    downloaderConfig,
    environment,
    readFile(path) {
      calls.loadedFile = path;
      return (Array.isArray(mode) ? mode[0] : mode) === "preview"
        ? `${previewEnvironment()}\n${fileContent}`
        : fileContent;
    },
    execute(command, args, options) {
      const secretFile = args[args.indexOf("--secrets-file") + 1];
      const secrets = args.includes("--secrets-file") ? JSON.parse(readFileSync(secretFile, "utf8")) : undefined;
      if (secrets) expect(statSync(secretFile).mode & 0o777).toBe(0o600);
      calls.push({ command, args, ...options, secrets });
      return results.shift() ?? { status: 0 };
    },
  });
  return { calls, environment, status };
}

test("Cloudflare builds use the configured public origin and scrub bundled environment fallbacks", () => {
  const { calls, environment, status } = recordRun("build");
  expect(status).toBe(0);
  expect(calls.map(({ args }) => args)).toEqual([
    [
      "node_modules/@opennextjs/cloudflare/dist/cli/index.js",
      "build",
      "--config",
      "wrangler.jsonc",
      "--env",
      "",
      "--skipNextBuild=false",
    ],
    ["scripts/clear-cloudflare-build-env.mjs"],
  ]);
  for (const call of calls) {
    expect(call.env.APP_URL).toBe("https://canopy.example");
    expect(call.env.SYNTHETIC_RUNTIME_SECRET).toBe("fixture-only");
    expect(call.env.CLOUDFLARE_ENV).toBe("");
    expect(call.env.INHERITED_APP_SECRET).toBeUndefined();
    expect(call.env.__NEXT_PROCESSED_ENV).toBe("true");
    expect(call.env.PATH).toBe("/fixture/bin");
  }
  expect(environment.APP_URL).toBe("https://stale.example");
  expect(calls.loadedFile).toMatch(/env\.prod$/);
});

test("deployment builds and deploys with the same origin after scrubbing", () => {
  const { calls, status } = recordRun("deploy", {
    ...config,
    vars: { APP_URL: "https://canopy.example" },
  });
  expect(status).toBe(0);
  expect(calls).toHaveLength(3);
  expect(calls.at(-1).args).toEqual([
    "node_modules/wrangler/bin/wrangler.js",
    "deploy",
    "--config",
    "wrangler.jsonc",
    "--env",
    "",
    "--env-file",
    ".env.prod",
    "--secrets-file",
    expect.any(String),
  ]);
  const secretPath = calls.at(-1).args.at(-1);
  expect(existsSync(secretPath)).toBe(false);
  expect(calls.at(-1).secrets).toEqual({ SYNTHETIC_RUNTIME_SECRET: "fixture-only" });
  expect(calls.every(({ env }) => env.APP_URL === "https://canopy.example")).toBe(true);
  // The prior Next output could be a preview with localhost in browser bundles.
  expect(calls[0].args).toContain("--skipNextBuild=false");
});

test("Workers Builds target checks reach Wrangler without becoming Worker settings", () => {
  const { calls } = recordRun("deploy");
  const deployment = calls.at(-1);
  expect(deployment.env.WRANGLER_CI_MATCH_TAG).toBe("expected-worker-tag");
  expect(deployment.env.WRANGLER_CI_OVERRIDE_NAME).toBe("canopy");
  expect(deployment.env.WRANGLER_OUTPUT_FILE_PATH).toBe("/fixture/deployment.json");
  expect(deployment.env.WRANGLER_OUTPUT_FILE_DIRECTORY).toBe("/fixture");
  expect(deployment.env.WORKERS_CI_BRANCH).toBe("production");
  expect(deployment.env.CLOUDFLARE_API_TOKEN).toBe("deployment-only");
  expect(deployment.env.INHERITED_APP_SECRET).toBeUndefined();
  expect(deployment.secrets).toEqual({ SYNTHETIC_RUNTIME_SECRET: "fixture-only" });
  expect(deployment.args).not.toContain("--var");
});

test.each(["1", "true"])("Workers Builds (%s) deploys code while retaining existing runtime settings", (workersCi) => {
  const { calls, status } = recordRun("deploy", config, [], "must not read dotenv", {
    WORKERS_CI: workersCi,
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "public-cloud",
    SENTRY_AUTH_TOKEN: "build-upload-token",
    BETTER_AUTH_SECRET: "must-not-upload",
    CLOUDFLARE_EMAIL_ACCOUNT_ID: "runtime-email-account",
    CLOUDFLARE_EMAIL_API_TOKEN: "runtime-email-token",
  });
  expect(status).toBe(0);
  expect(calls.loadedFile).toBeUndefined();
  expect(calls).toHaveLength(3);
  expect(calls[0].env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME).toBe("public-cloud");
  expect(calls[0].env.SENTRY_AUTH_TOKEN).toBe("build-upload-token");
  expect(calls.every(({ env }) => env.APP_URL === "https://canopy.example")).toBe(true);
  expect(calls.every(({ env }) => env.CLOUDFLARE_EMAIL_ACCOUNT_ID === undefined)).toBe(true);
  expect(calls.every(({ env }) => env.CLOUDFLARE_EMAIL_API_TOKEN === undefined)).toBe(true);
  const deployment = calls.at(-1);
  expect(deployment.args).toEqual([
    "node_modules/wrangler/bin/wrangler.js",
    "deploy",
    "--config",
    "wrangler.jsonc",
    "--env",
    "",
    "--keep-vars",
  ]);
  expect(deployment.env.BETTER_AUTH_SECRET).toBeUndefined();
  expect(deployment.env.INHERITED_APP_SECRET).toBeUndefined();
  expect(deployment.env.WRANGLER_CI_MATCH_TAG).toBe("expected-worker-tag");
  expect(deployment.secrets).toBeUndefined();
});

test("preview deploys the downloader first, then rebuilds and deploys the dev app using only .env", () => {
  const { calls } = recordRun("preview");
  expect(calls).toHaveLength(4);
  expect(calls.slice(1).every(({ env }) => env.APP_URL === "https://canopy-dev.example.workers.dev")).toBe(true);
  expect(calls.loadedFile).toMatch(/\/\.env$/);
  expect(calls[0].args).toEqual([
    "node_modules/wrangler/bin/wrangler.js",
    "deploy",
    "--config",
    "wrangler.downloaders.jsonc",
    "--env",
    "dev",
    "--env-file",
    ".env",
    "--var",
    `DOWNLOADERS_R2_ACCOUNT_ID:${previewCredentials.DOWNLOADERS_R2_ACCOUNT_ID}`,
    "--var",
    "DOWNLOADERS_R2_BUCKET:canopy-downloads-dev",
    "--secrets-file",
    expect.any(String),
  ]);
  expect(calls[0].secrets).toEqual({
    DOWNLOADERS_CONTROL_SECRET: previewCredentials.DOWNLOADERS_CONTROL_SECRET,
    DOWNLOADERS_R2_ACCESS_KEY_ID: previewCredentials.DOWNLOADERS_R2_ACCESS_KEY_ID,
    DOWNLOADERS_R2_SECRET_ACCESS_KEY: previewCredentials.DOWNLOADERS_R2_SECRET_ACCESS_KEY,
  });
  expect(calls[1].args).toEqual([
    "node_modules/@opennextjs/cloudflare/dist/cli/index.js",
    "build",
    "--config",
    "wrangler.jsonc",
    "--env",
    "dev",
    "--skipNextBuild=false",
  ]);
  expect(calls[2].args).toEqual(["scripts/clear-cloudflare-build-env.mjs"]);
  expect(calls.at(-1).args).toEqual([
    "node_modules/wrangler/bin/wrangler.js",
    "deploy",
    "--config",
    "wrangler.jsonc",
    "--env",
    "dev",
    "--env-file",
    ".env",
    "--secrets-file",
    expect.any(String),
  ]);
  expect(calls.at(-1).secrets).toEqual({ ...previewCredentials, SYNTHETIC_RUNTIME_SECRET: "fixture-only" });
  expect(existsSync(calls[0].args.at(-1))).toBe(false);
  expect(existsSync(calls.at(-1).args.at(-1))).toBe(false);
});

test("preview uploads only backend settings and scoped secrets to the downloader", () => {
  const limits = JSON.stringify({
    globalDailyJobs: 1000,
    networkDailyJobs: 50,
    globalQueued: 100,
    platformActive: 4,
    platformStartsPerMinute: 20,
    globalDailyBytes: 1024 ** 3,
    globalMonthlyBytes: 30 * 1024 ** 3,
    globalDailyCostMicros: 1_000_000,
    jobCostMicros: 1000,
  });
  const controlSecret = "fixture-control-secret-at-least-32-characters";
  const { calls } = recordRun(
    "preview",
    config,
    [],
    [
      "DOWNLOADERS_ENABLED=true",
      "DOWNLOADERS_POOL_SIZE=4",
      "DOWNLOADERS_YOUTUBE_INSPECTION=false",
      "DOWNLOADERS_INSTAGRAM_INSPECTION=false",
      "DOWNLOADERS_PLATFORMS=youtube,instagram",
      `DOWNLOADERS_LIMITS=${limits}`,
      `DOWNLOADERS_R2_ACCOUNT_ID=${previewCredentials.DOWNLOADERS_R2_ACCOUNT_ID}`,
      "DOWNLOADERS_R2_BUCKET=canopy-downloads-dev",
      `DOWNLOADERS_CONTROL_SECRET=${controlSecret}`,
      "DOWNLOADERS_R2_ACCESS_KEY_ID=storage-key",
      "DOWNLOADERS_R2_SECRET_ACCESS_KEY=storage-secret",
      "DOWNLOADERS_LOCAL=true",
      "DOWNLOADERS_LOCAL_ORIGIN=http://127.0.0.1:8788",
      `DOWNLOADERS_GUEST_SECRET=${previewCredentials.DOWNLOADERS_GUEST_SECRET}`,
      "DOWNLOADERS_GUEST_PREVIOUS_SECRET=app-previous-secret",
      `DOWNLOADERS_NETWORK_SECRET=${previewCredentials.DOWNLOADERS_NETWORK_SECRET}`,
      "DOWNLOADERS_CONFINEMENT_VERIFIED=true",
      'DOWNLOADERS_EGRESS_HOSTS={"youtube":["youtube.com"]}',
      "DOWNLOADERS_UNKNOWN=unknown-value",
      "DB=must-not-replace-binding",
      "DOWNLOAD_FILES=must-not-replace-bucket",
      "BETTER_AUTH_SECRET=app-auth-secret",
      "DATABASE_URL=postgres://app-only",
      "CLOUDFLARE_API_TOKEN=deployment-token",
      "CLOUDFLARE_EMAIL_API_TOKEN=app-email-secret",
    ].join("\n"),
  );
  const backend = calls[0];
  expect(backend.args.flatMap((arg, index) => (arg === "--var" ? [backend.args[index + 1]] : [])).sort()).toEqual([
    "DOWNLOADERS_ENABLED:true",
    "DOWNLOADERS_INSTAGRAM_INSPECTION:false",
    `DOWNLOADERS_LIMITS:${limits}`,
    "DOWNLOADERS_PLATFORMS:youtube,instagram",
    "DOWNLOADERS_POOL_SIZE:4",
    `DOWNLOADERS_R2_ACCOUNT_ID:${previewCredentials.DOWNLOADERS_R2_ACCOUNT_ID}`,
    "DOWNLOADERS_R2_BUCKET:canopy-downloads-dev",
    "DOWNLOADERS_YOUTUBE_INSPECTION:false",
  ]);
  expect(backend.secrets).toEqual({
    DOWNLOADERS_CONTROL_SECRET: controlSecret,
    DOWNLOADERS_R2_ACCESS_KEY_ID: "storage-key",
    DOWNLOADERS_R2_SECRET_ACCESS_KEY: "storage-secret",
  });
  expect(backend.env.CLOUDFLARE_API_TOKEN).toBe("deployment-token");
  expect(calls.at(-1).secrets).toMatchObject({
    DOWNLOADERS_GUEST_SECRET: previewCredentials.DOWNLOADERS_GUEST_SECRET,
    DOWNLOADERS_GUEST_PREVIOUS_SECRET: "app-previous-secret",
    DOWNLOADERS_NETWORK_SECRET: previewCredentials.DOWNLOADERS_NETWORK_SECRET,
    BETTER_AUTH_SECRET: "app-auth-secret",
    DATABASE_URL: "postgres://app-only",
    CLOUDFLARE_EMAIL_API_TOKEN: "app-email-secret",
  });
});

test("preview keeps enabled defaults for blank non-secret configuration placeholders", () => {
  const { calls, status } = recordRun(
    "preview",
    config,
    [],
    [
      "DOWNLOADERS_ENABLED=",
      "DOWNLOADERS_POOL_SIZE=",
      "DOWNLOADERS_YOUTUBE_INSPECTION=",
      "DOWNLOADERS_INSTAGRAM_INSPECTION=",
      "DOWNLOADERS_PLATFORMS=",
      "DOWNLOADERS_LIMITS=",
    ].join("\n"),
  );
  expect(status).toBe(0);
  expect(calls).toHaveLength(4);
  const backendVars = calls[0].args.flatMap((arg, index) => (arg === "--var" ? [calls[0].args[index + 1]] : []));
  expect(backendVars).toEqual([
    `DOWNLOADERS_R2_ACCOUNT_ID:${previewCredentials.DOWNLOADERS_R2_ACCOUNT_ID}`,
    "DOWNLOADERS_R2_BUCKET:canopy-downloads-dev",
  ]);
});

test("enabled preview defaults accept all platform services with bounded runtime limits", () => {
  const { calls, error } = recordPreviewPreflight(previewEnvironment());
  expect(error).toBeUndefined();
  expect(calls).toHaveLength(4);
});

test.each(Object.keys(previewCredentials))("preview rejects missing %s before any child command", (key) => {
  const settings = { ...previewCredentials };
  delete settings[key];
  const { calls, error } = recordPreviewPreflight(
    Object.entries(settings)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n"),
  );
  expect(calls).toHaveLength(0);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toContain(key);
  for (const value of Object.values(previewCredentials)) expect(error.message).not.toContain(value);
});

test.each([
  ["DOWNLOADERS_CONTROL_SECRET", "control-too-short"],
  ["DOWNLOADERS_GUEST_SECRET", "guest-too-short"],
  ["DOWNLOADERS_NETWORK_SECRET", "network-too-short"],
  ["DOWNLOADERS_R2_ACCESS_KEY_ID", ""],
  ["DOWNLOADERS_R2_SECRET_ACCESS_KEY", '"   "'],
  ["DOWNLOADERS_R2_ACCOUNT_ID", "malformed-account-id"],
  ["DOWNLOADERS_R2_BUCKET", "wrong-development-bucket"],
])("preview rejects invalid %s without exposing credentials", (key, value) => {
  const { calls, error } = recordPreviewPreflight(previewEnvironment({ [key]: value }));
  expect(calls).toHaveLength(0);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toContain(key);
  if (value.trim()) expect(error.message).not.toContain(value);
  for (const secret of Object.values(previewCredentials)) expect(error.message).not.toContain(secret);
});

test.each([
  ["DOWNLOADERS_ENABLED", "yes"],
  ["DOWNLOADERS_POOL_SIZE", "0"],
  ["DOWNLOADERS_POOL_SIZE", "NaN"],
  ["DOWNLOADERS_YOUTUBE_INSPECTION", "yes"],
  ["DOWNLOADERS_INSTAGRAM_INSPECTION", "yes"],
  ["DOWNLOADERS_PLATFORMS", "youtube,unsupported-service"],
  ["DOWNLOADERS_LIMITS", "invalid-private-limit-setting"],
  ["DOWNLOADERS_LIMITS", "{}"],
])("preview validates runtime setting %s before deployment", (key, value) => {
  const { calls, error } = recordPreviewPreflight(previewEnvironment({ [key]: value }));
  expect(calls).toHaveLength(0);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toMatch(/Invalid downloader settings/);
  expect(error.message).not.toContain(value);
});

test("preview validates settings already present in the selected downloader config", () => {
  const invalidConfig = structuredClone(downloaderConfig);
  invalidConfig.env.dev.vars.DOWNLOADERS_POOL_SIZE = "0";
  const { calls, error } = recordPreviewPreflight(previewEnvironment(), invalidConfig);
  expect(calls).toHaveLength(0);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toMatch(/Invalid downloader settings/);
});

test("nonblank .env settings take precedence over downloader configuration", () => {
  const overriddenConfig = structuredClone(downloaderConfig);
  overriddenConfig.env.dev.vars.DOWNLOADERS_POOL_SIZE = "0";
  const { calls, error } = recordPreviewPreflight(previewEnvironment({ DOWNLOADERS_POOL_SIZE: "3" }), overriddenConfig);
  expect(error).toBeUndefined();
  expect(calls).toHaveLength(4);
  expect(calls[0]).toContain("DOWNLOADERS_POOL_SIZE:3");
});

test("an explicitly disabled preview can deploy without downloader credentials", () => {
  const { calls, error } = recordPreviewPreflight("DOWNLOADERS_ENABLED=false");
  expect(error).toBeUndefined();
  expect(calls).toHaveLength(4);
  expect(calls[0]).toContain("DOWNLOADERS_ENABLED:false");
});

test("preview retains Docker tooling but excludes app-specific Cloudflare deployment target metadata", () => {
  const { calls } = recordRun("preview", config, [], "", {
    DOCKER_HOST: "unix:///fixture/docker.sock",
    DOCKER_CONTEXT: "fixture-context",
    WRANGLER_DOCKER_BIN: "/fixture/bin/docker",
  });
  const backend = calls[0];
  expect(backend.env.DOCKER_HOST).toBe("unix:///fixture/docker.sock");
  expect(backend.env.DOCKER_CONTEXT).toBe("fixture-context");
  expect(backend.env.WRANGLER_DOCKER_BIN).toBe("/fixture/bin/docker");
  expect(backend.env.CLOUDFLARE_API_TOKEN).toBe("deployment-only");
  for (const key of [
    "WRANGLER_CI_MATCH_TAG",
    "WRANGLER_CI_OVERRIDE_NAME",
    "WRANGLER_OUTPUT_FILE_PATH",
    "WRANGLER_OUTPUT_FILE_DIRECTORY",
  ]) {
    expect(backend.env[key]).toBeUndefined();
    expect(calls.at(-1).env[key]).toBeDefined();
  }
});

test.each([
  [[{ status: 7 }], 7, 1],
  [[{ status: null, signal: "SIGTERM" }], 1, 1],
  [[{ status: 0 }, { status: 2 }], 2, 2],
  [[{ status: 0 }, { status: 0 }, { status: 3 }], 3, 3],
  [[{ status: 0 }, { status: 0 }, { status: 0 }, { status: 4 }], 4, 4],
])("preview stops after a failed stage and removes temporary secrets (%j)", (results, expectedStatus, count) => {
  const { calls, status } = recordRun("preview", config, results);
  expect(status).toBe(expectedStatus);
  expect(calls).toHaveLength(count);
  expect(calls[0].args).toContain("wrangler.downloaders.jsonc");
  for (const call of calls.filter(({ args }) => args.includes("--secrets-file"))) {
    expect(existsSync(call.args[call.args.indexOf("--secrets-file") + 1])).toBe(false);
  }
});

test("a downloader process start failure stops before building and removes temporary secrets", () => {
  const calls = [];
  expect(() =>
    runCloudflare(["preview"], config, {
      downloaderConfig,
      environment: {},
      readFile: () => previewEnvironment(),
      execute(_command, args) {
        calls.push(args);
        expect(existsSync(args[args.indexOf("--secrets-file") + 1])).toBe(true);
        return { error: new Error("sensitive child detail") };
      },
    }),
  ).toThrow("Unable to start the Cloudflare command.");
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain("wrangler.downloaders.jsonc");
  expect(existsSync(calls[0][calls[0].indexOf("--secrets-file") + 1])).toBe(false);
});

test("preview requires downloader configuration before any child command", () => {
  const calls = [];
  expect(() =>
    runCloudflare(["preview"], config, {
      environment: {},
      readFile: () => "",
      execute(...args) {
        calls.push(args);
        return { status: 0 };
      },
    }),
  ).toThrow("wrangler.downloaders.jsonc");
  expect(calls).toHaveLength(0);
});

test("local preview serves the dev configuration without uploading code or secrets", () => {
  const { calls } = recordRun(
    "local",
    {
      ...config,
      env: {
        dev: { ...config.env.dev, hyperdrive: [{ binding: "DB", id: "fake" }] },
      },
    },
    [],
    [
      "DATABASE_URL=postgres://local/preview-test-only",
      "CLOUDFLARE_EMAIL_ACCOUNT_ID=local-email-account",
      "CLOUDFLARE_EMAIL_API_TOKEN=local-email-token",
    ].join("\n"),
  );
  expect(calls).toHaveLength(3);
  expect(calls.loadedFile).toMatch(/\/\.env$/);
  expect(calls.every(({ env }) => env.APP_URL === "http://localhost:8787")).toBe(true);
  expect(calls[0].args).toContain("dev");
  expect(calls.at(-1).args).toEqual([
    "node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--config",
    "wrangler.jsonc",
    "--env",
    "dev",
    "--env-file",
    ".env",
    "--port",
    "8787",
    "--var",
    "APP_URL:http://localhost:8787",
  ]);
  expect(calls.at(-1).env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV).toBe("true");
  expect(calls.at(-1).env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB).toBe("postgres://local/preview-test-only");
  expect(calls.at(-1).env.CLOUDFLARE_EMAIL_ACCOUNT_ID).toBe("local-email-account");
  expect(calls.at(-1).env.CLOUDFLARE_EMAIL_API_TOKEN).toBe("local-email-token");
  expect(calls.at(-1).secrets).toBeUndefined();
});

test("a workers.dev deployment needs no custom-domain routes", () => {
  const workerConfig = {
    name: "canopy",
    workers_dev: true,
    routes: [],
    vars: { APP_URL: "https://canopy.example.workers.dev" },
  };
  const { calls, status } = recordRun("deploy", workerConfig);
  expect(status).toBe(0);
  expect(calls.every(({ env }) => env.APP_URL === workerConfig.vars.APP_URL)).toBe(true);
});

test("failed builds or environment scrubbing stop before deployment", () => {
  const buildFailure = recordRun("deploy", config, [{ status: 2 }]);
  expect(buildFailure.status).toBe(2);
  expect(buildFailure.calls).toHaveLength(1);
  const scrubFailure = recordRun("deploy", config, [{ status: 0 }, { status: 3 }]);
  expect(scrubFailure.status).toBe(3);
  expect(scrubFailure.calls).toHaveLength(2);
});

test("interrupted child commands fail without deploying", () => {
  const { calls, status } = recordRun("deploy", config, [{ status: null, signal: "SIGTERM" }]);
  expect(status).toBe(1);
  expect(calls).toHaveLength(1);
});

test("unknown commands and spawn failures report only fixed safe messages", () => {
  expect(() => recordRun("unknown")).toThrow("Use build, local, preview, or deploy.");
  expect(() => recordRun("deploy", config, [{ error: new Error("sensitive child detail") }])).toThrow(
    "Unable to start the Cloudflare command.",
  );
});

test.each([["--dry-run"], ["--env", "staging"]])("unsupported CLI options stop before any command", (...args) => {
  expect(() => recordRun(["deploy", ...args])).toThrow(
    "Cloudflare scripts do not accept extra arguments. Configure deployment settings in wrangler.jsonc.",
  );
});

test("an inherited named environment cannot deploy a different configuration", () => {
  expect(() =>
    runCloudflare(["deploy"], config, {
      environment: { CLOUDFLARE_ENV: "staging" },
      execute() {
        throw new Error("A child command must not run.");
      },
    }),
  ).toThrow("Unset CLOUDFLARE_ENV: these scripts target the top-level wrangler.jsonc configuration.");
});

test("selected file values override the shell and preserve quoted multiline secrets", () => {
  const { calls } = recordRun(
    "deploy",
    config,
    [],
    'CLOUDFLARE_API_TOKEN=file-token\nNEXT_PUBLIC_SENTRY_DSN=public-dsn\nSENTRY_AUTH_TOKEN=upload-only\nBETTER_AUTH_SECRET="first line\nsecond line"\nAPP_URL=https://canopy.example\n',
  );
  expect(calls[0].env.CLOUDFLARE_API_TOKEN).toBe("file-token");
  expect(calls[0].env.NEXT_PUBLIC_SENTRY_DSN).toBe("public-dsn");
  expect(calls.at(-1).secrets).toEqual({ BETTER_AUTH_SECRET: "first line\nsecond line" });
});

test.each(["deploy", "preview"])(
  "%s exposes basic settings while keeping credentials and unknown settings secret",
  (mode) => {
    const { calls } = recordRun(
      mode,
      config,
      [],
      [
        "CACHE_ENABLED=false",
        "DATABASE_POOL_MAX=5",
        "AI_ENABLED=true",
        "AI_PROVIDER=openai",
        "OPENAI_MODEL=example-model",
        'ACCOUNTS_EMAIL="SmartTools <accounts@example.test>"',
        "GOOGLE_CLIENT_ID=example-client-id",
        "DATABASE_URL=postgres://user:password@db.example.test/app",
        "REDIS_URL=redis://user:password@cache.example.test",
        "CLOUDINARY_URL=cloudinary://key:secret@example",
        "GOOGLE_CLIENT_SECRET=example-secret",
        "OPENAI_API_KEY=example-key",
        "CUSTOM_SETTING=unknown-sensitive-value",
      ].join("\n"),
    );
    const deployment = calls.at(-1);
    expect(deployment.args.flatMap((arg, index) => (arg === "--var" ? [deployment.args[index + 1]] : []))).toEqual([
      "ACCOUNTS_EMAIL:SmartTools <accounts@example.test>",
      "AI_ENABLED:true",
      "AI_PROVIDER:openai",
      "CACHE_ENABLED:false",
      "DATABASE_POOL_MAX:5",
      "GOOGLE_CLIENT_ID:example-client-id",
      "OPENAI_MODEL:example-model",
    ]);
    expect(deployment.secrets).toEqual({
      ...(mode === "preview" ? previewCredentials : {}),
      DATABASE_URL: "postgres://user:password@db.example.test/app",
      REDIS_URL: "redis://user:password@cache.example.test",
      CLOUDINARY_URL: "cloudinary://key:secret@example",
      GOOGLE_CLIENT_SECRET: "example-secret",
      OPENAI_API_KEY: "example-key",
      CUSTOM_SETTING: "unknown-sensitive-value",
    });
  },
);

test.each(["deploy", "preview"])("%s uploads Email Sending settings without exposing its token", (mode) => {
  const { calls } = recordRun(
    mode,
    config,
    [],
    [
      "CLOUDFLARE_EMAIL_ACCOUNT_ID=email-account",
      "CLOUDFLARE_EMAIL_API_TOKEN=email-token",
      "EMAIL_PROVIDER=cloudflare",
      "CLOUDFLARE_ACCOUNT_ID=deployment-account",
      "CLOUDFLARE_API_TOKEN=deployment-token",
      "CLOUDFLARE_UNRELATED_SETTING=build-only",
    ].join("\n"),
    {
      CLOUDFLARE_EMAIL_ACCOUNT_ID: "inherited-email-account",
      CLOUDFLARE_EMAIL_API_TOKEN: "inherited-email-token",
    },
  );
  const deployment = calls.at(-1);
  expect(deployment.args.flatMap((arg, index) => (arg === "--var" ? [deployment.args[index + 1]] : []))).toEqual([
    "CLOUDFLARE_EMAIL_ACCOUNT_ID:email-account",
    "EMAIL_PROVIDER:cloudflare",
  ]);
  expect(deployment.secrets).toEqual({
    ...(mode === "preview" ? previewCredentials : {}),
    CLOUDFLARE_EMAIL_API_TOKEN: "email-token",
  });
  expect(deployment.env.CLOUDFLARE_ACCOUNT_ID).toBe("deployment-account");
  expect(deployment.env.CLOUDFLARE_API_TOKEN).toBe("deployment-token");
  expect(existsSync(deployment.args.at(-1))).toBe(false);
});

test("local deployment does not inherit email credentials absent from the selected file", () => {
  const { calls } = recordRun("deploy", config, [], "", {
    CLOUDFLARE_EMAIL_ACCOUNT_ID: "inherited-email-account",
    CLOUDFLARE_EMAIL_API_TOKEN: "inherited-email-token",
  });
  expect(calls.every(({ env }) => env.CLOUDFLARE_EMAIL_ACCOUNT_ID === undefined)).toBe(true);
  expect(calls.every(({ env }) => env.CLOUDFLARE_EMAIL_API_TOKEN === undefined)).toBe(true);
  expect(calls.at(-1).secrets).toEqual({});
  expect(calls.at(-1).args).not.toContain("--var");
});

test("runtime secrets cannot replace the DB resource binding", () => {
  const configured = {
    ...config,
    services: [{ binding: "WORKER_SELF_REFERENCE", service: "self" }],
    hyperdrive: [{ binding: "DB", id: "fake" }],
    assets: { binding: "ASSETS" },
  };
  const { calls } = recordRun(
    "deploy",
    configured,
    [],
    "DB=bad\nASSETS=bad\nWORKER_SELF_REFERENCE=bad\nREDIS_URL=redis://example.test",
  );
  expect(calls.at(-1).secrets).toEqual({ REDIS_URL: "redis://example.test" });
});

test("a missing selected file stops before building and does not expose filesystem error details", () => {
  for (const mode of ["build", "deploy", "preview"]) {
    const calls = [];
    expect(() =>
      runCloudflare([mode], config, {
        environment: {},
        readFile() {
          throw new Error("private error detail");
        },
        execute(...args) {
          calls.push(args);
        },
      }),
    ).toThrow(mode === "preview" ? "Unable to read .env." : "Unable to read .env.prod.");
    expect(calls).toHaveLength(0);
  }
});

test("named environments in the file stop deployment", () => {
  expect(() => recordRun("deploy", config, [], "CLOUDFLARE_ENV=staging")).toThrow("Unset CLOUDFLARE_ENV");
});

test("temporary runtime secrets are removed when deployment fails", () => {
  const { calls, status } = recordRun("deploy", config, [{ status: 0 }, { status: 0 }, { status: 2 }]);
  expect(status).toBe(2);
  expect(existsSync(calls.at(-1).args.at(-1))).toBe(false);
});

test("deployment uses the configured origin without requiring custom domains or matching env file values", () => {
  const { calls, status } = recordRun(
    "deploy",
    { vars: { APP_URL: "https://canopy.example" } },
    [],
    "APP_URL=https://old.example",
  );
  expect(status).toBe(0);
  expect(calls.every(({ env }) => env.APP_URL === "https://canopy.example")).toBe(true);
});
