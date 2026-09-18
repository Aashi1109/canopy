import { SubmitButton } from "@/app/admin/(protected)/components/SubmitButton";
import { DOCUMENT_DEFINITIONS } from "@/lib/invoice-templates/index.ts";
import {
  H3,
  Label,
  Caption,
  H1,
  H2,
  Muted,
  Overline,
  Strong,
  Field,
  Input,
  Select,
  StatusBadge,
  Textarea,
  buttonVariants,
} from "@/components/ui/index.tsx";
import { ArrowLeft, Braces, Copy, FilePenLine, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { requirePagePermission } from "../../../../../../lib/admin/access";
import { createAdvancedTemplateAction } from "../../../../actions";

const categories = ["classic", "modern", "simple", "professional", "creative", "service"] as const;
const pageFormatLabels = {
  A4: "A4",
  LETTER: "Letter",
  RECEIPT_80MM: "80 mm receipt",
  RECEIPT_58MM: "58 mm receipt",
} as const;

export default async function NewAdvancedTemplatePage() {
  await requirePagePermission("templates", "create");

  return (
    <div className="min-h-dvh w-full bg-muted pb-8">
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
        <Link
          aria-label="Back to templates"
          className={buttonVariants({
            className: "size-9 shrink-0 rounded-lg",
            size: "icon",
            variant: "ghost",
          })}
          href="/admin/templates"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
        </Link>
        <H1 className="text-foreground">New advanced template</H1>
        <StatusBadge className="min-h-6 px-2.5" variant="info">
          Opens in advanced designer
        </StatusBadge>
      </header>

      <form action={createAdvancedTemplateAction} className="mx-auto grid w-full max-w-6xl gap-6 p-5 sm:p-7">
        <div className="text-center">
          <Overline className="block text-primary">Advanced creation</Overline>
          <H2 className="mt-2 text-foreground">Choose a starting point</H2>
          <Muted className="mx-auto mt-2 max-w-2xl text-muted-foreground">
            We’ll create the template record first, then hand it off to the existing canvas designer.
          </Muted>
        </div>

        <div className="grid gap-4 md:grid-cols-3" aria-label="Advanced template starting points">
          <Label className="group relative cursor-pointer rounded-xl border-2 border-primary bg-primary/5 p-5 outline-none transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <input className="sr-only" defaultChecked name="startingPoint" type="radio" value="blank" />
            <span className="flex items-start justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Plus aria-hidden="true" className="size-5" />
              </span>
              <Overline className="text-primary">Selected</Overline>
            </span>
            <Strong className="mt-4 block text-foreground">Blank canvas</Strong>
            <Caption className="mt-1.5 block text-muted-foreground">
              Start from a clean, correctly sized document with no placed elements.
            </Caption>
          </Label>

          <Link
            className="group rounded-xl border border-border bg-card p-5 outline-none transition-[border-color,transform] hover:-translate-y-0.5 hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            href="/admin/templates"
          >
            <span className="grid size-10 place-items-center rounded-lg bg-muted text-foreground group-hover:bg-primary/10 group-hover:text-primary">
              <Copy aria-hidden="true" className="size-5" />
            </span>
            <Strong className="mt-4 block text-foreground">Clone a template</Strong>
            <Caption className="mt-1.5 block text-muted-foreground">
              Return to the library and duplicate an existing standard or advanced draft.
            </Caption>
          </Link>

          <Link
            className="group rounded-xl border border-border bg-card p-5 outline-none transition-[border-color,transform] hover:-translate-y-0.5 hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            href="/admin/templates/import"
          >
            <span className="grid size-10 place-items-center rounded-lg bg-muted text-foreground group-hover:bg-primary/10 group-hover:text-primary">
              <Upload aria-hidden="true" className="size-5" />
            </span>
            <Strong className="mt-4 block text-foreground">Import JSON</Strong>
            <Caption className="mt-1.5 block text-muted-foreground">
              Use the library importer for an exported and schema-compatible template.
            </Caption>
          </Link>
        </div>

        <section
          className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6"
          aria-labelledby="advanced-setup-title"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <H3 id="advanced-setup-title" className="text-foreground">
                Quick setup
              </H3>
              <Muted className="mt-1 text-muted-foreground">
                Define the draft identity and canvas before opening the designer.
              </Muted>
            </div>
            <Caption className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-muted-foreground">
              <Braces aria-hidden="true" className="size-3.5 text-primary" />
              Schema-backed draft
            </Caption>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <Field htmlFor="advanced-template-name" label="Template name" required>
              <Input autoComplete="off" name="name" placeholder="Modern Service Invoice" required />
            </Field>
            <Field
              description="Lowercase letters, numbers, and hyphens only."
              htmlFor="advanced-template-slug"
              label="Slug"
              required
            >
              <Input
                autoCapitalize="none"
                autoComplete="off"

                name="slug"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                placeholder="modern-service-invoice"
                required
              />
            </Field>
            <Field htmlFor="advanced-template-starter" label="Document and canvas">
              <Select defaultValue="invoice:A4" name="starter">
                {DOCUMENT_DEFINITIONS.flatMap((definition) =>
                  definition.allowedPageFormats.map((format) => (
                    <option key={`${definition.documentType}:${format}`} value={`${definition.documentType}:${format}`}>
                      {definition.label} · {pageFormatLabels[format]}
                    </option>
                  )),
                )}
              </Select>
            </Field>
            <Field htmlFor="advanced-template-category" label="Category">
              <Select defaultValue="professional" name="category">
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field className="md:col-span-2" htmlFor="advanced-template-description" label="Description" required>
              <Textarea
                className="min-h-24"
                name="description"
                placeholder="A freeform document for service businesses with custom bindings and repeating regions."
                required
              />
            </Field>
          </div>
        </section>

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Caption className="block mr-auto text-muted-foreground">
            Next: add layers, bindings, and repeating regions
          </Caption>
          <Link className={buttonVariants({ variant: "ghost" })} href="/admin/templates">
            Cancel
          </Link>
          <SubmitButton type="submit">
            <FilePenLine aria-hidden="true" className="size-4" />
            Create &amp; open designer
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
