export const CONSENT_KEY = "smarttools.analytics-consent.v1";
export type AnalyticsConsent = "accepted" | "declined" | null;
export type ToolEvent =
  "tool_start" | "tool_complete" | "tool_error" | "result_download" | "result_copy";

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  [key: `ga-disable-${string}`]: boolean;
};

export function measurementId(env: {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  GA_MEASUREMENT_ID?: string;
  GA_ENABLE_IN_DEVELOPMENT?: string;
}) {
  const id = env.GA_MEASUREMENT_ID?.trim();
  const enabled =
    env.NODE_ENV === "production" ||
    (env.NODE_ENV === "development" && env.GA_ENABLE_IN_DEVELOPMENT === "true");
  return enabled &&
    (!env.VERCEL_ENV || env.VERCEL_ENV === "production") &&
    /^G-[A-Z0-9]+$/.test(id ?? "")
    ? id!
    : null;
}

// Never send arbitrary route segments (document IDs, emails, or pasted text).
export function publicPath(pathname: string): string | null {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
  if (
    [
      "/",
      "/privacy",
      "/contact",
      "/media",
      "/devtools",
      "/paperwork",
      "/paperwork/about",
      "/paperwork/terms",
    ].includes(path)
  )
    return path;
  const tool = /^\/(media|devtools|paperwork)\/[a-z0-9-]+$/.exec(path);
  return tool ? `/${tool[1]}/[tool]` : null;
}

export function createAnalytics(browser: AnalyticsWindow, id: string | null) {
  let consent: AnalyticsConsent = null;
  let script: HTMLScriptElement | null = null;
  let loaded = false;
  let lastPath: string | null = null;
  let previousLocation = "";
  let pageReferrer = "";
  try {
    const url = new URL(browser.document.referrer);
    if (url.protocol === "https:" || url.protocol === "http:") pageReferrer = url.origin;
  } catch {
    /* No valid referrer. */
  }
  const validId = /^G-[A-Z0-9]+$/.test(id ?? "") ? id : null;
  try {
    const saved = browser.localStorage.getItem(CONSENT_KEY);
    if (saved === "accepted" || saved === "declined") consent = saved;
  } catch {
    /* Storage may be blocked; the current tab still respects the choice. */
  }

  function allowed() {
    return Boolean(validId && consent === "accepted" && publicPath(browser.location.pathname));
  }

  function send(...args: unknown[]) {
    try {
      browser.gtag?.(...args);
    } catch {
      /* Analytics must never interrupt a tool. */
    }
  }

  function context() {
    const path = publicPath(browser.location.pathname)!;
    return {
      page_location: `${browser.location.origin}${path}`,
      page_referrer: pageReferrer,
      page_title: "SmartTools",
    };
  }

  function pageView() {
    try {
      if (!validId) return;
      browser[`ga-disable-${validId}`] = !allowed();
      if (!allowed()) {
        if (lastPath || !publicPath(browser.location.pathname)) pageReferrer = "";
        lastPath = null;
        previousLocation = "";
        return;
      }
      if (!script) {
        browser.dataLayer ??= [];
        browser.gtag = function () {
          browser.dataLayer!.push(arguments);
        };
        send("consent", "default", {
          analytics_storage: "granted",
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
        });
        send("js", new Date());
        send("config", validId, {
          ...context(),
          send_page_view: false,
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
          cookie_domain: "none",
          cookie_expires: 60 * 60 * 24 * 180,
        });
        script = browser.document.createElement("script");
        script.async = true;
        script.crossOrigin = "anonymous";
        script.src = `https://www.googletagmanager.com/gtag/js?id=${validId}`;
        script.onload = () => {
          loaded = true;
          pageView();
        };
        script.onerror = () => {
          loaded = false;
          if (browser.dataLayer) browser.dataLayer.length = 0;
        };
        browser.document.head.append(script);
      }
      const path = browser.location.pathname;
      if (loaded && lastPath !== path) {
        if (lastPath) pageReferrer = previousLocation;
        lastPath = path;
        previousLocation = context().page_location;
        // Also replace config defaults so automatic engagement never receives the real URL/title.
        send("consent", "update", {
          analytics_storage: "granted",
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
        });
        send("config", validId, {
          ...context(),
          send_page_view: false,
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
          cookie_domain: "none",
          cookie_expires: 60 * 60 * 24 * 180,
        });
        send("event", "page_view", context());
      }
    } catch {
      loaded = false; // A blocked DOM/script API must not break the application.
    }
  }

  function setConsent(next: AnalyticsConsent, persist = true) {
    consent = next;
    let saved = true;
    if (persist) {
      try {
        browser.localStorage.setItem(CONSENT_KEY, next ?? "");
      } catch {
        saved = false;
      }
    }
    if (next !== "accepted" && validId) {
      browser[`ga-disable-${validId}`] = true;
      lastPath = null;
      previousLocation = "";
      pageReferrer = "";
      if (browser.dataLayer) browser.dataLayer.length = 0;
      if (script)
        send("consent", "update", {
          analytics_storage: "denied",
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
        });
      // These cookies are host-only (cookie_domain: none).
      try {
        for (const cookie of browser.document.cookie.split(";")) {
          const name = cookie.trim().split("=", 1)[0];
          if (name === "_ga" || name.startsWith("_ga_"))
            browser.document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
        }
      } catch {
        /* Collection is disabled even when cookie access is blocked. */
      }
    }
    pageView();
    return saved;
  }

  return {
    consent: () => consent,
    pageView,
    setConsent,
    track(event: ToolEvent, toolKey?: string) {
      if (
        !allowed() ||
        !loaded ||
        !["tool_start", "tool_complete", "tool_error", "result_download", "result_copy"].includes(
          event,
        )
      )
        return;
      const tool =
        toolKey && /^[a-z0-9][a-z0-9-]{0,63}$/.test(toolKey) ? { tool_key: toolKey } : {};
      send("event", event, { ...context(), ...tool });
    },
  };
}

let client: ReturnType<typeof createAnalytics> | null = null;
export function initializeAnalytics(browser: Window, id: string | null) {
  client ??= createAnalytics(browser as AnalyticsWindow, id);
  return client;
}
export function trackToolEvent(event: ToolEvent, toolKey?: string) {
  try {
    client?.track(event, toolKey);
  } catch {
    /* Never affect processing, copying or downloads. */
  }
}
