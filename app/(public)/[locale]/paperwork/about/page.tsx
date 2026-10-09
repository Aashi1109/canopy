import { H2, Muted } from "@/components/ui/index.tsx";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import InformationPage from "@/app/paperwork/components/InformationPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("About");
  return { title: t("metadataTitle"), description: t("metadataDescription") };
}

const sections = ["focus", "priorities"] as const;

export default async function AboutPage() {
  const t = await getTranslations("About");
  return (
    <InformationPage description={t("description")} eyebrow={t("eyebrow")} title={t("heading")}>
      {sections.map((section) => (
        <section className="space-y-2" key={section}>
          <H2>{t(`${section}Title`)}</H2>
          <Muted className="text-muted-foreground">{t(`${section}Body`)}</Muted>
        </section>
      ))}
    </InformationPage>
  );
}
