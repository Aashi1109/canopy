"use client";

import { Slot } from "radix-ui";
import { useCallback, useLayoutEffect, useState, type ComponentPropsWithRef } from "react";

import { cn } from "../lib/utils.ts";
import styles from "./SelectionHighlight.module.css";

export type SelectionHighlightProps = ComponentPropsWithRef<"div"> & {
  activeSelector: string;
  asChild?: boolean;
  disabled?: boolean;
};

const READY_ATTRIBUTE = "data-selection-highlight-ready";
const ANIMATE_ATTRIBUTE = "data-selection-highlight-animate";
const VARIABLES = ["x", "y", "width", "height", "radius"] as const;
const TRANSITION_EVENTS = ["transitionrun", "transitionend", "transitioncancel"] as const;

function useSelectionHighlight(root: HTMLElement | null, activeSelector: string, disabled: boolean) {
  useLayoutEffect(() => {
    if (!root) return;

    let frame = 0;
    let animationFrame = 0;
    let selected: HTMLElement | null = null;
    let positioned = false;
    let disposed = false;
    let ownStyle = root.getAttribute("style");

    function hide() {
      cancelAnimationFrame(animationFrame);
      root!.removeAttribute(READY_ATTRIBUTE);
      root!.removeAttribute(ANIMATE_ATTRIBUTE);
      positioned = false;
    }

    if (disabled) {
      hide();
      return;
    }

    const resizeObserver = new ResizeObserver(schedule);

    function measure() {
      frame = 0;
      if (disposed) return;
      let target: HTMLElement | null;
      try {
        target = root!.querySelector<HTMLElement>(activeSelector);
      } catch {
        hide();
        return;
      }
      const remounted = selected !== null && !root!.contains(selected);
      if (target !== selected) {
        if (selected) resizeObserver.unobserve(selected);
        selected = target;
        if (selected) resizeObserver.observe(selected);
      }
      if (!target || !target.offsetWidth || !target.offsetHeight || !target.getClientRects().length) {
        hide();
        return;
      }

      let x = target.offsetLeft;
      let y = target.offsetTop;
      let parent = target.offsetParent;
      while (parent instanceof HTMLElement && parent !== root) {
        x += parent.offsetLeft + parent.clientLeft;
        y += parent.offsetTop + parent.clientTop;
        parent = parent.offsetParent;
      }
      if (parent !== root || getComputedStyle(target).visibility === "hidden") {
        hide();
        return;
      }
      // Keep the static selection attached while the selected item itself is moving.
      if (
        target
          .getAnimations()
          .some(
            (animation) =>
              animation instanceof CSSTransition &&
              animation.transitionProperty === "transform" &&
              (animation.playState === "running" || animation.pending),
          )
      ) {
        hide();
        return;
      }
      for (let ancestor = target.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
        x -= ancestor.scrollLeft;
        y -= ancestor.scrollTop;
      }

      const snap = !positioned || remounted;
      if (snap) root!.removeAttribute(ANIMATE_ATTRIBUTE);
      const values = [
        `${x}px`,
        `${y}px`,
        `${target.offsetWidth}px`,
        `${target.offsetHeight}px`,
        getComputedStyle(target).borderRadius,
      ];
      VARIABLES.forEach((name, index) => root!.style.setProperty(`--selection-highlight-${name}`, values[index]));
      ownStyle = root!.getAttribute("style");
      root!.setAttribute(READY_ATTRIBUTE, "true");
      positioned = true;

      if (snap) {
        cancelAnimationFrame(animationFrame);
        // Commit the first position before enabling transitions on later selections.
        void getComputedStyle(root!, "::before").transform;
        animationFrame = requestAnimationFrame(() => root!.setAttribute(ANIMATE_ATTRIBUTE, "true"));
      }
    }

    function schedule() {
      if (!disposed && !frame) frame = requestAnimationFrame(measure);
    }

    function handleTransition(event: TransitionEvent) {
      if (disposed || event.target !== selected || event.propertyName !== "transform") return;
      if (event.type === "transitionrun") hide();
      schedule();
    }

    const mutationObserver = new MutationObserver((records) => {
      if (
        records.some(
          ({ target, attributeName }) =>
            target !== root ||
            (attributeName !== READY_ATTRIBUTE &&
              attributeName !== ANIMATE_ATTRIBUTE &&
              (attributeName !== "style" || root!.getAttribute("style") !== ownStyle)),
        )
      ) {
        schedule();
      }
    });

    measure();
    resizeObserver.observe(root);
    mutationObserver.observe(root, { attributes: true, childList: true, characterData: true, subtree: true });
    root.addEventListener("scroll", schedule, true);
    TRANSITION_EVENTS.forEach((event) => root.addEventListener(event, handleTransition, true));
    window.addEventListener("resize", schedule);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      hide();
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      root.removeEventListener("scroll", schedule, true);
      TRANSITION_EVENTS.forEach((event) => root.removeEventListener(event, handleTransition, true));
      window.removeEventListener("resize", schedule);
      VARIABLES.forEach((name) => root.style.removeProperty(`--selection-highlight-${name}`));
    };
  }, [root, activeSelector, disabled]);
}

export function SelectionHighlight({
  activeSelector,
  asChild = false,
  className,
  disabled = false,
  ref,
  ...props
}: SelectionHighlightProps) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      setRoot(node);
      if (typeof ref === "function") {
        const cleanup = ref(node);
        if (cleanup) {
          return () => {
            setRoot(null);
            cleanup();
          };
        }
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );
  useSelectionHighlight(root, activeSelector, disabled);
  const Comp = asChild ? Slot.Root : "div";

  return <Comp {...props} className={cn(styles.root, className)} data-slot="selection-highlight" ref={setRef} />;
}
