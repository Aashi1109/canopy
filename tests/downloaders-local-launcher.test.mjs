import { afterEach, expect, test } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "dotenv";
import {
  checkDatabase,
  loadEnvironment,
  localControlToken,
  localSettings,
  withLocalSecrets,
  workerEnvironment,
  workerEnvFile,
} from "../scripts/downloaders-local.mjs";

const database = "postgresql://developer:password@localhost:5432/canopy_dev";
const temporary = [];
const directory = () => {
  const path = mkdtempSync(join(tmpdir(), "canopy-local-launcher-test-"));
  temporary.push(path);
  return path;
};
afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

test("shell values win over .env.local, which wins over .env", () => {
  const root = directory();
  writeFileSync(join(root, ".env"), 'DATABASE_URL="postgresql://base/db"\nDOWNLOADERS_ENABLED=false\nFROM_BASE=base\n');
  writeFileSync(join(root, ".env.local"), `DATABASE_URL=${database}\nDOWNLOADERS_ENABLED=true\n`);
  expect(loadEnvironment(root, { DOWNLOADERS_ENABLED: "false" })).toEqual({
    DATABASE_URL: database,
    DOWNLOADERS_ENABLED: "false",
    FROM_BASE: "base",
  });
});

test("local defaults use one slot and the local Worker transport", () => {
  const settings = localSettings({ DATABASE_URL: database });
  expect(settings.env.DOWNLOADERS_LOCAL).toBe("true");
  expect(settings.env.DOWNLOADERS_ENABLED).toBe("true");
  expect(settings.env.DOWNLOADERS_INSTAGRAM_INSPECTION).toBe("true");
  expect(settings.env.DOWNLOADERS_LOCAL_ORIGIN).toBe("http://localhost:8788");
  expect(settings.env.DOWNLOADERS_POOL_SIZE).toBe("1");
  expect(settings.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB).toBe(database);
  expect(settings.appPort).toBe(3000);
  expect(settings.workerPort).toBe(8788);
});

test("blank downloader placeholders in a copied environment example use local defaults", () => {
  const settings = localSettings({
    DATABASE_URL: database,
    DOWNLOADERS_LOCAL: "",
    DOWNLOADERS_LOCAL_ORIGIN: " ",
    DOWNLOADERS_CONTROL_SECRET: "",
    DOWNLOADERS_LIMITS: "",
    DOWNLOADERS_PLATFORMS: "",
    DOWNLOADERS_INSTAGRAM_INSPECTION: "",
  });
  expect(settings.env.DOWNLOADERS_LOCAL).toBe("true");
  expect(settings.env.DOWNLOADERS_LOCAL_ORIGIN).toBe("http://localhost:8788");
  expect(settings.env.DOWNLOADERS_CONTROL_SECRET).toBeUndefined();
  expect(settings.env.DOWNLOADERS_INSTAGRAM_INSPECTION).toBe("true");
  expect(JSON.parse(settings.env.DOWNLOADERS_LIMITS).globalDailyJobs).toBeGreaterThan(0);
});

test("explicit downloader settings and Docker socket remain intact", () => {
  const env = {
    DATABASE_URL: database,
    DOWNLOADERS_ENABLED: "false",
    DOWNLOADERS_INSTAGRAM_INSPECTION: "false",
    DOWNLOADERS_PLATFORMS: "dailymotion",
    DOCKER_HOST: "unix:///tmp/developer-docker.sock",
    PORT: "3010",
  };
  const settings = localSettings(env, ["--worker-only", "--app-port", "3011"]);
  expect(settings.workerOnly).toBe(true);
  expect(settings.appPort).toBe(3011);
  expect(settings.env.DOWNLOADERS_ENABLED).toBe("false");
  expect(settings.env.DOWNLOADERS_INSTAGRAM_INSPECTION).toBe("false");
  expect(settings.env.DOCKER_HOST).toBe(env.DOCKER_HOST);
});

test.each([
  "https://localhost:8788",
  "http://worker.example:8788",
  "http://localhost:8788/path",
  "http://user:password@localhost:8788",
  "http://localhost:8788?secret=value",
  "http://localhost:3000",
])("unsafe local origin %s is rejected", (origin) => {
  expect(() => localSettings({ DATABASE_URL: database, DOWNLOADERS_LOCAL_ORIGIN: origin })).toThrow();
});

test.each([undefined, "not-a-database", "https://db.example/canopy", "postgres:///canopy", "postgres://localhost"])(
  "invalid database configuration fails without echoing it",
  (value) => {
    expect(() => localSettings({ DATABASE_URL: value })).toThrow(/DATABASE_URL/);
  },
);

test("explicit unsupported pool and invalid limits fail instead of being overwritten", () => {
  expect(() => localSettings({ DATABASE_URL: database, DOWNLOADERS_POOL_SIZE: "2" })).toThrow(/one container/);
  expect(() => localSettings({ DATABASE_URL: database, DOWNLOADERS_LIMITS: "{}" })).toThrow(/capacity budgets/);
});

test("generated local secrets are private and stable, while supplied secrets take precedence", () => {
  const root = directory();
  const first = withLocalSecrets({}, root);
  expect(withLocalSecrets({}, root)).toEqual(first);
  expect(first.DOWNLOADERS_CONTROL_SECRET.length).toBeGreaterThanOrEqual(32);
  expect(statSync(join(root, "secrets.json")).mode & 0o777).toBe(0o600);
  expect(statSync(root).mode & 0o777).toBe(0o700);
  const supplied = "supplied-control-secret-with-at-least-32-characters";
  expect(withLocalSecrets({ DOWNLOADERS_CONTROL_SECRET: supplied }, root).DOWNLOADERS_CONTROL_SECRET).toBe(supplied);
  expect(JSON.parse(readFileSync(join(root, "secrets.json"), "utf8")).DOWNLOADERS_CONTROL_SECRET).toBe(
    first.DOWNLOADERS_CONTROL_SECRET,
  );
  expect(withLocalSecrets({ DOWNLOADERS_CONTROL_SECRET: "" }, root).DOWNLOADERS_CONTROL_SECRET).toBe(
    first.DOWNLOADERS_CONTROL_SECRET,
  );
  expect(() => withLocalSecrets({ DOWNLOADERS_CONTROL_SECRET: "too-short" }, root)).toThrow(/32 characters/);
});

test("local secrets cannot overwrite a symlink target", () => {
  const root = directory();
  const target = join(root, "keep.json");
  writeFileSync(target, "unchanged");
  symlinkSync(target, join(root, "secrets.json"));
  expect(() => withLocalSecrets({}, root)).toThrow(/secrets.json/);
  expect(readFileSync(target, "utf8")).toBe("unchanged");
});

test("Worker host environment keeps Docker settings but excludes cloud and unrelated app credentials", () => {
  const env = workerEnvironment({
    DATABASE_URL: database,
    HOME: "/home/developer",
    DOCKER_HOST: "unix:///tmp/docker.sock",
    PATH: "/usr/bin",
    DOWNLOADERS_CONTROL_SECRET: "local-secret",
    CLOUDFLARE_API_TOKEN: "cloud-secret",
    AWS_SECRET_ACCESS_KEY: "aws-secret",
    BETTER_AUTH_SECRET: "auth-secret",
    DOWNLOADERS_R2_SECRET_ACCESS_KEY: "remote-storage-secret",
    CLOUDFLARE_ENV: "production",
  });
  expect(env.DOCKER_HOST).toBe("unix:///tmp/docker.sock");
  expect(env.DOWNLOADERS_CONTROL_SECRET).toBe("local-secret");
  expect(env.CLOUDFLARE_API_TOKEN).toBeUndefined();
  expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  expect(env.BETTER_AUTH_SECRET).toBeUndefined();
  expect(env.DOWNLOADERS_R2_SECRET_ACCESS_KEY).toBeUndefined();
  expect(env.CLOUDFLARE_ENV).toBe("");
});

test("Wrangler's private dotenv file preserves JSON budgets, quotes, backslashes and escaped interpolation", () => {
  const value = "supplied'quoted`secret\"with\\backslashes$REFERENCE";
  const env = {
    DOWNLOADERS_CONTROL_SECRET: value,
    DOWNLOADERS_LIMITS: '{"globalDailyJobs":100}',
    DOWNLOADERS_R2_SECRET_ACCESS_KEY: "must-not-forward",
    OTHER_SECRET: "must-not-forward",
  };
  const parsed = parse(workerEnvFile(env));
  expect(parsed.DOWNLOADERS_LIMITS).toBe(env.DOWNLOADERS_LIMITS);
  expect(parsed.DOWNLOADERS_CONTROL_SECRET.replace(/\\\$/g, "$")).toBe(value);
  expect(Object.keys(parsed)).toEqual(["DOWNLOADERS_CONTROL_SECRET", "DOWNLOADERS_LIMITS"]);
});

test("health and maintenance authentication bind the exact path and canonical JSON body", () => {
  const secret = "test-control-secret-at-least-32-characters";
  const [encoded, signature] = localControlToken("/__download-maintenance", secret, 100).split(".");
  expect(signature).toBe(createHmac("sha256", secret).update(encoded).digest("base64url"));
  expect(JSON.parse(Buffer.from(encoded, "base64url").toString())).toEqual({
    purpose: "download-local-control-v1",
    path: "/__download-maintenance",
    bodyHash: createHash("sha256").update("{}").digest("hex"),
    expiresAt: 160,
  });
  expect(localControlToken("/__download-health", secret, 100)).not.toBe(`${encoded}.${signature}`);
});

test("database preflight checks schema and enabled catalog rows without writing", async () => {
  const queries = [];
  class Client {
    async connect() {}
    async query(sql, values) {
      queries.push(sql);
      if (sql.includes("to_regclass")) return { rows: values[0].map((name) => ({ name, present: true })) };
      if (sql.includes("download_policies")) return { rowCount: 1 };
      return {
        rows: [
          { enabled: true, archived: false },
          { enabled: false, archived: false },
          { enabled: true, archived: true },
        ],
      };
    }
    async end() {}
  }
  expect(await checkDatabase({ DATABASE_URL: database }, ["youtube"], Client)).toBe(1);
  expect(queries.every((sql) => sql.startsWith("SELECT "))).toBe(true);
});

test("missing schema gives a migration prerequisite and database failures never expose credentials", async () => {
  class Missing {
    async connect() {}
    async query() {
      return { rows: [{ name: "download_jobs", present: false }] };
    }
    async end() {}
  }
  await expect(checkDatabase({ DATABASE_URL: database }, ["youtube"], Missing)).rejects.toThrow(
    "pnpm db:migrate 0009-media-downloaders",
  );
  class Failed extends Missing {
    async connect() {
      throw new Error(database);
    }
  }
  await expect(checkDatabase({ DATABASE_URL: database }, ["youtube"], Failed)).rejects.toThrow(
    "Cannot reach DATABASE_URL",
  );
});

test("an older downloader schema reports the format migration instead of a connection failure", async () => {
  class OlderSchema {
    async connect() {}
    async query(sql, values) {
      if (sql.includes("to_regclass")) return { rows: values[0].map((name) => ({ name, present: true })) };
      throw Object.assign(new Error("column does not exist"), { code: "42703" });
    }
    async end() {}
  }
  await expect(checkDatabase({ DATABASE_URL: database }, ["youtube"], OlderSchema)).rejects.toThrow(
    "pnpm db:migrate 0010-download-format-inspection",
  );
});
