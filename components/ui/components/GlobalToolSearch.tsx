"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/lib/i18n/config";
import { Muted, Small, Strong } from "./typography.tsx";
import { History, Search, X } from "lucide-react";
import { LoaderCircle as LoadingGlyph, Search as SearchGlyph } from "lucide";
import { MorphIcon } from "morphicons/react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { Dialog, Slot } from "radix-ui";
import { cn } from "../lib/utils.ts";
import { ContentState } from "./ContentState.tsx";
import { Button } from "./button.tsx";
import { Input } from "./input.tsx";

type SearchFamily = "paperwork" | "devtools" | "media";
type SearchRequest = { family?: SearchFamily; initialQuery?: string; publicSiteUrl?: string };
type SearchSession = { family?: SearchFamily; query: string; publicSiteUrl?: string };
type SearchResult = {
  category: string;
  description: string;
  href: string;
  icon: { kind: "svg"; svg: string } | { kind: "url"; url: string };
  name: string;
  toolId: string;
};
type SearchState = "idle" | "loading" | "ready" | "error";
const RECENT_SEARCHES_KEY = "canopy.recent-searches";
const SEARCH_MOTION = { duration: 0.26, ease: [0.25, 1, 0.5, 1] as const };
const MotionButton = motion.create(Button);
const MotionInput = motion.create(Input);

function readRecentSearches(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    const recent: string[] = [];
    for (const value of stored) {
      if (typeof value !== "string" || !value.trim() || value.trim().length > 200) continue;
      const query = value.trim();
      if (!recent.some((entry) => entry.toLowerCase() === query.toLowerCase())) recent.push(query);
      if (recent.length === 3) break;
    }
    return recent;
  } catch {
    return [];
  }
}
const SearchContext = createContext<{
  isOpen: boolean;
  shortcut: string;
  openSearch: (request?: SearchRequest, trigger?: HTMLElement) => void;
  closeSearch: (restoreFocus?: boolean) => void;
} | null>(null);

export function useToolSearch() {
  const context = useContext(SearchContext);
  if (!context) throw new Error("Tool search requires GlobalToolSearchProvider");
  return context;
}

export function GlobalToolSearchProvider({ children, publicSiteUrl }: { children: ReactNode; publicSiteUrl?: string }) {
  const [session, setSession] = useState<SearchSession | null>(null);
  const [shortcut, setShortcut] = useState("⌘ K");
  const returnFocus = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpenRef = useRef(false);
  const openSearch = useCallback(
    (request: SearchRequest = {}, trigger?: HTMLElement) => {
      isOpenRef.current = true;
      returnFocus.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      setSession({
        query: request.initialQuery ?? "",
        family: request.family,
        publicSiteUrl: request.publicSiteUrl ?? publicSiteUrl,
      });
    },
    [publicSiteUrl],
  );
  const closeSearch = useCallback((restoreFocus = true) => {
    isOpenRef.current = false;
    setSession(null);
    if (restoreFocus)
      requestAnimationFrame(() => {
        if (isOpenRef.current) return;
        const target = returnFocus.current?.isConnected
          ? returnFocus.current
          : document.querySelector<HTMLElement>("[data-mobile-menu-toggle]");
        target?.focus({ preventScroll: true });
      });
  }, []);
  const isOpen = session !== null;
  const value = useMemo(
    () => ({ isOpen, shortcut, openSearch, closeSearch }),
    [isOpen, shortcut, openSearch, closeSearch],
  );

  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘ K" : "Ctrl K");
    function handleShortcut(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "k" ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.repeat ||
        event.defaultPrevented
      )
        return;
      event.preventDefault();
      if (!isOpenRef.current) {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      isOpenRef.current = true;
      setSession((current) => (current ? { ...current, family: undefined } : { query: "", publicSiteUrl }));
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    }
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [publicSiteUrl]);

  return (
    <SearchContext.Provider value={value}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {session ? (
                <ToolSearchWindow
                  key="tool-search"
                  session={session}
                  inputRef={inputRef}
                  onClose={closeSearch}
                  onQueryChange={(query) => setSession((current) => current && { ...current, query })}
                  onRemoveFamily={() => setSession((current) => current && { ...current, family: undefined })}
                />
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </SearchContext.Provider>
  );
}

export function GlobalToolSearch({
  mobile = false,
  publicSiteUrl,
  onOpen,
}: { mobile?: boolean; publicSiteUrl?: string; onOpen?: () => void } = {}) {
  const t = useTranslations("Search");
  const { isOpen, shortcut, openSearch, closeSearch } = useToolSearch();
  return (
    <div
      className={
        mobile
          ? "compact:hidden"
          : "relative hidden w-[220px] compact:block compact:max-navigation:col-start-2 compact:max-navigation:row-start-1 compact:max-navigation:w-[clamp(11rem,calc(100vw-31rem),24rem)] compact:max-navigation:justify-self-center xl:w-[250px]"
      }
    >
      <button
        data-tool-search-trigger
        aria-label={t(mobile ? "searchTools" : "placeholder")}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        type="button"
        className={
          mobile
            ? cn(
                "grid size-11 place-items-center rounded-full border border-input bg-card text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                isOpen && "bg-accent text-primary",
              )
            : "flex h-[46px] w-full items-center gap-2 rounded-full border border-border bg-muted px-3 text-[13px] text-muted-foreground outline-none hover:border-input focus-visible:ring-2 focus-visible:ring-ring"
        }
        onClick={(event) => {
          onOpen?.();
          if (isOpen) closeSearch();
          else openSearch({ publicSiteUrl }, event.currentTarget);
        }}
      >
        <Search aria-hidden="true" className={mobile ? "size-5" : "size-[17px] shrink-0"} />
        {!mobile ? (
          <>
            <span className="min-w-0 flex-1 truncate text-start">{t("placeholder")}</span>
            <kbd
              aria-hidden="true"
              className="ml-auto grid h-6 shrink-0 place-items-center rounded border border-border bg-card px-1.5 font-caption text-[11px] font-semibold"
            >
              {shortcut}
            </kbd>
          </>
        ) : null}
      </button>
    </div>
  );
}

export function FamilyToolSearch({
  family,
  initialQuery = "",
  children,
}: {
  family: SearchFamily;
  initialQuery?: string;
  children: ReactNode;
}) {
  const { openSearch } = useToolSearch();
  function open(form: HTMLElement, trigger?: HTMLElement) {
    const input = form.querySelector<HTMLInputElement>('input[name="q"]');
    openSearch({ family, initialQuery: input?.value ?? initialQuery }, trigger ?? input ?? form);
  }
  return (
    <Slot.Root
      data-tool-search-trigger
      onClick={(event) => {
        const trigger = event.target instanceof Element ? event.target.closest<HTMLElement>("input, button") : null;
        if (!trigger || !event.currentTarget.contains(trigger)) return;
        event.preventDefault();
        // Enter in an input can dispatch an implicit click on the submit button.
        const source =
          event.detail === 0 &&
          document.activeElement instanceof HTMLInputElement &&
          event.currentTarget.contains(document.activeElement)
            ? document.activeElement
            : trigger;
        open(event.currentTarget, source);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        open(event.currentTarget);
      }}
    >
      {children}
    </Slot.Root>
  );
}

function ToolSearchWindow({
  session: { family, query, publicSiteUrl },
  inputRef,
  onClose,
  onQueryChange,
  onRemoveFamily,
}: {
  session: SearchSession;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: (restoreFocus?: boolean) => void;
  onQueryChange: (query: string) => void;
  onRemoveFamily: () => void;
}) {
  const t = useTranslations("Search");
  const common = useTranslations("Common");
  const catalog = useTranslations("Catalog");
  const locale = useLocale() as Locale;
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [resultQuery, setResultQuery] = useState("");
  const [resultFamily, setResultFamily] = useState<SearchFamily>();
  const [resultLocale, setResultLocale] = useState<Locale>();
  const [retry, setRetry] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState(readRecentSearches);
  const [suggestions, setSuggestions] = useState<{
    family?: SearchFamily;
    locale?: Locale;
    tools: readonly SearchResult[];
  }>({
    tools: [],
  });
  const [suggestionsState, setSuggestionsState] = useState<SearchState>("loading");
  const [position, setPosition] = useState({ top: 72, availableHeight: 600 });
  const isPresent = useIsPresent();
  const reducedMotion = useReducedMotion();
  const transition = reducedMotion ? { duration: 0 } : SEARCH_MOTION;
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resultsId = useId();
  const hintsId = `${resultsId}-hints`;
  const current = query.trim() === resultQuery && resultFamily === family && resultLocale === locale;
  const loading = !!query.trim() && (!current || state === "loading" || state === "idle");
  const visibleResults = query.trim() && current && state === "ready" ? results : [];
  const selectedIndex = visibleResults.length ? Math.min(activeIndex, visibleResults.length - 1) : -1;
  const familyLabel = family
    ? family === "devtools"
      ? catalog("developerOverline")
      : common(family === "paperwork" ? "documents" : "media")
    : undefined;
  const optionId = (index: number) => `${resultsId}-${index}`;
  const hasQuery = Boolean(query.trim());
  const popularTools =
    suggestions.family === family && suggestions.locale === locale ? suggestions.tools.slice(0, family ? 3 : 4) : [];
  const searchIcon = (
    <motion.span
      key="search-icon"
      layoutId={reducedMotion ? undefined : `${resultsId}-search-icon`}
      transition={transition}
      className={cn("flex size-[17px] shrink-0", familyLabel && "max-sm:hidden")}
      aria-hidden="true"
    >
      <MorphIcon
        icon={loading ? LoadingGlyph : SearchGlyph}
        reducedMotion="user"
        size={17}
        className={cn(
          "size-[17px] shrink-0",
          loading && "animate-spin motion-reduce:animate-none",
          !familyLabel && (loading ? "text-primary" : "text-muted-foreground"),
        )}
      />
    </motion.span>
  );

  function openTool(tool: SearchResult) {
    const term = (query.trim() || tool.name).slice(0, 200);
    const recent = [term, ...readRecentSearches().filter((entry) => entry.toLowerCase() !== term.toLowerCase())].slice(
      0,
      3,
    );
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
    } catch {
      // Storage can be disabled or full; opening a tool must still work.
    }
    onClose(false);
  }

  function removeRecentSearch(term: string) {
    const remaining = recentSearches.filter((query) => query !== term);
    try {
      if (remaining.length) localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(remaining));
      else localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      return;
    }
    setRecentSearches(remaining);
    inputRef.current?.focus();
  }

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
    if (isPresent) {
      setRecentSearches(readRecentSearches());
      const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(frame);
    }
  }, [inputRef, isPresent]);

  useLayoutEffect(() => {
    const update = () => {
      const header = document.querySelector("header[data-product-name]");
      const top = Math.max(0, header?.getBoundingClientRect().bottom ?? 0);
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      setPosition({ top, availableHeight: Math.max(100, bottom - top - 16) });
    };
    update();
    const header = document.querySelector("header[data-product-name]");
    header?.addEventListener("transitionend", update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      header?.removeEventListener("transitionend", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [inputRef]);

  useEffect(() => {
    const selected = listRef.current?.children[selectedIndex];
    const scroll = scrollRef.current;
    if (!selected || !scroll) return;
    const itemBounds = selected.getBoundingClientRect();
    const scrollBounds = scroll.getBoundingClientRect();
    if (itemBounds.top < scrollBounds.top) scroll.scrollTop -= scrollBounds.top - itemBounds.top;
    else if (itemBounds.bottom > scrollBounds.bottom) scroll.scrollTop += itemBounds.bottom - scrollBounds.bottom;
  }, [selectedIndex, results]);

  useEffect(() => {
    if (!isPresent) return;
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query, isPresent]);

  useEffect(() => {
    const normalized = debouncedQuery.trim();
    if (!isPresent || !normalized || query.trim() !== normalized) return;
    const controller = new AbortController();
    setState("loading");
    setResults([]);
    setResultQuery(normalized);
    setResultFamily(family);
    setResultLocale(locale);
    const params = new URLSearchParams({ q: normalized, locale });
    if (family) params.set("family", family);
    fetch(`/api/tools/search?${params}`, { signal: controller.signal })
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
  }, [debouncedQuery, family, retry, query, isPresent, locale]);

  useEffect(() => {
    if (!isPresent || hasQuery) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ suggestions: "1", locale });
    if (family) params.set("family", family);
    setSuggestionsState("loading");
    fetch(`/api/tools/search?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Suggestions unavailable");
        return response.json() as Promise<{ results: SearchResult[] }>;
      })
      .then(({ results: tools }) => {
        if (!controller.signal.aborted) {
          setSuggestions({ family, locale, tools });
          setSuggestionsState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setSuggestionsState("error");
      });
    return () => controller.abort();
  }, [family, hasQuery, isPresent, locale]);

  return (
    <Dialog.Root open={isPresent} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Overlay forceMount asChild>
        <motion.div
          aria-hidden="true"
          className="fixed inset-0 z-[55] bg-black/[0.19] backdrop-blur-sm"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reducedMotion ? 0 : 0.18 } }}
          transition={transition}
          style={{ pointerEvents: isPresent ? "auto" : "none" }}
          onPointerDown={() => onClose()}
        />
      </Dialog.Overlay>
      <Dialog.Content
        forceMount
        asChild
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (event.isComposing || event.keyCode === 229) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (event.target instanceof Element && event.target.closest("[data-tool-search-trigger]"))
            event.preventDefault();
        }}
      >
        <motion.div
          ref={popupRef}
          role={isPresent ? "dialog" : undefined}
          aria-label={t("searchTools")}
          aria-modal={isPresent || undefined}
          aria-hidden={!isPresent || undefined}
          inert={!isPresent}
          initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{
            opacity: 0,
            y: reducedMotion ? 0 : 10,
            scale: reducedMotion ? 1 : 0.98,
            transition: { duration: reducedMotion ? 0 : 0.18 },
          }}
          transition={transition}
          className="fixed inset-x-4 top-[var(--search-top)] z-[60] navigation:inset-x-auto navigation:top-1/2 navigation:left-1/2 navigation:w-[min(50vw,800px)] navigation:-translate-x-1/2 navigation:-translate-y-1/2"
          style={
            { "--search-top": `${position.top + 8}px`, pointerEvents: isPresent ? "auto" : "none" } as CSSProperties
          }
          onKeyDown={navigateResults}
        >
          <Dialog.Title className="sr-only">{t("searchTools")}</Dialog.Title>
          <div className="relative flex h-12 w-full items-center gap-2 rounded-full border border-primary bg-card pe-0.5 ps-3 text-[13px] shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_12%,transparent)]">
            <AnimatePresence initial={false} mode="popLayout">
              {familyLabel ? (
                <SearchFamilyChip
                  key={familyLabel}
                  label={familyLabel}
                  reducedMotion={!!reducedMotion}
                  onRemove={() => {
                    onRemoveFamily();
                    setActiveIndex(0);
                    inputRef.current?.focus();
                  }}
                >
                  {searchIcon}
                </SearchFamilyChip>
              ) : (
                searchIcon
              )}
            </AnimatePresence>
            <div className="h-full min-w-0 flex-1 overflow-hidden">
              <MotionInput
                layout={reducedMotion ? false : "position"}
                layoutDependency={familyLabel}
                transition={transition}
                aria-controls={query.trim() ? resultsId : undefined}
                aria-expanded={!!query.trim()}
                aria-autocomplete="list"
                aria-haspopup="listbox"
                aria-activedescendant={selectedIndex >= 0 ? optionId(selectedIndex) : undefined}
                aria-describedby={query.trim() ? hintsId : undefined}
                aria-label={familyLabel ? t("familyLabel", { family: familyLabel }) : t("label")}
                role="combobox"
                autoComplete="off"
                className="h-full min-w-0 rounded-none border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
                onChange={(event) => {
                  onQueryChange(event.currentTarget.value);
                  setActiveIndex(0);
                }}
                placeholder={familyLabel ? t("familyPlaceholder", { family: familyLabel }) : t("placeholder")}
                ref={inputRef}
                value={query}
              />
            </div>
            {query ? (
              <Button
                aria-label={t("clear")}
                variant="ghost"
                size="icon-md"
                className="rounded-full text-muted-foreground"
                onClick={() => {
                  onQueryChange("");
                  setDebouncedQuery("");
                  setResults([]);
                  setState("idle");
                  setActiveIndex(0);
                  inputRef.current?.focus();
                }}
              >
                <X aria-hidden="true" className="size-[15px]" />
              </Button>
            ) : null}
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" className="h-11 shrink-0 rounded-full px-3">
                {t("close")}
              </Button>
            </Dialog.Close>
          </div>
          <div role="status" className="sr-only">
            {!query.trim()
              ? familyLabel
                ? t("limitedTo", { family: familyLabel })
                : t("allFamilies")
              : loading
                ? t("searching")
                : state === "error"
                  ? t("unavailable")
                  : familyLabel
                    ? t("resultCountFamily", { count: visibleResults.length, family: familyLabel })
                    : t("resultCountAll", { count: visibleResults.length })}
          </div>
          {query.trim() ? (
            <motion.div
              key="results"
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transition}
              className="mt-2.5 flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_12px_32px_rgb(17_18_20_/_12%)]"
              style={{
                height: `min(320px, 50dvh, ${Math.max(60, position.availableHeight - 70)}px)`,
              }}
              role="region"
              aria-label={t("resultsLabel")}
            >
              <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                {loading ? (
                  <>
                    <SearchSkeleton />
                    <SearchSkeleton />
                    <SearchSkeleton />
                  </>
                ) : state === "error" ? (
                  <SearchMessage title={t("unavailable")}>
                    <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
                      {t("retry")}
                    </Button>
                  </SearchMessage>
                ) : current && state === "ready" && !results.length ? (
                  <SearchMessage
                    title={
                      familyLabel
                        ? t("noMatchesFamily", { query: debouncedQuery.trim(), family: familyLabel })
                        : t("noMatches", { query: debouncedQuery.trim() })
                    }
                  />
                ) : visibleResults.length ? (
                  <Muted className="block border-b border-border px-3 py-2">
                    {t("queryResults", { count: results.length, query: debouncedQuery.trim() })}
                  </Muted>
                ) : null}
                <div ref={listRef} id={resultsId} role="listbox" aria-label={t("matching")} aria-busy={loading}>
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
                      onClick={() => openTool(result)}
                      onAuxClick={(event) => {
                        if (event.button === 1) openTool(result);
                      }}
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
                aria-label={t("shortcuts")}
                className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1 [&_kbd]:rounded-sm [&_kbd]:border [&_kbd]:border-border [&_kbd]:bg-muted [&_kbd]:px-1 [&_kbd]:py-0.5 [&_kbd]:font-sans [&_kbd]:text-[11px] [&_kbd]:font-medium"
              >
                {visibleResults.length ? (
                  <>
                    <span>
                      <kbd>↑ ↓</kbd> {t("move")}
                    </span>
                    <span>
                      <kbd>↵</kbd> {t("open")}
                    </span>
                  </>
                ) : null}
                <span>
                  <kbd>Esc</kbd> {t("close")}
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="suggestions"
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transition}
              className={cn(
                "relative mt-2.5 grid w-full overflow-y-auto rounded-lg border border-border bg-card shadow-[0_12px_32px_rgb(17_18_20_/_12%)]",
                recentSearches.length > 0 && "sm:grid-cols-2",
              )}
              style={{
                height: `min(320px, 50dvh, ${Math.max(60, position.availableHeight - 70)}px)`,
              }}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {recentSearches.length > 0 ? (
                  <RecentSearches
                    key="recent"
                    terms={recentSearches}
                    reducedMotion={!!reducedMotion}
                    onReplay={(term) => {
                      onQueryChange(term);
                      setActiveIndex(0);
                      inputRef.current?.focus();
                    }}
                    onRemove={removeRecentSearch}
                  />
                ) : null}
                <motion.section
                  key="popular"
                  layout={reducedMotion ? false : "position"}
                  transition={transition}
                  aria-label={t("popular")}
                  className="flex min-w-0 flex-col"
                >
                  {recentSearches.length === 0 && suggestionsState === "ready" && popularTools.length > 0 ? (
                    <ContentState
                      density="compact"
                      title={t("noRecent")}
                      description={t("recentDescription")}
                      headingLevel="h3"
                      className="min-h-24 flex-none border-b border-border bg-muted/40"
                    />
                  ) : null}
                  <Strong className="block px-3 py-2">{t("popular")}</Strong>
                  {suggestionsState === "loading" ? (
                    <>
                      <SearchSkeleton />
                      <SearchSkeleton />
                      <SearchSkeleton />
                    </>
                  ) : suggestionsState === "error" ? (
                    <Muted className="flex flex-1 items-center justify-center px-3 pb-3 text-center">
                      {t("suggestionsUnavailable")}
                    </Muted>
                  ) : popularTools.length ? (
                    popularTools.map((tool) => (
                      <a
                        key={tool.toolId}
                        href={publicSiteUrl ? new URL(tool.href, publicSiteUrl).href : tool.href}
                        className="group/search-result flex min-h-[58px] items-center gap-2.5 border-t border-border px-3 py-2 no-underline outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        onClick={() => openTool(tool)}
                        onAuxClick={(event) => {
                          if (event.button === 1) openTool(tool);
                        }}
                      >
                        <ToolIcon icon={tool.icon} />
                        <span className="min-w-0">
                          <Strong className="block truncate text-foreground group-hover/search-result:text-accent-foreground">
                            {tool.name}
                          </Strong>
                          <Small className="block truncate text-muted-foreground group-hover/search-result:text-accent-foreground">
                            {tool.category}
                          </Small>
                        </span>
                      </a>
                    ))
                  ) : (
                    <Muted className="flex flex-1 items-center justify-center px-3 pb-3 text-center">
                      {t("emptyPrompt")}
                    </Muted>
                  )}
                </motion.section>
              </AnimatePresence>
            </motion.div>
          )}
        </motion.div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

const SearchFamilyChip = forwardRef<
  HTMLButtonElement,
  { label: string; reducedMotion: boolean; onRemove: () => void; children: ReactNode }
>(function SearchFamilyChip({ label, reducedMotion, onRemove, children }, ref) {
  const t = useTranslations("Search");
  const isPresent = useIsPresent();
  return (
    <MotionButton
      ref={ref}
      aria-label={t("removeFilter", { family: label })}
      aria-hidden={!isPresent || undefined}
      inert={!isPresent}
      disabled={!isPresent}
      variant="ghost"
      size="sm"
      initial={false}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.96, x: reducedMotion ? 0 : -6 }}
      transition={{ ...SEARCH_MOTION, duration: reducedMotion ? 0 : 0.18 }}
      className="me-1 h-8 max-w-[calc(45%+1.5rem)] origin-left gap-1.5 rounded-full bg-accent px-2.5 text-sm font-medium text-accent-foreground focus-visible:ring-inset focus-visible:ring-offset-0 disabled:opacity-100 max-sm:me-0 max-sm:h-11 max-sm:max-w-[28%]"
      onClick={onRemove}
    >
      {children}
      <span className="truncate">{label}</span>
      <X aria-hidden="true" className="size-3.5" />
    </MotionButton>
  );
});

const RecentSearches = forwardRef<
  HTMLElement,
  {
    terms: string[];
    reducedMotion: boolean;
    onReplay: (term: string) => void;
    onRemove: (term: string) => void;
  }
>(function RecentSearches({ terms, reducedMotion, onReplay, onRemove }, ref) {
  const t = useTranslations("Search");
  const isPresent = useIsPresent();
  return (
    <motion.section
      ref={ref}
      aria-label={t("recent")}
      aria-hidden={!isPresent || undefined}
      inert={!isPresent}
      exit={{ opacity: 0, x: reducedMotion ? 0 : -16 }}
      transition={{ ...SEARCH_MOTION, duration: reducedMotion ? 0 : 0.16 }}
      className="relative min-w-0 border-b border-border sm:border-e sm:border-b-0"
    >
      <Strong className="block px-3 py-2">{t("recent")}</Strong>
      <AnimatePresence initial={false} mode="popLayout">
        {terms.map((term) => (
          <RecentSearchRow
            key={term}
            term={term}
            reducedMotion={reducedMotion}
            onReplay={onReplay}
            onRemove={onRemove}
          />
        ))}
      </AnimatePresence>
    </motion.section>
  );
});

const RecentSearchRow = forwardRef<
  HTMLDivElement,
  {
    term: string;
    reducedMotion: boolean;
    onReplay: (term: string) => void;
    onRemove: (term: string) => void;
  }
>(function RecentSearchRow({ term, reducedMotion, onReplay, onRemove }, ref) {
  const t = useTranslations("Search");
  const isPresent = useIsPresent();
  return (
    <motion.div
      ref={ref}
      layout={reducedMotion ? false : "position"}
      aria-hidden={!isPresent || undefined}
      inert={!isPresent}
      initial={reducedMotion ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: reducedMotion ? 0 : -16, transition: { duration: reducedMotion ? 0 : 0.16 } }}
      transition={reducedMotion ? { duration: 0 } : SEARCH_MOTION}
      className="group/recent-search flex items-center transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] hover:bg-accent focus-within:bg-accent motion-reduce:transition-none"
    >
      <Button
        variant="ghost"
        size="md"
        disabled={!isPresent}
        className="min-w-0 flex-1 justify-start gap-2 rounded-none px-3 font-normal group-hover/recent-search:text-accent-foreground group-focus-within/recent-search:text-accent-foreground hover:bg-transparent active:bg-transparent motion-reduce:transition-none"
        onClick={() => onReplay(term)}
      >
        <History
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-colors duration-150 group-hover/recent-search:text-accent-foreground group-focus-within/recent-search:text-accent-foreground motion-reduce:transition-none"
        />
        <span className="min-w-0 truncate">{term}</span>
      </Button>
      <Button
        aria-label={t("removeRecent", { term })}
        variant="ghost"
        size="icon-md"
        disabled={!isPresent}
        className="rounded-none text-muted-foreground group-hover/recent-search:text-accent-foreground group-focus-within/recent-search:text-accent-foreground hover:bg-transparent active:bg-transparent motion-reduce:transition-none active:[&_svg]:scale-90 motion-reduce:active:[&_svg]:scale-100"
        onClick={() => onRemove(term)}
      >
        <X aria-hidden="true" className="size-3.5 transition-transform duration-100 motion-reduce:transition-none" />
      </Button>
    </motion.div>
  );
});

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
  const t = useTranslations("Search");
  return (
    <ContentState
      density="compact"
      state={children ? "error" : "no-results"}
      headingLevel="h3"
      title={title}
      description={t(children ? "retryDescription" : "emptyDescription")}
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
