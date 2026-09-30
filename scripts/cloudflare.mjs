import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { downloadConfiguration } from "../lib/downloaders/config.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OPEN_NEXT = "node_modules/@opennextjs/cloudflare/dist/cli/index.js";
const WRANGLER = "node_modules/wrangler/bin/wrangler.js";
// Preserve host tooling and Cloudflare authentication, never inherited app settings.
const HOST_VARIABLE =
  /^(?:PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TMP|TEMP|SystemRoot|COMSPEC|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_.*|TERM|CI|FORCE_COLOR|NO_COLOR|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS|NODE_USE_SYSTEM_CA|PNPM_HOME|(?:npm_config_|pnpm_config_|NPM_CONFIG_|COREPACK_).*|DOCKER_.*|WRANGLER_DOCKER_.*|CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_KEY|CLOUDFLARE_EMAIL|CLOUDFLARE_ACCOUNT_ID|CF_API_TOKEN|CF_API_KEY|CF_EMAIL|CF_ACCOUNT_ID|WRANGLER_CI_.*|WRANGLER_OUTPUT_FILE_.*|WORKERS_CI(?:_.*)?|WRANGLER_LOG.*|WRANGLER_SEND_METRICS)$/;
const BUILD_VARIABLE =
  /^(?:APP_URL|CI|NODE_ENV|NEXTJS_ENV|SENTRY_ORG|SENTRY_PROJECT|SENTRY_AUTH_TOKEN)$|^(?:NEXT_PUBLIC_|NODE_|__NEXT_|OPEN_NEXT_|SKIP_|CLOUDFLARE_|CF_|WRANGLER_|PLAYWRIGHT_)/;
// These application settings must reach the Worker, not the CI build environment.
const EMAIL_RUNTIME_VARIABLES = new Set(["CLOUDFLARE_EMAIL_ACCOUNT_ID", "CLOUDFLARE_EMAIL_API_TOKEN"]);
// Only known non-sensitive settings are visible; new or unknown values stay secret.
const PLAIN_VARIABLES = new Set([
  "DATABASE_POOL_MAX",
  "CACHE_ENABLED",
  "AUTH_COOKIE_PREFIX",
  "GOOGLE_CLIENT_ID",
  "EMAIL_PROVIDER",
  "CLOUDFLARE_EMAIL_ACCOUNT_ID",
  "ACCOUNTS_EMAIL",
  "SUPPORT_EMAIL",
  "CLOUDINARY_CLOUD_NAME",
  "AI_ENABLED",
  "AI_PROVIDER",
  "AI_TITLE_MODEL",
  "OPENAI_MODEL",
  "GA_MEASUREMENT_ID",
  "GA_ENABLE_IN_DEVELOPMENT",
  "VERCEL_ENV",
]);
const DOWNLOADER_VARIABLES = new Set([
  "DOWNLOADERS_ENABLED",
  "DOWNLOADERS_POOL_SIZE",
  "DOWNLOADERS_YOUTUBE_INSPECTION",
  "DOWNLOADERS_INSTAGRAM_INSPECTION",
  "DOWNLOADERS_PLATFORMS",
  "DOWNLOADERS_LIMITS",
  "DOWNLOADERS_R2_ACCOUNT_ID",
  "DOWNLOADERS_R2_BUCKET",
]);
const DOWNLOADER_SECRETS = new Set([
  "DOWNLOADERS_CONTROL_SECRET",
  "DOWNLOADERS_R2_ACCESS_KEY_ID",
  "DOWNLOADERS_R2_SECRET_ACCESS_KEY",
]);

function isBuildVariable(key) {
  return BUILD_VARIABLE.test(key) && !EMAIL_RUNTIME_VARIABLES.has(key);
}

function runtimeSettings(values, config) {
  const bindings = new Set(Object.keys(config.vars ?? {}));
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.binding === "string") bindings.add(value.binding);
    for (const child of Object.values(value)) visit(child);
  };
  visit(config);
  const vars = {};
  const secrets = {};
  for (const [key, value] of Object.entries(values)) {
    if (bindings.has(key) || HOST_VARIABLE.test(key) || isBuildVariable(key)) continue;
    (PLAIN_VARIABLES.has(key) ? vars : secrets)[key] = value;
  }
  return { vars, secrets };
}

export function runCloudflare(
  [mode, ...args],
  config,
  { environment = process.env, execute = spawnSync, readFile = readFileSync, downloaderConfig } = {},
) {
  if (args.length) {
    throw new Error(
      "Cloudflare scripts do not accept extra arguments. Configure deployment settings in wrangler.jsonc.",
    );
  }
  if (!["build", "local", "preview", "deploy"].includes(mode)) throw new Error("Use build, local, preview, or deploy.");
  if (environment.CLOUDFLARE_ENV) {
    throw new Error("Unset CLOUDFLARE_ENV: these scripts target the top-level wrangler.jsonc configuration.");
  }
  const dev = mode === "preview" || mode === "local";
  const workersBuild = !dev && ["1", "true"].includes(environment.WORKERS_CI);
  const selectedConfig = dev ? { ...config, ...config.env?.dev } : config;
  const environmentArgs = ["--env", dev ? "dev" : ""];
  const origin = mode === "local" ? "http://localhost:8787" : selectedConfig.vars?.APP_URL;
  const envFile = dev ? ".env" : ".env.prod";
  let values;
  try {
    values = workersBuild
      ? Object.fromEntries(Object.entries(environment).filter(([key]) => isBuildVariable(key)))
      : parseEnv(readFile(resolve(ROOT, envFile), "utf8"));
  } catch {
    throw new Error(`Unable to read ${envFile}. Create it before running this command.`);
  }
  if (values.CLOUDFLARE_ENV) {
    throw new Error("Unset CLOUDFLARE_ENV: these scripts target the top-level wrangler.jsonc configuration.");
  }
  const env = {
    ...Object.fromEntries(Object.entries(environment).filter(([key]) => HOST_VARIABLE.test(key))),
    ...values,
    APP_URL: origin,
    CLOUDFLARE_ENV: "",
    NODE_ENV: "production",
    NEXTJS_ENV: "production",
    // Next's loader must not fill omitted settings from .env.local or other defaults.
    // Covered against the installed @next/env implementation by an integration test.
    __NEXT_PROCESSED_ENV: "true",
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
    OPEN_NEXT_DEPLOY: "true",
  };
  function deployWorker(configPath, { vars, secrets }, deploymentEnv = env) {
    const directory = mkdtempSync(join(tmpdir(), "canopy-worker-secrets-"));
    try {
      const secretsFile = join(directory, "secrets.json");
      writeFileSync(secretsFile, JSON.stringify(secrets), { mode: 0o600 });
      const result = execute(
        process.execPath,
        [
          WRANGLER,
          "deploy",
          "--config",
          configPath,
          ...environmentArgs,
          "--env-file",
          envFile,
          ...Object.entries(vars).flatMap(([key, value]) => ["--var", `${key}:${value}`]),
          "--secrets-file",
          secretsFile,
        ],
        { cwd: ROOT, env: deploymentEnv, stdio: "inherit" },
      );
      if (result.error) throw new Error("Unable to start the Cloudflare command.");
      return result.status ?? 1;
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  if (mode === "preview") {
    if (!downloaderConfig?.env?.dev)
      throw new Error("Configure env.dev in wrangler.downloaders.jsonc before preview deployment.");
    const settings = { vars: {}, secrets: {} };
    for (const [key, value] of Object.entries(values)) {
      if (!value.trim()) continue;
      if (DOWNLOADER_VARIABLES.has(key)) settings.vars[key] = value;
      else if (DOWNLOADER_SECRETS.has(key)) settings.secrets[key] = value;
    }
    const downloaderValues = { ...downloaderConfig.env.dev.vars, ...settings.vars, ...settings.secrets };
    if (downloaderValues.DOWNLOADERS_ENABLED?.trim() !== "false") {
      const required = {
        DOWNLOADERS_CONTROL_SECRET: 32,
        DOWNLOADERS_GUEST_SECRET: 32,
        DOWNLOADERS_NETWORK_SECRET: 32,
        DOWNLOADERS_R2_ACCESS_KEY_ID: 1,
        DOWNLOADERS_R2_SECRET_ACCESS_KEY: 1,
      };
      const missing = Object.entries(required)
        .filter(([key, length]) => (values[key]?.trim().length ?? 0) < length)
        .map(([key]) => key);
      if (missing.length)
        throw new Error(`Set valid downloader credentials in .env before deployment: ${missing.join(", ")}.`);
      if (!/^[a-f0-9]{32}$/.test(downloaderValues.DOWNLOADERS_R2_ACCOUNT_ID ?? ""))
        throw new Error("Set DOWNLOADERS_R2_ACCOUNT_ID to your 32-character R2 account ID before deployment.");
      const bucket = downloaderConfig.env.dev.r2_buckets?.find(({ binding }) => binding === "DOWNLOAD_FILES");
      if (
        !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(downloaderValues.DOWNLOADERS_R2_BUCKET ?? "") ||
        downloaderValues.DOWNLOADERS_R2_BUCKET !== bucket?.bucket_name
      )
        throw new Error("Set DOWNLOADERS_R2_BUCKET to the dev DOWNLOAD_FILES bucket in wrangler.downloaders.jsonc.");
    }
    try {
      downloadConfiguration(downloaderValues);
    } catch {
      throw new Error(
        "Invalid downloader settings in .env or wrangler.downloaders.jsonc (DOWNLOADERS_ENABLED, DOWNLOADERS_POOL_SIZE, DOWNLOADERS_PLATFORMS, DOWNLOADERS_LIMITS, DOWNLOADERS_YOUTUBE_INSPECTION, DOWNLOADERS_INSTAGRAM_INSPECTION).",
      );
    }
    // An app-specific CI target must never redirect the backend deployment.
    const downloaderEnv = Object.fromEntries(
      Object.entries(env).filter(([key]) => !/^WRANGLER_(?:CI_|OUTPUT_FILE_)/.test(key)),
    );
    const status = deployWorker("wrangler.downloaders.jsonc", settings, downloaderEnv);
    if (status !== 0) return status;
  }
  // Never reuse a prior preview's Next output, even if SKIP_NEXT_APP_BUILD is set.
  const commands = [
    [OPEN_NEXT, "build", "--config", "wrangler.jsonc", ...environmentArgs, "--skipNextBuild=false"],
    ["scripts/clear-cloudflare-build-env.mjs"],
  ];
  if (mode === "local") {
    commands.push([
      WRANGLER,
      "dev",
      "--config",
      "wrangler.jsonc",
      ...environmentArgs,
      "--env-file",
      envFile,
      "--port",
      "8787",
      "--var",
      `APP_URL:${origin}`,
    ]);
  } else if (workersBuild && mode === "deploy") {
    // Keep runtime settings already uploaded by a local deployment.
    commands.push([WRANGLER, "deploy", "--config", "wrangler.jsonc", ...environmentArgs, "--keep-vars"]);
  }
  for (const args of commands) {
    let childEnv = env;
    if (mode === "local" && args[0] === WRANGLER) {
      childEnv = {
        ...env,
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "true",
        CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB: values.DATABASE_URL,
      };
    } else if (workersBuild && args[0] === OPEN_NEXT) {
      // Better Auth initializes while Next collects routes. This disposable key
      // is only for the build process; the scrubber removes bundled fallbacks.
      childEnv = { ...env, BETTER_AUTH_SECRET: randomBytes(32).toString("hex") };
    }
    const result = execute(process.execPath, args, { cwd: ROOT, env: childEnv, stdio: "inherit" });
    if (result.error) throw new Error("Unable to start the Cloudflare command.");
    if (result.status !== 0) return result.status ?? 1;
  }
  if (!workersBuild && (mode === "deploy" || mode === "preview")) {
    // OpenNext's deploy helper reloads default env files. This app has no remote
    // OpenNext cache to populate, so deploy the scrubbed bundle with Wrangler.
    return deployWorker("wrangler.jsonc", runtimeSettings(values, selectedConfig));
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { experimental_readRawConfig } = await import("wrangler");
    let config, downloaderConfig;
    try {
      ({ rawConfig: config } = experimental_readRawConfig({ config: resolve(ROOT, "wrangler.jsonc") }));
    } catch {
      throw new Error("Unable to read wrangler.jsonc.");
    }
    if (process.argv[2] === "preview") {
      try {
        ({ rawConfig: downloaderConfig } = experimental_readRawConfig({
          config: resolve(ROOT, "wrangler.downloaders.jsonc"),
        }));
      } catch {
        throw new Error("Unable to read wrangler.downloaders.jsonc.");
      }
    }
    process.exitCode = runCloudflare(process.argv.slice(2), config, { downloaderConfig });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
