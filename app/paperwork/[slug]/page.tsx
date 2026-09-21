import { getOptionalSession } from "@/lib/auth/session.ts";
import { getPublishedTemplates } from "@/lib/admin/index.ts";
import { findAvailableToolBySlug } from "@/lib/tool-catalog/index.ts";
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

const getPaperworkTool = cache(async (slug: string) =>
  findAvailableToolBySlug(await getPaperworkTools(), "paperwork", slug),
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tool = await getPaperworkTool(slug);

  if (!tool || !DOCUMENT_TYPE_BY_COMPONENT_KEY[tool.componentKey]) notFound();

  return { title: tool.name };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const requestHeaders = await headers();
  const [tool, tools, session] = await Promise.all([
    getPaperworkTool(slug),
    getPaperworkTools(),
    getOptionalSession(requestHeaders),
  ]);

  if (!tool) notFound();
  const documentType = DOCUMENT_TYPE_BY_COMPONENT_KEY[tool.componentKey];
  if (!documentType) notFound();
  const templates = await getPublishedTemplates(documentType);

  return (
    <App
      account={{
        returnTo: `/paperwork/${slug}`,
        user: session?.user ?? null,
      }}
      componentKey={tool.componentKey}
      templates={templates}
      tools={tools}
    />
  );
}
