import publicConfig from "../config/public.ts";
import {
  getActiveSpan,
  isEnabled,
  type Breadcrumb,
  type ErrorEvent,
  type Options,
  type SpanJSON,
  type TransactionEvent,
} from "@sentry/core";
import { init, withServerActionInstrumentation } from "@sentry/nextjs";

function redactSharedUrl(value: string): string {
  // Shared state is percent-encoded, so its payload cannot contain literal whitespace.
  return value.replace(/#share=[^\s]*/gi, "#share=[Filtered]");
}

function sanitizeUrlData(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  // SDK URL attributes are flat strings; do not traverse arbitrary application data.
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") data[key] = redactSharedUrl(value);
  }
}

function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // Console breadcrumbs can contain raw database errors, including parameters.
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.message) breadcrumb.message = redactSharedUrl(breadcrumb.message);
  sanitizeUrlData(breadcrumb.data);
  return breadcrumb;
}

function sanitizeSpan(span: SpanJSON): SpanJSON {
  if (span.description) span.description = redactSharedUrl(span.description);
  sanitizeUrlData(span.data);
  return span;
}

function sanitizeEventUrls<T extends ErrorEvent | TransactionEvent>(event: T): T {
  if (event.request?.url) event.request.url = redactSharedUrl(event.request.url);
  if (event.message) event.message = redactSharedUrl(event.message);
  if (event.logentry?.message) event.logentry.message = redactSharedUrl(event.logentry.message);
  if (event.transaction) event.transaction = redactSharedUrl(event.transaction);
  sanitizeUrlData(event.contexts?.trace?.data);
  sanitizeUrlData(event.sdkProcessingMetadata?.dynamicSamplingContext);
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(sanitizeBreadcrumb).filter((breadcrumb) => breadcrumb !== null);
  }
  for (const span of event.spans ?? []) sanitizeSpan(span);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactSharedUrl(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename) frame.filename = redactSharedUrl(frame.filename);
      if (frame.abs_path) frame.abs_path = redactSharedUrl(frame.abs_path);
    }
  }
  return event;
}

export function sanitizeSentryError(event: ErrorEvent): ErrorEvent {
  sanitizeEventUrls(event);
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
  release: publicConfig.environment ?? "development",
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
  beforeBreadcrumb: sanitizeBreadcrumb,
  beforeSend: sanitizeSentryError,
  beforeSendTransaction: sanitizeEventUrls,
  beforeSendSpan: sanitizeSpan,
} satisfies Options;

export function initializeSentry(): void {
  if (!sentryOptions.enabled) return;
  // The local sign-in handoff carries a one-time ticket in its URL fragment.
  // Browser tracing runs before React can remove it, so never start it here.
  if (typeof window !== "undefined" && window.location.pathname === "/auth/local-session") return;
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
