import { AdminPageHeader } from "@/app/admin/(protected)/components/AdminPageHeader";
import { InvoiceTemplatePreview } from "@/lib/invoice-templates/TemplatePreview.tsx";
import type { InvoiceTemplate } from "@/lib/invoice-templates/index.ts";
import { notFound, redirect } from "next/navigation";
import { requirePagePermission } from "../../../../../../lib/admin/access";
import { getTemplate } from "../../../../../../lib/admin/data";

export default async function TemplatePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("templates", "view");
  const template = await getTemplate((await params).id);
  if (!template) notFound();
  if (template.layoutFamily === "advanced") {
    redirect(`/admin/templates/${template.id}/advanced`);
  }
  const preview = {
    ...template,
    description: template.description ?? "",
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  } as InvoiceTemplate;

  return (
    <>
      <AdminPageHeader
        description="Uses the shared invoice-template preview renderer."
        title={`${template.name} preview`}
      />
      <InvoiceTemplatePreview template={preview} />
    </>
  );
}
