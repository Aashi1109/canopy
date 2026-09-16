"use client";

import { Button, Field, Input, Select } from "@smarttools/ui";
import { RotateCcw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";

export function AdminFilters({
  search,
  selects,
}: {
  search: { key: string; label: string; placeholder: string };
  selects: readonly {
    key: string;
    label: string;
    defaultValue?: string;
    options: readonly { value: string; label: string }[];
  }[];
}) {
  const defaults = Object.fromEntries([
    [search.key, ""],
    ...selects.map((select) => [select.key, select.defaultValue ?? "all"]),
  ]);
  const formRef = useRef<HTMLFormElement>(null);
  const focusRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const [hasDraftQuery, setHasDraftQuery] = useState(false);

  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = Object.fromEntries([
    [search.key, searchParams.get(search.key) ?? ""],
    ...selects.map((select) => {
      const value = searchParams.get(select.key);
      return [select.key, select.options.find((option) => option.value === value)?.value ?? defaults[select.key]];
    }),
  ]);
  const hasFilters =
    hasDraftQuery || Object.keys(defaults).some((key) => filters[key] !== defaults[key] || searchParams.has(key));
  const setFormRef = useCallback((form: HTMLFormElement | null) => {
    formRef.current = form;
    if (!form) clearTimeout(timerRef.current);
    else setHasDraftQuery(false);
    if (form && focusRef.current) {
      form.querySelector<HTMLElement>(`#${CSS.escape(focusRef.current)}`)?.focus();
      focusRef.current = null;
    }
  }, []);

  function applyFilters(overrides: Partial<typeof filters> = {}, replace = false) {
    clearTimeout(timerRef.current);
    if (!formRef.current) return;
    const values = new FormData(formRef.current);
    const next = new URLSearchParams(searchParams.toString());
    for (const key of Object.keys(defaults)) {
      const value = overrides[key] ?? String(values.get(key) ?? "");
      if (!value || value === defaults[key]) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    if (query === searchParams.toString()) return;
    focusRef.current = formRef.current.contains(document.activeElement) ? document.activeElement?.id || null : null;
    startTransition(() =>
      router[replace ? "replace" : "push"](`${pathname}${query ? `?${query}` : ""}${window.location.hash}`, {
        scroll: false,
      }),
    );
  }

  return (
    <form
      aria-busy={isPending}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4"
      method="get"
      key={searchParams.toString()}
      onSubmit={(event) => {
        event.preventDefault();
        applyFilters();
      }}
      ref={setFormRef}
    >
      <Field className="min-w-0 flex-[2_1_16rem]" htmlFor={`admin-filter-${search.key}`} label={search.label}>
        <Input
          defaultValue={filters[search.key]}
          disabled={isPending}
          id={`admin-filter-${search.key}`}
          name={search.key}
          onChange={(event) => {
            setHasDraftQuery(event.currentTarget.value !== filters[search.key]);
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => applyFilters({}, true), 300);
          }}
          placeholder={search.placeholder}
          type="search"
        />
      </Field>
      {selects.map((select) => (
        <Field
          className="min-w-0 flex-[1_1_10rem]"
          htmlFor={`admin-filter-${select.key}`}
          key={select.key}
          label={select.label}
        >
          <Select
            defaultValue={filters[select.key]}
            disabled={isPending}
            id={`admin-filter-${select.key}`}
            name={select.key}
            onChange={(event) => applyFilters({ [select.key]: event.target.value })}
          >
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      ))}
      <Button
        className="justify-self-start rounded-lg"
        disabled={isPending || !hasFilters}
        loading={isPending}
        onClick={() => {
          applyFilters(defaults);
          const input = formRef.current?.elements.namedItem(search.key);
          if (input instanceof HTMLInputElement) {
            input.value = "";
            input.focus();
            focusRef.current = input.id;
          }
          setHasDraftQuery(false);
        }}
        type="button"
        variant="secondary"
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        Reset
      </Button>
    </form>
  );
}
