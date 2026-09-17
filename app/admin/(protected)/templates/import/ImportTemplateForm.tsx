"use client";

import { SubmitButton } from "@/app/admin/(protected)/components/SubmitButton";

import { H3, Caption, Muted, P, Strong, Text, AlertBanner, Button, Field, Textarea } from "@canopy/ui";
import { CheckCircle2, FileJson2, UploadCloud, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { importTemplateAction } from "../../../actions";

export default function ImportTemplateForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [source, setSource] = useState("");
  const validation = useMemo(() => {
    if (!source.trim()) return null;
    try {
      const parsed: unknown = JSON.parse(source);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { valid: false, message: "The JSON root must be a template object." };
      }
      return {
        valid: true,
        message: "Valid JSON structure. Server-side schema validation runs during import.",
      };
    } catch (error) {
      return {
        valid: false,
        message: error instanceof Error ? error.message : "The file is not valid JSON.",
      };
    }
  }, [source]);

  async function readFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setFileName(file.name);
      setSource("");
      return;
    }
    setFileName(file.name);
    setSource(await file.text());
  }

  return (
    <form action={importTemplateAction} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
      <div className="grid content-start gap-4">
        <button
          className="grid min-h-64 place-items-center rounded-xl border-2 border-dashed border-primary bg-card p-8 text-center outline-none transition-colors hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void readFile(event.dataTransfer.files[0]);
          }}
          type="button"
        >
          <span>
            <span className="mx-auto grid size-14 place-items-center rounded-xl bg-primary/10 text-primary">
              <UploadCloud aria-hidden="true" className="size-7" />
            </span>
            <Strong className="mt-4 block text-foreground">Drop a template file here</Strong>
            <Text className="mt-2 block text-muted-foreground">or choose a JSON file from your computer</Text>
            <Caption className="mt-3 block text-muted-foreground">JSON only · validated before import</Caption>
          </span>
        </button>
        <input
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => void readFile(event.target.files?.[0])}
          ref={fileInputRef}
          type="file"
        />

        {fileName ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-primary">
              <FileJson2 aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <P className="truncate text-foreground">{fileName}</P>
              <Caption className="block mt-0.5 text-muted-foreground">
                {source ? `${source.length.toLocaleString()} characters loaded` : "Choose a .json file"}
              </Caption>
            </div>
            <Button
              aria-label="Remove selected file"
              onClick={() => {
                setFileName("");
                setSource("");
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
        ) : null}

        <AlertBanner title="Imports never overwrite existing templates" variant="info">
          If the slug already exists, the import is rejected so the existing template stays unchanged.
        </AlertBanner>
      </div>

      <section
        className="grid content-start gap-5 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6"
        aria-labelledby="import-review-title"
      >
        <div>
          <H3 id="import-review-title" className="text-foreground">
            Review before import
          </H3>
          <Muted className="mt-2 text-muted-foreground">
            Imported templates always start as drafts. Paste JSON directly or load a file to validate it locally.
          </Muted>
        </div>
        <Field htmlFor="import-template-json" label="Template JSON" required>
          <Textarea
            code
            className="min-h-72"
            maxLength={5_000_000}
            name="template"
            onChange={(event) => {
              setSource(event.target.value);
              if (fileName) setFileName("");
            }}
            placeholder="Paste an exported template"
            required
            spellCheck={false}
            value={source}
          />
        </Field>
        {validation ? (
          <AlertBanner variant={validation.valid ? "success" : "error"}>{validation.message}</AlertBanner>
        ) : (
          <div className="rounded-lg bg-muted p-4 text-muted-foreground">
            <Text>Add template JSON to see validation status.</Text>
          </div>
        )}
        <div className="rounded-lg bg-muted p-4">
          <div className="flex items-center gap-2 text-foreground">
            <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
            <Text>Imported as a draft</Text>
          </div>
          <Caption className="block mt-1.5 text-muted-foreground">
            Nothing becomes available in Paperwork until you review and publish it.
          </Caption>
        </div>
        <SubmitButton disabled={!validation?.valid} type="submit">
          Import template
        </SubmitButton>
      </section>
    </form>
  );
}
