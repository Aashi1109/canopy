"use client";

import { useEffect, useState } from "react";
import { Button, Popover, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, toast } from "@canopy/ui";
import { ChevronDown, Download, Maximize2 } from "lucide-react";
import { MermaidPreview } from "./MermaidPreview";
import { diagramPng } from "@/lib/blog/diagramExport";

export function MermaidDiagram({ source, previewable = false }: { source: string; previewable?: boolean }) {
  const [result, setResult] = useState<{ source: string; svg?: string; error?: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function downloadPng() {
    if (!result?.svg || exporting) return;
    setExporting(true);
    try {
      const png = await diagramPng(result.svg);
      const url = URL.createObjectURL(png);
      const link = document.createElement("a");
      link.href = url;
      link.download = "diagram.png";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("PNG download failed. Try again or download SVG.");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function render() {
      const container = document.createElement("div");
      try {
        if (source.length > 200_000) throw new Error("Split this diagram into smaller diagrams.");
        const { default: mermaid } = await import("mermaid");
        if (cancelled) return;
        mermaid.initialize({ securityLevel: "strict", startOnLoad: false, suppressErrorRendering: true });
        container.setAttribute("aria-hidden", "true");
        Object.assign(container.style, {
          position: "absolute",
          top: "0",
          left: "0",
          width: "100%",
          visibility: "hidden",
          pointerEvents: "none",
        });
        document.body.append(container);
        const { svg } = await mermaid.render(`blog-diagram-${crypto.randomUUID()}`, source, container);
        if (!cancelled) setResult({ source, svg });
      } catch {
        if (!cancelled) setResult({ source, error: "Couldn’t render this diagram. Check the Mermaid source below." });
      } finally {
        container.remove();
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (result?.source !== source)
    return (
      <div role="status" className="p-3 text-sm text-muted-foreground">
        Rendering diagram…
      </div>
    );
  if (result.error)
    return (
      <div>
        <p role="status" className="text-sm text-destructive">
          {result.error}
        </p>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    );
  const diagram = (
    <div
      role="img"
      aria-label="Mermaid diagram"
      className="overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: result.svg ?? "" }}
    />
  );
  if (!previewable) return diagram;
  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              aria-label="Open Mermaid diagram preview"
              className="group relative block h-auto w-full cursor-zoom-in rounded-lg p-0 font-normal hover:bg-transparent"
              onClick={() => setPreviewOpen(true)}
            >
              <span
                className="block overflow-x-auto [&>svg]:mx-auto [&>svg]:h-auto! [&>svg]:w-full! [&>svg]:max-w-full"
                dangerouslySetInnerHTML={{ __html: result.svg ?? "" }}
              />
              <Maximize2
                aria-hidden="true"
                className="absolute right-2 top-2 size-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open full-size diagram</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {previewOpen && (
        <MermaidPreview
          svg={result.svg ?? ""}
          onClose={() => setPreviewOpen(false)}
          downloads={
            <Popover.Root>
              <Popover.Trigger asChild>
                <Button variant="secondary" size="sm" loading={exporting}>
                  <Download aria-hidden="true" />
                  {exporting ? "Preparing PNG…" : "Download"}
                  <ChevronDown aria-hidden="true" />
                </Button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="end"
                  sideOffset={4}
                  aria-label="Download diagram"
                  data-preview-escape-boundary
                  className="z-50 flex flex-col gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                >
                  <Popover.Close asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start"
                      loading={exporting}
                      onClick={() => void downloadPng()}
                    >
                      Download PNG
                    </Button>
                  </Popover.Close>
                  <Popover.Close asChild>
                    <Button asChild variant="ghost" size="sm" className="justify-start">
                      <a
                        href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg ?? "")}`}
                        download="diagram.svg"
                      >
                        Download SVG
                      </a>
                    </Button>
                  </Popover.Close>
                  <Popover.Close asChild>
                    <Button asChild variant="ghost" size="sm" className="justify-start">
                      <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(source)}`} download="diagram.mmd">
                        Download source
                      </a>
                    </Button>
                  </Popover.Close>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          }
        />
      )}
    </>
  );
}
