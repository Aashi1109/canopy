import type { InvoiceTemplate } from "@smarttools/invoice-templates";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { requirePagePermission } from "../../../../../lib/admin/access";
import { getTemplate } from "../../../../../lib/admin/data";
import TemplateEditor from "./components/TemplateEditor";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("templates", "view");
  const template = await getTemplate((await params).id);
  if (!template) notFound();
  if (template.layoutFamily === "advanced") {
    redirect(`/admin/templates/${template.id}/advanced`);
  }

  return (
    <TemplateEditor
      template={
        {
          ...template,
          config: template.config,
          description: template.description ?? "",
          createdAt: template.createdAt.toISOString(),
          updatedAt: template.updatedAt.toISOString(),
        } as InvoiceTemplate
      }
    />
  );
}
