"use client";
import { useLocale, useTranslations } from "next-intl";
import { localizeHref, unlocalizedPathname, type Locale } from "@/lib/i18n/config";

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
  const t = useTranslations("Analytics");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const isPrivacyPage = unlocalizedPathname(pathname) === "/privacy";
  const privacyLink = (chunks: ReactNode) => (
    <Link
      className="rounded-sm text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      href={localizeHref("/privacy#analytics", locale)}
    >
      {chunks}
    </Link>
  );
  const [consent, setConsent] = useState<AnalyticsConsent>(null);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const isPublicPage = ready && Boolean(publicPath(pathname, window.location.origin));

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
        {isPublicPage && measurementId && !isPrivacyPage && consent
          ? t(consent === "accepted" ? "acceptedNotice" : "declinedNotice")
          : ""}
      </div>
      {children}
      {measurementId && isPublicPage && consent === null && !isPrivacyPage ? (
        <section
          aria-label={t("optional")}
          className="sticky bottom-0 z-50 border-t border-border bg-card px-6 py-4 print:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <H2 className="text-base">{t("promptTitle")}</H2>
              <Muted className="mt-1">{t.rich("promptDescription", { privacy: privacyLink })}</Muted>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => choose("declined")}>
                {t("decline")}
              </Button>
              <Button variant="outline" onClick={() => choose("accepted")}>
                {t("allow")}
              </Button>
            </div>
          </div>
        </section>
      ) : null}
      {!saved && !isPrivacyPage && isPublicPage ? (
        <div role="status" className="sticky bottom-0 z-50 border-t border-border bg-card px-6 py-4 print:hidden">
          <Muted>{t.rich("saveFailedLink", { privacy: privacyLink })}</Muted>
        </div>
      ) : null}
    </AnalyticsContext.Provider>
  );
}

export function AnalyticsPreferences() {
  const t = useTranslations("Analytics");
  const analytics = useContext(AnalyticsContext);
  return (
    <section id="analytics" className="flex scroll-mt-8 flex-col gap-3">
      <H2>{t("preferencesTitle")}</H2>
      <Muted>{t("preferencesDescription")}</Muted>
      <Muted role="status">
        {!analytics?.enabled
          ? t("unavailable")
          : analytics.consent === "accepted"
            ? t("accepted")
            : analytics.consent === "declined"
              ? t("declined")
              : t("off")}
      </Muted>
      {analytics?.enabled ? (
        <div className="flex flex-wrap gap-3">
          {analytics.consent !== "declined" ? (
            <Button variant="outline" onClick={() => analytics.choose("declined")}>
              {analytics.consent === "accepted" ? t("withdraw") : t("decline")}
            </Button>
          ) : null}
          {analytics.consent !== "accepted" ? (
            <Button variant="outline" onClick={() => analytics.choose("accepted")}>
              {t("allow")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {analytics && !analytics.saved ? <Muted role="status">{t("saveFailed")}</Muted> : null}
      <Muted>
        {t.rich("withdrawal", {
          policy: (chunks) => (
            <a
              className="rounded-sm text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              href="https://policies.google.com/privacy"
            >
              {chunks}
            </a>
          ),
        })}
      </Muted>
    </section>
  );
}
