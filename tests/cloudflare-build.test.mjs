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
    environment,
    readFile(path) {
      calls.loadedFile = path;
      return fileContent;
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
  });
  expect(status).toBe(0);
  expect(calls.loadedFile).toBeUndefined();
  expect(calls).toHaveLength(3);
  expect(calls[0].env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME).toBe("public-cloud");
  expect(calls[0].env.SENTRY_AUTH_TOKEN).toBe("build-upload-token");
  expect(calls.every(({ env }) => env.APP_URL === "https://canopy.example")).toBe(true);
  const deployment = calls.at(-1);
  expect(deployment.args).toEqual([
    "node_modules/wrangler/bin/wrangler.js",
    "deploy",
    "--config",
    "wrangler.jsonc",
    "--keep-vars",
  ]);
  expect(deployment.env.BETTER_AUTH_SECRET).toBeUndefined();
  expect(deployment.env.INHERITED_APP_SECRET).toBeUndefined();
  expect(deployment.env.WRANGLER_CI_MATCH_TAG).toBe("expected-worker-tag");
  expect(deployment.secrets).toBeUndefined();
});

test("preview builds and remotely deploys the dev Worker using only .env", () => {
  const { calls } = recordRun("preview");
  expect(calls).toHaveLength(3);
  expect(calls.every(({ env }) => env.APP_URL === "https://canopy-dev.example.workers.dev")).toBe(true);
  expect(calls.loadedFile).toMatch(/\/\.env$/);
  expect(calls[0].args).toEqual([
    "node_modules/@opennextjs/cloudflare/dist/cli/index.js",
    "build",
    "--config",
    "wrangler.jsonc",
    "--env",
    "dev",
    "--skipNextBuild=false",
  ]);
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
  expect(calls.at(-1).secrets).toEqual({ SYNTHETIC_RUNTIME_SECRET: "fixture-only" });
  expect(existsSync(calls.at(-1).args.at(-1))).toBe(false);
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
    "DATABASE_URL=postgres://local/preview-test-only",
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
  expect(calls.at(-1).secrets).toBeUndefined();
});

test("a workers.dev deployment needs no custom-domain routes", () => {
  const workerConfig = {
    name: "smarttools",
    workers_dev: true,
    routes: [],
    vars: { APP_URL: "https://smarttools.example.workers.dev" },
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
      DATABASE_URL: "postgres://user:password@db.example.test/app",
      REDIS_URL: "redis://user:password@cache.example.test",
      CLOUDINARY_URL: "cloudinary://key:secret@example",
      GOOGLE_CLIENT_SECRET: "example-secret",
      OPENAI_API_KEY: "example-key",
      CUSTOM_SETTING: "unknown-sensitive-value",
    });
  },
);

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
