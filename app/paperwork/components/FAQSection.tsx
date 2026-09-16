/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Muted, Button, SectionCard, SectionHeading } from "@smarttools/ui";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { useState } from "react";

interface FAQItem {
  question: string;
  answer: string;
  id: string;
}

export default function FAQSection() {
  const [openId, setOpenId] = useState<string | null>("faq-1");

  const faqs: FAQItem[] = [
    {
      id: "faq-1",
      question: "Is this invoice generator free?",
      answer:
        "Yes. You can create, preview, print, and download professional invoice PDFs without creating an account or entering credit card details. Current free templates include a small SmartTools Paperwork attribution in the document footer.",
    },
    {
      id: "faq-2",
      question: "Do I need an account to save my draft?",
      answer:
        "No registration is required. Any information you fill out is saved automatically in your browser's local safety storage (localStorage). This means you can refresh the page, close your browser, or come back tomorrow without losing your progress.",
    },
    {
      id: "faq-3",
      question: "Can I customize the sales tax, currency, and discounts?",
      answer:
        "Yes. The builder has custom config structures supporting flat-rate or percentage-based discounts, optional itemized sales tax applicability (applying tax only to specified taxable services/goods), and shipping/handling fees. Currency for this toolkit is set to USD by default.",
    },
    {
      id: "faq-4",
      question: "Is my business data secure?",
      answer:
        "Invoice drafts and PDF generation stay in your browser. Some other Paperwork tools may synchronize supported records through guarded application storage APIs using a browser-generated identifier. Review the Privacy page for the current storage details.",
    },
    {
      id: "faq-5",
      question: "Is this official tax or accounting advice?",
      answer:
        "No. This tool is designed to ease business document workflows for independent contractors, freelancers, and small business owners in the US. Please consult with a Certified Public Accountant (CPA) or legal counsel for professional accounting or tax regulations.",
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
            Frequently Asked Questions
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
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
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
