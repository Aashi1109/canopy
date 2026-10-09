"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Button, ContentState } from "@/components/ui/index.tsx";
import { defaultLocale, isLocale, localizeHref } from "@/lib/i18n/config";

export default function PublicNotFound() {
  const t = useTranslations("Common");
  const requestedLocale = useLocale();
  const locale = isLocale(requestedLocale) ? requestedLocale : defaultLocale;
  const pathname = usePathname();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-12">
      <ContentState
        state="unavailable"
        density="page"
        headingLevel="h1"
        title={t("unavailableTitle")}
        description={t("unavailableDescription")}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            {locale !== defaultLocale && (
              <Button asChild>
                <a href={localizeHref(pathname, defaultLocale)}>{t("tryEnglish")}</a>
              </Button>
            )}
            <Button asChild variant="outline">
              <a href={localizeHref("/", locale)}>{t("explore")}</a>
            </Button>
          </div>
        }
      />
    </main>
  );
}
