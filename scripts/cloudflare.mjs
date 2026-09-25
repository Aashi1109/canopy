import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OPEN_NEXT = "node_modules/@opennextjs/cloudflare/dist/cli/index.js";
const WRANGLER = "node_modules/wrangler/bin/wrangler.js";
// Preserve host tooling and Cloudflare authentication, never inherited app settings.
const HOST_VARIABLE =
  /^(?:PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TMP|TEMP|SystemRoot|COMSPEC|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_.*|TERM|CI|FORCE_COLOR|NO_COLOR|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS|NODE_USE_SYSTEM_CA|PNPM_HOME|(?:npm_config_|pnpm_config_|NPM_CONFIG_|COREPACK_).*|CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_KEY|CLOUDFLARE_EMAIL|CLOUDFLARE_ACCOUNT_ID|CF_API_TOKEN|CF_API_KEY|CF_EMAIL|CF_ACCOUNT_ID|WRANGLER_CI_.*|WRANGLER_OUTPUT_FILE_.*|WORKERS_CI(?:_.*)?|WRANGLER_LOG.*|WRANGLER_SEND_METRICS)$/;
const BUILD_VARIABLE =
  /^(?:APP_URL|CI|NODE_ENV|NEXTJS_ENV|SENTRY_ORG|SENTRY_PROJECT|SENTRY_AUTH_TOKEN)$|^(?:NEXT_PUBLIC_|NODE_|__NEXT_|OPEN_NEXT_|SKIP_|CLOUDFLARE_|CF_|WRANGLER_|PLAYWRIGHT_)/;
// Only known non-sensitive settings are visible; new or unknown values stay secret.
const PLAIN_VARIABLES = new Set([
  "DATABASE_POOL_MAX",
  "CACHE_ENABLED",
  "AUTH_COOKIE_PREFIX",
  "GOOGLE_CLIENT_ID",
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
    if (bindings.has(key) || HOST_VARIABLE.test(key) || BUILD_VARIABLE.test(key)) continue;
    (PLAIN_VARIABLES.has(key) ? vars : secrets)[key] = value;
  }
  return { vars, secrets };
}

export function runCloudflare(
  [mode, ...args],
  config,
  { environment = process.env, execute = spawnSync, readFile = readFileSync } = {},
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
  const environmentArgs = dev ? ["--env", "dev"] : [];
  const origin = mode === "local" ? "http://localhost:8787" : selectedConfig.vars?.APP_URL;
  const envFile = dev ? ".env" : ".env.prod";
  let values;
  try {
    values = workersBuild
      ? Object.fromEntries(Object.entries(environment).filter(([key]) => BUILD_VARIABLE.test(key)))
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
    commands.push([WRANGLER, "deploy", "--config", "wrangler.jsonc", "--keep-vars"]);
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
    const { vars, secrets } = runtimeSettings(values, selectedConfig);
    const directory = mkdtempSync(join(tmpdir(), "canopy-worker-secrets-"));
    try {
      const secretsFile = join(directory, "secrets.json");
      writeFileSync(secretsFile, JSON.stringify(secrets), { mode: 0o600 });
      // OpenNext's deploy helper reloads default env files. This app has no remote
      // OpenNext cache to populate, so deploy the scrubbed bundle with Wrangler.
      const result = execute(
        process.execPath,
        [
          WRANGLER,
          "deploy",
          "--config",
          "wrangler.jsonc",
          ...environmentArgs,
          "--env-file",
          envFile,
          ...Object.entries(vars).flatMap(([key, value]) => ["--var", `${key}:${value}`]),
          "--secrets-file",
          secretsFile,
        ],
        { cwd: ROOT, env, stdio: "inherit" },
      );
      if (result.error) throw new Error("Unable to start the Cloudflare command.");
      return result.status ?? 1;
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { experimental_readRawConfig } = await import("wrangler");
    let config;
    try {
      ({ rawConfig: config } = experimental_readRawConfig({ config: resolve(ROOT, "wrangler.jsonc") }));
    } catch {
      throw new Error("Unable to read wrangler.jsonc.");
    }
    process.exitCode = runCloudflare(process.argv.slice(2), config);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
