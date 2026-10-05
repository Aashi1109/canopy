/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTranslations } from "next-intl";
import { Muted, Button, SectionCard, SectionHeading } from "@/components/ui/index.tsx";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { useState } from "react";

interface FAQItem {
  question: string;
  answer: string;
  id: string;
}

export default function FAQSection() {
  const t = useTranslations("Tool.runtime");
  const [openId, setOpenId] = useState<string | null>("faq-1");

  const faqs: FAQItem[] = [
    {
      id: "faq-1",
      question: t("invoice.faq.isThisInvoiceGeneratorFree"),
      answer: t("invoice.faq.yesYouCanCreatePreviewPrintAnd"),
    },
    {
      id: "faq-2",
      question: t("invoice.faq.doINeedAnAccountToSave"),
      answer: t("invoice.faq.noRegistrationIsRequiredAnyInformationYou"),
    },
    {
      id: "faq-3",
      question: t("invoice.faq.canICustomizeTheSalesTaxCurrency"),
      answer: t("invoice.faq.yesTheBuilderHasCustomConfigStructures"),
    },
    {
      id: "faq-4",
      question: t("invoice.faq.isMyBusinessDataSecure"),
      answer: t("invoice.faq.invoiceDraftsAndPdfGenerationStayIn"),
    },
    {
      id: "faq-5",
      question: t("invoice.faq.isThisOfficialTaxOrAccountingAdvice"),
      answer: t("invoice.faq.noThisToolIsDesignedToEase"),
    },
  ];

  const handleToggle = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <SectionCard className="mx-auto my-12 max-w-4xl" id="faq-section">
      <SectionHeading
        title={
          <span className="flex items-center gap-3">
            <HelpCircle aria-hidden="true" className="size-6 text-muted-foreground" />
            {t("invoice.faq.frequentlyAskedQuestions")}
          </span>
        }
      />
      <div className="divide-y divide-border">
        {faqs.map((faq) => {
          const isOpen = openId === faq.id;
          return (
            <div className="py-2" id={`faq-item-${faq.id}`} key={faq.id}>
              <Button
                aria-controls={`faq-panel-${faq.id}`}
                aria-expanded={isOpen}
                className="h-auto w-full justify-between whitespace-normal rounded-md px-0 py-3 text-left text-foreground hover:bg-transparent hover:text-primary"
                id={`faq-trigger-${faq.id}`}
                onClick={() => handleToggle(faq.id)}
                type="button"
                variant="ghost"
              >
                <span>{faq.question}</span>
                {isOpen ? (
                  <ChevronUp aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                )}
              </Button>
              {isOpen && (
                <div
                  aria-labelledby={`faq-trigger-${faq.id}`}
                  className="pb-3 pr-8 text-muted-foreground"
                  id={`faq-panel-${faq.id}`}
                  role="region"
                >
                  <Muted>{faq.answer}</Muted>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
