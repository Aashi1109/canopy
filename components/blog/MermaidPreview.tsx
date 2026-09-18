"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Button,
  MediaPreview,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/index.tsx";
import { Minus, Plus } from "lucide-react";

export function MermaidPreview({
  svg,
  onClose,
  downloads,
}: {
  svg: string;
  onClose: () => void;
  downloads: ReactNode;
}) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const bounds = svg
    .match(/\bviewBox=["']([^"']+)["']/)?.[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = bounds && Number.isFinite(bounds[2]) && bounds[2] > 0 ? bounds[2] : 1000;
  const height = bounds && Number.isFinite(bounds[3]) && bounds[3] > 0 ? bounds[3] : 600;
  const fit = area.width && area.height ? Math.min(area.width / width, area.height / height) * 100 : 100;
  const scale = zoom ?? fit;
  const canPan = scale > fit;

  useEffect(() => {
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) =>
      setArea({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewport]);

  function changeZoom(value: number | null) {
    setZoom(value === null ? null : Math.min(400, Math.max(10, value)));
    viewport?.scrollTo({ left: 0, top: 0 });
  }

  function stopPanning() {
    drag.current = null;
    setPanning(false);
  }

  return (
    <TooltipProvider>
      <MediaPreview
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title="Mermaid diagram"
        description="Full-size diagram preview"
        actions={downloads}
        hint="Zoom to inspect · Drag or use arrow keys to pan"
        viewportClassName="overflow-hidden"
        controls={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Zoom out"
                  disabled={scale <= 10}
                  onClick={() => changeZoom(scale - 25)}
                >
                  <Minus aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom out</TooltipContent>
            </Tooltip>
            <span className="min-w-10 text-center text-xs tabular-nums" aria-live="polite">
              {Math.round(scale)}%
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Zoom in"
                  disabled={scale >= 400}
                  onClick={() => changeZoom(scale + 25)}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom in</TooltipContent>
            </Tooltip>
            <Button variant="secondary" size="sm" onClick={() => changeZoom(null)}>
              Fit to screen
            </Button>
            <Button variant="secondary" size="sm" onClick={() => changeZoom(100)}>
              100%
            </Button>
          </>
        }
      >
        <div
          ref={setViewport}
          role="region"
          aria-label="Diagram canvas. Use arrow keys to pan when zoomed in."
          tabIndex={0}
          className="flex h-full min-h-0 w-full overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ cursor: canPan ? (panning ? "grabbing" : "grab") : undefined }}
          onPointerDown={(event) => {
            if (!canPan || event.button !== 0 || event.pointerType === "touch") return;
            const node = event.currentTarget;
            node.focus();
            drag.current = { x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop };
            node.setPointerCapture(event.pointerId);
            setPanning(true);
            event.preventDefault();
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            event.currentTarget.scrollLeft = drag.current.left + drag.current.x - event.clientX;
            event.currentTarget.scrollTop = drag.current.top + drag.current.y - event.clientY;
          }}
          onPointerUp={stopPanning}
          onPointerCancel={stopPanning}
          onLostPointerCapture={stopPanning}
        >
          <div
            role="img"
            aria-label="Mermaid diagram"
            className="m-auto shrink-0 select-none bg-white text-black [&>svg]:!h-full [&>svg]:!w-full [&>svg]:!max-w-none"
            style={{ width: (width * scale) / 100, height: (height * scale) / 100 }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </MediaPreview>
    </TooltipProvider>
  );
}
