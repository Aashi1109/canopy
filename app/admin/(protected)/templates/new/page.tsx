import { SubmitButton } from "@/app/admin/(protected)/components/SubmitButton";
import {
  H3,
  Label,
  Caption,
  H1,
  List,
  Muted,
  Text,
  Field,
  Input,
  Select,
  Switch,
  Textarea,
  buttonVariants,
  BackButton,
} from "@/components/ui/index.tsx";
import { CircleCheck, LayoutTemplate } from "lucide-react";
import Link from "next/link";
import { requirePagePermission } from "../../../../../lib/admin/access";
import { createTemplateAction } from "../../../actions";

const layouts = ["classic", "modern", "compact", "bold", "minimal", "service"] as const;

export default async function NewTemplatePage() {
  await requirePagePermission("templates", "create");

  return (
    <div className="flex min-h-dvh w-full flex-col bg-muted">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 bg-card px-6">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton href="/admin/templates" label="Back to templates" className="shrink-0" />
          <div className="min-w-0">
            <H1 className="truncate text-foreground">New standard template</H1>
            <Caption className="block mt-0.5 text-muted-foreground">Templates / Create</Caption>
          </div>
        </div>
        <Caption className="text-warning">Not saved</Caption>
      </header>

      <div className="grid flex-1 items-stretch gap-7 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form
          action={createTemplateAction}
          className="grid content-start gap-[22px] rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7"
        >
          <input name="category" type="hidden" value="professional" />

          <div>
            <H3 className="text-foreground">Create a standard template</H3>
            <Caption className="block mt-1.5 max-w-3xl text-muted-foreground">
              Set the core details and creation defaults. You can refine the template after it has been created.
            </Caption>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              description="Shown in the template library."
              htmlFor="new-template-name"
              label="Template name"
              required
            >
              <Input autoComplete="off" name="name" placeholder="Service Invoice" required />
            </Field>
            <Field
              description="Used in URLs and locked after creation."
              htmlFor="new-template-slug"
              label="Slug"
              required
            >
              <Input
                autoCapitalize="none"
                autoComplete="off"

                name="slug"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                placeholder="service-invoice"
                required
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="new-template-document-type" label="Document type">
              <Select defaultValue="invoice" disabled>
                <option value="invoice">Invoice</option>
              </Select>
            </Field>
            <Field htmlFor="new-template-layout" label="Layout family">
              <Select defaultValue="service" name="layoutFamily">
                {layouts.map((value) => (
                  <option key={value} value={value}>
                    {value[0].toUpperCase() + value.slice(1)}
                    {value === "service" ? " · balanced" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field htmlFor="new-template-description" label="Description" required>
            <Textarea
              className="min-h-[88px] resize-none"
              name="description"
              placeholder="A clear invoice for service businesses with payment terms and itemized work."
              required
            />
          </Field>

          <section className="grid gap-3.5 rounded-lg bg-muted p-4" aria-label="Initial settings">
            <Label className="flex items-center justify-between gap-4">
              <span>
                <Text className="block text-foreground">Start as a draft</Text>
                <Caption className="mt-0.5 block text-muted-foreground">Review before customers can use it</Caption>
              </span>
              <Switch defaultChecked aria-label="Start as a draft" />
            </Label>
            <Label className="flex items-center justify-between gap-4">
              <span>
                <Text className="block text-foreground">Include sample data</Text>
                <Caption className="mt-0.5 block text-muted-foreground">
                  Adds realistic content to the new template
                </Caption>
              </span>
              <Switch defaultChecked aria-label="Include sample data" />
            </Label>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Caption className="block text-muted-foreground">
              Creates one standard template with these settings.
            </Caption>
            <div className="flex items-center justify-end gap-2.5">
              <Link
                className={buttonVariants({ className: "rounded-full px-5", variant: "ghost" })}
                href="/admin/templates"
              >
                Cancel
              </Link>
              <SubmitButton className="rounded-full px-6" size="lg" type="submit">
                Create template
              </SubmitButton>
            </div>
          </div>
        </form>

        <aside
          className="flex flex-col rounded-xl border border-border bg-card p-7 shadow-sm"
          aria-labelledby="standard-guidance-title"
        >
          <span className="grid size-[52px] place-items-center rounded-xl bg-primary/10 text-primary">
            <LayoutTemplate aria-hidden="true" className="size-6" />
          </span>
          <H3 id="standard-guidance-title" className="mt-[22px] text-foreground">
            A dependable starting point
          </H3>
          <Muted className="mt-[22px] text-muted-foreground">
            Standard templates begin with a proven layout family and safe defaults, so creation stays quick and
            predictable.
          </Muted>
          <List className="list-none p-0 space-y-0 mt-[22px] grid gap-[22px] text-foreground">
            {["Structured document foundation", "Print-safe defaults included", "Ready to refine after creation"].map(
              (item) => (
                <li className="flex items-center gap-2.5" key={item}>
                  <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
                  <Text>{item}</Text>
                </li>
              ),
            )}
          </List>
        </aside>
      </div>
    </div>
  );
}
