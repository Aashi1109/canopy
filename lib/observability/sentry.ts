import publicConfig from "@canopy/config/public";
import { getActiveSpan, isEnabled, type ErrorEvent, type Options } from "@sentry/core";
import { init, withServerActionInstrumentation } from "@sentry/nextjs";

export function sanitizeSentryError(event: ErrorEvent): ErrorEvent {
  for (const exception of event.exception?.values ?? []) {
    if (!exception.value) continue;
    // Drizzle embeds SQL and bound parameters in its error message.
    exception.value = exception.value.startsWith("Failed query:")
      ? "Database query failed"
      : exception.value
          .replace(/\b(postgres(?:ql)?|rediss?|https?):\/\/[^\s/@]+:[^\s/@]*@/gi, "$1://[Filtered]@")
          .replace(/\b(password|token|secret|authorization|api[_-]?key)\s*[=:]\s*[^\s&,;]+/gi, "$1=[Filtered]");
  }
  return event;
}

export const sentryOptions = {
  dsn: publicConfig.sentryDsn,
  enabled: Boolean(publicConfig.sentryDsn),
  tracesSampleRate: publicConfig.environment === "production" ? 0.1 : 1,
  enableLogs: false,
  enableMetrics: false,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
    genAI: { inputs: false, outputs: false },
  },
  // Console breadcrumbs can contain raw database errors, including parameters.
  beforeBreadcrumb: (breadcrumb) => (breadcrumb.category === "console" ? null : breadcrumb),
  beforeSend: sanitizeSentryError,
} satisfies Options;

export function initializeSentry(): void {
  if (!sentryOptions.enabled) return;
  init({
    ...sentryOptions,
    // Shared clients create safe spans without SQL, cache keys, or values.
    integrations: (defaults) => defaults.filter((integration) => !["Postgres", "Redis"].includes(integration.name)),
  });
}

export async function measureServerAction<T>(name: string, operation: () => Promise<T>): Promise<T> {
  if (!isEnabled()) return operation();
  return withServerActionInstrumentation(name, { recordResponse: false }, async () => {
    const result = await operation();
    // These are the existing action response contracts; handled failures do not throw.
    if (
      result &&
      typeof result === "object" &&
      (("ok" in result && result.ok === false) ||
        ("status" in result && result.status === "error") ||
        ("error" in result && Boolean(result.error)))
    ) {
      getActiveSpan()?.setStatus({ code: 2, message: "internal_error" });
    }
    return result;
  });
}
