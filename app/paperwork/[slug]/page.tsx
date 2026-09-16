import { getOptionalSession } from "@smarttools/auth/session";
import {
  getAvailableToolBySlug,
  getAvailableTools,
  getPublishedTemplates,
} from "@smarttools/control-plane";
import type { DocumentType } from "@smarttools/invoice-templates";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import App from "@/app/paperwork/components/App";
import { getToolManifest } from "@/lib/tool-framework/manifest";

const DOCUMENT_TYPE_BY_COMPONENT_KEY: Record<string, DocumentType> = {
  "invoice-generator": "invoice",
  "receipt-generator": "receipt",
  "expense-report": "expense-report",
  "mileage-log": "mileage-log",
  "quarterly-tax-estimator": "quarterly-tax-estimator",
  "w9-request": "w9-request",
  "1099-nec-tracker": "1099-nec-tracker",
};

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const requestHeaders = await headers();
  const manifest = await getToolManifest();
  const [tool, tools, session] = await Promise.all([
    getAvailableToolBySlug("paperwork", slug, manifest),
    getAvailableTools("paperwork", manifest),
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
