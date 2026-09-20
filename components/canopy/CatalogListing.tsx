"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function CatalogListing({
  category,
  query,
  className,
  children,
}: {
  category: string;
  query: string;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if ((!category && !query) || window.location.hash) return;

    // Override the page's smooth scrolling so filtered links land at their results.
    ref.current?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [category, query]);

  return (
    <section className={`scroll-mt-24 ${className}`} id="tool-listing" ref={ref}>
      {children}
    </section>
  );
}
