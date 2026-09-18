/** Server/build configuration. Browser code must use @canopy/config/public. */
// Read lazily: CLI entry points load dotenv after imports, and request runtimes
// can supply environment values after module initialization.
const config = {
  get environment() {
    return process.env.NODE_ENV;
  },
  get appUrl() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL;
  },
  get redisUrl() {
    return process.env.REDIS_URL;
  },
  get ci() {
    return process.env.CI;
  },
  get auth() {
    return {
      secret: process.env.BETTER_AUTH_SECRET,
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  },
  get email() {
    return {
      apiKey: process.env.RESEND_API_KEY,
      accountsEmail: process.env.ACCOUNTS_EMAIL,
      supportEmail: process.env.SUPPORT_EMAIL,
    };
  },
  get cloudinary() {
    return {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
      url: process.env.CLOUDINARY_URL,
    };
  },
  get blog() {
    return {
      schedulerSecret: process.env.BLOG_SCHEDULER_SECRET,
      publishUrl: process.env.BLOG_PUBLISH_URL,
    };
  },
  get analytics() {
    return {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      GA_MEASUREMENT_ID: process.env.GA_MEASUREMENT_ID,
      GA_ENABLE_IN_DEVELOPMENT: process.env.GA_ENABLE_IN_DEVELOPMENT,
    };
  },
  get integrations() {
    return {
      ahrefsApiKey: process.env.AHREFS_API_KEY,
      geminiApiKey: process.env.GEMINI_API_KEY,
    };
  },
  get sentry() {
    return {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
    };
  },
  get playwright() {
    return {
      appUrl: process.env.PLAYWRIGHT_APP_URL ?? "http://localhost:3000",
      port: process.env.PLAYWRIGHT_PORT,
      reuseServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    };
  },
};

export default config;
