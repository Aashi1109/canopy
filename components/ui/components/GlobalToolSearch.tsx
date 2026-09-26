"use client";
import { Muted, Small, Strong } from "./typography.tsx";
import { LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils.ts";
import { matchBreakpoint } from "../lib/breakpoints.ts";
import { ContentState } from "./ContentState.tsx";
import { Button } from "./button.tsx";

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

// Reserve space for the logo, page/account actions, menu, and header padding.
const CENTERED_SEARCH_WIDTH_CLASS = "compact:max-navigation:w-[clamp(11rem,calc(100vw-26rem),24rem)]";

export function GlobalToolSearch({ mobile, publicSiteUrl }: { mobile?: MobileSearch; publicSiteUrl?: string } = {}) {
  const [desktopOpen, setDesktopOpen] = useState(false);
  const isMobileSearch = Boolean(mobile);
  const isOpen = mobile ? mobile.open : desktopOpen;
  const setOpen = mobile?.onOpenChange ?? setDesktopOpen;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resultsId = useId();
  const hintsId = `${resultsId}-hints`;
  const current = query.trim() === debouncedQuery.trim();
  const loading = !!query.trim() && (!current || state === "loading" || state === "idle");
  const visibleResults = isOpen && query.trim() && current && state === "ready" ? results : [];
  const selectedIndex = visibleResults.length ? Math.min(activeIndex, visibleResults.length - 1) : -1;
  const optionId = (index: number) => `${resultsId}-${index}`;

  function navigateResults(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      selectedIndex < 0 ||
      (event.target !== inputRef.current && !listRef.current?.contains(event.target as Node))
    )
      return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (selectedIndex + (event.key === "ArrowDown" ? 1 : -1) + visibleResults.length) % visibleResults.length,
      );
      inputRef.current?.focus({ preventScroll: true });
    } else if (event.key === "Enter" && event.target === inputRef.current) {
      event.preventDefault();
      listRef.current?.querySelectorAll<HTMLAnchorElement>("a")[selectedIndex]?.click();
    }
  }

  useEffect(() => {
    const selected = listRef.current?.children[selectedIndex];
    const scroll = scrollRef.current;
    if (!selected || !scroll) return;
    const itemBounds = selected.getBoundingClientRect();
    const scrollBounds = scroll.getBoundingClientRect();
    if (itemBounds.top < scrollBounds.top) scroll.scrollTop -= scrollBounds.top - itemBounds.top;
    else if (itemBounds.bottom > scrollBounds.bottom) scroll.scrollTop += itemBounds.bottom - scrollBounds.bottom;
  }, [selectedIndex, results, isOpen]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => {
    const desktop = matchBreakpoint({ min: "compact" });
    const reset = () => {
      if (isMobileSearch === desktop.matches) setOpen(false);
    };
    reset();
    desktop.addEventListener("change", reset);
    return () => desktop.removeEventListener("change", reset);
  }, [isMobileSearch, setOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function outside(event: PointerEvent) {
      const node = event.target as Node;
      if (!rootRef.current?.contains(node) && !popupRef.current?.contains(node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.isComposing && event.keyCode !== 229) {
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
      setActiveIndex(0);
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
          setActiveIndex(0);
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
        "flex h-[46px] w-full items-center gap-2 rounded-full border border-primary bg-card px-3 text-[13px] shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_12%,transparent)]",
        mobile && "h-12 pr-0.5",
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
        aria-haspopup="listbox"
        aria-activedescendant={selectedIndex >= 0 ? optionId(selectedIndex) : undefined}
        aria-describedby={query.trim() ? hintsId : undefined}
        aria-label="Search all SmartTools"
        role="combobox"
        autoComplete="off"
        className={cn(
          "min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground",
          mobile && "text-base",
        )}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setActiveIndex(0);
        }}
        placeholder="Search 150+ tools"
        ref={inputRef}
        value={query}
      />
      {query ? (
        <Button
          aria-label="Clear search"
          className="rounded-full text-muted-foreground"
          onClick={() => {
            setQuery("");
            setDebouncedQuery("");
            setResults([]);
            setState("idle");
            setActiveIndex(0);
            inputRef.current?.focus();
          }}
          size={mobile ? "icon-md" : "icon-xs"}
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-[15px]" />
        </Button>
      ) : !mobile ? (
        <kbd className="grid size-6 place-items-center rounded border border-border bg-muted font-caption text-[11px] font-semibold max-navigation:hidden">
          /
        </kbd>
      ) : null}
    </div>
  );
  const feedback = query.trim() ? (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_12px_32px_rgb(17_18_20_/_12%)]",
        mobile
          ? "mt-2.5 w-full"
          : "absolute top-[56px] left-0 z-50 max-h-[min(480px,70dvh)] w-[360px] compact:max-navigation:left-1/2 compact:max-navigation:-translate-x-1/2",
      )}
      style={mobile ? { maxHeight: `min(320px, 50dvh, ${Math.max(60, mobile.availableHeight - 70)}px)` } : undefined}
      role="region"
      aria-label="Tool search results"
    >
      <div role="status" className="sr-only">
        {loading
          ? "Searching tools"
          : state === "error"
            ? "Search is temporarily unavailable"
            : `${results.length} results`}
      </div>
      <div ref={scrollRef} className="min-h-0 overflow-y-auto overscroll-contain">
        {loading ? (
          <>
            <SearchSkeleton />
            <SearchSkeleton />
            <SearchSkeleton />
          </>
        ) : state === "error" ? (
          <SearchMessage title="Search is temporarily unavailable">
            <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
              Retry search
            </Button>
          </SearchMessage>
        ) : current && state === "ready" && !results.length ? (
          <SearchMessage title={`No tools match “${debouncedQuery.trim()}”`} />
        ) : visibleResults.length ? (
          <Muted className="border-b border-border px-3 py-2 text-muted-foreground">
            {results.length} {results.length === 1 ? "result" : "results"} for “{debouncedQuery.trim()}”
          </Muted>
        ) : null}
        <div ref={listRef} id={resultsId} role="listbox" aria-label="Matching tools" aria-busy={loading}>
          {visibleResults.map((result, index) => (
            <a
              id={optionId(index)}
              role="option"
              aria-selected={index === selectedIndex}
              tabIndex={-1}
              className="group/search-result flex min-h-[58px] items-center gap-2.5 border-b border-border px-3 py-2 no-underline outline-none hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              href={publicSiteUrl ? new URL(result.href, publicSiteUrl).href : result.href}
              key={result.toolId}
              onPointerMove={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => setOpen(false)}
            >
              <ToolIcon icon={result.icon} />
              <span className="min-w-0">
                <Strong className="block truncate text-foreground group-hover/search-result:text-accent-foreground group-aria-selected/search-result:text-accent-foreground">
                  {result.name}
                </Strong>
                <Small className="block truncate text-muted-foreground group-hover/search-result:text-accent-foreground group-aria-selected/search-result:text-accent-foreground">
                  {result.category}
                </Small>
              </span>
            </a>
          ))}
        </div>
      </div>
      <div
        id={hintsId}
        aria-label="Search keyboard shortcuts"
        className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1 [&_kbd]:rounded-sm [&_kbd]:border [&_kbd]:border-border [&_kbd]:bg-muted [&_kbd]:px-1 [&_kbd]:py-0.5 [&_kbd]:font-sans [&_kbd]:text-[11px] [&_kbd]:font-medium"
      >
        {visibleResults.length ? (
          <>
            <span>
              <kbd>↑ ↓</kbd> Move
            </span>
            <span>
              <kbd>↵</kbd> Open
            </span>
          </>
        ) : null}
        <span>
          <kbd>Esc</kbd> Close
        </span>
      </div>
    </div>
  ) : null;

  return (
    <div
      className={
        mobile
          ? "compact:hidden"
          : cn(
              "relative hidden w-[220px] compact:block compact:max-navigation:col-start-2 compact:max-navigation:row-start-1 compact:max-navigation:justify-self-center xl:w-[250px]",
              CENTERED_SEARCH_WIDTH_CLASS,
            )
      }
      ref={rootRef}
      onKeyDown={navigateResults}
    >
      {mobile ? (
        <button
          aria-label="Search tools"
          aria-expanded={isOpen}
          aria-controls={isOpen && query.trim() ? resultsId : undefined}
          className={cn(
            "grid size-11 place-items-center rounded-full border border-input bg-card text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
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
          aria-haspopup="listbox"
          className="flex h-[46px] w-full items-center gap-2 rounded-full border border-border bg-muted px-3 text-[13px] text-muted-foreground outline-none hover:border-input focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen(true)}
          ref={triggerRef}
          type="button"
        >
          <Search aria-hidden="true" className="size-[17px]" />
          <span>Search 150+ tools</span>
          <kbd className="ml-auto grid size-6 place-items-center rounded border border-border bg-card font-caption text-[11px] font-semibold max-navigation:hidden">
            /
          </kbd>
        </button>
      )}
      {isOpen && mobile
        ? createPortal(
            <div ref={popupRef} className="fixed inset-x-4 z-[60] compact:hidden" style={{ top: mobile.top + 8 }}>
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
    <ContentState
      density="compact"
      state={children ? "error" : "no-results"}
      headingLevel="h3"
      title={title}
      description={children ? "Your query is safe. Try again." : "Check spelling or try another search."}
      action={children}
    />
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
