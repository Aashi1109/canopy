import {
  AdvancedDocumentTemplateSchema,
  normalizeAdvancedTemplateConfig,
  type AdvancedDocumentTemplate,
  type DocumentType,
} from "@canopy/invoice-templates";
import { notFound } from "next/navigation";
import { requirePagePermission } from "../../../../../../lib/admin/access";
import { getTemplate } from "../../../../../../lib/admin/data";
import AdvancedTemplateEditor from "./components/AdvancedTemplateEditor";

export default async function AdvancedTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("templates", "view");
  const template = await getTemplate((await params).id);
  if (!template || template.layoutFamily !== "advanced") notFound();

  let normalized: AdvancedDocumentTemplate;
  try {
    normalized = {
      ...template,
      config: normalizeAdvancedTemplateConfig(template.config, template.documentType as DocumentType),
      description: template.description ?? "",
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    } as AdvancedDocumentTemplate;
  } catch {
    notFound();
  }
  if (!AdvancedDocumentTemplateSchema.safeParse(normalized).success) notFound();

  return <AdvancedTemplateEditor template={normalized} />;
}
