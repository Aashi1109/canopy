import { appHref } from "@/lib/routing/subdomains.ts";
import { Button } from "@/components/ui/index.tsx";
import { InvoiceTemplatePreview } from "@/lib/invoice-templates/TemplatePreview.tsx";
import type { InvoiceTemplate } from "@/lib/invoice-templates/index.ts";
import { FilePenLine, Settings2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TemplatePageHeader } from "../../components/TemplatePageHeader";
import { requirePagePermission } from "../../../../../../lib/admin/access";
import { getTemplate } from "../../../../../../lib/admin/data";

export default async function TemplatePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("templates", "view");
  const template = await getTemplate((await params).id);
  if (!template) notFound();
  if (template.layoutFamily === "advanced") {
    redirect(appHref(`/admin/templates/${template.id}/advanced`));
  }
  const preview = {
    ...template,
    description: template.description ?? "",
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  } as InvoiceTemplate;

  return (
    <div className="min-h-dvh w-full bg-muted">
      <TemplatePageHeader
        title={`${template.name} preview`}
        status={template.status}
        backHref={appHref(`/admin/templates/${template.id}`)}
        backLabel="Back to template editor"
        description={
          <>
            {template.documentType.replaceAll("-", " ")} · Standard editor · /{template.slug}
          </>
        }
        actions={
          <>
            <Button asChild className="rounded-full" size="default" variant="secondary">
              <Link href={appHref(`/admin/templates/${template.id}/manage`)}>
                <Settings2 aria-hidden="true" />
                Manage template
              </Link>
            </Button>
            <Button asChild className="rounded-full" size="default">
              <Link href={appHref(`/admin/templates/${template.id}`)}>
                <FilePenLine aria-hidden="true" />
                Open editor
              </Link>
            </Button>
          </>
        }
      />
      <div className="mx-auto w-full max-w-6xl p-5 sm:p-7">
        <InvoiceTemplatePreview template={preview} />
      </div>
    </div>
  );
}
