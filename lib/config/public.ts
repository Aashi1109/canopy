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
};

export default publicConfig;
