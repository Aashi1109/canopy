"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { useWorkbenchMotion, useWorkbenchPaneView } from "@/components/ui/components/workbench-presentation";

/** Adds focus-view selection to an existing two-pane grid without replacing its geometry or mounting another editor. */
export function WorkbenchPanes({
  children,
  active = true,
  singlePaneDisplay,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  active?: boolean;
  /** Reveal the selected pane when its normal responsive tabs hide it. */
  singlePaneDisplay?: CSSProperties["display"];
}) {
  const view = useWorkbenchPaneView(active);
  const single = view !== "split";
  const container = useRef<HTMLDivElement>(null);
  useWorkbenchMotion(container, view);
  return (
    <div
      {...props}
      ref={container}
      style={{
        ...style,
        ...(single ? { gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: "minmax(0, 1fr)" } : {}),
      }}
    >
      {Children.map(children, (child, index) => {
        if (!isValidElement<HTMLAttributes<HTMLElement>>(child)) return child;
        const hidden = (view === "input" && index === 1) || (view === "preview" && index === 0);
        return cloneElement(child, {
          "aria-hidden": hidden || undefined,
          inert: hidden || undefined,
          style: {
            ...child.props.style,
            ...(single ? { gridColumn: "1 / -1", gridRow: "1 / -1" } : {}),
            ...(single && !hidden && singlePaneDisplay ? { display: singlePaneDisplay } : {}),
            ...(hidden ? { display: "none" } : {}),
          },
        });
      })}
    </div>
  );
}
