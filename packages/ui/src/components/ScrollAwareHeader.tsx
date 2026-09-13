"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { cn } from "../lib/utils.ts";

export function ScrollAwareHeader({
  className,
  ...props
}: ComponentProps<"header">) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = ref.current;
    if (!header) return;

    function position() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return Math.max(0, Math.min(max, window.scrollY));
    }

    let previous = position();
    let distance = 0;
    let frame = 0;
    let hidden = false;

    // Scroll changes only this DOM attribute, never React state or children.
    function setHidden(next: boolean) {
      if (hidden === next) return;
      hidden = next;
      header!.dataset.scrollHidden = String(next);
    }

    function onFocus() {
      distance = 0;
      setHidden(false);
    }

    function update() {
      frame = 0;
      const current = position();
      const delta = current - previous;
      previous = current;
      if (!delta) return;
      distance = Math.sign(delta) === Math.sign(distance) ? distance + delta : delta;

      const interacting = header!.contains(document.activeElement)
        || header!.querySelector('[aria-expanded="true"]');
      if (current <= header!.offsetHeight || interacting) {
        distance = 0;
        setHidden(false);
      } else if (distance >= 20) {
        setHidden(true);
        distance = 0;
      } else if (distance <= -10) {
        setHidden(false);
        distance = 0;
      }
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    header.addEventListener("focusin", onFocus);
    return () => {
      window.removeEventListener("scroll", onScroll);
      header.removeEventListener("focusin", onFocus);
      cancelAnimationFrame(frame);
      delete header.dataset.scrollHidden;
    };
  }, []);

  return (
    <header
      {...props}
      ref={ref}
      className={cn(
        "sticky top-0 z-50 translate-y-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[scroll-hidden=true]:-translate-y-[calc(100%+1rem)] data-[scroll-hidden=true]:duration-[350ms] data-[scroll-hidden=true]:ease-[cubic-bezier(0.4,0,0.2,1)] data-[scroll-hidden=true]:focus-within:translate-y-0 motion-reduce:transition-none focus-within:transition-none",
        className,
      )}
    />
  );
}
