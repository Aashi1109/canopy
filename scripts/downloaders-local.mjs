import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { setTimeout as pause } from "node:timers/promises";
import { parse } from "dotenv";
import pg from "pg";
import { platformServices } from "../lib/downloaders/platformRegistry.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIRECTORY = "/tmp/canopy-downloaders-dev";
const SECRET_KEYS = ["DOWNLOADERS_CONTROL_SECRET", "DOWNLOADERS_GUEST_SECRET", "DOWNLOADERS_NETWORK_SECRET"];
const PLATFORMS = platformServices.map((service) => service.descriptor.platformId);
const LIMITS = {
  globalDailyJobs: 100,
  networkDailyJobs: 100,
  globalQueued: 10,
  platformActive: 1,
  platformStartsPerMinute: 10,
  globalDailyBytes: 20 * 1024 ** 3,
  globalMonthlyBytes: 100 * 1024 ** 3,
  globalDailyCostMicros: 1_000_000,
  jobCostMicros: 1000,
};

export function loadEnvironment(root, inherited = process.env) {
  const values = {};
  for (const name of [".env", ".env.local"]) {
    try {
      Object.assign(values, parse(readFileSync(join(root, name))));
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error(`Unable to read ${name}. Check its permissions.`);
    }
  }
  return { ...values, ...inherited };
}

export function localSettings(values, args = []) {
  const { values: options } = parseArgs({
    args,
    options: { "worker-only": { type: "boolean" }, "app-port": { type: "string" }, help: { type: "boolean" } },
    allowPositionals: false,
  });
  if (options.help) return { help: true };
  const env = { ...values };
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith("DOWNLOADERS_") && typeof value === "string" && !value.trim()) delete env[key];
  }
  if (env.NODE_ENV && env.NODE_ENV !== "development") throw new Error("This launcher requires NODE_ENV=development.");
  if (env.DOWNLOADERS_LOCAL !== undefined && env.DOWNLOADERS_LOCAL !== "true")
    throw new Error("Set DOWNLOADERS_LOCAL=true or unset it for this local launcher.");
  env.NODE_ENV = "development";
  env.DOWNLOADERS_LOCAL = "true";
  env.DOWNLOADERS_LOCAL_ORIGIN ??= "http://localhost:8788";
  let origin;
  try {
    origin = new URL(env.DOWNLOADERS_LOCAL_ORIGIN);
  } catch {
    throw new Error("DOWNLOADERS_LOCAL_ORIGIN must be an HTTP loopback origin.");
  }
  if (
    origin.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      "DOWNLOADERS_LOCAL_ORIGIN must be an HTTP localhost or 127.0.0.1 origin without a path or credentials.",
    );
  }
  const appPort = Number(options["app-port"] ?? env.PORT ?? "3000");
  const workerPort = Number(origin.port || "80");
  if (
    ![appPort, workerPort].every((port) => Number.isInteger(port) && port >= 1024 && port <= 65535) ||
    appPort === workerPort
  )
    throw new Error("Use distinct app and Worker ports between 1024 and 65535.");
  let database;
  try {
    database = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("Set DATABASE_URL in .env.local, .env, or your shell before starting downloaders.");
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname || database.pathname.length < 2)
    throw new Error("DATABASE_URL must be a PostgreSQL URL with a hostname and database name.");
  env.DOWNLOADERS_ENABLED ??= "true";
  env.DOWNLOADERS_YOUTUBE_INSPECTION ??= "true";
  env.DOWNLOADERS_INSTAGRAM_INSPECTION ??= "true";
  env.DOWNLOADERS_POOL_SIZE ??= "1";
  env.DOWNLOADERS_PLATFORMS ??= PLATFORMS.join(",");
  env.DOWNLOADERS_LIMITS ??= JSON.stringify(LIMITS);
  if (!["true", "false"].includes(env.DOWNLOADERS_ENABLED))
    throw new Error("DOWNLOADERS_ENABLED must be true or false.");
  if (env.DOWNLOADERS_POOL_SIZE !== "1")
    throw new Error("The local configuration supports one container; set DOWNLOADERS_POOL_SIZE=1.");
  const platforms = env.DOWNLOADERS_PLATFORMS.split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!platforms.length || platforms.some((p) => !PLATFORMS.includes(p)))
    throw new Error("DOWNLOADERS_PLATFORMS contains an unknown platform or is empty.");
  try {
    const limits = JSON.parse(env.DOWNLOADERS_LIMITS);
    if (
      Object.keys(limits).length !== Object.keys(LIMITS).length ||
      !Object.keys(LIMITS).every((key) => Number.isSafeInteger(limits[key]) && limits[key] > 0) ||
      limits.platformActive > 250
    )
      throw new Error();
  } catch {
    throw new Error("DOWNLOADERS_LIMITS must provide all documented positive capacity budgets.");
  }
  env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB = env.DATABASE_URL;
  return { env, appPort, workerPort, workerOnly: options["worker-only"] ?? false, platforms };
}

function privatePath(path, directory = false) {
  const stat = lstatSync(path);
  if (
    stat.isSymbolicLink() ||
    (directory ? !stat.isDirectory() : !stat.isFile()) ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw new Error("Local downloader state must be owned by this user and cannot use symlinks.");
  chmodSync(path, directory ? 0o700 : 0o600);
}

export function withLocalSecrets(env, directory = DIRECTORY) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  privatePath(directory, true);
  const path = join(directory, "secrets.json");
  let saved;
  try {
    privatePath(path);
    saved = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error(
        "Cannot read local downloader secrets.json. Preserve or deliberately remove this file before retrying.",
      );
    saved = Object.fromEntries(SECRET_KEYS.map((key) => [key, randomBytes(32).toString("base64url")]));
    writeFileSync(path, JSON.stringify(saved), { flag: "wx", mode: 0o600 });
  }
  const result = { ...env };
  for (const key of SECRET_KEYS) {
    if (result[key] === undefined || (typeof result[key] === "string" && !result[key].trim()))
      result[key] = saved?.[key];
    if (typeof result[key] !== "string" || result[key].length < 32)
      throw new Error(`${key} must contain at least 32 characters.`);
  }
  return result;
}

export function workerEnvironment(env) {
  // Keep Docker/Node host tooling; do not inherit cloud account credentials,
  // application integrations, or Cloudflare environment selection.
  const values = Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        /^(?:DOWNLOADERS_(?!R2_)|DOCKER_|WRANGLER_DOCKER_|MINIFLARE_CONTAINER_)/.test(key) ||
        [
          "PATH",
          "HOME",
          "USER",
          "LOGNAME",
          "TMPDIR",
          "TMP",
          "TEMP",
          "LANG",
          "TERM",
          "NODE_EXTRA_CA_CERTS",
          "NODE_USE_SYSTEM_CA",
        ].includes(key),
    ),
  );
  return {
    ...values,
    NODE_ENV: "development",
    CLOUDFLARE_ENV: "",
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB: env.DATABASE_URL,
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "true",
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "false",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_LOG_PATH: join(DIRECTORY, "wrangler.log"),
  };
}

export function workerEnvFile(env) {
  return (
    Object.entries(env)
      .filter(([key]) => key.startsWith("DOWNLOADERS_") && !key.startsWith("DOWNLOADERS_R2_"))
      .map(([key, value]) => {
        // Dotenv does not decode JSON quote/backslash escapes. Prefer literal
        // quoting, and verify the installed parser preserves the complete value.
        const escaped = value.replace(/\$/g, "\\$");
        for (const quoted of [`'${escaped}'`, `\`${escaped}\``, `"${escaped}"`, escaped]) {
          const line = `${key}=${quoted}`;
          if (parse(line)[key] === escaped && Object.keys(parse(line)).length === 1) return line;
        }
        throw new Error(`Cannot encode ${key} in the local environment file. Use a dotenv-compatible value.`);
      })
      .join("\n") + "\n"
  );
}

export function localControlToken(path, secret, now = Math.floor(Date.now() / 1000)) {
  const encoded = Buffer.from(
    JSON.stringify({
      purpose: "download-local-control-v1",
      path,
      bodyHash: createHash("sha256").update("{}").digest("hex"),
      expiresAt: now + 60,
    }),
  ).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

async function freePort(port, label) {
  await new Promise((done, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `${label} port ${port} is unavailable. Stop the existing server${label === "App" ? " and restart with this launcher, or pass --app-port <port>" : " or choose another DOWNLOADERS_LOCAL_ORIGIN port"}.`,
        ),
      ),
    );
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () => server.close(done));
  });
}

export async function checkDatabase(env, platforms, Client = pg.Client) {
  const client = new Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const tables = [
    "download_jobs",
    "download_policies",
    "download_quota_buckets",
    "download_attempts",
    "download_slots",
    "download_artifacts",
    "managed_tools",
  ];
  try {
    await client.connect();
    const result = await client.query(
      "SELECT name, to_regclass(name) IS NOT NULL AS present FROM unnest($1::text[]) AS name",
      [tables],
    );
    if (result.rows.some((row) => !row.present) || result.rows.length !== tables.length) throw new Error("schema");
    await client.query("SELECT inspect, inspection, selected_format FROM download_jobs LIMIT 0");
    if (!(await client.query("SELECT 1 FROM download_policies WHERE id='default'")).rowCount) throw new Error("schema");
    const catalog = await client.query(
      "SELECT tool_id,enabled,archived FROM managed_tools WHERE tool_id=ANY($1::text[])",
      [platforms.map((p) => `media.${p}-video-downloader`)],
    );
    return catalog.rows.filter((row) => row.enabled && !row.archived).length;
  } catch (error) {
    if (error.message === "schema" || ["42P01", "42703"].includes(error.code))
      throw new Error(
        "Downloader schema is missing. Run pnpm db:migrate 0009-media-downloaders and pnpm db:migrate 0010-download-format-inspection against this development database, then restart. No database changes were made by the launcher.",
      );
    throw new Error(
      "Cannot reach DATABASE_URL. Check PostgreSQL, its credentials and TLS settings. The launcher did not modify the database.",
    );
  } finally {
    await client.end().catch(() => {});
  }
}

export async function runLocal(args = process.argv.slice(2)) {
  const settings = localSettings(loadEnvironment(ROOT), args);
  if (settings.help) {
    console.log(
      "Usage: pnpm dev [--app-port <port>] [--worker-only]\nRequires Docker and the existing development DATABASE_URL. No deployment or automatic migration. Use pnpm dev:app for the app without download execution.",
    );
    return;
  }
  const dockerEnv = settings.env.WRANGLER_DOCKER_HOST
    ? { ...settings.env, DOCKER_HOST: settings.env.WRANGLER_DOCKER_HOST }
    : settings.env;
  const docker = spawnSync(settings.env.WRANGLER_DOCKER_BIN || "docker", ["info", "--format", "{{.ServerVersion}}"], {
    env: dockerEnv,
    timeout: 15_000,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (docker.error || docker.status !== 0)
    throw new Error(
      "Docker is unavailable. Start Docker Desktop or your Colima profile; set DOCKER_HOST to that daemon's socket if needed, then verify `docker info`. No global Docker context is changed.",
    );
  await freePort(settings.workerPort, "Worker");
  if (!settings.workerOnly) await freePort(settings.appPort, "App");
  const enabled = await checkDatabase(settings.env, settings.platforms);
  const env = withLocalSecrets(settings.env);
  const envFile = join(DIRECTORY, "worker.env");
  try {
    privatePath(envFile);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  writeFileSync(envFile, workerEnvFile(env), { mode: 0o600 });
  console.log(
    `Local download Worker: ${env.DOWNLOADERS_LOCAL_ORIGIN}; one container slot. Docker image builds may take several minutes.`,
  );
  if (env.DOWNLOADERS_ENABLED !== "true")
    console.warn(
      "DOWNLOADERS_ENABLED is explicitly false. The service will reject new downloads until you set it to true and restart.",
    );
  if (!enabled)
    console.warn(
      "No selected downloader is enabled in the tool catalog. Enable a seeded tool in Admin → Tools; the launcher does not seed or enable catalog rows.",
    );
  const children = new Set();
  let stopping = false,
    interval;
  const shutdown = (code = 0) => {
    if (stopping) return;
    stopping = true;
    clearInterval(interval);
    process.exitCode = code;
    for (const child of children) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
    const force = setTimeout(() => {
      for (const child of children) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    }, 10_000);
  };
  const launch = (script, arguments_, childEnv) => {
    const child = spawn(process.execPath, [join(ROOT, script), ...arguments_], {
      cwd: ROOT,
      env: childEnv,
      stdio: "inherit",
      detached: true,
    });
    children.add(child);
    child.once("error", () => {
      console.error("A local downloader process could not start.");
      shutdown(1);
    });
    // Keep the process-group identity through forced cleanup: a launcher can
    // exit while its non-cooperative grandchildren are still alive.
    child.once("exit", (code) => {
      if (!stopping) {
        console.error(`A local downloader process exited (${code ?? "signal"}); stopping its companions.`);
        shutdown(code || 1);
      }
    });
    return child;
  };
  const onSignal = () => shutdown();
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    launch(
      "node_modules/wrangler/bin/wrangler.js",
      [
        "dev",
        "--config",
        "wrangler.downloaders.local.jsonc",
        "--env",
        "",
        "--local",
        "--ip",
        "127.0.0.1",
        "--port",
        String(settings.workerPort),
        "--persist-to",
        join(DIRECTORY, "state"),
        "--env-file",
        envFile,
        "--experimental-provision=false",
        "--experimental-auto-create=false",
      ],
      workerEnvironment(env),
    );
    const call = async (path) => {
      const response = await fetch(new URL(path, env.DOWNLOADERS_LOCAL_ORIGIN), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localControlToken(path, env.DOWNLOADERS_CONTROL_SECRET)}`,
        },
        body: "{}",
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      await response.body?.cancel();
      return response.ok;
    };
    let ready = false;
    // Native dependency compilation can take several minutes on a cold image.
    const until = Date.now() + 15 * 60_000;
    while (!stopping && Date.now() < until) {
      try {
        ready = await call("/__download-health");
      } catch {
        /* Worker is still starting. */
      }
      if (ready) break;
      await pause(1000);
    }
    if (stopping) return;
    if (!ready)
      throw new Error("Local Worker did not become ready. Check its build/runtime output above; no app was started.");
    let maintaining = false;
    interval = setInterval(async () => {
      if (maintaining || stopping) return;
      maintaining = true;
      try {
        if (!(await call("/__download-maintenance")))
          console.warn("Local download maintenance failed; it will retry in 30 seconds.");
      } catch {
        if (!stopping) console.warn("Local download maintenance is unreachable; it will retry in 30 seconds.");
      } finally {
        maintaining = false;
      }
    }, 30_000);
    if (!settings.workerOnly) {
      const vendor = spawnSync(process.execPath, [join(ROOT, "scripts/copy-media-vendor.mjs")], {
        cwd: ROOT,
        env,
        stdio: "inherit",
      });
      if (vendor.error || vendor.status !== 0)
        throw new Error("Media vendor preparation failed; both services are stopping.");
      launch("node_modules/next/dist/bin/next", ["dev", "-p", String(settings.appPort)], env);
      console.log(`Open http://localhost:${settings.appPort}/downloaders. Press Ctrl+C to stop both services.`);
    } else
      console.log(
        "Worker only. An existing app must be restarted with the same local settings and secrets; see docs/downloaders-local.md.",
      );
  } catch (error) {
    shutdown(1);
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLocal().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
