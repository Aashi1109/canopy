import config from "@canopy/config";
import { defineConfig, devices } from "@playwright/test";

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL must point to a migrated disposable database for E2E tests.");
}

const appUrl = config.playwright.appUrl;
const parsedAppUrl = new URL(appUrl);
const appPort = config.playwright.port || parsedAppUrl.port || (parsedAppUrl.protocol === "https:" ? "443" : "80");

if (!/^\d+$/.test(appPort)) {
  throw new Error("PLAYWRIGHT_PORT must be a valid port number.");
}

const e2eEnvironment = {
  APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: config.auth.secret ?? "e2e-only-secret-that-is-at-least-32-characters",
  RESEND_API_KEY: "re_e2e_mock",
  ACCOUNTS_EMAIL: "accounts@example.test",
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
  retries: config.ci ? 2 : 0,
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
    reuseExistingServer: config.playwright.reuseServer,
    timeout: 180_000,
    ...(appPort === "3000"
      ? null
      : {
          command: `pnpm exec next dev -p ${appPort}`,
          url: appUrl,
        }),
  },
});
