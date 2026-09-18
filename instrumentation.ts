import publicConfig from "@canopy/config/public";
import { captureRequestError } from "@sentry/nextjs";

export async function register() {
  if (!publicConfig.sentryDsn) return;
  const { initializeSentry } = await import("./lib/observability/sentry");
  initializeSentry();
}

export const onRequestError = captureRequestError;
