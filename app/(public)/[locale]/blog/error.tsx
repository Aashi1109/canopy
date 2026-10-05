"use client";

import { Button, ContentState } from "@/components/ui/index.tsx";
import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localizeHref, type Locale } from "@/lib/i18n/config";

export default function BlogError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("Blog");
  const locale = useLocale() as Locale;
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-8">
      <ContentState
        className="flex-1"
        state="error"
        density="page"
        headingLevel="h1"
        title={t("loadErrorTitle")}
        description={t("loadErrorDescription")}
        action={
          <div className="flex flex-wrap gap-3">
            <Button onClick={reset}>{t("retry")}</Button>
            <Button asChild variant="outline">
              <a href={localizeHref("/blog", locale)}>{t("backToBlog")}</a>
            </Button>
          </div>
        }
      />
    </div>
  );
}
