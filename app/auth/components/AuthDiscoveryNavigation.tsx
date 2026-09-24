"use client";
import { Caption, P, Small, Strong, Text, TextLink } from "@/components/ui/index.tsx";

import { searchTools, type ToolApp } from "@/lib/tool-catalog/index.ts";
import type { CatalogTool } from "@/lib/tool-framework/catalog";
import { TOOL_CATEGORIES, type CategoryKey } from "@/lib/tool-framework/categories";
import {
  Braces,
  AlertTriangle,
  Calculator,
  ChevronDown,
  Code2,
  FileImage,
  FileText,
  LoaderCircle,
  ReceiptText,
  Search,
  SearchX,
  Table2,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export type AuthProjectPaths = {
  devtools: string;
  media: string;
  paperwork: string;
};

type MenuName = "documents" | "developer" | null;

function categoryHref(key: CategoryKey) {
  return `/${TOOL_CATEGORIES[key].app}?category=${encodeURIComponent(key)}`;
}

const categoryMenus = {
  documents: [
    { href: "/paperwork/invoice-generator", icon: FileText, label: "Invoices" },
    { href: "/paperwork/receipt-generator", icon: ReceiptText, label: "Receipts" },
    { href: "/paperwork/expense-report", icon: Calculator, label: "Expenses" },
  ],
  developer: [
    { href: categoryHref("json-tools"), icon: Braces, label: "JSON tools" },
    { href: categoryHref("csv-data-tools"), icon: Table2, label: "CSV tools" },
    { href: categoryHref("web-markup-tools"), icon: Code2, label: "Web tools" },
  ],
} as const;

function ToolIcon({ app, name }: { app: ToolApp; name: string }) {
  const Icon =
    app === "media"
      ? FileImage
      : app === "devtools"
        ? name.toLowerCase().includes("csv")
          ? Table2
          : Braces
        : name.toLowerCase().includes("receipt")
          ? ReceiptText
          : FileText;

  return (
    <span aria-hidden="true" className="auth-search-result-icon">
      <Icon />
    </span>
  );
}

/**
 * `tools` is the database-backed catalogue, resolved server-side by
 * `getTools()` and handed down as a prop: this is a client component, and a
 * tool's public URL is only ever `tool.href`, never derived from a folder name.
 */
export function AuthDiscoveryNavigation({
  projects,
  tools,
}: {
  projects: AuthProjectPaths;
  tools: readonly CatalogTool[];
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuName>(null);
  const [activeResult, setActiveResult] = useState(0);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const stableQuery = useDeferredValue(query);
  const isSearching = query !== stableQuery;

  const { results, searchError } = useMemo(() => {
    const normalized = stableQuery.trim().toLowerCase();
    if (!normalized) return { results: [], searchError: false };

    try {
      return {
        results: searchTools(tools, normalized),
        searchError: false,
      };
    } catch {
      return { results: [], searchError: true };
    }
  }, [searchAttempt, stableQuery, tools]);

  useEffect(() => {
    if (!searchOpen || isSearching) return;
    rootRef.current
      ?.querySelector<HTMLAnchorElement>('.auth-search-result[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeResult, isSearching, results, searchOpen]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
        setOpenMenu(null);
      }
    }

    function handleShortcut(event: KeyboardEvent) {
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleShortcut);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  const documentsActive =
    pathname.startsWith("/paperwork/invoice-generator") || pathname.startsWith("/paperwork/receipt-generator");
  const businessActive = pathname === projects.paperwork || (pathname.startsWith("/paperwork/") && !documentsActive);

  function toggleMenu(menu: Exclude<MenuName, null>) {
    setSearchOpen(false);
    setOpenMenu((current) => (current === menu ? null : menu));
  }

  function moveMenuFocus(event: ReactKeyboardEvent<HTMLButtonElement>, menu: Exclude<MenuName, null>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpenMenu(menu);
      requestAnimationFrame(() => {
        rootRef.current?.querySelector<HTMLAnchorElement>(`[data-menu="${menu}"] a`)?.focus();
      });
    }
  }

  return (
    <div className="auth-discovery" ref={rootRef}>
      <div className="auth-search-wrap">
        <div
          className="auth-search"
          data-open={searchOpen || undefined}
          role="combobox"
          aria-controls="auth-tool-search-results"
          aria-expanded={searchOpen}
          aria-haspopup="listbox"
        >
          {isSearching ? (
            <LoaderCircle aria-hidden="true" className="auth-search-spinner" />
          ) : (
            <Search aria-hidden="true" />
          )}
          <input
            aria-autocomplete="list"
            aria-label="Search all SmartTools"
            autoComplete="off"
            onChange={(event) => {
              const value = event.currentTarget.value;
              setQuery(value);
              setActiveResult(0);
              setSearchOpen(true);
              setOpenMenu(null);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearchOpen(false);
                searchRef.current?.blur();
              } else if (event.key === "ArrowDown" && results.length > 0) {
                event.preventDefault();
                setActiveResult((current) => Math.min(current + 1, results.length - 1));
              } else if (event.key === "ArrowUp" && results.length > 0) {
                event.preventDefault();
                setActiveResult((current) => Math.max(current - 1, 0));
              } else if (event.key === "Enter" && results[activeResult]) {
                window.location.assign(results[activeResult].href);
              }
            }}
            placeholder="Search 150+ tools"
            ref={searchRef}
            value={query}
          />
          {query ? (
            <button
              aria-label="Clear search"
              className="auth-search-clear"
              onClick={() => {
                setQuery("");
                setActiveResult(0);
                searchRef.current?.focus();
              }}
              type="button"
            >
              <X aria-hidden="true" />
            </button>
          ) : (
            <kbd aria-label="Keyboard shortcut: slash">
              <Caption>/</Caption>
            </kbd>
          )}
        </div>

        {searchOpen && query.trim() ? (
          <div className="auth-search-popover" id="auth-tool-search-results">
            {isSearching ? (
              <div aria-live="polite" className="auth-search-loading" role="status">
                {[0, 1, 2].map((item) => (
                  <span className="auth-search-skeleton" key={item}>
                    <i />
                    <b />
                  </span>
                ))}
                <Text className="sr-only">Searching tools</Text>
              </div>
            ) : searchError ? (
              <div aria-live="polite" className="auth-search-error" role="status">
                <AlertTriangle aria-hidden="true" />
                <Strong>Search is temporarily unavailable</Strong>
                <Text>Try again, or clear your search and use a category.</Text>
                <button onClick={() => setSearchAttempt((attempt) => attempt + 1)} type="button">
                  <Caption>Try again</Caption>
                </button>
              </div>
            ) : results.length > 0 ? (
              <>
                <P className="auth-search-count">
                  {results.length} {results.length === 1 ? "result" : "results"} for “{stableQuery}”
                </P>
                <div aria-label="Tool search results" role="listbox">
                  {results.map((tool, index) => (
                    <TextLink
                      aria-selected={index === activeResult}
                      className="auth-search-result"
                      href={tool.href}
                      key={tool.toolId}
                      onMouseEnter={() => setActiveResult(index)}
                      role="option"
                    >
                      <ToolIcon app={tool.app} name={tool.name} />
                      <span>
                        <Strong>{tool.name}</Strong>
                        <Small>{TOOL_CATEGORIES[tool.category].label}</Small>
                      </span>
                    </TextLink>
                  ))}
                </div>
              </>
            ) : (
              <div aria-live="polite" className="auth-search-empty" role="status">
                <SearchX aria-hidden="true" />
                <Strong>No tools match “{stableQuery}”</Strong>
                <Text>Check spelling, try “invoice”, or clear the query.</Text>
                <button onClick={() => searchRef.current?.select()} type="button">
                  <Caption>Edit search</Caption>
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <nav aria-label="Tool categories" className="auth-category-nav">
        <TextLink aria-current={pathname === "/" ? "page" : undefined} href="/">
          All tools
        </TextLink>
        <span className="auth-category-menu">
          <button
            aria-expanded={openMenu === "documents"}
            aria-haspopup="menu"
            className={documentsActive ? "is-active" : undefined}
            onClick={() => toggleMenu("documents")}
            onKeyDown={(event) => moveMenuFocus(event, "documents")}
            type="button"
          >
            <Caption>Documents </Caption>
            <ChevronDown aria-hidden="true" />
          </button>
          {openMenu === "documents" ? <CategoryMenu menu="documents" onClose={() => setOpenMenu(null)} /> : null}
        </span>
        <span className="auth-category-menu">
          <button
            aria-expanded={openMenu === "developer"}
            aria-haspopup="menu"
            className={pathname.startsWith("/devtools") ? "is-active" : undefined}
            onClick={() => toggleMenu("developer")}
            onKeyDown={(event) => moveMenuFocus(event, "developer")}
            type="button"
          >
            <Caption>Developer </Caption>
            <ChevronDown aria-hidden="true" />
          </button>
          {openMenu === "developer" ? <CategoryMenu menu="developer" onClose={() => setOpenMenu(null)} /> : null}
        </span>
        <TextLink aria-current={businessActive ? "page" : undefined} href={projects.paperwork}>
          Business
        </TextLink>
      </nav>
    </div>
  );
}

function CategoryMenu({ menu, onClose }: { menu: Exclude<MenuName, null>; onClose: () => void }) {
  return (
    <div className="auth-category-popover" data-menu={menu} role="menu">
      {categoryMenus[menu].map(({ href, icon: Icon, label }) => (
        <TextLink
          href={href}
          key={href}
          onKeyDown={(event) => {
            const links = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
            const index = links.indexOf(event.currentTarget);
            if (event.key === "Escape") {
              onClose();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              links[(index + 1) % links.length]?.focus();
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              links[(index - 1 + links.length) % links.length]?.focus();
            }
          }}
          role="menuitem"
        >
          <Icon aria-hidden="true" />
          {label}
        </TextLink>
      ))}
    </div>
  );
}
