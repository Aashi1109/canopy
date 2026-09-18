"use client";
import { P, Text } from "@/components/ui/index.tsx";

import type { Template } from "@pdfme/common";
import type { AdvancedDocumentTemplate } from "@/lib/invoice-templates/index.ts";
import { useEffect, useRef, useState } from "react";
import { applyTemplateFormatting } from "@/lib/paperwork/advancedTemplateData";

type PdfmeSchemas = typeof import("@pdfme/schemas");
type ViewerInstance = InstanceType<(typeof import("@pdfme/ui"))["Viewer"]>;

interface AdvancedDocumentPdfOptions {
  template: AdvancedDocumentTemplate;
  data: Record<string, string>;
}

interface DownloadAdvancedDocumentPdfOptions extends AdvancedDocumentPdfOptions {
  fileName: string;
}

interface AdvancedDocumentPreviewProps extends AdvancedDocumentPdfOptions {
  className?: string;
  onError?: (message: string) => void;
}

function allPdfmePlugins(schemas: PdfmeSchemas) {
  return {
    text: schemas.text,
    multiVariableText: schemas.multiVariableText,
    list: schemas.list,
    image: schemas.image,
    signature: schemas.signature,
    svg: schemas.svg,
    table: schemas.table,
    line: schemas.line,
    rectangle: schemas.rectangle,
    ellipse: schemas.ellipse,
    dateTime: schemas.dateTime,
    date: schemas.date,
    time: schemas.time,
    select: schemas.select,
    radioGroup: schemas.radioGroup,
    checkbox: schemas.checkbox,
    circleMark: schemas.circleMark,
    ...schemas.barcodes,
  };
}

function pdfmeTemplate(template: AdvancedDocumentTemplate): Template {
  return template.config.template as unknown as Template;
}

function fitViewerPageToSurface(container: HTMLDivElement, viewer: ViewerInstance) {
  let timer = 0;
  const observer = new MutationObserver(scheduleFit);

  function stop() {
    observer.disconnect();
    window.clearTimeout(timer);
  }

  function fit() {
    const background = container.querySelector<HTMLElement>(".pdfme-designer-background");
    const paper = background?.lastElementChild?.firstElementChild?.firstElementChild;
    const controls = container.querySelector<HTMLElement>(".pdfme-ui-control-bar")?.parentElement;
    if (!(paper instanceof HTMLElement) || !controls) return;

    const paperRect = paper.getBoundingClientRect();
    const availableWidth = container.clientWidth - 16;
    const availableHeight = container.clientHeight - controls.getBoundingClientRect().height - 48;
    if (paperRect.width <= 0 || paperRect.height <= 0 || availableWidth <= 0 || availableHeight <= 0) {
      return;
    }

    const currentZoomLevel = viewer.getOptions().zoomLevel ?? 1;
    const zoomLevel = Math.min(
      2,
      Math.max(0.25, currentZoomLevel * Math.min(availableWidth / paperRect.width, availableHeight / paperRect.height)),
    );
    stop();
    viewer.updateOptions({ zoomLevel });
  }

  function scheduleFit() {
    window.clearTimeout(timer);
    timer = window.setTimeout(fit, 150);
  }

  observer.observe(container, {
    attributes: true,
    childList: true,
    subtree: true,
  });
  scheduleFit();
  return stop;
}

async function generateAdvancedDocumentPdf({ template, data }: AdvancedDocumentPdfOptions) {
  const [{ generate }, schemas] = await Promise.all([import("@pdfme/generator"), import("@pdfme/schemas")]);
  return generate({
    template: pdfmeTemplate(template),
    inputs: [applyTemplateFormatting(template, data)],
    plugins: allPdfmePlugins(schemas),
  });
}

export async function downloadAdvancedDocumentPdf({
  template,
  data,
  fileName,
}: DownloadAdvancedDocumentPdfOptions): Promise<void> {
  const pdf = await generateAdvancedDocumentPdf({ template, data });
  const objectUrl = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  const link = document.createElement("a");
  const requestedName = fileName.trim() || template.slug;
  link.download = requestedName.toLowerCase().endsWith(".pdf") ? requestedName : `${requestedName}.pdf`;
  link.href = objectUrl;

  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

export async function openAdvancedDocumentPdf({ template, data }: AdvancedDocumentPdfOptions): Promise<void> {
  const previewWindow = window.open("", "_blank");
  if (!previewWindow) {
    throw new Error("Allow pop-ups to open the PDF preview.");
  }
  previewWindow.opener = null;

  let objectUrl: string | null = null;
  try {
    const pdf = await generateAdvancedDocumentPdf({ template, data });
    objectUrl = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
    previewWindow.location.replace(objectUrl);
    const loadedUrl = objectUrl;
    objectUrl = null;
    // ponytail: browser PDF viewers expose no reliable cross-browser load event.
    window.setTimeout(() => URL.revokeObjectURL(loadedUrl), 60_000);
  } catch (error) {
    previewWindow.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export function AdvancedDocumentPreview({ template, data, className, onError }: AdvancedDocumentPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerInstance | null>(null);
  const fitCleanupRef = useRef<(() => void) | null>(null);
  const fittedTemplateRef = useRef(`${template.id}:${template.version}`);
  const templateRef = useRef(template);
  const dataRef = useRef(data);
  const onErrorRef = useRef(onError);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  templateRef.current = template;
  dataRef.current = data;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let viewer: ViewerInstance | null = null;

    async function mountViewer() {
      try {
        const [{ Viewer }, schemas] = await Promise.all([import("@pdfme/ui"), import("@pdfme/schemas")]);
        if (cancelled || !containerRef.current) return;

        viewer = new Viewer({
          domContainer: containerRef.current,
          template: pdfmeTemplate(templateRef.current),
          inputs: [applyTemplateFormatting(templateRef.current, dataRef.current)],
          plugins: allPdfmePlugins(schemas),
        });
        viewerRef.current = viewer;
        fitCleanupRef.current = fitViewerPageToSurface(containerRef.current, viewer);
        setIsLoading(false);
      } catch {
        if (cancelled) return;
        const message = "The PDF preview could not be loaded. Please try again.";
        setError(message);
        setIsLoading(false);
        onErrorRef.current?.(message);
      }
    }

    void mountViewer();

    return () => {
      cancelled = true;
      fitCleanupRef.current?.();
      if (!viewer) return;
      viewer.destroy();
      if (viewerRef.current === viewer) viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    try {
      viewer.updateTemplate(pdfmeTemplate(template));
      viewer.setInputs([applyTemplateFormatting(template, data)]);
      const templateKey = `${template.id}:${template.version}`;
      if (fittedTemplateRef.current !== templateKey && containerRef.current) {
        fitCleanupRef.current?.();
        fitCleanupRef.current = fitViewerPageToSurface(containerRef.current, viewer);
        fittedTemplateRef.current = templateKey;
      }
      setError("");
    } catch {
      const message = "The PDF preview could not be updated. Please try again.";
      setError(message);
      onErrorRef.current?.(message);
    }
  }, [template, data]);

  return (
    <div className={className}>
      <div
        aria-busy={isLoading}
        aria-label={`${template.name} PDF preview`}
        className="relative h-[48rem] min-h-[32rem] overflow-hidden rounded-xl border border-border bg-muted/30"
      >
        <div className="pdfme-preview-surface size-full" ref={containerRef} />
        {isLoading ? (
          <div
            aria-live="polite"
            className="absolute inset-0 grid place-items-center bg-background/80 text-muted-foreground"
            role="status"
          >
            <Text>Loading PDF preview…</Text>
          </div>
        ) : null}
      </div>
      {error ? (
        <P className="mt-2 text-destructive" role="alert">
          {error}
        </P>
      ) : null}
    </div>
  );
}
