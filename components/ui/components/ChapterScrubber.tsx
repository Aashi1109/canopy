"use client";

import * as React from "react";
import { motion, useMotionValue, useTransform, type MotionValue } from "motion/react";

import { cn } from "../lib/utils.ts";

export interface Chapter {
  id: string;
  title: string;
  description?: React.ReactNode;
  meta?: React.ReactNode;
}

export interface ChapterScrubberProps {
  chapters: Chapter[];
  density?: "compact" | "default";
  side?: "left" | "right";
  restLength?: number;
  hoverLengthMultiplier?: number;
  rowHeight?: number;
  radius?: number;
  currentIndex?: number;
  onActiveChange?: (chapter: Chapter | null, index: number) => void;
  onSelect: (chapter: Chapter, index: number) => void;
  previewCardClassName?: string;
  previewCardGap?: number;
  previewCardWidth?: number;
  previewDelayMs?: number;
  renderPreview?: (chapter: Chapter, index: number) => React.ReactNode;
  showPreviewCard?: boolean;
  label?: string;
  className?: string;
}

const CARD_MAX_WIDTH = 260;
const CARD_GAP = 20;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function waveStrength(distance: number, radius: number) {
  if (distance >= radius) return 0;
  const standardDeviation = radius / 2.25;
  return Math.exp(-0.5 * (distance / standardDeviation) ** 2);
}

type ChapterTickProps = {
  active: boolean;
  current: boolean;
  hoverLengthMultiplier: number;
  initialLength: number;
  index: number;
  pointer: MotionValue<number>;
  radius: number;
  restLength: number;
  strength: MotionValue<number>;
};

const ChapterTick = React.memo(function ChapterTick({
  active,
  current,
  hoverLengthMultiplier,
  initialLength,
  index,
  pointer,
  radius,
  restLength,
  strength,
}: ChapterTickProps) {
  const width = useTransform(() => {
    const rise = strength.get() * waveStrength(Math.abs(index - pointer.get()), radius);
    const peakLength = initialLength * hoverLengthMultiplier;
    return restLength + rise * (peakLength - restLength);
  });
  const opacity = useTransform(() => {
    if (active) return 1;
    const rise = strength.get() * waveStrength(Math.abs(index - pointer.get()), radius);
    const restingOpacity = current ? 0.82 : 0.46;
    return restingOpacity + rise * (0.72 - restingOpacity);
  });
  return (
    <motion.span
      aria-hidden="true"
      className={cn(
        "block h-0.5 rounded-full",
        active ? "bg-foreground" : current ? "bg-primary" : "bg-muted-foreground",
      )}
      style={{ opacity, width }}
    />
  );
});

export function ChapterScrubber({
  chapters,
  density = "default",
  side = "right",
  restLength = 14,
  hoverLengthMultiplier = 4,
  rowHeight = 24,
  radius = 4,
  currentIndex,
  onActiveChange,
  onSelect,
  previewCardClassName,
  previewCardGap = CARD_GAP,
  previewCardWidth,
  previewDelayMs = 0,
  renderPreview,
  showPreviewCard = true,
  label = "Chapters",
  className,
}: ChapterScrubberProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLButtonElement>(null);
  const buttonsRef = React.useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = React.useId();

  const pointer = useMotionValue(0);
  const strength = useMotionValue(0);

  const [activeIndex, setActiveIndex] = React.useState(0);
  const [cardHeight, setCardHeight] = React.useState(0);
  const [cardMaxWidth, setCardMaxWidth] = React.useState(CARD_MAX_WIDTH);
  const [engaged, setEngaged] = React.useState(false);
  const [flipped, setFlipped] = React.useState(false);
  const [previewCardReady, setPreviewCardReady] = React.useState(false);
  const activeRef = React.useRef(0);
  const focusedRef = React.useRef<number | null>(null);
  const hoveringRef = React.useRef(false);
  const lastPointerTypeRef = React.useRef<string | null>(null);
  const touchPreviewRef = React.useRef<number | null>(null);

  const lastIndex = chapters.length - 1;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const resolvedRestLength = Number.isFinite(restLength) ? clamp(restLength, 2, 80) : 14;
  const resolvedHoverLengthMultiplier = Number.isFinite(hoverLengthMultiplier)
    ? clamp(hoverLengthMultiplier, 1, 12)
    : 4;
  const resolvedPeakLength = resolvedRestLength * resolvedHoverLengthMultiplier;
  const resolvedPreviewCardGap = Number.isFinite(previewCardGap) ? Math.max(0, previewCardGap) : CARD_GAP;
  const resolvedPreviewCardWidth = Number.isFinite(previewCardWidth)
    ? Math.min(cardMaxWidth, clamp(previewCardWidth ?? CARD_MAX_WIDTH, 96, CARD_MAX_WIDTH))
    : cardMaxWidth;
  const minimumRowHeight = density === "compact" ? 5 : 24;
  const resolvedRowHeight = Number.isFinite(rowHeight) && rowHeight >= minimumRowHeight ? rowHeight : minimumRowHeight;
  const resolvedRadius = Number.isFinite(radius) && radius > 0 ? radius : 4;
  const normalizedCurrentIndex =
    currentIndex === undefined || lastIndex < 0
      ? 0
      : clamp(Number.isFinite(currentIndex) ? Math.round(currentIndex) : 0, 0, lastIndex);
  const rovingIndex = engaged ? clamp(activeIndex, 0, Math.max(lastIndex, 0)) : normalizedCurrentIndex;

  function updatePointer(nextPointer: number) {
    pointer.set(nextPointer);
  }

  function updateStrength(nextStrength: number) {
    strength.set(nextStrength);
  }

  const commitActive = React.useCallback((index: number) => {
    if (index === activeRef.current) return;
    activeRef.current = index;
    setActiveIndex(index);
  }, []);

  React.useEffect(() => {
    const activeChapter = engaged ? chapters[activeIndex] : undefined;
    onActiveChange?.(activeChapter ?? null, activeChapter ? activeIndex : -1);
  }, [activeIndex, chapters, engaged, onActiveChange]);

  React.useEffect(() => {
    if (!engaged || !showPreviewCard) {
      setPreviewCardReady(false);
      return;
    }

    const resolvedDelay = Number.isFinite(previewDelayMs) ? Math.max(0, previewDelayMs) : 0;
    if (resolvedDelay === 0) {
      setPreviewCardReady(true);
      return;
    }

    setPreviewCardReady(false);
    const timer = window.setTimeout(() => setPreviewCardReady(true), resolvedDelay);
    return () => window.clearTimeout(timer);
  }, [activeIndex, engaged, previewDelayMs, showPreviewCard]);

  React.useLayoutEffect(() => {
    if (!showPreviewCard || !previewCardReady) return;
    const card = cardRef.current;
    if (!card) return;

    const measure = () => {
      setCardHeight(card.offsetHeight);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => observer.disconnect();
  }, [activeIndex, previewCardReady, renderPreview, showPreviewCard]);

  React.useEffect(() => {
    if (!engaged || !showPreviewCard) return;
    const container = containerRef.current;
    if (!container) return;

    const view = container.ownerDocument.defaultView;
    const updatePlacement = () => {
      const rect = container.getBoundingClientRect();
      const viewportWidth = view?.innerWidth ?? 0;
      const rightSpace = viewportWidth - rect.right - resolvedPreviewCardGap - 8;
      const leftSpace = rect.left - resolvedPreviewCardGap - 8;
      let openRight = side === "right";

      if (openRight && rightSpace < CARD_MAX_WIDTH && leftSpace > rightSpace) {
        openRight = false;
      } else if (!openRight && leftSpace < CARD_MAX_WIDTH && rightSpace > leftSpace) {
        openRight = true;
      }

      const availableSpace = openRight ? rightSpace : leftSpace;
      setCardMaxWidth(clamp(availableSpace, 96, CARD_MAX_WIDTH));
      setFlipped(openRight !== (side === "right"));
    };

    updatePlacement();
    view?.addEventListener("resize", updatePlacement);
    const observer = new ResizeObserver(updatePlacement);
    observer.observe(container);
    return () => {
      view?.removeEventListener("resize", updatePlacement);
      observer.disconnect();
    };
  }, [activeIndex, engaged, resolvedPreviewCardGap, showPreviewCard, side]);

  React.useEffect(() => {
    if (lastIndex < 0) {
      activeRef.current = 0;
      setActiveIndex(0);
      setEngaged(false);
      return;
    }
    if (activeRef.current > lastIndex) {
      activeRef.current = lastIndex;
      setActiveIndex(lastIndex);
    }
  }, [lastIndex]);

  const resolvedSide = side === "right" ? (flipped ? "left" : "right") : flipped ? "right" : "left";
  const totalHeight = chapters.length * resolvedRowHeight;

  const cardTop = useTransform(pointer, (position) => {
    const halfHeight = cardHeight / 2;
    const center = clamp(
      (position + 0.5) * resolvedRowHeight,
      halfHeight,
      Math.max(halfHeight, totalHeight - halfHeight),
    );
    return center - halfHeight;
  });
  const cardScale = useTransform(strength, [0, 1], [0.97, 1]);
  const cardX = useTransform(strength, [0, 1], [resolvedSide === "right" ? -6 : 6, 0]);

  function engageAt(pointerRow: number, activeAt: number) {
    if (lastIndex < 0) return;
    updatePointer(pointerRow);
    updateStrength(1);
    commitActive(clamp(activeAt, 0, lastIndex));
    setEngaged(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const list = listRef.current;
    if (!list) return;

    const rect = list.getBoundingClientRect();
    const row = (event.clientY - rect.top) / resolvedRowHeight - 0.5;
    hoveringRef.current = true;
    engageAt(clamp(row, -0.5, lastIndex + 0.5), Math.round(row));
  }

  function handlePointerLeave() {
    hoveringRef.current = false;
    if (focusedRef.current !== null) {
      updatePointer(focusedRef.current);
      return;
    }
    updateStrength(0);
    setEngaged(false);
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    hoveringRef.current = false;
    focusedRef.current = null;
    lastPointerTypeRef.current = null;
    touchPreviewRef.current = null;
    updateStrength(0);
    setEngaged(false);
    if (event.target instanceof HTMLElement) event.target.blur();
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    focusedRef.current = null;
    lastPointerTypeRef.current = null;
    touchPreviewRef.current = null;
    if (!hoveringRef.current) {
      updateStrength(0);
      setEngaged(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    let nextIndex = focusedRef.current ?? activeRef.current;

    switch (event.key) {
      case "Enter":
      case " ": {
        const chapter = chapters[nextIndex];
        if (!chapter) return;
        event.preventDefault();
        lastPointerTypeRef.current = null;
        touchPreviewRef.current = null;
        onSelect(chapter, nextIndex);
        return;
      }
      case "Escape":
        event.preventDefault();
        focusedRef.current = null;
        touchPreviewRef.current = null;
        updateStrength(0);
        setEngaged(false);
        if (event.target instanceof HTMLElement) event.target.blur();
        return;
      case "ArrowDown":
      case "ArrowRight":
        nextIndex = Math.min(lastIndex, nextIndex + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        nextIndex = Math.max(0, nextIndex - 1);
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = lastIndex;
        break;
      default:
        return;
    }

    event.preventDefault();
    buttonsRef.current[nextIndex]?.focus();
  }

  if (chapters.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)} data-slot="chapter-scrubber-empty" role="status">
        No chapters available.
      </div>
    );
  }

  return (
    <div
      className={cn("relative", className)}
      data-slot="chapter-scrubber"
      data-preview-escape-boundary={engaged ? "" : undefined}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      ref={containerRef}
      style={{ width: resolvedPeakLength }}
    >
      <div
        aria-activedescendant={engaged && chapters[activeIndex] ? optionId(activeIndex) : undefined}
        aria-label={label}
        aria-orientation="vertical"
        className="flex w-full flex-col"
        onPointerMove={handlePointerMove}
        ref={listRef}
        role="listbox"
      >
        {chapters.map((chapter, index) => {
          const current = currentIndex !== undefined && index === normalizedCurrentIndex;
          const description = typeof chapter.description === "string" ? `. ${chapter.description}` : "";

          return (
            <button
              aria-label={`${chapter.title}${description}`}
              aria-selected={current}
              className={cn(
                "flex w-full items-center rounded-sm outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                resolvedSide === "left" ? "justify-end" : "justify-start",
              )}
              id={optionId(index)}
              key={chapter.id}
              onClick={() => {
                if (showPreviewCard && lastPointerTypeRef.current === "touch" && touchPreviewRef.current !== index) {
                  touchPreviewRef.current = index;
                  engageAt(index, index);
                  return;
                }
                lastPointerTypeRef.current = null;
                touchPreviewRef.current = null;
                onSelect(chapter, index);
              }}
              onFocus={() => {
                focusedRef.current = index;
                engageAt(index, index);
              }}
              onPointerDown={(event) => {
                lastPointerTypeRef.current = event.pointerType;
                if (event.pointerType === "touch") engageAt(index, index);
              }}
              ref={(element) => {
                buttonsRef.current[index] = element;
              }}
              role="option"
              style={{ height: resolvedRowHeight }}
              tabIndex={index === rovingIndex ? 0 : -1}
              type="button"
            >
              <ChapterTick
                active={engaged && index === activeIndex}
                current={current}
                hoverLengthMultiplier={resolvedHoverLengthMultiplier}
                initialLength={resolvedRestLength}
                index={index}
                pointer={pointer}
                radius={resolvedRadius}
                restLength={resolvedRestLength}
                strength={strength}
              />
            </button>
          );
        })}
      </div>

      {showPreviewCard && previewCardReady && chapters[activeIndex] ? (
        <motion.button
          aria-label={`Go to ${chapters[activeIndex].title}`}
          className={cn(
            "absolute z-10 cursor-pointer rounded-xl border border-border bg-popover px-4 py-3.5 text-left text-popover-foreground shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            resolvedSide === "right" ? "origin-left" : "origin-right",
            previewCardClassName,
          )}
          onClick={() => {
            lastPointerTypeRef.current = null;
            touchPreviewRef.current = null;
            onSelect(chapters[activeIndex], activeIndex);
          }}
          onFocus={() => {
            focusedRef.current = activeIndex;
            engageAt(activeIndex, activeIndex);
          }}
          ref={cardRef}
          type="button"
          style={{
            opacity: strength,
            scale: cardScale,
            top: cardTop,
            width: resolvedPreviewCardWidth,
            x: cardX,
            ...(resolvedSide === "right"
              ? { left: resolvedPeakLength + resolvedPreviewCardGap }
              : { right: resolvedPeakLength + resolvedPreviewCardGap }),
          }}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0"
            style={{
              width: resolvedPreviewCardGap + 1,
              [resolvedSide === "right" ? "right" : "left"]: "100%",
            }}
          />
          {renderPreview ? (
            renderPreview(chapters[activeIndex], activeIndex)
          ) : (
            <>
              {chapters[activeIndex].meta ? (
                <div className="mb-1 font-caption text-xs font-semibold tabular-nums text-muted-foreground">
                  {chapters[activeIndex].meta}
                </div>
              ) : null}
              <div className="break-words font-heading text-sm leading-snug font-semibold tracking-[-0.01em]">
                {chapters[activeIndex].title}
              </div>
              {chapters[activeIndex].description ? (
                <div className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {chapters[activeIndex].description}
                </div>
              ) : null}
            </>
          )}
        </motion.button>
      ) : null}
    </div>
  );
}
