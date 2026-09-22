import assert from "node:assert/strict";
import test from "node:test";
import config from "../lib/config/config.ts";
import publicConfig from "../lib/config/public.ts";

test("auth cookie prefix keeps the existing default and reads environment overrides lazily", (t) => {
  const previous = process.env;
  t.after(() => {
    process.env = previous;
  });
  process.env = {};
  assert.equal(config.auth.cookiePrefix, "smarttools");
  for (const [value, expected] of [
    ["", "smarttools"],
    ["   ", "smarttools"],
    ["canopy", "canopy"],
    [" canopy-test ", "canopy-test"],
  ]) {
    process.env.AUTH_COOKIE_PREFIX = value;
    assert.equal(config.auth.cookiePrefix, expected);
  }
});

test("cache reads default off in development and support an explicit environment override", (t) => {
  const previous = process.env;
  t.after(() => {
    process.env = previous;
  });
  for (const [environment, override, expected] of [
    ["development", undefined, false],
    ["development", "", false],
    ["development", "true", true],
    ["development", "false", false],
    ["production", undefined, true],
    ["production", "false", false],
    ["production", "true", true],
    ["test", undefined, true],
    [undefined, undefined, true],
  ]) {
    process.env = {};
    if (environment !== undefined) process.env.NODE_ENV = environment;
    if (override !== undefined) process.env.CACHE_ENABLED = override;
    assert.equal(config.cacheEnabled, expected, `${environment}, CACHE_ENABLED=${override}`);
  }
});

test("configuration stays lazy across environment loading, updates and replacement", (t) => {
  const previous = process.env;
  t.after(() => {
    process.env = previous;
  });
  process.env = {};
  assert.equal(config.appUrl, "http://localhost:3000");
  assert.equal(config.databaseUrl, undefined);
  assert.equal(config.auth.secret, undefined);
  assert.equal(config.cloudinary.apiSecret, undefined);
  assert.equal(publicConfig.sentryDsn, undefined);
  assert.deepEqual(config.playwright, {
    appUrl: "http://localhost:3000",
    port: undefined,
    reuseServer: false,
  });

  const fields = [
    ["NODE_ENV", () => config.environment],
    ["DATABASE_URL", () => config.databaseUrl],
    ["REDIS_URL", () => config.redisUrl],
    ["APP_URL", () => config.appUrl],
    ["CI", () => config.ci],
    ["BETTER_AUTH_SECRET", () => config.auth.secret],
    ["GOOGLE_CLIENT_ID", () => config.auth.googleClientId],
    ["GOOGLE_CLIENT_SECRET", () => config.auth.googleClientSecret],
    ["RESEND_API_KEY", () => config.email.apiKey],
    ["ACCOUNTS_EMAIL", () => config.email.accountsEmail],
    ["SUPPORT_EMAIL", () => config.email.supportEmail],
    ["CLOUDINARY_CLOUD_NAME", () => config.cloudinary.cloudName],
    ["CLOUDINARY_API_KEY", () => config.cloudinary.apiKey],
    ["CLOUDINARY_API_SECRET", () => config.cloudinary.apiSecret],
    ["CLOUDINARY_URL", () => config.cloudinary.url],
    ["BLOG_SCHEDULER_SECRET", () => config.blog.schedulerSecret],
    ["BLOG_PUBLISH_URL", () => config.blog.publishUrl],
    ["ASSISTANT_SCHEDULER_SECRET", () => config.assistant.schedulerSecret],
    ["ASSISTANT_MAINTENANCE_URL", () => config.assistant.maintenanceUrl],
    ["NODE_ENV", () => config.analytics.NODE_ENV],
    ["VERCEL_ENV", () => config.analytics.VERCEL_ENV],
    ["GA_MEASUREMENT_ID", () => config.analytics.GA_MEASUREMENT_ID],
    ["GA_ENABLE_IN_DEVELOPMENT", () => config.analytics.GA_ENABLE_IN_DEVELOPMENT],
    ["AHREFS_API_KEY", () => config.integrations.ahrefsApiKey],
    ["GEMINI_API_KEY", () => config.integrations.geminiApiKey],
    ["SENTRY_ORG", () => config.sentry.org],
    ["SENTRY_PROJECT", () => config.sentry.project],
    ["SENTRY_AUTH_TOKEN", () => config.sentry.authToken],
    ["NODE_ENV", () => publicConfig.environment],
    ["NEXT_PUBLIC_SENTRY_DSN", () => publicConfig.sentryDsn],
    ["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", () => publicConfig.cloudinaryCloudName],
    ["APP_URL", () => publicConfig.appUrl],
  ];
  for (const [key, read] of fields) {
    process.env[key] = ` first ${key} `;
    assert.equal(read(), ` first ${key} `, `${key} preserves its raw value`);
    process.env[key] = `second ${key}`;
    assert.equal(read(), `second ${key}`, `${key} is read at access time`);
    delete process.env[key];
    assert.equal(read(), key === "APP_URL" ? "http://localhost:3000" : undefined);
  }
  process.env = { DATABASE_URL: "postgres://replacement", APP_URL: "" };
  assert.equal(config.databaseUrl, "postgres://replacement");
  assert.equal(config.appUrl, "", "only an absent APP_URL receives the default");
  Object.assign(process.env, {
    PLAYWRIGHT_APP_URL: "http://localhost:3100",
    PLAYWRIGHT_PORT: "3100",
    PLAYWRIGHT_REUSE_SERVER: "1",
  });
  assert.deepEqual(config.playwright, {
    appUrl: "http://localhost:3100",
    port: "3100",
    reuseServer: true,
  });
  process.env.PLAYWRIGHT_REUSE_SERVER = "true";
  assert.equal(config.playwright.reuseServer, false);
});

test("public configuration exposes only browser-safe values", (t) => {
  const previous = process.env;
  t.after(() => {
    process.env = previous;
  });
  process.env = {
    NODE_ENV: "production",
    APP_URL: "https://smarttools.test",
    NEXT_PUBLIC_SENTRY_DSN: "https://public@example.test/1",
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "public-cloud",
    DATABASE_URL: "postgres://private",
    BETTER_AUTH_SECRET: "private-auth-secret",
    CLOUDINARY_API_SECRET: "private-cloudinary-secret",
    SENTRY_AUTH_TOKEN: "private-sentry-token",
  };
  assert.deepEqual(JSON.parse(JSON.stringify(publicConfig)), {
    environment: "production",
    appUrl: "https://smarttools.test",
    sentryDsn: "https://public@example.test/1",
    cloudinaryCloudName: "public-cloud",
  });
});
