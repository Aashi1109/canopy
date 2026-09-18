import { captureRouterTransitionStart } from "@sentry/nextjs";
import { initializeSentry } from "./lib/observability/sentry";

initializeSentry();

export const onRouterTransitionStart = captureRouterTransitionStart;
