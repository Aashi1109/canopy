/** Only browser-safe values. Direct references let Next.js inline public env. */
const publicConfig = {
  get environment() {
    return process.env.NODE_ENV;
  },
  get sentryDsn() {
    return process.env.NEXT_PUBLIC_SENTRY_DSN;
  },
  get cloudinaryCloudName() {
    return process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  },
  get appUrl() {
    // Explicitly exposed by next.config.ts so server and browser derive the same URLs.
    return process.env.APP_URL ?? "http://localhost:3000";
  },
};

export default publicConfig;
