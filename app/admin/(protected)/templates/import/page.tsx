import { appHref } from "@/lib/routing/subdomains.ts";
import { BackButton, Caption, H1, H2, Muted } from "@/components/ui/index.tsx";
import { requirePagePermission } from "../../../../../lib/admin/access";
import ImportTemplateForm from "./ImportTemplateForm";

export default async function ImportTemplatePage() {
  await requirePagePermission("templates", "create");

  return (
    <div className="min-h-dvh w-full bg-muted pb-8">
      <header className="flex min-h-16 items-center gap-3 bg-card px-4 sm:px-6">
        <BackButton href={appHref("/admin/templates")} label="Back to templates" className="shrink-0" />
        <div>
          <H1 className="text-foreground">Import template JSON</H1>
          <Caption className="block text-muted-foreground">Validated locally before upload</Caption>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl p-5 sm:p-7">
        <div className="mb-5">
          <H2 className="text-foreground">Import a reusable document template</H2>
          <Muted className="mt-2 max-w-2xl text-muted-foreground">
            Load a SmartTools template export, review its JSON, and create a new draft without changing existing
            templates.
          </Muted>
        </div>

        <ImportTemplateForm />
      </div>
    </div>
  );
}
