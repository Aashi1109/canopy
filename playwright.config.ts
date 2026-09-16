import { defineConfig, devices } from "@playwright/test";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must point to a migrated disposable database for E2E tests.");
}

const appUrl = process.env.PLAYWRIGHT_APP_URL ?? "http://localhost:3000";
const parsedAppUrl = new URL(appUrl);
const appPort =
  process.env.PLAYWRIGHT_PORT ||
  parsedAppUrl.port ||
  (parsedAppUrl.protocol === "https:" ? "443" : "80");

if (!/^\d+$/.test(appPort)) {
  throw new Error("PLAYWRIGHT_PORT must be a valid port number.");
}

const e2eEnvironment = {
  APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ?? "e2e-only-secret-that-is-at-least-32-characters",
  RESEND_API_KEY: "re_e2e_mock",
  AUTH_EMAIL_FROM: "SmartTools <auth@example.test>",
  GOOGLE_CLIENT_ID: "google-e2e-client",
  GOOGLE_CLIENT_SECRET: "google-e2e-secret",
};

if (appUrl !== e2eEnvironment.APP_URL) {
  e2eEnvironment.APP_URL = appUrl;
}

Object.assign(process.env, e2eEnvironment);

const appEnvironment = { ...process.env, ...e2eEnvironment };

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: appUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"], channel: "chrome" },
    },
    {
      name: "firefox-desktop",
      testMatch: /json-large-file-mode\.spec\.ts/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit-desktop",
      testMatch: /json-large-file-mode\.spec\.ts/,
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    env: appEnvironment,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    timeout: 180_000,
    ...(appPort === "3000"
      ? null
      : {
          command: `pnpm exec next dev -p ${appPort}`,
          url: appUrl,
        }),
  },
});
