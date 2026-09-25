import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, onTestFinished, test } from "vitest";
import { runCloudflare } from "../scripts/cloudflare.mjs";

const require = createRequire(import.meta.url);
const nextEnv = createRequire(require.resolve("next/package.json")).resolve("@next/env");
const config = {
  vars: { APP_URL: "https://canopy.example" },
  env: { dev: { vars: { APP_URL: "https://canopy-dev.example.workers.dev" } } },
  routes: [{ pattern: "canopy.example", custom_domain: true }],
};

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "canopy-cloudflare-env-"));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const files = {
    ".env": "CANOPY_SELECTED=preview\nCANOPY_PREVIEW_ONLY=preview-only\n",
    ".env.prod": "CANOPY_SELECTED=production\nCANOPY_PRODUCTION_ONLY=production-only\n",
    ".env.local": "CANOPY_SELECTED=local-conflict\nCANOPY_LOCAL_ONLY=must-not-leak\n",
    ".env.production": "CANOPY_SELECTED=production-default-conflict\nCANOPY_DEFAULT_PRODUCTION_ONLY=must-not-leak\n",
    ".env.production.local": "CANOPY_SELECTED=production-local-conflict\nCANOPY_PRODUCTION_LOCAL_ONLY=must-not-leak\n",
    ".dev.vars": "CANOPY_SELECTED=dev-vars-conflict\nCANOPY_DEV_VARS_ONLY=must-not-leak\n",
  };
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(directory, name), contents);
  writeFileSync(join(directory, "wrangler.jsonc"), JSON.stringify(config));
  return directory;
}

function commandsFor(mode, directory) {
  const commands = [];
  const status = runCloudflare([mode], config, {
    environment: { CANOPY_SELECTED: "shell-conflict", CANOPY_SHELL_ONLY: "must-not-leak" },
    readFile(path) {
      // The wrapper's selected filename is resolved only inside our synthetic fixture.
      return readFileSync(join(directory, basename(path)), "utf8");
    },
    execute(command, args, { env }) {
      commands.push({ command, args, env });
      return { status: 0 };
    },
  });
  expect(status).toBe(0);
  return commands;
}

function runLoader(code, environment, directory) {
  const result = spawnSync(process.execPath, ["--input-type=commonjs", "-e", code], {
    cwd: directory,
    env: {
      ...environment,
      WRANGLER_LOG_PATH: join(directory, "wrangler.log"),
      WRANGLER_SEND_METRICS: "false",
    },
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

test.each(["build", "deploy", "preview"])(
  "%s child environment prevents the installed Next loader from filling omitted settings from default files",
  (mode) => {
    const directory = fixture();
    const [build] = commandsFor(mode, directory);
    const loaded = runLoader(
      `const { loadEnvConfig } = require(${JSON.stringify(nextEnv)});
       const { combinedEnv } = loadEnvConfig(process.cwd(), false);
       process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(combinedEnv).filter(([key]) => key.startsWith('CANOPY_')))));`,
      build.env,
      directory,
    );
    expect(loaded).toEqual(
      mode === "preview"
        ? { CANOPY_SELECTED: "preview", CANOPY_PREVIEW_ONLY: "preview-only" }
        : { CANOPY_SELECTED: "production", CANOPY_PRODUCTION_ONLY: "production-only" },
    );
  },
);

test("preview uploads only its selected .env values as Worker secrets", () => {
  const directory = fixture();
  let secrets;
  runCloudflare(["preview"], config, {
    environment: {},
    readFile(path) {
      return readFileSync(join(directory, basename(path)), "utf8");
    },
    execute(_command, args) {
      if (args.includes("--secrets-file")) secrets = JSON.parse(readFileSync(args.at(-1), "utf8"));
      return { status: 0 };
    },
  });
  expect(secrets).toEqual({ CANOPY_SELECTED: "preview", CANOPY_PREVIEW_ONLY: "preview-only" });
});

test("Workers Builds initializes installed Better Auth with a temporary key that never reaches deployment", () => {
  const directory = mkdtempSync(join(tmpdir(), "canopy-cloudflare-auth-"));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const commands = [];
  expect(
    runCloudflare(["deploy"], config, {
      environment: { WORKERS_CI: "1", BETTER_AUTH_SECRET: "inherited-runtime-key-must-not-be-used" },
      readFile() {
        throw new Error("Workers Builds must not read an environment file");
      },
      execute(_command, args, { env }) {
        commands.push({ args, env });
        return { status: 0 };
      },
    }),
  ).toBe(0);

  const [build, scrub, deployment] = commands;
  const authModule = pathToFileURL(require.resolve("better-auth")).href;
  const authRequire = createRequire(require.resolve("better-auth"));
  const adapterModule = pathToFileURL(authRequire.resolve("@better-auth/memory-adapter")).href;
  const initialized = runLoader(
    `(async () => {
       const { betterAuth } = await import(${JSON.stringify(authModule)});
       const { memoryAdapter } = await import(${JSON.stringify(adapterModule)});
       const auth = betterAuth({
         baseURL: process.env.APP_URL,
         database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
         telemetry: { enabled: false },
       });
       await auth.$context;
       process.stdout.write(JSON.stringify({ initialized: true }));
     })().catch(() => {
       process.stderr.write('Better Auth context failed to initialize');
       process.exitCode = 1;
     });`,
    build.env,
    directory,
  );
  expect(initialized).toEqual({ initialized: true });
  expect(build.env.BETTER_AUTH_SECRET).toMatch(/^[a-f0-9]{64}$/);
  expect(scrub.env.BETTER_AUTH_SECRET).toBeUndefined();
  expect(deployment.env.BETTER_AUTH_SECRET).toBeUndefined();
  expect(deployment.args).toContain("--keep-vars");
  expect(deployment.args).not.toContain("--secrets-file");
});

test("the build scrubber removes bundled runtime fallbacks for every environment", () => {
  const directory = fixture();
  mkdirSync(join(directory, "scripts"));
  mkdirSync(join(directory, ".open-next", "cloudflare"), { recursive: true });
  const script = join(directory, "scripts", "clear-cloudflare-build-env.mjs");
  copyFileSync(fileURLToPath(new URL("../scripts/clear-cloudflare-build-env.mjs", import.meta.url)), script);
  writeFileSync(
    join(directory, ".open-next", "cloudflare", "next-env.mjs"),
    'export const production = { CANOPY_PRODUCTION: "must-not-leak" };\n' +
      'export const development = { CANOPY_LOCAL: "must-not-leak" };\n' +
      'export const test = { CANOPY_TEST: "must-not-leak" };\n',
  );
  const result = spawnSync(process.execPath, [script], { cwd: directory, env: {}, encoding: "utf8", timeout: 10_000 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const values = runLoader(
    `import(${JSON.stringify(join(directory, ".open-next", "cloudflare", "next-env.mjs"))}).then((values) => process.stdout.write(JSON.stringify(values)));`,
    {},
    directory,
  );
  expect(values).toEqual({ production: {}, development: {}, test: {} });
});
