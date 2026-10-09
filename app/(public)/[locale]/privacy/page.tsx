import { Display, H2, Muted, Overline } from "@/components/ui/index.tsx";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AnalyticsPreferences } from "@/components/analytics/Analytics";
import PublicInfoChrome from "@/components/canopy/PublicInfoChrome";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Privacy");
  return { title: t("metadataTitle"), description: t("metadataDescription") };
}

const sections = ["information", "limits", "cookies", "rights"] as const;

export default async function PrivacyPage() {
  const t = await getTranslations("Privacy");

  return (
    <PublicInfoChrome>
      <article className="mx-auto w-full max-w-[760px] px-6 py-16 lg:py-[72px]">
        <header>
          <Overline className="block text-primary">{t("updated")}</Overline>
          <Display className="mt-2">{t("heading")}</Display>
          <Muted className="mt-3 text-muted-foreground">{t("description")}</Muted>
        </header>
        <div className="mt-8 flex flex-col gap-8">
          <AnalyticsPreferences />
          {sections.map((section) => (
            <section className="flex flex-col gap-2" key={section}>
              <H2>{t(`${section}Title`)}</H2>
              <Muted className="text-muted-foreground">{t(`${section}Body`)}</Muted>
            </section>
          ))}
        </div>
      </article>
    </PublicInfoChrome>
  );
}
