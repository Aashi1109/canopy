import { getOptionalSession } from "@/lib/auth/session.ts";
import { getPublishedTemplates } from "@/lib/admin/index.ts";
import { NextIntlClientProvider } from "next-intl";
import { isLocale, localizeHref, type Locale } from "@/lib/i18n/config";
import { getCommonMessages } from "@/lib/i18n/messages";
import { toolMessageTree } from "@/lib/tool-framework/translations";
import type { DocumentType } from "@/lib/invoice-templates/index.ts";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import App from "@/app/paperwork/components/App";
import { getPaperworkTools } from "@/lib/tool-framework/catalog";

const DOCUMENT_TYPE_BY_COMPONENT_KEY: Record<string, DocumentType> = {
  "invoice-generator": "invoice",
  "receipt-generator": "receipt",
  "expense-report": "expense-report",
  "mileage-log": "mileage-log",
  "quarterly-tax-estimator": "quarterly-tax-estimator",
  "w9-request": "w9-request",
  "1099-nec-tracker": "1099-nec-tracker",
};

const getPaperworkTool = cache(async (slug: string, locale: Locale) =>
  (await getPaperworkTools(locale)).find((tool) => tool.slug === slug && tool.locale === locale),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  if (!isLocale(locale)) notFound();
  const tool = await getPaperworkTool(slug, locale);

  if (!tool || !DOCUMENT_TYPE_BY_COMPONENT_KEY[tool.componentKey]) notFound();

  return {
    title: tool.name,
    description: tool.description,
    alternates: {
      canonical: tool.href,
      languages: Object.fromEntries(
        tool.availableLocales.map((language) => [language, localizeHref(tool.href, language)]),
      ),
    },
  };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;
  if (!isLocale(locale)) notFound();
  const requestHeaders = await headers();
  const [tool, tools, session] = await Promise.all([
    getPaperworkTool(slug, locale),
    getPaperworkTools(locale),
    getOptionalSession(requestHeaders),
  ]);

  if (!tool) notFound();
  const documentType = DOCUMENT_TYPE_BY_COMPONENT_KEY[tool.componentKey];
  if (!documentType) notFound();
  const templates = await getPublishedTemplates(documentType);

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={{ ...getCommonMessages(locale), Tool: toolMessageTree(tool.messages) }}
    >
      <App
        availableLocales={tool.availableLocales}
        account={{
          returnTo: tool.href,
          user: session?.user ?? null,
        }}
        componentKey={tool.componentKey}
        templates={templates}
        tools={tools}
      />
    </NextIntlClientProvider>
  );
}
