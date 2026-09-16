"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

/** A crop rectangle in whatever units the tool's own settings are declared in. */
export interface CropBox {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface CropFrameProps {
  /** The page or image size the box lives inside, in the same units. */
  bounds: { readonly height: number; readonly width: number };
  box: CropBox;
  disabled?: boolean;
  handles?: "corner" | "all";
  onChange: (box: CropBox) => void;
  /** True when the origin is the bottom-left corner, as in PDF user space. */
  originBottomLeft?: boolean;
}

function roundBox(box: CropBox): CropBox {
  return {
    height: Math.round(box.height),
    width: Math.round(box.width),
    x: Math.round(box.x),
    y: Math.round(box.y),
  };
}

/**
 * A draggable, resizable crop box positioned over whatever its parent renders.
 *
 * It is absolutely positioned, so the caller supplies a `relative` container
 * holding the preview image — the container's box is what pointer movement is
 * measured against. The frame knows only the coordinate space it is handed,
 * which is what lets one implementation serve pixel and point units, and
 * top-left and bottom-left origins.
 */
export function CropFrame({
  bounds,
  box,
  disabled = false,
  onChange,
  originBottomLeft = false,
  handles = "corner",
}: CropFrameProps) {
  const pointer = useRef<{ mode: string; x: number; y: number } | null>(null);

  function clamp(next: CropBox): CropBox {
    const width = Math.min(Math.max(1, next.width), bounds.width);
    const height = Math.min(Math.max(1, next.height), bounds.height);
    return {
      height,
      width,
      x: Math.min(Math.max(0, next.x), bounds.width - width),
      y: Math.min(Math.max(0, next.y), bounds.height - height),
    };
  }

  /** `dy` is screen-down, which is away from the origin only when it is at the top. */
  function move(dx: number, dy: number) {
    if (disabled) return;
    onChange(
      roundBox(
        clamp({
          ...box,
          x: box.x + dx,
          y: box.y + (originBottomLeft ? -dy : dy),
        }),
      ),
    );
  }

  /** Grows towards the bottom-right corner on screen, whichever way y runs. */
  function resize(dx: number, dy: number, handle: string) {
    if (disabled) return;
    let left = box.x;
    let top = originBottomLeft ? bounds.height - box.y - box.height : box.y;
    let right = left + box.width;
    let bottom = top + box.height;
    if (handle.includes("w")) left = Math.max(0, Math.min(right - 1, left + dx));
    if (handle.includes("e")) right = Math.min(bounds.width, Math.max(left + 1, right + dx));
    if (handle.includes("n")) top = Math.max(0, Math.min(bottom - 1, top + dy));
    if (handle.includes("s")) bottom = Math.min(bounds.height, Math.max(top + 1, bottom + dy));
    onChange(
      roundBox({
        x: left,
        y: originBottomLeft ? bounds.height - bottom : top,
        width: right - left,
        height: bottom - top,
      }),
    );
  }

  function step(event: KeyboardEvent<HTMLElement>, apply: (dx: number, dy: number) => void) {
    const amount = event.shiftKey ? 10 : 1;
    const movement: Record<string, readonly [number, number]> = {
      ArrowDown: [0, amount],
      ArrowLeft: [-amount, 0],
      ArrowRight: [amount, 0],
      ArrowUp: [0, -amount],
    };
    const delta = movement[event.key];
    if (!delta) return false;
    event.preventDefault();
    apply(delta[0], delta[1]);
    return true;
  }

  /** Converts a pointer movement in CSS pixels into the caller's units. */
  function scaled(frame: DOMRect, dx: number, dy: number): readonly [number, number] {
    return [(dx * bounds.width) / frame.width, (dy * bounds.height) / frame.height];
  }

  function trackPointer(
    event: PointerEvent<HTMLElement>,
    frame: DOMRect | undefined,
    apply: (dx: number, dy: number) => void,
  ) {
    const origin = pointer.current;
    if (!origin || !frame) return;
    const [dx, dy] = scaled(frame, event.clientX - origin.x, event.clientY - origin.y);
    apply(dx, dy);
    pointer.current = { mode: origin.mode, x: event.clientX, y: event.clientY };
  }

  const top = originBottomLeft ? bounds.height - box.y - box.height : box.y;

  return (
    <div
      aria-label="Crop area"
      className="absolute touch-none cursor-move border-2 border-primary bg-primary/10 shadow-[0_0_0_999px_rgb(15_23_42_/_0.42)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onKeyDown={(event) => step(event, move)}
      onPointerDown={(event) => {
        if (disabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = { mode: "move", x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        if (pointer.current?.mode !== "move") return;
        trackPointer(event, event.currentTarget.parentElement?.getBoundingClientRect(), move);
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        pointer.current = null;
      }}
      onPointerCancel={() => {
        pointer.current = null;
      }}
      onLostPointerCapture={() => {
        pointer.current = null;
      }}
      role="application"
      style={{
        height: `${(box.height / bounds.height) * 100}%`,
        left: `${(box.x / bounds.width) * 100}%`,
        top: `${(top / bounds.height) * 100}%`,
        width: `${(box.width / bounds.width) * 100}%`,
      }}
      tabIndex={disabled ? -1 : 0}
    >
      {(handles === "all" ? ["nw", "n", "ne", "e", "se", "s", "sw", "w"] : ["se"]).map((handle) => (
        <button
          key={handle}
          aria-label={
            handles === "corner"
              ? "Resize crop area"
              : `Resize crop ${{ nw: "top left", n: "top", ne: "top right", e: "right", se: "bottom right", s: "bottom", sw: "bottom left", w: "left" }[handle]}`
          }
          className={
            handles === "all"
              ? `absolute touch-none border-2 border-primary bg-white hover:bg-primary shadow-sm before:absolute before:inset-[-12px] before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${handle.length === 2 ? "size-3 rounded-[3px]" : handle === "n" || handle === "s" ? "h-2 w-6 rounded-full" : "h-6 w-2 rounded-full"}`
              : "absolute size-6 touch-none rounded-full border-2 border-white bg-primary shadow before:absolute before:inset-[-10px] before:content-[''] focus-visible:ring-2 focus-visible:ring-ring"
          }
          style={{
            left: handle.includes("w") ? "0%" : handle.includes("e") ? "100%" : "50%",
            top: handle.includes("n") ? "0%" : handle.includes("s") ? "100%" : "50%",
            transform: "translate(-50%, -50%)",
            cursor: `${handle}-resize`,
          }}
          disabled={disabled}
          onKeyDown={(event) => {
            if (step(event, (dx, dy) => resize(dx, dy, handle))) event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            pointer.current = { mode: handle, x: event.clientX, y: event.clientY };
          }}
          onPointerMove={(event) => {
            if (pointer.current?.mode !== handle) return;
            trackPointer(
              event,
              event.currentTarget.parentElement?.parentElement?.getBoundingClientRect(),
              (dx, dy) => resize(dx, dy, handle),
            );
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            pointer.current = null;
          }}
          onPointerCancel={() => {
            pointer.current = null;
          }}
          type="button"
        />
      ))}
    </div>
  );
}
