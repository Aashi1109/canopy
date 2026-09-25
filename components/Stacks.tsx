"use client";

import {
  Button,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  usePanelRef,
} from "@/components/ui/index.tsx";
import { cn } from "@/components/ui/lib/utils.ts";
import { SegmentedControl } from "@/components/ui/index.tsx";
import {
  useWorkbenchPaneView,
  useWorkbenchPresentation,
  type WorkbenchView,
} from "@/components/ui/components/workbench-presentation";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, SlidersHorizontal } from "lucide";
import { MorphIcon } from "morphicons/react";
import { Children, type HTMLAttributes, type ReactNode, useEffect, useId, useRef, useState } from "react";

type StackDirection = "row" | "column";
type StackGap = "none" | "xs" | "sm" | "md" | "lg";
type StackAlignment = "start" | "center" | "end" | "stretch";
type StackJustification = "start" | "center" | "end" | "between" | "around";

export type StackProps = HTMLAttributes<HTMLDivElement> & {
  align?: StackAlignment;
  direction?: StackDirection;
  gap?: StackGap;
  justify?: StackJustification;
  responsiveDirection?: StackDirection;
  wrap?: boolean;
};

const STACK_DIRECTION_CLASSES: Record<StackDirection, string> = {
  column: "flex-col",
  row: "flex-row",
};

const STACK_RESPONSIVE_DIRECTION_CLASSES: Record<StackDirection, string> = {
  column: "max-[64rem]:flex-col",
  row: "max-[64rem]:flex-row",
};

const STACK_GAP_CLASSES: Record<StackGap, string> = {
  lg: "gap-6",
  md: "gap-4",
  none: "gap-0",
  sm: "gap-2",
  xs: "gap-1",
};

const STACK_ALIGNMENT_CLASSES: Record<StackAlignment, string> = {
  center: "items-center",
  end: "items-end",
  start: "items-start",
  stretch: "items-stretch",
};

const STACK_JUSTIFICATION_CLASSES: Record<StackJustification, string> = {
  around: "justify-around",
  between: "justify-between",
  center: "justify-center",
  end: "justify-end",
  start: "justify-start",
};

function Stack({
  align = "stretch",
  className,
  direction = "column",
  gap = "none",
  justify = "start",
  responsiveDirection,
  wrap = false,
  ...props
}: StackProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0",
        STACK_DIRECTION_CLASSES[direction],
        STACK_GAP_CLASSES[gap],
        STACK_ALIGNMENT_CLASSES[align],
        STACK_JUSTIFICATION_CLASSES[justify],
        responsiveDirection ? STACK_RESPONSIVE_DIRECTION_CLASSES[responsiveDirection] : undefined,
        wrap ? "flex-wrap" : undefined,
        className,
      )}
      data-direction={direction}
      data-stack="flow"
      {...props}
    />
  );
}

type SplitOrientation = "horizontal" | "vertical";
type SplitCollapseSide = "primary" | "secondary";

export type SplitStackProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "onChange"> & {
  children: ReactNode;
  collapsedIcon?: typeof SlidersHorizontal;
  collapseLabel?: string;
  collapseControlPosition?: "bottom" | "center" | "top";
  collapseSide?: SplitCollapseSide;
  collapsible?: boolean;
  defaultCollapsed?: SplitCollapseSide;
  defaultSize?: number;
  maxSize?: number;
  minSize?: number;
  onSizeChange?: (size: number) => void;
  orientation?: SplitOrientation;
  resizable?: boolean;
  /** Opt in only for the tool's actual input/preview pair, never its settings split. */
  presentation?: boolean;
  /** Hides the secondary pane until content is available, preserving the primary workspace. */
  secondaryHidden?: boolean;
  storageKey?: string;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function useNarrowWorkbench() {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 64rem)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return narrow;
}

function SplitStack({
  children,
  className,
  collapsedIcon,
  collapseLabel,
  collapseControlPosition = "center",
  collapseSide = "primary",
  collapsible = false,
  defaultCollapsed,
  defaultSize = 40,
  maxSize = 80,
  minSize = 20,
  onSizeChange,
  orientation = "horizontal",
  resizable = true,
  presentation = false,
  secondaryHidden,
  storageKey,
  style,
  ...props
}: SplitStackProps) {
  const panes = Children.toArray(children);
  const presentationContext = useWorkbenchPresentation();
  const focusView = useWorkbenchPaneView(presentation);
  const [mobileView, setMobileView] = useState<WorkbenchView>("input");
  const splitId = useId();
  const primaryPaneId = `${splitId}-primary`;
  const secondaryPaneId = `${splitId}-secondary`;
  const primaryPanelRef = usePanelRef();
  const secondaryPanelRef = usePanelRef();
  const [size, setSize] = useState(() => clamp(defaultSize, minSize, maxSize));
  const [collapsed, setCollapsed] = useState<SplitCollapseSide | null>(
    secondaryHidden ? "secondary" : collapsible ? (defaultCollapsed ?? null) : null,
  );
  // Changing defaultSize re-registers the panels and interrupts an active drag.
  const initialPrimarySize = useRef(collapsed === "secondary" ? 100 : collapsed === "primary" ? 0 : size);
  const [animateCollapse, setAnimateCollapse] = useState(false);
  const narrow = useNarrowWorkbench();
  const stacked = (orientation === "horizontal" || presentation) && narrow;
  const view = presentation && narrow && !presentationContext?.focused ? mobileView : focusView;
  const inputHidden = presentation && view === "preview";
  const previewHidden = presentation && view === "input";

  useEffect(() => {
    if (!presentation || stacked) return;
    setAnimateCollapse(true);
    const frame = requestAnimationFrame(() => {
      if (view === "input") {
        primaryPanelRef.current?.resize("100%");
      } else if (view === "preview") {
        secondaryPanelRef.current?.resize("100%");
      } else {
        primaryPanelRef.current?.resize(`${size}%`);
        secondaryPanelRef.current?.resize(`${100 - size}%`);
      }
    });
    return () => cancelAnimationFrame(frame);
    // Only view changes resize the panes; dragging must not feed back into this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentation, stacked, view, primaryPanelRef, secondaryPanelRef]);

  useEffect(() => {
    if (!stacked) return;
    // The desktop panels unmount while stacked; restore their last state on remount.
    initialPrimarySize.current = collapsed === "secondary" ? 100 : collapsed === "primary" ? 0 : size;
  }, [collapsed, size, stacked]);

  useEffect(() => {
    if (secondaryHidden === undefined) return;
    setAnimateCollapse(true);
    setCollapsed(secondaryHidden ? "secondary" : null);
    if (!stacked) {
      if (secondaryHidden) secondaryPanelRef.current?.collapse();
      else secondaryPanelRef.current?.resize(`${100 - size}%`);
    }
    // Keep user-resized proportions; only availability or orientation changes move the pane.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondaryHidden, stacked, secondaryPanelRef]);

  useEffect(() => {
    if (!storageKey || stacked) return;
    try {
      const storedValue = window.localStorage.getItem(storageKey);
      if (storedValue === null) return;
      const storedSize = Number(storedValue);
      if (!Number.isFinite(storedSize)) return;
      const normalized = clamp(storedSize, minSize, maxSize);
      primaryPanelRef.current?.resize(`${normalized}%`);
      setSize(normalized);
    } catch {
      // Ignore unavailable or blocked storage.
    }
  }, [maxSize, minSize, primaryPanelRef, stacked, storageKey]);

  function toggleCollapsedPane() {
    if (!collapsible) return;
    if (stacked) {
      setCollapsed((current) => (current ? null : collapseSide));
      return;
    }
    const panel = collapseSide === "primary" ? primaryPanelRef : secondaryPanelRef;
    setAnimateCollapse(true);
    if (panel.current?.isCollapsed()) {
      panel.current.resize(`${collapseSide === "primary" ? size : 100 - size}%`);
      setCollapsed(null);
    } else {
      panel.current?.collapse();
      setCollapsed(collapseSide);
    }
  }

  const collapsedPanelLabel = `${collapsed ? "Restore" : "Collapse"} ${collapseLabel ?? `${collapseSide} panel`}`;
  const collapseIcon =
    collapsed && (collapsedIcon || collapseControlPosition !== "center")
      ? (collapsedIcon ?? SlidersHorizontal)
      : orientation === "horizontal"
        ? collapseSide === "primary"
          ? collapsed
            ? ChevronRight
            : ChevronLeft
          : collapsed
            ? ChevronLeft
            : ChevronRight
        : collapseSide === "primary"
          ? collapsed
            ? ChevronDown
            : ChevronUp
          : collapsed
            ? ChevronUp
            : ChevronDown;

  if (stacked) {
    return (
      <div
        className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-auto", className)}
        data-collapsed={collapsed ?? undefined}
        data-orientation={orientation}
        data-stack="split"
        style={style}
        {...props}
      >
        {presentation && !presentationContext?.focused ? (
          <SegmentedControl
            className="shrink-0 items-center border-b border-border p-2"
            items={[
              { label: "Input", value: "input" },
              { label: "Preview", value: "preview" },
            ]}
            onValueChange={(next) => setMobileView(next as WorkbenchView)}
            value={mobileView}
          />
        ) : null}
        {collapsible ? (
          <div className="flex shrink-0 justify-end border-b border-border p-2">
            <Button
              aria-controls={collapseSide === "primary" ? primaryPaneId : secondaryPaneId}
              aria-expanded={collapsed !== collapseSide}
              onClick={toggleCollapsedPane}
              size="xs"
              type="button"
              variant="outline"
            >
              <MorphIcon
                icon={collapsed ? (collapsedIcon ?? SlidersHorizontal) : SlidersHorizontal}
                reducedMotion="user"
              />
              {collapsedPanelLabel}
            </Button>
          </div>
        ) : null}
        <div
          className={cn(
            "min-w-0 shrink-0 overflow-visible",
            inputHidden || collapsed === "primary"
              ? "hidden"
              : previewHidden || collapsed === "secondary"
                ? "min-h-0 flex-1 [&>*]:h-full"
                : undefined,
          )}
          inert={inputHidden || undefined}
          data-split-pane="primary"
          id={primaryPaneId}
        >
          {panes[0]}
        </div>
        <div
          className={cn(
            "min-w-0 shrink-0 overflow-visible",
            previewHidden || collapsed === "secondary"
              ? "hidden"
              : inputHidden || collapsed === "primary"
                ? "min-h-0 flex-1 [&>*]:h-full"
                : undefined,
          )}
          inert={previewHidden || undefined}
          data-split-pane="secondary"
          id={secondaryPaneId}
        >
          {panes[1]}
        </div>
      </div>
    );
  }

  const collapseControlStyle =
    orientation === "horizontal"
      ? collapseControlPosition === "bottom"
        ? {
            left: "calc(100% - 1rem)",
            top: "calc(100% - 1rem)",
          }
        : {
            left: collapsed === "primary" ? "1rem" : collapsed === "secondary" ? "calc(100% - 1rem)" : `${size}%`,
            top: collapseControlPosition === "top" ? "4rem" : "50%",
          }
      : {
          left: "50%",
          top: collapsed === "primary" ? "1rem" : collapsed === "secondary" ? "calc(100% - 1rem)" : `${size}%`,
        };

  return (
    <div
      className={cn("relative h-full min-h-0 min-w-0 overflow-hidden", className)}
      data-collapsed={collapsed ?? undefined}
      data-orientation={orientation}
      data-stack="split"
      style={style}
      {...props}
    >
      <ResizablePanelGroup
        className={cn(
          "h-full min-h-0 min-w-0",
          animateCollapse &&
            "motion-safe:[&>[data-panel]]:transition-[flex-grow] motion-safe:[&>[data-panel]]:duration-[320ms] motion-safe:[&>[data-panel]]:ease-[cubic-bezier(0.4,0,0.2,1)]",
          orientation === "horizontal"
            ? "max-[64rem]:!flex-col max-[64rem]:overflow-y-auto max-[64rem]:[&>[data-slot=resizable-handle]]:!hidden"
            : undefined,
        )}
        defaultLayout={{
          [primaryPaneId]: initialPrimarySize.current,
          [secondaryPaneId]: 100 - initialPrimarySize.current,
        }}
        disabled={!resizable}
        id={storageKey ?? splitId}
        onPointerDownCapture={() => setAnimateCollapse(false)}
        onKeyDownCapture={() => setAnimateCollapse(false)}
        onLayoutChange={(layout) => {
          if (presentation && view !== "split") return;
          const nextSize = layout[primaryPaneId];
          if (!Number.isFinite(nextSize)) return;
          if (nextSize > 0 && nextSize < 100) setSize(nextSize);
          if (collapsible) {
            setCollapsed(
              layout[collapseSide === "primary" ? primaryPaneId : secondaryPaneId] === 0 ? collapseSide : null,
            );
          }
        }}
        onLayoutChanged={(layout, meta) => {
          const nextSize = layout[primaryPaneId];
          if (!Number.isFinite(nextSize) || nextSize <= 0 || nextSize >= 100) {
            return;
          }
          if (!meta.isUserInteraction) return;
          onSizeChange?.(nextSize);
          if (!storageKey) return;
          try {
            window.localStorage.setItem(storageKey, String(nextSize));
          } catch {
            // Persistence is optional; the shadcn resize interaction still works.
          }
        }}
        orientation={orientation}
        resizeTargetMinimumSize={{ coarse: 44, fine: 24 }}
      >
        <ResizablePanel
          aria-hidden={inputHidden || collapsed === "primary" || undefined}
          className="min-h-0 min-w-0 overflow-hidden"
          collapsible={presentation || (collapsible && collapseSide === "primary")}
          collapsedSize="0%"
          data-split-pane="primary"
          defaultSize={`${initialPrimarySize.current}%`}
          disabled={!resizable}
          id={primaryPaneId}
          inert={inputHidden || collapsed === "primary" || undefined}
          maxSize={
            presentation || secondaryHidden !== undefined || (collapsible && collapseSide === "secondary")
              ? "100%"
              : `${maxSize}%`
          }
          minSize={`${minSize}%`}
          panelRef={primaryPanelRef}
        >
          {panes[0]}
        </ResizablePanel>
        <ResizableHandle
          aria-label={orientation === "horizontal" ? "Resize workspace panels" : "Resize workspace regions"}
          className={cn("z-20", (secondaryHidden || inputHidden || previewHidden) && "hidden")}
          disabled={!resizable || secondaryHidden || inputHidden || previewHidden}
          withHandle={resizable && !collapsed && (!collapsible || collapseControlPosition !== "center")}
        />
        <ResizablePanel
          aria-hidden={previewHidden || collapsed === "secondary" || undefined}
          className="min-h-0 min-w-0 overflow-hidden"
          collapsible={presentation || secondaryHidden !== undefined || (collapsible && collapseSide === "secondary")}
          collapsedSize="0%"
          data-split-pane="secondary"
          defaultSize={`${100 - initialPrimarySize.current}%`}
          disabled={!resizable}
          id={secondaryPaneId}
          inert={previewHidden || collapsed === "secondary" || undefined}
          maxSize={presentation || (collapsible && collapseSide === "primary") ? "100%" : `${100 - minSize}%`}
          minSize={`${100 - maxSize}%`}
          panelRef={secondaryPanelRef}
        >
          {panes[1]}
        </ResizablePanel>
      </ResizablePanelGroup>
      {collapsible ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-controls={collapseSide === "primary" ? primaryPaneId : secondaryPaneId}
                aria-label={collapsedPanelLabel}
                aria-expanded={collapsed !== collapseSide}
                className={cn(
                  "absolute z-30 !size-8 -translate-x-1/2 -translate-y-1/2 shadow-sm",
                  animateCollapse &&
                    "motion-safe:transition-[left,top,translate] motion-safe:duration-[320ms] motion-safe:ease-[cubic-bezier(0.4,0,0.2,1)]",
                  collapseSide === "secondary" &&
                    orientation === "horizontal" && [
                      "rounded-r-none",
                      !collapsed && collapseControlPosition !== "bottom" && "-translate-x-full",
                    ],
                )}
                onClick={toggleCollapsedPane}
                size="icon-xs"
                style={collapseControlStyle}
                type="button"
                variant={collapsed ? "default" : "outline"}
              >
                <MorphIcon icon={collapseIcon} reducedMotion="user" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{collapsedPanelLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </div>
  );
}

export type GridStackProps = HTMLAttributes<HTMLDivElement> & {
  columns?: number;
  gap?: StackGap;
  minItemWidth?: string;
};

function GridStack({ className, columns, gap = "md", minItemWidth = "14rem", style, ...props }: GridStackProps) {
  return (
    <div
      className={cn("grid min-h-0 min-w-0", STACK_GAP_CLASSES[gap], className)}
      data-stack="grid"
      style={{
        ...style,
        gridTemplateColumns: columns
          ? `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`
          : `repeat(auto-fit, minmax(min(100%, ${minItemWidth}), 1fr))`,
      }}
      {...props}
    />
  );
}

export type OverlayStackProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  base: ReactNode;
  baseClassName?: string;
  overlay?: ReactNode;
  overlayClassName?: string;
  overlayPointerEvents?: "auto" | "none";
};

function OverlayStack({
  base,
  baseClassName,
  className,
  overlay,
  overlayClassName,
  overlayPointerEvents = "auto",
  ...props
}: OverlayStackProps) {
  return (
    <div className={cn("relative min-h-0 min-w-0 overflow-hidden", className)} data-stack="overlay" {...props}>
      <div className={cn("min-h-0 min-w-0", baseClassName)}>{base}</div>
      {overlay ? (
        <div
          className={cn(
            "absolute inset-0",
            overlayPointerEvents === "none" ? "pointer-events-none" : "pointer-events-auto",
            overlayClassName,
          )}
          data-overlay-layer="controls"
        >
          {overlay}
        </div>
      ) : null}
    </div>
  );
}

export type ScrollRegionProps = HTMLAttributes<HTMLDivElement> & {
  accessibleName?: string;
};

function ScrollRegion({ accessibleName, children, className, tabIndex, ...props }: ScrollRegionProps) {
  return (
    <ScrollArea
      className={cn("min-h-0 min-w-0", className)}
      data-stack="scroll-region"
      viewportClassName="overscroll-contain"
      viewportProps={{
        ...props,
        "aria-label": accessibleName,
        role: accessibleName ? "region" : undefined,
        tabIndex: tabIndex ?? (accessibleName ? 0 : undefined),
      }}
    >
      {children}
    </ScrollArea>
  );
}

export { GridStack, OverlayStack, ScrollRegion, SplitStack, Stack };
