import { Caption, H1, H2, Muted, Overline, buttonVariants } from "@smarttools/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requirePagePermission } from "../../../../../lib/admin/access";
import ImportTemplateForm from "./ImportTemplateForm";

export default async function ImportTemplatePage() {
  await requirePagePermission("templates", "create");

  return (
    <div className="min-h-dvh w-full bg-muted pb-8">
      <header className="flex min-h-16 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
        <Link
          aria-label="Back to templates"
          className={buttonVariants({
            className: "size-9 rounded-lg",
            size: "icon",
            variant: "ghost",
          })}
          href="/admin/templates"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
        </Link>
        <div>
          <H1 className="text-foreground">Import template JSON</H1>
          <Caption className="block text-muted-foreground">Validated locally before upload</Caption>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl p-5 sm:p-7">
        <div className="mb-6">
          <Overline className="block text-primary">Template operations</Overline>
          <H2 className="mt-2 text-foreground">Import a reusable document template</H2>
          <Muted className="mt-2 max-w-2xl text-muted-foreground">
            Load a SmartTools template export, review its JSON, and create a new draft without
            changing existing templates.
          </Muted>
        </div>

        <ImportTemplateForm />
      </div>
    </div>
  );
}
