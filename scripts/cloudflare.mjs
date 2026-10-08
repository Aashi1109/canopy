import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const WRANGLER = "node_modules/wrangler/bin/wrangler.js";
// Preserve host tooling and Cloudflare authentication, never inherited app settings.
const HOST_VARIABLE =
  /^(?:PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TMP|TEMP|SystemRoot|COMSPEC|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_.*|TERM|CI|FORCE_COLOR|NO_COLOR|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS|NODE_USE_SYSTEM_CA|PNPM_HOME|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_CONFIG|DOCKER_CERT_PATH|DOCKER_TLS_VERIFY|BUILDX_BUILDER|XDG_RUNTIME_DIR|(?:npm_config_|pnpm_config_|NPM_CONFIG_|COREPACK_).*|CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_KEY|CLOUDFLARE_EMAIL|CLOUDFLARE_ACCOUNT_ID|CF_API_TOKEN|CF_API_KEY|CF_EMAIL|CF_ACCOUNT_ID|WRANGLER_CI_.*|WRANGLER_OUTPUT_FILE_.*|WORKERS_CI(?:_.*)?|WRANGLER_LOG.*|WRANGLER_SEND_METRICS|WRANGLER_DOCKER_BIN)$/;
const DOCKER_VARIABLE = /^(?:DOCKER_|BUILDX_|WRANGLER_DOCKER_BIN$)/;
const BUILD_VARIABLE =
  /^(?:APP_URL|CI|NODE_ENV|NEXTJS_ENV|SENTRY_ORG|SENTRY_PROJECT|SENTRY_AUTH_TOKEN)$|^(?:NEXT_PUBLIC_|NODE_|__NEXT_|SKIP_|CLOUDFLARE_|CF_|WRANGLER_|PLAYWRIGHT_)/;
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

function isBuildVariable(key) {
  return BUILD_VARIABLE.test(key) && !EMAIL_RUNTIME_VARIABLES.has(key);
}

function runtimeSettings(values, config) {
  const bindings = new Set(Object.keys(config.vars ?? {}));
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.binding === "string") bindings.add(value.binding);
    if (typeof value.name === "string" && typeof value.class_name === "string") bindings.add(value.name);
    for (const child of Object.values(value)) visit(child);
  };
  visit(config);
  const vars = {};
  const secrets = {};
  for (const [key, value] of Object.entries(values)) {
    if (bindings.has(key) || HOST_VARIABLE.test(key) || DOCKER_VARIABLE.test(key) || isBuildVariable(key)) continue;
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
  if (typeof origin !== "string" || !/^https?:\/\//.test(origin)) {
    throw new Error("Set APP_URL to the public origin in wrangler.jsonc.");
  }
  if (!selectedConfig.containers?.length) {
    throw new Error("Configure the application container in wrangler.jsonc.");
  }
  const publicValues = Object.fromEntries(
    Object.entries(values).filter(([key]) => /^NEXT_PUBLIC_[A-Z0-9_]+$/.test(key)),
  );
  const imageVars = {
    APP_URL: origin,
    CANOPY_PUBLIC_BUILD_ENV: JSON.stringify(publicValues),
    // A fresh image revision makes env-only deploys roll running containers too.
    CANOPY_DEPLOYMENT_REVISION: randomUUID(),
  };
  // Wrangler receives host tooling credentials only; Docker receives public build
  // arguments only. Runtime secrets travel separately and never enter the image.
  const env = {
    // App dotenv files can contain stale Docker sockets. Use the invoking shell's
    // Docker overrides, or leave them unset so Docker uses its active context.
    ...Object.fromEntries(
      Object.entries({ ...environment, ...values })
        .filter(([key]) => HOST_VARIABLE.test(key) || DOCKER_VARIABLE.test(key))
        .map(([key, value]) => [key, DOCKER_VARIABLE.test(key) ? environment[key] : value])
        .filter(([, value]) => value !== undefined),
    ),
    APP_URL: origin,
    CLOUDFLARE_ENV: "",
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: mode === "local" ? "true" : "false",
  };
  // Wrangler otherwise replaces the configured name with a stale Workers Builds
  // association, which can target the old Worker after an infrastructure rename.
  if (env.WRANGLER_CI_OVERRIDE_NAME && env.WRANGLER_CI_OVERRIDE_NAME !== selectedConfig.name) {
    throw new Error(
      "Cloudflare CI targets a different Worker. Connect the build to the Worker named in wrangler.jsonc.",
    );
  }
  const directory = mkdtempSync(join(tmpdir(), "canopy-container-deploy-"));
  try {
    // Keep generated configuration and runtime secrets outside the Docker context.
    // Absolute paths preserve repository resolution from this temporary location.
    const generatedConfig = structuredClone(config);
    generatedConfig.main = resolve(ROOT, config.main ?? "worker.ts");
    // Wrangler normalizes config tsconfig relative to cwd but resolves it from
    // the config's project root. A positional entry and CLI tsconfig keep both
    // rooted in the repository when the generated config lives in /tmp.
    delete generatedConfig.tsconfig;
    // Wrangler validates top-level containers even when a named environment is
    // selected, so relocate every Dockerfile reference before writing the file.
    for (const section of [generatedConfig, ...Object.values(generatedConfig.env ?? {})]) {
      if (section.containers) {
        section.containers = section.containers.map((container) => ({
          ...container,
          image: resolve(ROOT, container.image),
          image_build_context: resolve(ROOT, container.image_build_context ?? "."),
        }));
      }
    }
    const target = dev ? generatedConfig.env.dev : generatedConfig;
    target.vars = { ...selectedConfig.vars, APP_URL: origin };
    target.containers = target.containers.map((container) => ({ ...container, image_vars: imageVars }));
    if (mode === "local") {
      const { vars, secrets } = runtimeSettings(values, selectedConfig);
      target.vars = { ...target.vars, ...vars };
      target.secrets = { ...target.secrets, required: Object.keys(secrets) };
      Object.assign(env, secrets);
    }
    const configFile = join(directory, "wrangler.json");
    writeFileSync(configFile, JSON.stringify(generatedConfig), { mode: 0o600 });
    // Wrangler's CLI loads .env/.env.local even when dev-var loading is off.
    // Select an empty file in every mode. Local runtime secrets are passed via
    // process.env and explicitly declared above, without loading host overrides.
    const emptyEnvFile = join(directory, "empty.env");
    writeFileSync(emptyEnvFile, "", { mode: 0o600 });
    const wranglerArgs = [
      generatedConfig.main,
      "--tsconfig",
      resolve(ROOT, config.tsconfig ?? "tsconfig.json"),
      "--config",
      configFile,
      ...environmentArgs,
      "--env-file",
      emptyEnvFile,
    ];
    const commands = [];
    if (mode === "build") {
      commands.push([
        process.execPath,
        [WRANGLER, "deploy", ...wranglerArgs, "--dry-run", "--outdir", join(directory, "bundle")],
      ]);
    } else if (mode === "local") {
      commands.push([
        process.execPath,
        [WRANGLER, "dev", ...wranglerArgs, "--port", "8787", "--var", `APP_URL:${origin}`],
      ]);
    } else if (workersBuild) {
      // CI has no runtime secrets; retain the values from the prior deployment.
      commands.push([process.execPath, [WRANGLER, "deploy", ...wranglerArgs, "--keep-vars"]]);
    } else {
      const { vars, secrets } = runtimeSettings(values, selectedConfig);
      const secretsFile = join(directory, "secrets.json");
      writeFileSync(secretsFile, JSON.stringify(secrets), { mode: 0o600 });
      commands.push([
        process.execPath,
        [
          WRANGLER,
          "deploy",
          ...wranglerArgs,
          ...Object.entries(vars).flatMap(([key, value]) => ["--var", `${key}:${value}`]),
          "--secrets-file",
          secretsFile,
        ],
      ]);
    }
    for (const [command, commandArgs] of commands) {
      const result = execute(command, commandArgs, { cwd: ROOT, env, stdio: "inherit" });
      if (result.error) throw new Error("Unable to start the Cloudflare command.");
      if (result.status !== 0) return result.status ?? 1;
    }
    return 0;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
