"use client";

import { Button, H2, Muted } from "@/components/ui/index.tsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CONSENT_KEY, initializeAnalytics, publicPath, type AnalyticsConsent } from "@/lib/analytics/ga4";

const AnalyticsContext = createContext<{
  enabled: boolean;
  consent: AnalyticsConsent;
  choose: (choice: "accepted" | "declined") => void;
  saved: boolean;
} | null>(null);

export function Analytics({ measurementId, children }: { measurementId: string | null; children: ReactNode }) {
  const pathname = usePathname();
  const [consent, setConsent] = useState<AnalyticsConsent>(null);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    const client = initializeAnalytics(window, measurementId);
    setConsent(client.consent());
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key !== CONSENT_KEY && event.key !== null) return;
      const next = event.newValue === "accepted" || event.newValue === "declined" ? event.newValue : null;
      client.setConsent(next, false);
      setConsent(next);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [measurementId]);

  useEffect(() => {
    initializeAnalytics(window, measurementId).pageView();
  }, [measurementId, pathname]);

  function choose(choice: "accepted" | "declined") {
    setSaved(initializeAnalytics(window, measurementId).setConsent(choice));
    setConsent(choice);
  }

  return (
    <AnalyticsContext.Provider value={{ enabled: Boolean(measurementId), consent, choose, saved }}>
      <div role="status" className="sr-only">
        {ready && measurementId && pathname !== "/privacy" && consent
          ? `Analytics ${consent === "accepted" ? "allowed" : "declined"}. Change your choice in Privacy settings.`
          : ""}
      </div>
      {children}
      {measurementId && ready && consent === null && publicPath(pathname) && pathname !== "/privacy" ? (
        <section
          aria-label="Optional analytics"
          className="sticky bottom-0 z-50 border-t border-border bg-card px-6 py-4 print:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <H2 className="text-base">Help improve SmartTools?</H2>
              <Muted className="mt-1">
                With your permission, Google Analytics uses cookies to measure visits and tool actions. We never send
                your files or document content. Change your choice in{" "}
                <Link
                  className="rounded-sm text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  href="/privacy#analytics"
                >
                  Privacy settings
                </Link>
                .
              </Muted>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => choose("declined")}>
                Decline analytics
              </Button>
              <Button variant="outline" onClick={() => choose("accepted")}>
                Allow analytics
              </Button>
            </div>
          </div>
        </section>
      ) : null}
      {!saved && pathname !== "/privacy" && publicPath(pathname) ? (
        <div role="status" className="sticky bottom-0 z-50 border-t border-border bg-card px-6 py-4 print:hidden">
          <Muted>
            Your browser could not save this preference. Your choice applies in this tab until you reload. Change it in{" "}
            <Link
              className="rounded-sm text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              href="/privacy#analytics"
            >
              Privacy settings
            </Link>
            .
          </Muted>
        </div>
      ) : null}
    </AnalyticsContext.Provider>
  );
}

export function AnalyticsPreferences() {
  const analytics = useContext(AnalyticsContext);
  return (
    <section id="analytics" className="flex scroll-mt-8 flex-col gap-3">
      <H2>Analytics preferences</H2>
      <Muted>
        Optional Google Analytics helps us understand page visits and tool actions. Google receives cookie identifiers,
        browser/device information, and a privacy-filtered page address. We do not send uploaded files, document
        contents, account details, query strings, or advertising data. Analytics is off until you allow it; private
        account and admin pages are excluded.
      </Muted>
      <Muted role="status">
        {!analytics?.enabled
          ? "Analytics is not enabled on this deployment."
          : analytics.consent === "accepted"
            ? "Analytics is allowed. You can withdraw permission below."
            : analytics.consent === "declined"
              ? "Analytics is declined."
              : "Analytics is off. Choose whether to allow it."}
      </Muted>
      {analytics?.enabled ? (
        <div className="flex flex-wrap gap-3">
          {analytics.consent !== "declined" ? (
            <Button variant="outline" onClick={() => analytics.choose("declined")}>
              {analytics.consent === "accepted" ? "Withdraw analytics consent" : "Decline analytics"}
            </Button>
          ) : null}
          {analytics.consent !== "accepted" ? (
            <Button variant="outline" onClick={() => analytics.choose("accepted")}>
              Allow analytics
            </Button>
          ) : null}
        </div>
      ) : null}
      {analytics && !analytics.saved ? (
        <Muted role="status">
          Your browser could not save this preference. Your choice applies in this tab until you reload.
        </Muted>
      ) : null}
      <Muted>
        Withdrawing stops future collection and removes this site's analytics cookies; it does not erase data already
        sent.{" "}
        <a
          className="rounded-sm text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          href="https://policies.google.com/privacy"
        >
          Google Privacy Policy
        </a>
        .
      </Muted>
    </section>
  );
}
