"use client";

import { useId, useRef, useState, type PointerEvent } from "react";
import { Muted } from "@/components/ui/index.tsx";
import { moveCropPoint, translateCrop, type CropPoint, type ImageSize } from "./geometry";

interface Props {
  url: string;
  points: readonly CropPoint[];
  size: ImageSize;
  selected: number;
  disabled: boolean;
  onSelect: (index: number) => void;
  onChange: (points: readonly CropPoint[]) => void;
  onLoad: (size: ImageSize) => void;
  onError: () => void;
  onInvalidMove: () => void;
}

export function FreeformPreview({
  url,
  points,
  size,
  selected,
  disabled,
  onSelect,
  onChange,
  onLoad,
  onError,
  onInvalidMove,
}: Props) {
  const hintId = useId();
  const maskId = useId().replace(/:/g, "");
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    index: number | null;
    start: CropPoint;
    points: readonly CropPoint[];
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const coordinate = (event: PointerEvent): CropPoint => {
    const rect = surface.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * size.width) / rect.width,
      y: ((event.clientY - rect.top) * size.height) / rect.height,
    };
  };
  const start = (event: PointerEvent, index: number | null) => {
    if (disabled || !event.isPrimary || event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (index !== null) onSelect(index);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.currentTarget instanceof HTMLElement || event.currentTarget instanceof SVGElement)
      event.currentTarget.focus();
    drag.current = { id: event.pointerId, index, start: coordinate(event), points };
    setDragging(true);
  };
  const move = (event: PointerEvent) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId || disabled) return;
    const p = coordinate(event);
    const next =
      current.index === null
        ? translateCrop(current.points, p.x - current.start.x, p.y - current.start.y, size)
        : moveCropPoint(
            current.points,
            current.index,
            {
              x: current.points[current.index].x + p.x - current.start.x,
              y: current.points[current.index].y + p.y - current.start.y,
            },
            size,
          );
    if (next === current.points) onInvalidMove();
    else onChange(next);
  };
  const finish = (cancel = false) => {
    if (cancel && drag.current) onChange(drag.current.points);
    drag.current = null;
    setDragging(false);
  };
  const ready = size.width > 0 && size.height > 0 && points.length >= 3;
  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Muted className="shrink-0 px-4 py-2" id={hintId}>
        Drag handles to shape the crop · Drag inside to move it
      </Muted>
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-6">
        <div
          ref={surface}
          className="relative inline-block max-w-full shrink-0 touch-none select-none"
          onKeyDown={(event) => {
            if (event.key === "Escape" && drag.current) {
              event.preventDefault();
              finish(true);
            }
          }}
          onPointerMove={move}
          onPointerUp={() => finish()}
          onPointerCancel={() => finish(true)}
          onLostPointerCapture={() => {
            if (drag.current) finish(true);
          }}
        >
          <img
            alt="Source image with freeform crop selection"
            className="block max-h-[520px] max-w-full object-contain outline outline-1 outline-black/10 dark:outline-white/10"
            draggable={false}
            src={url}
            onError={onError}
            onLoad={(event) =>
              onLoad({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
          />
          {ready ? (
            <>
              <svg
                aria-label="Crop selection"
                className="absolute inset-0 h-full w-full overflow-visible"
                viewBox={`0 0 ${size.width} ${size.height}`}
              >
                <defs>
                  <mask id={maskId}>
                    <rect width={size.width} height={size.height} fill="white" />
                    <polygon points={polygon} fill="black" />
                  </mask>
                </defs>
                <rect
                  width={size.width}
                  height={size.height}
                  fill="black"
                  opacity="0.4"
                  mask={`url(#${maskId})`}
                  pointerEvents="none"
                />
                <polygon
                  aria-label="Move entire crop selection"
                  aria-describedby={hintId}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  className="cursor-move fill-transparent stroke-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  points={polygon}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(event) => start(event, null)}
                  onKeyDown={(event) => {
                    if (disabled || !event.key.startsWith("Arrow")) return;
                    event.preventDefault();
                    const step = event.shiftKey ? 10 : 1;
                    onChange(
                      translateCrop(
                        points,
                        event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
                        event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
                        size,
                      ),
                    );
                  }}
                />
              </svg>
              {points.map((point, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Crop point ${index + 1}`}
                  aria-pressed={selected === index}
                  aria-describedby={hintId}
                  disabled={disabled}
                  className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed"
                  style={{
                    left: `${(point.x / size.width) * 100}%`,
                    top: `${(point.y / size.height) * 100}%`,
                  }}
                  onFocus={() => onSelect(index)}
                  onPointerDown={(event) => start(event, index)}
                  onKeyDown={(event) => {
                    if (disabled || !event.key.startsWith("Arrow")) return;
                    event.preventDefault();
                    const step = event.shiftKey ? 10 : 1;
                    const next = moveCropPoint(
                      points,
                      index,
                      {
                        x: point.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
                        y: point.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
                      },
                      size,
                    );
                    if (next === points) onInvalidMove();
                    else onChange(next);
                  }}
                >
                  <span
                    className={`size-4 rounded-full border-2 border-white bg-primary ${selected === index ? "ring-4 ring-primary/25" : ""}`}
                  />
                </button>
              ))}
            </>
          ) : null}
        </div>
      </div>
      <Muted aria-live={dragging ? "off" : "polite"} className="shrink-0 border-t border-border px-4 py-2">
        Point {selected + 1} selected · Arrow keys move 1 px · Shift moves 10 px · Esc cancels a drag
      </Muted>
    </div>
  );
}
