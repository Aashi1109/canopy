import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { runCloudflare } from "../scripts/cloudflare.mjs";

const container = { name: "canopy", class_name: "CanopyContainer", image: "./Dockerfile", max_instances: 1 };
const config = {
  name: "canopy",
  main: "worker.ts",
  vars: { APP_URL: "https://canopy.example" },
  containers: [container],
  durable_objects: { bindings: [{ name: "CANOPY_CONTAINER", class_name: "CanopyContainer" }] },
  services: [{ binding: "WORKER_SELF_REFERENCE", service: "canopy" }],
  routes: [{ pattern: "canopy.example", custom_domain: true }],
  env: {
    dev: {
      name: "canopy-dev",
      vars: { APP_URL: "https://canopy-dev.example.workers.dev" },
      containers: [{ ...container, name: "canopy-dev" }],
      durable_objects: { bindings: [{ name: "CANOPY_CONTAINER", class_name: "CanopyContainer" }] },
      routes: [],
      services: [{ binding: "WORKER_SELF_REFERENCE", service: "canopy-dev" }],
      triggers: { crons: [] },
    },
  },
};

function recordRun(
  mode,
  { configuration = config, results = [], contents = "SYNTHETIC_RUNTIME_SECRET=fixture-only", environment = {} } = {},
) {
  const calls = [];
  const files = [];
  const status = runCloudflare(Array.isArray(mode) ? mode : [mode], configuration, {
    environment: {
      APP_URL: "https://stale.example",
      INHERITED_APP_SECRET: "must-not-leak",
      PATH: "/fixture/bin",
      HOME: "/fixture/home",
      DOCKER_HOST: "unix:///fixture/docker.sock",
      CLOUDFLARE_API_TOKEN: "deployment-only",
      WRANGLER_CI_MATCH_TAG: "expected-worker-tag",
      WRANGLER_CI_OVERRIDE_NAME: ["preview", "local"].includes(Array.isArray(mode) ? mode[0] : mode)
        ? configuration.env?.dev?.name
        : configuration.name,
      WRANGLER_OUTPUT_FILE_PATH: "/fixture/deployment.json",
      WRANGLER_OUTPUT_FILE_DIRECTORY: "/fixture",
      WORKERS_CI_BRANCH: "production",
      ...environment,
    },
    readFile(path) {
      files.push(path);
      return contents;
    },
    execute(command, args, options) {
      const configPath = args.includes("--config") ? args[args.indexOf("--config") + 1] : undefined;
      const secretsPath = args.includes("--secrets-file") ? args[args.indexOf("--secrets-file") + 1] : undefined;
      if (secretsPath) assert.equal(statSync(secretsPath).mode & 0o777, 0o600);
      const emptyEnvFile = args[args.indexOf("--env-file") + 1];
      assert.ok(!emptyEnvFile.startsWith(options.cwd));
      assert.equal(readFileSync(emptyEnvFile, "utf8"), "");
      calls.push({
        command,
        args,
        ...options,
        configPath,
        secretsPath,
        configuration: configPath ? JSON.parse(readFileSync(configPath, "utf8")) : undefined,
        secrets: secretsPath ? JSON.parse(readFileSync(secretsPath, "utf8")) : undefined,
      });
      return results.shift() ?? { status: 0 };
    },
  });
  return { calls, files, status };
}

const target = (call, mode) => (["preview", "local"].includes(mode) ? call.configuration.env.dev : call.configuration);
const vars = (call) => call.args.flatMap((arg, index) => (arg === "--var" ? [call.args[index + 1]] : []));

test("application env files cannot replace the invoking shell's Docker connection", () => {
  const dockerSettings = {
    DOCKER_HOST: "unix:///active/docker.sock",
    DOCKER_CONTEXT: "active-context",
    DOCKER_CONFIG: "/active/docker-config",
    DOCKER_CERT_PATH: "/active/docker-certs",
    DOCKER_TLS_VERIFY: "1",
    DOCKER_TLS: "1",
    DOCKER_API_VERSION: "1.49",
    BUILDX_BUILDER: "active-builder",
    BUILDX_CONFIG: "/active/buildx-config",
    WRANGLER_DOCKER_BIN: "/active/bin/docker",
  };
  const contents = Object.keys(dockerSettings)
    .map((key) => `${key}=stale-file-value`)
    .join("\n");
  for (const mode of ["build", "preview", "deploy", "local"]) {
    const explicit = recordRun(mode, { contents, environment: dockerSettings }).calls[0];
    for (const [key, value] of Object.entries(dockerSettings)) assert.equal(explicit.env[key], value);
    const unsetSettings = Object.fromEntries(Object.keys(dockerSettings).map((key) => [key, undefined]));
    const defaults = recordRun(mode, { contents, environment: unsetSettings }).calls[0];
    for (const key of Object.keys(dockerSettings)) assert.equal(defaults.env[key], undefined);
    if (defaults.secrets) assert.deepEqual(defaults.secrets, {});
  }
});

test("build makes a local linux/amd64 image and checks the Worker without uploading", () => {
  const { calls, files, status } = recordRun("build");
  assert.equal(status, 0);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args.includes("--dry-run"));
  assert.equal(calls[0].secrets, undefined);
  assert.match(files[0], /\/\.env\.prod$/);
  assert.equal(calls[0].configuration.vars.APP_URL, "https://canopy.example");
  assert.equal(calls[0].configuration.containers[0].image_vars.APP_URL, "https://canopy.example");
  assert.equal(existsSync(calls[0].configPath), false);
});

for (const mode of ["deploy", "preview", "local"]) {
  test(`${mode} builds for the correct origin and keeps temporary configuration outside the image`, () => {
    const before = structuredClone(config);
    const { calls, files, status } = recordRun(mode, {
      contents:
        "APP_URL=https://ignored.example\nNEXT_PUBLIC_SENTRY_DSN=public-dsn\nBETTER_AUTH_SECRET=live-key\nSENTRY_AUTH_TOKEN=upload-token",
    });
    assert.equal(status, 0);
    assert.equal(calls.length, 1);
    const call = calls[0];
    const expectedName = mode === "deploy" ? "canopy" : "canopy-dev";
    assert.equal(target(call, mode).name, expectedName);
    assert.equal(target(call, mode).containers[0].name, expectedName);
    assert.equal(target(call, mode).services[0].service, expectedName);
    const expectedOrigin =
      mode === "local"
        ? "http://localhost:8787"
        : mode === "preview"
          ? "https://canopy-dev.example.workers.dev"
          : "https://canopy.example";
    assert.deepEqual(target(call, mode).containers[0].image_vars, {
      APP_URL: expectedOrigin,
      CANOPY_PUBLIC_BUILD_ENV: '{"NEXT_PUBLIC_SENTRY_DSN":"public-dsn"}',
      CANOPY_DEPLOYMENT_REVISION: target(call, mode).containers[0].image_vars.CANOPY_DEPLOYMENT_REVISION,
    });
    assert.equal(target(call, mode).vars.APP_URL, expectedOrigin);
    assert.ok(call.configuration.main.endsWith("/canopy/worker.ts"));
    assert.equal(call.args[2], call.configuration.main);
    for (const section of [call.configuration, ...Object.values(call.configuration.env)]) {
      assert.ok(section.containers[0].image.endsWith("/canopy/Dockerfile"));
    }
    assert.ok(call.args[call.args.indexOf("--tsconfig") + 1].endsWith("/canopy/tsconfig.json"));
    assert.ok(target(call, mode).containers[0].image.endsWith("/canopy/Dockerfile"));
    assert.ok(target(call, mode).containers[0].image_build_context.endsWith("/canopy"));
    assert.ok(!call.configPath.startsWith(call.cwd));
    assert.equal(existsSync(call.configPath), false);
    assert.equal(call.env.INHERITED_APP_SECRET, undefined);
    assert.equal(call.env.BETTER_AUTH_SECRET, mode === "local" ? "live-key" : undefined);
    assert.equal(call.env.SENTRY_AUTH_TOKEN, undefined);
    assert.equal(call.env.DOCKER_HOST, "unix:///fixture/docker.sock");
    assert.equal(call.env.APP_URL, expectedOrigin);
    assert.equal(call.args[call.args.indexOf("--env") + 1], mode === "deploy" ? "" : "dev");
    assert.match(files[0], mode === "deploy" ? /\/\.env\.prod$/ : /\/\.env$/);
    assert.deepEqual(config, before);
    if (mode === "local") {
      assert.equal(call.args[1], "dev");
      assert.equal(call.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV, "true");
      assert.deepEqual(vars(call), ["APP_URL:http://localhost:8787"]);
      assert.deepEqual(target(call, mode).secrets.required, ["BETTER_AUTH_SECRET"]);
      assert.equal(call.secrets, undefined);
    } else {
      assert.equal(call.args[1], "deploy");
      assert.deepEqual(call.secrets, { BETTER_AUTH_SECRET: "live-key" });
      assert.equal(call.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV, "false");
      assert.equal(existsSync(call.secretsPath), false);
    }
  });
}

for (const workersCi of ["1", "true"]) {
  test(`Workers Builds (${workersCi}) retains deployed runtime settings and excludes build secrets`, () => {
    const { calls, files } = recordRun("deploy", {
      environment: {
        WORKERS_CI: workersCi,
        NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "public-cloud",
        SENTRY_AUTH_TOKEN: "must-not-bake",
        BETTER_AUTH_SECRET: "must-not-upload",
        CLOUDFLARE_EMAIL_API_TOKEN: "must-not-upload",
      },
    });
    const call = calls[0];
    assert.equal(files.length, 0);
    assert.equal(calls.length, 1);
    assert.ok(call.args.includes("--keep-vars"));
    assert.equal(call.secrets, undefined);
    assert.deepEqual(call.configuration.containers[0].image_vars, {
      APP_URL: "https://canopy.example",
      CANOPY_PUBLIC_BUILD_ENV: '{"NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME":"public-cloud"}',
      CANOPY_DEPLOYMENT_REVISION: call.configuration.containers[0].image_vars.CANOPY_DEPLOYMENT_REVISION,
    });
    for (const key of ["SENTRY_AUTH_TOKEN", "BETTER_AUTH_SECRET", "CLOUDFLARE_EMAIL_API_TOKEN"])
      assert.equal(call.env[key], undefined);
    assert.equal(call.env.WRANGLER_CI_MATCH_TAG, "expected-worker-tag");
    assert.equal(call.env.WRANGLER_CI_OVERRIDE_NAME, "canopy");
    assert.equal(call.env.WRANGLER_OUTPUT_FILE_PATH, "/fixture/deployment.json");
    assert.equal(call.env.WRANGLER_OUTPUT_FILE_DIRECTORY, "/fixture");
    assert.equal(call.env.CLOUDFLARE_API_TOKEN, "deployment-only");
  });
}

test("every deployment changes the public image revision so running containers receive new runtime settings", () => {
  const first = recordRun("deploy", { contents: "BETTER_AUTH_SECRET=first-runtime-value" }).calls[0];
  const second = recordRun("deploy", { contents: "BETTER_AUTH_SECRET=second-runtime-value" }).calls[0];
  const firstArgs = first.configuration.containers[0].image_vars;
  const secondArgs = second.configuration.containers[0].image_vars;
  assert.match(
    firstArgs.CANOPY_DEPLOYMENT_REVISION,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.notEqual(firstArgs.CANOPY_DEPLOYMENT_REVISION, secondArgs.CANOPY_DEPLOYMENT_REVISION);
  assert.deepEqual(Object.keys(firstArgs).sort(), ["APP_URL", "CANOPY_DEPLOYMENT_REVISION", "CANOPY_PUBLIC_BUILD_ENV"]);
  assert.equal(JSON.stringify(firstArgs).includes("first-runtime-value"), false);
  assert.equal(JSON.stringify(secondArgs).includes("second-runtime-value"), false);
});

test("local runtime secrets preserve literal values and exclude deployment credentials from bindings", () => {
  const secret = "line one\nline two $HOME `literal`";
  const { calls } = recordRun("local", {
    contents: `BETTER_AUTH_SECRET="${secret}"\nCACHE_ENABLED=true\nCLOUDFLARE_API_TOKEN=deployment-only`,
  });
  const call = calls[0];
  assert.equal(call.env.BETTER_AUTH_SECRET, secret);
  assert.equal(call.configuration.env.dev.vars.CACHE_ENABLED, "true");
  assert.deepEqual(call.configuration.env.dev.secrets.required, ["BETTER_AUTH_SECRET"]);
  assert.equal(call.configuration.env.dev.vars.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(JSON.stringify(call.configuration).includes(secret), false);
});

test("runtime settings remain plain or secret without replacing configured bindings", () => {
  const { calls } = recordRun("deploy", {
    contents: [
      "CACHE_ENABLED=false",
      "DATABASE_POOL_MAX=5",
      "AI_ENABLED=true",
      "OPENAI_MODEL=model",
      "DATABASE_URL=postgres://user:password@db.example/app",
      "REDIS_URL=redis://secret@redis.example",
      'BETTER_AUTH_SECRET="first line\nsecond line"',
      "SCHEDULER_SECRET=scheduler-secret",
      "CLOUDFLARE_EMAIL_ACCOUNT_ID=email-account",
      "CLOUDFLARE_EMAIL_API_TOKEN=email-token",
      "CLOUDFLARE_API_TOKEN=file-token",
      "CUSTOM_SETTING=unknown-secret",
      "CANOPY_CONTAINER=bad",
      "WORKER_SELF_REFERENCE=bad",
    ].join("\n"),
  });
  const call = calls[0];
  assert.deepEqual(vars(call), [
    "AI_ENABLED:true",
    "CACHE_ENABLED:false",
    "CLOUDFLARE_EMAIL_ACCOUNT_ID:email-account",
    "DATABASE_POOL_MAX:5",
    "OPENAI_MODEL:model",
  ]);
  assert.deepEqual(call.secrets, {
    DATABASE_URL: "postgres://user:password@db.example/app",
    REDIS_URL: "redis://secret@redis.example",
    BETTER_AUTH_SECRET: "first line\nsecond line",
    SCHEDULER_SECRET: "scheduler-secret",
    CLOUDFLARE_EMAIL_API_TOKEN: "email-token",
    CUSTOM_SETTING: "unknown-secret",
  });
  assert.equal(call.env.CLOUDFLARE_API_TOKEN, "file-token");
  assert.equal(call.env.CLOUDFLARE_EMAIL_API_TOKEN, undefined);
});

test("public build arguments preserve special characters without shell interpolation", () => {
  const value = "public-$HOME-$(example)-`example`-with-'quotes'";
  const { calls } = recordRun("build", { contents: `NEXT_PUBLIC_EXAMPLE="${value}"\nSENTRY_AUTH_TOKEN=secret` });
  const argument = calls[0].configuration.containers[0].image_vars.CANOPY_PUBLIC_BUILD_ENV;
  assert.deepEqual(JSON.parse(argument), { NEXT_PUBLIC_EXAMPLE: value });
  assert.equal(calls[0].shell, undefined);
  assert.equal(calls[0].env.SENTRY_AUTH_TOKEN, undefined);
});

test("failure or interruption stops subsequent commands and removes generated files", () => {
  for (const result of [{ status: 2 }, { status: null, signal: "SIGTERM" }]) {
    const build = recordRun("build", { results: [result] });
    assert.equal(build.status, result.status ?? 1);
    assert.equal(build.calls.length, 1);
    const deploy = recordRun("deploy", { results: [result] });
    assert.equal(deploy.status, result.status ?? 1);
    assert.equal(existsSync(deploy.calls[0].configPath), false);
    assert.equal(existsSync(deploy.calls[0].secretsPath), false);
  }
});

test("spawn failures use a fixed safe error and clean up secrets", () => {
  let secretsPath;
  let configPath;
  assert.throws(
    () =>
      runCloudflare(["deploy"], config, {
        environment: {},
        readFile: () => "BETTER_AUTH_SECRET=fixture-only",
        execute(_command, args) {
          secretsPath = args[args.indexOf("--secrets-file") + 1];
          configPath = args[args.indexOf("--config") + 1];
          return { error: new Error("private child detail") };
        },
      }),
    /Unable to start the Cloudflare command/,
  );
  assert.equal(existsSync(secretsPath), false);
  assert.equal(existsSync(configPath), false);
});

test("a stale CI Worker override cannot redirect deployment to an old infrastructure name", () => {
  for (const mode of ["build", "preview", "deploy", "local"]) {
    assert.throws(
      () => recordRun(mode, { environment: { WRANGLER_CI_OVERRIDE_NAME: "legacy-worker" } }),
      /Cloudflare CI targets a different Worker/,
    );
    assert.throws(
      () => recordRun(mode, { contents: "WRANGLER_CI_OVERRIDE_NAME=legacy-worker" }),
      /Cloudflare CI targets a different Worker/,
    );
  }
});

test("invalid mode, extra arguments and inherited environment fail safely", () => {
  assert.throws(() => recordRun("unknown"), /Use build, local, preview, or deploy/);
  for (const args of [["--dry-run"], ["--env", "staging"]]) {
    assert.throws(() => recordRun(["deploy", ...args]), /do not accept extra arguments/);
  }
  assert.throws(() => recordRun("deploy", { environment: { CLOUDFLARE_ENV: "staging" } }), /Unset CLOUDFLARE_ENV/);
  assert.throws(() => recordRun("deploy", { contents: "CLOUDFLARE_ENV=staging" }), /Unset CLOUDFLARE_ENV/);
  assert.throws(() => recordRun("deploy", { configuration: { ...config, vars: {} } }), /Set APP_URL/);
  assert.throws(
    () => recordRun("deploy", { configuration: { ...config, containers: [] } }),
    /Configure the application container/,
  );
});

test("a missing selected file stops before commands without exposing filesystem details", () => {
  for (const mode of ["build", "deploy", "preview", "local"]) {
    let executed = false;
    assert.throws(
      () =>
        runCloudflare([mode], config, {
          environment: {},
          readFile() {
            throw new Error("private filesystem detail");
          },
          execute() {
            executed = true;
          },
        }),
      mode === "preview" || mode === "local" ? /Unable to read \.env\./ : /Unable to read \.env\.prod\./,
    );
    assert.equal(executed, false);
  }
});
