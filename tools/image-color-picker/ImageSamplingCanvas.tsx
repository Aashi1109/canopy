"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ColorSwatch } from "@/components/ui/index.tsx";
import { pixelCoordinates } from "./model";

type Point = { x: number; y: number };
type Lens = Point & { left: number; top: number };

export function ImageSamplingCanvas({
  image,
  x,
  y,
  zoom,
  disabled,
  onSample,
}: {
  image: HTMLCanvasElement;
  x: number;
  y: number;
  zoom: "fit" | "actual";
  disabled: boolean;
  onSample: (x: number, y: number) => void;
}) {
  const regionRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lensRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<Point | null>(null);
  const sampleRef = useRef(onSample);
  const pointRef = useRef<Point>({ x, y });
  const [point, setPoint] = useState<Point>({ x, y });
  const [lens, setLens] = useState<Lens | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    sampleRef.current = onSample;
  }, [onSample]);

  useEffect(() => {
    if (pointerRef.current !== null) return;
    pointRef.current = { x, y };
    setPoint({ x, y });
  }, [x, y, image]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const observer = new ResizeObserver(() => {
      setViewport({ width: scroll.clientWidth, height: scroll.clientHeight });
    });
    observer.observe(scroll);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    scrollRef.current?.scrollTo(0, 0);
  }, [image]);

  useEffect(() => {
    setLens(null);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      pendingRef.current = null;
      const pointer = pointerRef.current;
      pointerRef.current = null;
      if (pointer !== null && canvasRef.current?.hasPointerCapture(pointer))
        canvasRef.current.releasePointerCapture(pointer);
    };
  }, [image, disabled]);

  useEffect(() => {
    const context = lensRef.current?.getContext("2d");
    if (!context || !lens) return;
    context.clearRect(0, 0, 132, 132);
    context.imageSmoothingEnabled = false;
    context.drawImage(image, lens.x - 5, lens.y - 5, 11, 11, 0, 0, 132, 132);
  }, [image, lens]);

  function cancelPending() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pendingRef.current = null;
  }

  function select(next: Point, flush = false) {
    pointRef.current = next;
    setPoint(next);
    pendingRef.current = next;
    if (flush) {
      cancelPending();
      sampleRef.current(next.x, next.y);
    } else if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) sampleRef.current(pending.x, pending.y);
      });
    }
  }

  function inspect(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = pixelCoordinates(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
      image.width,
      image.height,
    );
    const region = regionRef.current!.getBoundingClientRect();
    const left = event.clientX - region.left;
    const top = event.clientY - region.top;
    setLens({
      ...next,
      left: Math.max(4, Math.min(region.width - 140, left + 20 + 136 > region.width ? left - 156 : left + 20)),
      top: Math.max(4, Math.min(region.height - 164, top + 20 + 160 > region.height ? top - 180 : top + 20)),
    });
    return next;
  }

  function cancelDrag() {
    cancelPending();
    pointerRef.current = null;
    pointRef.current = { x, y };
    setPoint({ x, y });
    setLens(null);
  }

  const scale = zoom === "fit" ? Math.min(1, viewport.width / image.width, viewport.height / image.height) : 1;
  const width = image.width * scale;
  const height = image.height * scale;

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border" ref={regionRef}>
      <ColorSwatch
        className="pointer-events-none absolute inset-0 rounded-none border-0"
        color="transparent"
        label="Transparency background"
      />
      <div className="absolute inset-0 overflow-auto" onScroll={() => setLens(null)} ref={scrollRef}>
        <div
          className="flex items-center justify-center"
          style={{ width: Math.max(width, viewport.width), height: Math.max(height, viewport.height) }}
        >
          <div className="relative shrink-0" style={{ width, height }}>
            <canvas
              aria-disabled={disabled}
              aria-label="Image color picker. Click or drag to select a pixel. Arrow keys move one pixel; hold Shift to move ten."
              className="block touch-none cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onKeyDown={(event) => {
                if (disabled) return;
                const directions: Record<string, Point> = {
                  ArrowLeft: { x: -1, y: 0 },
                  ArrowRight: { x: 1, y: 0 },
                  ArrowUp: { x: 0, y: -1 },
                  ArrowDown: { x: 0, y: 1 },
                };
                const direction = directions[event.key];
                if (!direction) return;
                event.preventDefault();
                setLens(null);
                const step = event.shiftKey ? 10 : 1;
                select(
                  {
                    x: Math.max(0, Math.min(image.width - 1, pointRef.current.x + direction.x * step)),
                    y: Math.max(0, Math.min(image.height - 1, pointRef.current.y + direction.y * step)),
                  },
                  true,
                );
              }}
              onLostPointerCapture={() => {
                if (pointerRef.current !== null) cancelDrag();
              }}
              onPointerCancel={(event) => {
                if (event.pointerId === pointerRef.current) cancelDrag();
              }}
              onPointerDown={(event) => {
                if (disabled || !event.isPrimary || event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.focus({ preventScroll: true });
                event.currentTarget.setPointerCapture(event.pointerId);
                pointerRef.current = event.pointerId;
                select(inspect(event));
              }}
              onPointerLeave={() => {
                if (pointerRef.current === null) setLens(null);
              }}
              onPointerMove={(event) => {
                if (disabled || !event.isPrimary) return;
                const next = inspect(event);
                if (event.pointerId === pointerRef.current) select(next);
              }}
              onPointerUp={(event) => {
                if (disabled || event.pointerId !== pointerRef.current) return;
                select(inspect(event), true);
                pointerRef.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
                if (event.pointerType !== "mouse") setLens(null);
              }}
              ref={canvasRef}
              role="img"
              style={{ width, height }}
              tabIndex={disabled ? -1 : 0}
            />
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 overflow-visible"
              fill="none"
              height="20"
              style={{
                left: `${((point.x + 0.5) / image.width) * 100}%`,
                top: `${((point.y + 0.5) / image.height) * 100}%`,
              }}
              viewBox="0 0 20 20"
              width="20"
            >
              <path d="M10 0v7m0 6v7M0 10h7m6 0h7M7 7h6v6H7z" stroke="var(--primary-foreground)" strokeWidth="3" />
              <path d="M10 0v7m0 6v7M0 10h7m6 0h7M7 7h6v6H7z" stroke="var(--foreground)" strokeWidth="1" />
            </svg>
          </div>
        </div>
      </div>
      {lens && !disabled && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 overflow-hidden rounded-lg border-2 border-popover bg-popover shadow-lg"
          style={{ left: lens.left, top: lens.top }}
        >
          <div className="relative h-[132px] w-[132px]">
            <ColorSwatch className="absolute inset-0 rounded-none border-0" color="transparent" />
            <canvas className="relative block" height={132} ref={lensRef} width={132} />
            <svg className="absolute inset-0" fill="none" height="132" viewBox="0 0 132 132" width="132">
              {Array.from({ length: 10 }, (_, index) => (
                <path
                  d={`M${(index + 1) * 12} 0v132M0 ${(index + 1) * 12}h132`}
                  key={index}
                  opacity="0.35"
                  stroke="var(--primary-foreground)"
                />
              ))}
              <path d="M60 60h12v12H60zM66 54v24M54 66h24" stroke="var(--primary-foreground)" strokeWidth="3" />
              <path d="M60 60h12v12H60zM66 54v24M54 66h24" stroke="var(--destructive)" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="flex h-6 items-center justify-center text-xs tabular-nums text-popover-foreground">
            {lens.x}, {lens.y}
          </div>
        </div>
      )}
    </div>
  );
}
