import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { defaultLocale, isLocale, localizeHref } from "@/lib/i18n/config";
import { BackButton } from "@/components/ui/index.tsx";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Offline");
  return { title: t("title"), robots: { index: false, follow: false } };
}

// Precached fallback shown when an uncached route is opened without a
// connection. Cached tool pages still load normally; this only covers routes
// the service worker has never seen.
export default async function OfflinePage() {
  const requestedLocale = await getLocale();
  const locale = isLocale(requestedLocale) ? requestedLocale : defaultLocale;
  const t = await getTranslations("Offline");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-heading text-2xl font-semibold text-foreground">{t("heading")}</h1>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <BackButton className="mt-2" href={localizeHref("/devtools", locale)} label={t("backToTools")} />
    </main>
  );
}
