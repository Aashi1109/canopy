"use client";

import { useRef, useState } from "react";
import { readBlogAction } from "../actions";

export interface TaxonomyOptions {
  items: { id: string; name: string }[];
  nextCursor: string | null;
}

export function useBlogTaxonomyOptions(
  kind: "category" | "tag",
  initial: TaxonomyOptions,
  selected: { id: string; label: string }[] = [],
) {
  const [items, setItems] = useState(() => [
    ...new Map(
      [...selected.map(({ id, label }) => ({ id, name: label })), ...initial.items].map((item) => [item.id, item]),
    ).values(),
  ]);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function loadMore() {
    if (!cursor || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError("");
    try {
      const result = await readBlogAction({ operation: "taxonomy", kind, filters: { cursor } });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (!("items" in result.data) || !("nextCursor" in result.data)) throw new Error("Unexpected taxonomy response");
      const terms = result.data.items.map((item) => {
        if (!("name" in item)) throw new Error("Unexpected taxonomy item");
        return { id: item.id, name: item.name };
      });
      setItems((previous) => [...new Map([...previous, ...terms].map((item) => [item.id, item])).values()]);
      setCursor(result.data.nextCursor);
    } catch {
      setError("Couldn’t load more topics. Try again.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }
  return { items, hasMore: !!cursor, loading, error, loadMore };
}
