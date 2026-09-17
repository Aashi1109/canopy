"use client";

import {
  AlertBanner,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from "@canopy/ui";
import { slugFromName } from "@canopy/tool-catalog";
import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { categoriesForApp, TOOL_CATEGORIES, type ToolApp } from "../../../../../lib/tool-framework/categories";
import { createToolAction, type ToolContentActionState } from "../actions";

const IDLE: ToolContentActionState = { status: "idle", message: "" };

const APPS: readonly { readonly app: ToolApp; readonly label: string }[] = [
  { app: "devtools", label: "Developer tools" },
  { app: "media", label: "Media tools" },
];

/** Mirrors the server default without letting an unslugifiable name throw. */
function previewSlug(name: string): string {
  try {
    return slugFromName(name);
  } catch {
    return "";
  }
}

export function NewToolDialog() {
  const [open, setOpen] = useState(false);
  const [app, setApp] = useState<ToolApp>("devtools");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [state, submit, isSubmitting] = useActionState(createToolAction, IDLE);

  const slug = previewSlug(name);

  function chooseApp(nextApp: ToolApp): void {
    setApp(nextApp);
    // Categories are per app, so the old choice cannot survive the switch.
    setCategory("");
  }

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden="true" />
          New tool
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] translate-x-0 translate-y-0 overflow-y-auto data-[size=default]:sm:max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Create a tool&apos;s configuration</AlertDialogTitle>
          <AlertDialogDescription>Set up the tool’s details; deploy its code separately.</AlertDialogDescription>
        </AlertDialogHeader>

        {state.status === "error" ? <AlertBanner variant="error">{state.message}</AlertBanner> : null}

        <form action={submit} className="grid gap-6">
          <input name="app" type="hidden" value={app} />
          <input name="key" type="hidden" value={slug} />

          <Field
            description="Paperwork is a separate product surface and is not created here."
            htmlFor="new-tool-app"
            label="App"
          >
            <Select id="new-tool-app" onChange={(event) => chooseApp(event.target.value as ToolApp)} value={app}>
              {APPS.map((option) => (
                <option key={option.app} value={option.app}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="new-tool-name" label="Name">
            <Input
              autoComplete="off"
              id="new-tool-name"
              name="name"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </Field>

          <Field htmlFor="new-tool-description" label="Description">
            <Textarea id="new-tool-description" name="description" required rows={2} />
          </Field>

          <Field
            description="Must be a category registered for the chosen app."
            htmlFor="new-tool-category"
            label="Category"
          >
            <Select
              id="new-tool-category"
              name="category"
              onChange={(event) => setCategory(event.target.value)}
              required
              value={category}
            >
              <option value="">Choose a category</option>
              {categoriesForApp(app).map((categoryKey) => (
                <option key={categoryKey} value={categoryKey}>
                  {TOOL_CATEGORIES[categoryKey].label}
                </option>
              ))}
            </Select>
          </Field>

          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button loading={isSubmitting} type="submit">
              Create configuration
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
