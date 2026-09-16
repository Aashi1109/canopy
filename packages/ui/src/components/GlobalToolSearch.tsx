"use client";
import { Muted, Small, Strong } from "#components/typography";

import { LoaderCircle, Search, SearchX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type SearchResult = {
  category: string;
  description: string;
  href: string;
  icon: { kind: "svg"; svg: string } | { kind: "url"; url: string };
  name: string;
  toolId: string;
};

type SearchState = "idle" | "loading" | "ready" | "error";

export function GlobalToolSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    function closeWhenOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    document.addEventListener("pointerdown", closeWhenOutside);
    return () => document.removeEventListener("pointerdown", closeWhenOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setDebouncedQuery("");
      return;
    }

    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [isOpen, query]);

  useEffect(() => {
    const normalizedQuery = debouncedQuery.trim();
    if (!isOpen || !normalizedQuery) {
      setResults([]);
      setState("idle");
      return;
    }

    const controller = new AbortController();
    setState("loading");
    fetch(`/api/tools/search?q=${encodeURIComponent(normalizedQuery)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Search request failed");
        return response.json() as Promise<{ results: SearchResult[] }>;
      })
      .then(({ results: nextResults }) => {
        setResults(nextResults);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults([]);
        setState("error");
      });

    return () => controller.abort();
  }, [debouncedQuery, isOpen]);

  function close() {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    setState("idle");
  }

  return (
    <div className="relative hidden xl:block" ref={rootRef}>
      {isOpen ? (
        <div
          aria-controls="global-tool-search-results"
          aria-expanded="true"
          className="flex h-[46px] w-[250px] items-center gap-2 rounded-full border border-primary bg-card px-3 text-[13px] shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_12%,transparent)]"
          role="combobox"
        >
          {state === "loading" ? (
            <LoaderCircle aria-hidden="true" className="size-[17px] animate-spin text-primary" />
          ) : (
            <Search aria-hidden="true" className="size-[17px] text-muted-foreground" />
          )}
          <input
            aria-autocomplete="list"
            aria-label="Search all SmartTools"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") close();
            }}
            placeholder="Search 150+ tools"
            ref={inputRef}
            value={query}
          />
          {query ? (
            <button
              aria-label="Clear search"
              className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setQuery("")}
              type="button"
            >
              <X aria-hidden="true" className="size-[15px]" />
            </button>
          ) : (
            <kbd className="grid size-6 place-items-center rounded border border-border bg-muted font-caption text-[11px] font-semibold">
              /
            </kbd>
          )}
        </div>
      ) : (
        <button
          aria-expanded="false"
          aria-haspopup="listbox"
          className="flex h-[46px] w-[250px] items-center gap-2 rounded-full border border-border bg-muted px-3 text-[13px] text-muted-foreground outline-none hover:border-input focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          <Search aria-hidden="true" className="size-[17px]" />
          <span>Search 150+ tools</span>
          <kbd className="ml-auto grid size-6 place-items-center rounded border border-border bg-card font-caption text-[11px] font-semibold">
            /
          </kbd>
        </button>
      )}

      {isOpen && query.trim() ? (
        <div
          className="absolute top-[56px] left-0 z-50 w-[360px] overflow-hidden rounded-lg border border-border bg-card shadow-[0_12px_32px_rgb(17_18_20_/_12%)]"
          id="global-tool-search-results"
          role="listbox"
        >
          {state === "loading" && results.length === 0 ? (
            <div className="space-y-0">
              <SearchSkeleton />
              <SearchSkeleton />
              <SearchSkeleton />
            </div>
          ) : null}
          {state === "error" ? <SearchMessage title="Search is temporarily unavailable" /> : null}
          {state === "ready" && results.length === 0 ? (
            <SearchMessage
              icon={<SearchX aria-hidden="true" className="size-6" />}
              title={`No tools match “${debouncedQuery.trim()}”`}
            />
          ) : null}
          {results.length > 0 ? (
            <>
              <Muted className="border-b border-border px-3 py-2 text-muted-foreground">
                {results.length} {results.length === 1 ? "result" : "results"} for “{debouncedQuery.trim()}”
              </Muted>
              {results.map((result) => (
                <a
                  className="flex min-h-[58px] items-center gap-2.5 border-b border-border px-3 py-2 no-underline outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  href={result.href}
                  key={result.toolId}
                >
                  <ToolIcon icon={result.icon} />
                  <span className="min-w-0">
                    <Strong className="block truncate text-foreground">{result.name}</Strong>
                    <Small className="block truncate text-muted-foreground">{result.category}</Small>
                  </span>
                </a>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ToolIcon({ icon }: { icon: SearchResult["icon"] }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-accent text-primary"
    >
      {icon.kind === "url" ? (
        <img alt="" className="size-full object-cover" crossOrigin="anonymous" src={icon.url} />
      ) : (
        <span className="size-full" dangerouslySetInnerHTML={{ __html: icon.svg }} />
      )}
    </span>
  );
}

function SearchMessage({ icon, title }: { icon?: ReactNode; title: string }) {
  return (
    <div className="flex min-h-[178px] flex-col items-center justify-center gap-2 px-6 text-center text-[11px] text-muted-foreground">
      {icon ?? <SearchX aria-hidden="true" className="size-6" />}
      <Strong className="text-foreground">{title}</Strong>
      <span>Check spelling or try another search.</span>
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="grid min-h-[58px] grid-cols-[32px_1fr] items-center gap-2.5 border-b border-border px-3 py-2">
      <span className="size-8 animate-pulse rounded-md bg-border" />
      <span className="h-2 w-2/3 animate-pulse rounded bg-border" />
    </div>
  );
}
