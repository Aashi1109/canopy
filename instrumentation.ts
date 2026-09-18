import publicConfig from "./lib/config/public.ts";
import { captureRequestError } from "@sentry/nextjs";

export async function register() {
  if (!publicConfig.sentryDsn) return;
  const { initializeSentry } = await import("./lib/observability/sentry");
  initializeSentry();
}

export const onRequestError = captureRequestError;
