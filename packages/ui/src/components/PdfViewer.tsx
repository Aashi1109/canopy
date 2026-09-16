"use client";
import { Caption, H3, Muted, P } from "#components/typography";

import { ChevronDown, Maximize2, Minus, Plus, Search } from "lucide-react";
import { Menu, X } from "lucide";
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { MorphIcon } from "morphicons/react";

import { Button } from "#components/button";
import { ChapterScrubber } from "#components/ChapterScrubber";
import { cn } from "#lib/utils";

export interface PdfOutlineItem {
  id: string;
  title: string;
  page: number;
  depth?: number;
  expanded?: boolean;
}

export interface PdfViewerProps {
  children?: React.ReactNode;
  className?: string;
  pageClassName?: string;
  currentPage: number;
  fileName: string;
  fileSize?: string;
  fit?: "width" | "page";
  onExpand?: () => void;
  onFitPage?: () => void;
  onPageChange: (page: number) => void;
  onZoomChange?: (zoom: number) => void;
  outline: PdfOutlineItem[];
  pageCount: number;
  pages?: readonly {
    pageNumber: number;
    width: number;
    height: number;
    content: React.ReactNode;
  }[];
  pagePreviewDelayMs?: number;
  pagePreviewDetail?: React.ReactNode;
  renderPagePreview?: (page: number) => React.ReactNode;
  rightChildren?: React.ReactNode;
  zoom?: number;
}

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizePage(page: number, pageCount: number) {
  return clamp(Number.isFinite(page) ? Math.round(page) : 1, 1, pageCount);
}

export function PdfViewer({
  children,
  className,
  pageClassName,
  currentPage,
  fileName,
  fileSize,
  fit = "width",
  onExpand,
  onFitPage,
  onPageChange,
  onZoomChange,
  outline,
  pageCount,
  pages,
  pagePreviewDelayMs = 120,
  pagePreviewDetail = "A4 → Letter · fit content",
  renderPagePreview,
  rightChildren,
  zoom,
}: PdfViewerProps) {
  const resolvedPageCount = Math.max(1, Number.isFinite(pageCount) ? Math.round(pageCount) : 1);
  const resolvedCurrentPage = normalizePage(currentPage, resolvedPageCount);
  const [internalZoom, setInternalZoom] = React.useState(100);
  const [query, setQuery] = React.useState("");
  const [outlineOpen, setOutlineOpen] = React.useState(false);
  const reduceMotion = useReducedMotion();
  const outlineId = React.useId();
  const outlineSearch = React.useRef<HTMLInputElement>(null);
  const outlineToggle = React.useRef<HTMLButtonElement>(null);
  const outlineAnimating = React.useRef(false);
  const [pageDraft, setPageDraft] = React.useState(String(resolvedCurrentPage));
  const outlineButtons = React.useRef<Array<HTMLButtonElement | null>>([]);
  const pageViewport = React.useRef<HTMLDivElement | null>(null);
  const pageElements = React.useRef(new Map<number, HTMLDivElement>());
  const scrollSelection = React.useRef<number | null>(null);
  const resolvedZoom = clamp(Number.isFinite(zoom) ? Math.round(zoom ?? 100) : internalZoom, MIN_ZOOM, MAX_ZOOM);
  const pageChapters = React.useMemo(
    () =>
      Array.from({ length: resolvedPageCount }, (_, index) => {
        const page = index + 1;
        return { id: `page-${page}`, title: `Page ${page}` };
      }),
    [resolvedPageCount],
  );

  React.useLayoutEffect(() => {
    if (scrollSelection.current === resolvedCurrentPage) {
      scrollSelection.current = null;
      return;
    }
    scrollToPage(resolvedCurrentPage);
  }, [resolvedCurrentPage, resolvedZoom, pages?.length, outlineOpen]);

  function scrollToPage(page: number) {
    const viewport = pageViewport.current;
    const target = pageElements.current.get(page);
    if (!viewport || !target) return;
    viewport.scrollTop += target.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
  }

  function syncVisiblePage() {
    if (outlineAnimating.current) return;
    const viewport = pageViewport.current;
    if (!viewport || !pages?.length) return;
    const bounds = viewport.getBoundingClientRect();
    let visible = pages[0];
    let largestVisibleHeight = 0;
    for (const page of pages) {
      const element = pageElements.current.get(page.pageNumber);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (rect.top >= bounds.bottom) break;
      const visibleHeight = Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top);
      if (visibleHeight > largestVisibleHeight) {
        largestVisibleHeight = visibleHeight;
        visible = page;
      }
    }
    if (largestVisibleHeight > 0 && visible.pageNumber !== resolvedCurrentPage) {
      scrollSelection.current = visible.pageNumber;
      onPageChange(visible.pageNumber);
    }
  }

  React.useEffect(() => {
    setPageDraft(String(resolvedCurrentPage));
  }, [resolvedCurrentPage]);

  React.useEffect(() => {
    if (outlineOpen) outlineSearch.current?.focus({ preventScroll: true });
  }, [outlineOpen]);

  const visibleOutline = React.useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return outline;
    return outline.filter((item) => item.title.toLocaleLowerCase().includes(normalizedQuery));
  }, [outline, query]);

  function sectionAtPage(page: number) {
    return [...outline].filter((item) => item.page <= page).sort((left, right) => right.page - left.page)[0];
  }

  const currentSection = sectionAtPage(resolvedCurrentPage);

  function selectPage(page: number) {
    const nextPage = normalizePage(page, resolvedPageCount);
    setPageDraft(String(nextPage));
    scrollToPage(nextPage);
    onPageChange(nextPage);
  }

  function commitPageDraft() {
    const parsedPage = Number(pageDraft);
    if (!Number.isFinite(parsedPage)) {
      setPageDraft(String(resolvedCurrentPage));
      return;
    }
    selectPage(parsedPage);
  }

  function updateZoom(nextZoom: number) {
    const normalizedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    if (zoom === undefined) setInternalZoom(normalizedZoom);
    onZoomChange?.(normalizedZoom);
  }

  function handleOutlineKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const focusedIndex = outlineButtons.current.findIndex((button) => button === event.target);
    if (focusedIndex < 0) return;

    let nextIndex = focusedIndex;
    if (event.key === "ArrowDown") nextIndex += 1;
    else if (event.key === "ArrowUp") nextIndex -= 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = visibleOutline.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const page = visibleOutline[focusedIndex]?.page;
      if (page) selectPage(page);
      return;
    } else {
      return;
    }

    event.preventDefault();
    outlineButtons.current[clamp(nextIndex, 0, visibleOutline.length - 1)]?.focus();
  }

  return (
    <div
      className={cn(
        "relative flex min-h-[32.5rem] overflow-hidden bg-card [container-type:inline-size]",
        pages && "min-h-0",
        className,
      )}
      data-slot="pdf-viewer"
    >
      <motion.aside
        initial={false}
        animate={{ width: outlineOpen ? "auto" : 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.25, 1, 0.5, 1] }}
        onAnimationStart={() => {
          outlineAnimating.current = true;
        }}
        onUpdate={() => scrollToPage(resolvedCurrentPage)}
        onAnimationComplete={() => {
          scrollToPage(resolvedCurrentPage);
          outlineAnimating.current = false;
        }}
        aria-hidden={!outlineOpen}
        inert={!outlineOpen}
        data-preview-escape-boundary=""
        id={outlineId}
        className="min-h-0 max-w-[35%] shrink-0 overflow-clip bg-muted"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          setOutlineOpen(false);
          outlineToggle.current?.focus();
        }}
      >
        <div className="flex h-full w-max max-w-[35cqw] flex-col gap-3.5 border-r border-border p-3 sm:p-4.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <H3 className="text-foreground">Outline</H3>
            <Caption className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
              {resolvedPageCount} {resolvedPageCount === 1 ? "page" : "pages"}
            </Caption>
          </div>

          <label className="flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <Search aria-hidden="true" className="size-3.5 text-muted-foreground" />
            <span className="sr-only">Search document outline</span>
            <input
              aria-label="Search document outline"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a section"
              ref={outlineSearch}
              type="search"
              value={query}
            />
          </label>

          <div
            aria-label="Document outline"
            className="min-h-0 flex-1 overflow-y-auto"
            onKeyDown={handleOutlineKeyDown}
            role="listbox"
          >
            {visibleOutline.length > 0 ? (
              visibleOutline.map((item, index) => {
                const selected = item.id === currentSection?.id;
                const depth = clamp(item.depth ?? 0, 0, 4);

                return (
                  <button
                    aria-selected={selected}
                    className={cn(
                      "flex h-8 w-full items-center justify-between gap-2 rounded-lg pr-2.5 text-left text-[11px] outline-none transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "bg-accent font-semibold text-foreground" : "text-muted-foreground",
                    )}
                    key={item.id}
                    onClick={() => selectPage(item.page)}
                    ref={(element) => {
                      outlineButtons.current[index] = element;
                    }}
                    role="option"
                    style={{ paddingLeft: `${9 + depth * 13}px` }}
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {item.expanded !== undefined ? (
                        <ChevronDown
                          aria-hidden="true"
                          className={cn("size-3 shrink-0", !item.expanded && "-rotate-90")}
                        />
                      ) : null}
                      <span className="truncate">{item.title}</span>
                    </span>
                    <Caption className={cn("", selected ? "text-primary" : "text-muted-foreground")}>
                      {item.page}
                    </Caption>
                  </button>
                );
              })
            ) : (
              <Muted className="px-2 py-3 text-muted-foreground">No matching sections.</Muted>
            )}
          </div>
        </div>
      </motion.aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 md:px-4.5">
        <div className="flex flex-wrap items-center gap-2.5 max-sm:[&_button:not([role=checkbox])]:!min-h-11 max-sm:[&_button:not([role=checkbox])]:min-w-11 [@media(pointer:coarse)]:[&_button:not([role=checkbox])]:!min-h-11 [@media(pointer:coarse)]:[&_button:not([role=checkbox])]:min-w-11">
          <Button
            aria-controls={outlineId}
            aria-expanded={outlineOpen}
            aria-label={outlineOpen ? "Hide outline" : "Show outline"}
            onClick={() => setOutlineOpen((open) => !open)}
            ref={outlineToggle}
            size="icon"
            type="button"
            variant="outline"
          >
            <MorphIcon icon={outlineOpen ? X : Menu} reducedMotion="user" />
          </Button>
          <div className="min-w-0 basis-40 flex-1">
            <P className="truncate text-foreground">{fileName}</P>
            <Muted className="truncate text-muted-foreground">
              {currentSection && currentSection.title !== `Page ${resolvedCurrentPage}`
                ? `${currentSection.title} · `
                : ""}
              Page {resolvedCurrentPage} of {resolvedPageCount}
              {fileSize ? ` · ${fileSize}` : null}
            </Muted>
          </div>

          <div className="flex items-center gap-1" aria-label="Page jump">
            <input
              aria-label="Current page"
              className="h-6 w-7 appearance-none rounded border border-border bg-transparent text-center font-caption text-[10px] font-semibold text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 max-sm:size-11 [@media(pointer:coarse)]:size-11 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              inputMode="numeric"
              max={resolvedPageCount}
              min={1}
              onBlur={commitPageDraft}
              onChange={(event) => setPageDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitPageDraft();
                  event.currentTarget.blur();
                }
              }}
              type="number"
              value={pageDraft}
            />
            <span className="font-caption text-[9px] text-muted-foreground">/ {resolvedPageCount}</span>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button
              aria-label="Zoom out"
              className="size-[30px]"
              disabled={resolvedZoom <= MIN_ZOOM}
              onClick={() => updateZoom(resolvedZoom - ZOOM_STEP)}
              size="icon-xs"
              variant="outline"
            >
              <Minus />
            </Button>
            <output
              aria-label="Zoom level"
              className="grid h-[30px] w-12 place-items-center rounded-lg border border-border bg-muted font-caption text-[10px] font-semibold text-foreground"
            >
              {resolvedZoom}%
            </output>
            <Button
              aria-label="Zoom in"
              className="size-[30px]"
              disabled={resolvedZoom >= MAX_ZOOM}
              onClick={() => updateZoom(resolvedZoom + ZOOM_STEP)}
              size="icon-xs"
              variant="outline"
            >
              <Plus />
            </Button>
            <Button
              aria-label={onExpand ? "Expand preview" : "Fit page"}
              className="size-[30px]"
              onClick={() => (onExpand ? onExpand() : onFitPage ? onFitPage() : updateZoom(100))}
              size="icon-xs"
              variant="outline"
            >
              <Maximize2 />
            </Button>
            {rightChildren}
          </div>
        </div>

        <div
          className={cn(
            "flex min-h-[24rem] flex-1 gap-4 overflow-hidden rounded-lg border border-border bg-muted p-4",
            pages && "min-h-0",
          )}
        >
          <div className="flex w-8 shrink-0 items-center justify-start overflow-visible max-sm:hidden [@media(pointer:coarse)]:hidden">
            <ChapterScrubber
              chapters={pageChapters}
              currentIndex={resolvedCurrentPage - 1}
              density="compact"
              hoverLengthMultiplier={2.5}
              label="Page scrubber"
              onSelect={(_, index) => selectPage(index + 1)}
              previewCardClassName="rounded-lg border-transparent bg-surface-ink p-2.5 text-on-ink shadow-[0_5px_14px_#00000022]"
              previewCardGap={12}
              previewCardWidth={178}
              previewDelayMs={pagePreviewDelayMs}
              radius={4.5}
              renderPreview={(_, index) => {
                const page = index + 1;
                return (
                  <div className="flex flex-col gap-2">
                    <div className="flex h-[116px] w-full flex-col gap-1.5 overflow-hidden rounded bg-card p-3">
                      {renderPagePreview ? (
                        renderPagePreview(page)
                      ) : (
                        <>
                          <span className="block h-[7px] w-[84px] shrink-0 rounded-full bg-foreground" />
                          <span className="block h-[3px] w-[35px] shrink-0 rounded-full bg-primary" />
                          <span className="block h-[3px] w-full shrink-0 rounded-full bg-input" />
                          <span className="block h-[3px] w-full shrink-0 rounded-full bg-input" />
                          <span className="block h-[3px] w-full shrink-0 rounded-full bg-input" />
                          <span className="block h-[3px] w-[90px] shrink-0 rounded-full bg-input" />
                        </>
                      )}
                    </div>
                    <P className="truncate text-on-ink">
                      Page {page} · {sectionAtPage(page)?.title ?? "Document"}
                    </P>
                    <P className="truncate text-on-ink-muted">{pagePreviewDetail}</P>
                  </div>
                );
              }}
              restLength={8}
              rowHeight={5}
            />
          </div>

          {pages ? (
            <div
              aria-label="PDF pages"
              className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain"
              onScroll={syncVisiblePage}
              ref={pageViewport}
              role="region"
              style={fit === "page" ? { containerType: "size" } : undefined}
              tabIndex={0}
            >
              <div
                className="mx-auto flex flex-col gap-4"
                style={{ width: fit === "page" ? "100%" : `${resolvedZoom}%` }}
              >
                {pages.map((page) => (
                  <div
                    className={cn(
                      "relative w-full shrink-0 overflow-hidden border border-input bg-card shadow-sm",
                      pageClassName,
                    )}
                    key={page.pageNumber}
                    ref={(element) => {
                      if (element) pageElements.current.set(page.pageNumber, element);
                      else pageElements.current.delete(page.pageNumber);
                    }}
                    style={{
                      aspectRatio: `${page.width} / ${page.height}`,
                      ...(fit === "page"
                        ? {
                            marginInline: "auto",
                            width: `min(${resolvedZoom}cqw, ${(resolvedZoom * page.width) / page.height}cqh)`,
                          }
                        : {}),
                    }}
                  >
                    {page.content}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto">
              <div
                className="flex min-h-full w-full origin-center items-stretch justify-center transition-transform"
                style={{ transform: `scale(${resolvedZoom / 100})` }}
              >
                <div className="flex min-h-full w-full flex-col overflow-hidden border border-input bg-card shadow-sm">
                  {children}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
