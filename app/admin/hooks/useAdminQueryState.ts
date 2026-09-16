"use client";

import { useSearchParams } from "next/navigation";

export function updateAdminQuery(updates: Record<string, string | null>, replace = false) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  if (url.href === window.location.href) return;
  window.history[replace ? "replaceState" : "pushState"](null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function useAdminQueryState<T extends string>(key: string, defaultValue: T, allowedValues?: readonly T[]) {
  const searchParams = useSearchParams();
  const rawValue = searchParams.get(key);
  const value =
    rawValue !== null && (!allowedValues || allowedValues.includes(rawValue as T)) ? (rawValue as T) : defaultValue;

  function setValue(nextValue: T, replace = false) {
    updateAdminQuery({ [key]: nextValue === defaultValue ? null : nextValue }, replace);
  }

  return [value, setValue] as const;
}
