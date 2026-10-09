"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, CodeXml, FileText, Grid2X2, Image, Search } from "lucide-react";
import { ToolIcon } from "@/components/ToolIcon";
import { ToolCard } from "@/components/ui/index";
import { Button } from "@/components/ui/components/button";
import { Input } from "@/components/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/components/tabs";
import { searchTools } from "@/lib/tool-catalog/index";
import type { PublicTool } from "@/lib/tool-framework/catalog";
import styles from "./ToolIndex.module.css";

type IndexTool = Pick<PublicTool, "toolId" | "name" | "description" | "href" | "app" | "keywords" | "icon">;
type Category = "all" | IndexTool["app"];

const CATEGORIES = [
  { value: "all", label: "All tools", icon: Grid2X2 },
  { value: "devtools", label: "Developer", icon: CodeXml },
  { value: "media", label: "Media", icon: Image },
  { value: "paperwork", label: "Paperwork", icon: FileText },
] as const;
const CATEGORY_LABELS = { devtools: "Developer", media: "Media", paperwork: "Paperwork" } as const;
const PAGE_SIZE = 8;

export function ToolIndex({ tools, unavailable = false }: { tools: readonly IndexTool[]; unavailable?: boolean }) {
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const indexRef = useRef<HTMLDivElement>(null);
  const firstNewToolRef = useRef<number | null>(null);
  const searchableTools = useMemo(
    () => tools.map((tool) => ({ ...tool, category: CATEGORY_LABELS[tool.app] })),
    [tools],
  );
  const searchResults = useMemo(() => searchTools(searchableTools, query), [searchableTools, query]);
  const matches = category === "all" ? searchResults : searchResults.filter((tool) => tool.app === category);
  const visibleTools = matches.slice(0, visibleCount);

  useEffect(() => {
    const firstNewTool = firstNewToolRef.current;
    if (firstNewTool === null) return;
    firstNewToolRef.current = null;
    indexRef.current?.children[firstNewTool]?.querySelector("a")?.focus();
  }, [visibleCount]);

  function clearFilters() {
    setQuery("");
    setCategory("all");
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <section id="tool-index" className={styles.section} aria-labelledby="tool-index-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>
            <span className={styles.sectionNumber}>01 /</span> THE COLLECTION
          </p>
          <h2 id="tool-index-heading">
            Find your next <em>shortcut.</em>
          </h2>
        </div>
        <p className={styles.headingNote}>A little less searching. A little more doing.</p>
      </div>

      {unavailable || tools.length === 0 ? (
        <div className={styles.empty}>
          <h3>{unavailable ? "The tools couldn’t load." : "Your next task starts here."}</h3>
          <p>
            {unavailable
              ? "Give the collection another try, or head straight to a category."
              : "Explore a category for tools that work with code, files, and paperwork."}
          </p>
          <div className={styles.recovery}>
            {unavailable && (
              <Button variant="outline" onClick={() => window.location.reload()}>
                Try again
              </Button>
            )}
            {CATEGORIES.filter((item) => item.value !== "all").map((item) => (
              <Button key={item.value} asChild variant="ghost" size="md">
                <a href={`/${item.value}`}>
                  {item.label}
                  <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <Tabs
          value={category}
          orientation="horizontal"
          onValueChange={(value) => {
            setCategory(value as Category);
            setVisibleCount(PAGE_SIZE);
          }}
          className={styles.tabs}
        >
          <div className={styles.toolbar}>
            <TabsList aria-label="Tool categories" className={styles.categories} variant="line">
              {CATEGORIES.map((item) => {
                const count =
                  item.value === "all"
                    ? searchResults.length
                    : searchResults.filter((tool) => tool.app === item.value).length;
                return (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className={styles.category}
                    aria-label={`${item.label}, ${count} tools`}
                  >
                    <item.icon className={styles.categoryIcon} aria-hidden="true" />
                    <span>{item.label}</span>
                    <span className={styles.count} aria-hidden="true">
                      {count}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <div className={styles.search}>
              <label htmlFor="new2-tool-search" className="sr-only">
                What are you working on?
              </label>
              <Input
                id="new2-tool-search"
                type="search"
                size="lg"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                placeholder="Find a tool…"
                leadingIcon={<Search />}
                className={styles.searchInput}
              />
            </div>
          </div>
          <div>
            <div className={styles.resultsLine}>
              <p role="status" aria-live="polite">
                {query.trim()
                  ? `${matches.length} ${matches.length === 1 ? "result" : "results"} for “${query.trim()}”`
                  : `Showing ${visibleTools.length} of ${matches.length} tools`}
              </p>
              {(query || category !== "all") && (
                <Button variant="link" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
            <TabsContent value={category} className={styles.content}>
              {matches.length > 0 ? (
                <div ref={indexRef} className={styles.index}>
                  {visibleTools.map((tool) => (
                    <div className={styles.row} key={tool.toolId}>
                      <ToolCard
                        href={tool.href}
                        title={tool.name}
                        description={tool.description}
                        icon={<ToolIcon icon={tool.icon} />}
                        status={<span className={styles.toolCategory}>{CATEGORY_LABELS[tool.app]}</span>}
                        action={
                          <>
                            <span>
                              Open tool<span className="sr-only">: {tool.name}</span>
                            </span>
                            <ArrowUpRight aria-hidden="true" />
                          </>
                        }
                        className={styles.tool}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>
                  <Search aria-hidden="true" className={styles.emptyIcon} />
                  <h3>No tools found for that one.</h3>
                  <p>Try a shorter search, choose another category, or start again with every tool.</p>
                  <Button variant="outline" size="md" onClick={clearFilters}>
                    Show all tools
                  </Button>
                </div>
              )}
              {matches.length > visibleTools.length && (
                <div className={styles.more}>
                  <p>Small tools. Plenty of possibilities.</p>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      firstNewToolRef.current = visibleTools.length;
                      setVisibleCount((count) => count + PAGE_SIZE);
                    }}
                    className={styles.moreButton}
                  >
                    Show {Math.min(PAGE_SIZE, matches.length - visibleTools.length)} more
                    <ArrowDown aria-hidden="true" />
                  </Button>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      )}
    </section>
  );
}
