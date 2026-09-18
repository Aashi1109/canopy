"use client";
import { Muted, Small, Strong } from "./typography.tsx";
import { LoaderCircle, Search, SearchX, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils.ts";

type SearchResult = {
  category: string;
  description: string;
  href: string;
  icon: { kind: "svg"; svg: string } | { kind: "url"; url: string };
  name: string;
  toolId: string;
};
type SearchState = "idle" | "loading" | "ready" | "error";
type MobileSearch = { open: boolean; onOpenChange: (open: boolean) => void; top: number; availableHeight: number };

export function GlobalToolSearch({ mobile }: { mobile?: MobileSearch } = {}) {
  const [desktopOpen, setDesktopOpen] = useState(false);
  const isOpen = mobile ? mobile.open : desktopOpen;
  const setOpen = mobile?.onOpenChange ?? setDesktopOpen;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsId = useId();
  const current = query.trim() === debouncedQuery.trim();
  const loading = !!query.trim() && (!current || state === "loading" || state === "idle");

  useEffect(() => {
    if (isOpen) inputRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function outside(event: PointerEvent) {
      const node = event.target as Node;
      if (!rootRef.current?.contains(node) && !popupRef.current?.contains(node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [isOpen, setOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setDebouncedQuery("");
      setResults([]);
      setState("idle");
      return;
    }
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [isOpen, query]);

  useEffect(() => {
    const normalized = debouncedQuery.trim();
    if (!isOpen || !normalized || query.trim() !== normalized) return;
    const controller = new AbortController();
    setState("loading");
    setResults([]);
    fetch(`/api/tools/search?q=${encodeURIComponent(normalized)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Search request failed");
        return response.json() as Promise<{ results: SearchResult[] }>;
      })
      .then(({ results: next }) => {
        if (!controller.signal.aborted) {
          setResults(next);
          setState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResults([]);
          setState("error");
        }
      });
    return () => controller.abort();
  }, [debouncedQuery, isOpen, retry, query]);

  const field = (
    <div
      className={cn(
        "flex h-[46px] w-[220px] xl:w-[250px] items-center gap-2 rounded-full border border-primary bg-card px-3 text-[13px] shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_12%,transparent)]",
        mobile && "h-12 w-full pr-0.5",
      )}
    >
      {loading ? (
        <LoaderCircle
          aria-hidden="true"
          className="size-[17px] shrink-0 animate-spin text-primary motion-reduce:animate-none"
        />
      ) : (
        <Search aria-hidden="true" className="size-[17px] shrink-0 text-muted-foreground" />
      )}
      <input
        aria-controls={query.trim() ? resultsId : undefined}
        aria-expanded={!!query.trim()}
        aria-autocomplete="list"
        aria-haspopup="dialog"
        aria-label="Search all SmartTools"
        role="combobox"
        autoComplete="off"
        className={cn(
          "min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground",
          mobile && "text-base",
        )}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="Search 150+ tools"
        ref={inputRef}
        value={query}
      />
      {query ? (
        <button
          aria-label="Clear search"
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            mobile && "size-11",
          )}
          onClick={() => {
            setQuery("");
            setDebouncedQuery("");
            setResults([]);
            setState("idle");
            inputRef.current?.focus();
          }}
          type="button"
        >
          <X aria-hidden="true" className="size-[15px]" />
        </button>
      ) : !mobile ? (
        <kbd className="grid size-6 place-items-center rounded border border-border bg-muted font-caption text-[11px] font-semibold">
          /
        </kbd>
      ) : null}
    </div>
  );
  const feedback = query.trim() ? (
    <div
      className={cn(
        "overflow-y-auto rounded-lg border border-border bg-card shadow-[0_12px_32px_rgb(17_18_20_/_12%)]",
        mobile ? "mt-2.5 w-full" : "absolute top-[56px] left-0 z-50 max-h-[min(480px,70dvh)] w-[360px]",
      )}
      style={mobile ? { maxHeight: Math.max(60, mobile.availableHeight - 70) } : undefined}
      id={resultsId}
      role="dialog"
      aria-label="Tool search results"
    >
      <div role="status" className="sr-only">
        {loading
          ? "Searching tools"
          : state === "error"
            ? "Search is temporarily unavailable"
            : `${results.length} results`}
      </div>
      {loading ? (
        <>
          <SearchSkeleton />
          <SearchSkeleton />
          <SearchSkeleton />
        </>
      ) : state === "error" ? (
        <SearchMessage title="Search is temporarily unavailable">
          <button
            type="button"
            className="mt-2 min-h-11 rounded-md px-3 font-semibold text-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry search
          </button>
        </SearchMessage>
      ) : current && state === "ready" && !results.length ? (
        <SearchMessage title={`No tools match “${debouncedQuery.trim()}”`} />
      ) : current && results.length ? (
        <>
          <Muted className="border-b border-border px-3 py-2 text-muted-foreground">
            {results.length} {results.length === 1 ? "result" : "results"} for “{debouncedQuery.trim()}”
          </Muted>
          {results.map((result) => (
            <a
              className="flex min-h-[58px] items-center gap-2.5 border-b border-border px-3 py-2 no-underline outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              href={result.href}
              key={result.toolId}
              onClick={() => setOpen(false)}
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
  ) : null;

  return (
    <div className={mobile ? "md:hidden" : "relative hidden md:block"} ref={rootRef}>
      {mobile ? (
        <button
          aria-label="Search tools"
          aria-expanded={isOpen}
          aria-controls={isOpen && query.trim() ? resultsId : undefined}
          className={cn(
            "grid size-11 place-items-center rounded-full border border-input bg-card text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
            isOpen && "bg-accent text-primary",
          )}
          onClick={() => setOpen(!isOpen)}
          ref={triggerRef}
          type="button"
        >
          <Search aria-hidden="true" className="size-5" />
        </button>
      ) : isOpen ? (
        field
      ) : (
        <button
          aria-expanded="false"
          aria-haspopup="dialog"
          className="flex h-[46px] w-[220px] xl:w-[250px] items-center gap-2 rounded-full border border-border bg-muted px-3 text-[13px] text-muted-foreground outline-none hover:border-input focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen(true)}
          ref={triggerRef}
          type="button"
        >
          <Search aria-hidden="true" className="size-[17px]" />
          <span>Search 150+ tools</span>
          <kbd className="ml-auto grid size-6 place-items-center rounded border border-border bg-card font-caption text-[11px] font-semibold">
            /
          </kbd>
        </button>
      )}
      {isOpen && mobile
        ? createPortal(
            <div ref={popupRef} className="fixed inset-x-4 z-[60] md:hidden" style={{ top: mobile.top + 8 }}>
              {field}
              {feedback}
            </div>,
            document.body,
          )
        : isOpen
          ? feedback
          : null}
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
function SearchMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-[178px] flex-col items-center justify-center gap-2 px-6 text-center text-[11px] text-muted-foreground">
      <SearchX aria-hidden="true" className="size-6" />
      <Strong className="text-foreground">{title}</Strong>
      <span>{children ? "Your query is safe. Try again." : "Check spelling or try another search."}</span>
      {children}
    </div>
  );
}
function SearchSkeleton() {
  return (
    <div className="grid min-h-[58px] grid-cols-[32px_1fr] items-center gap-2.5 border-b border-border px-3 py-2">
      <span className="size-8 animate-pulse rounded-md bg-border motion-reduce:animate-none" />
      <span className="h-2 w-2/3 animate-pulse rounded bg-border motion-reduce:animate-none" />
    </div>
  );
}
