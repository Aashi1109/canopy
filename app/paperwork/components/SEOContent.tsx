/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTranslations } from "next-intl";
import { H3, Muted, P, Text, Card, SectionCard, SectionHeading } from "@/components/ui/index.tsx";
import { FileCheck, Receipt, ShieldCheck, Sparkles } from "lucide-react";

export default function SEOContent() {
  const t = useTranslations("Tool.runtime");
  const values = [
    {
      icon: ShieldCheck,
      title: t("invoice.seo.noInconvenientSignups"),
      description: t("invoice.seo.produceClientReadyInvoicesImmediatelyWithoutRemembering"),
    },
    {
      icon: Receipt,
      title: t("invoice.seo.designedForUsBusinesses"),
      description: t("invoice.seo.includesInputsForLineItemSalesTaxes"),
    },
    {
      icon: FileCheck,
      title: t("invoice.seo.autoSavedLocally"),
      description: t("invoice.seo.anyDraftsYouChangeArePreservedIn"),
    },
    {
      icon: Sparkles,
      title: t("invoice.seo.polishedVisualLayouts"),
      description: t("invoice.seo.formulateCrispPdfDocumentsUsingEitherOur"),
    },
  ];

  return (
    <div className="mx-auto my-12 max-w-6xl space-y-12 px-4" id="seo-content-block">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {values.map((value) => {
          const Icon = value.icon;
          return (
            <Card className="flex gap-4 p-5 shadow-none" key={value.title}>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                <Icon aria-hidden="true" className="size-5" />
              </div>
              <div className="space-y-1">
                <H3 className="text-foreground">{value.title}</H3>
                <Muted className="text-muted-foreground">{value.description}</Muted>
              </div>
            </Card>
          );
        })}
      </div>

      <SectionCard className="bg-muted/40 shadow-none">
        <SectionHeading title={t("invoice.seo.howToGenerateProfessionalBusinessInvoicesOnline")} />
        <div className="grid gap-6 text-muted-foreground md:grid-cols-3">
          <div className="space-y-2">
            <H3 className="text-foreground">{t("invoice.seo.text1KeyContractorRecords")}</H3>
            <P>{t("invoice.seo.alwaysIncludeYourFullLegalBusinessName")}</P>
          </div>
          <div className="space-y-2">
            <H3 className="text-foreground">{t("invoice.seo.text2ItemizedDeliverableBreakdowns")}</H3>
            <P>{t("invoice.seo.writeHighlyDetailedDescriptionEntriesForClient")}</P>
          </div>
          <div className="space-y-2">
            <H3 className="text-foreground">{t("invoice.seo.text3SettingPragmaticDueTerms")}</H3>
            <P>{t("invoice.seo.selectPaymentGuidelinesLikeNet15Or")}</P>
          </div>
        </div>
        <Muted className="max-w-3xl border-t border-border pt-4 text-muted-foreground">
          <Text className="text-foreground">{t("invoice.seo.disclaimer")}</Text>{" "}
          {t("invoice.seo.thisFreeToolkitIsProvidedForGeneral")}
        </Muted>
      </SectionCard>
    </div>
  );
}
