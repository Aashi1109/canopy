"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowUpRight, Search } from "lucide-react";
import { ToolIcon } from "@/components/ToolIcon";
import { ToolCard } from "@/components/ui/index";
import { Button } from "@/components/ui/components/button";
import { Input } from "@/components/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/components/tabs";
import { searchTools } from "@/lib/tool-catalog/index";
import type { PublicTool } from "@/lib/tool-framework/catalog";
import styles from "./ToolCollection.module.css";

type CollectionTool = Pick<PublicTool, "toolId" | "name" | "description" | "href" | "app" | "keywords" | "icon">;
type Category = "all" | CollectionTool["app"];

const CATEGORIES = [
  { value: "all", label: "All tools" },
  { value: "devtools", label: "Developer" },
  { value: "media", label: "Media" },
  { value: "paperwork", label: "Paperwork" },
] as const;

const CATEGORY_LABELS = { devtools: "Developer", media: "Media", paperwork: "Paperwork" } as const;

export function ToolCollection({
  tools,
  unavailable = false,
}: {
  tools: readonly CollectionTool[];
  unavailable?: boolean;
}) {
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(6);
  const reduceMotion = useReducedMotion();
  const searchableTools = useMemo(
    () => tools.map((tool) => ({ ...tool, category: CATEGORY_LABELS[tool.app] })),
    [tools],
  );
  const searchResults = useMemo(() => searchTools(searchableTools, query), [searchableTools, query]);
  const matches = useMemo(() => {
    if (category !== "all") return searchResults.filter((tool) => tool.app === category);
    if (query.trim()) return searchResults;
    // Give each collection room in the opening view, preserving its catalog order.
    const collections = CATEGORIES.filter((item) => item.value !== "all").map((item) =>
      searchResults.filter((tool) => tool.app === item.value),
    );
    return Array.from({ length: Math.max(0, ...collections.map((items) => items.length)) }, (_, index) =>
      collections.flatMap((items) => (items[index] ? [items[index]] : [])),
    ).flat();
  }, [searchResults, category, query]);
  const visibleTools = matches.slice(0, visibleCount);
  const suggestions = ["JSON", "PDF", "Invoice"].filter((term) => searchTools(searchableTools, term).length > 0);

  function resetFilters() {
    setQuery("");
    setCategory("all");
    setVisibleCount(6);
  }

  return (
    <section id="tools" className={styles.section} aria-labelledby="tool-collection-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>
            <span aria-hidden="true" /> THE TOOL COLLECTION
          </p>
          <h2 id="tool-collection-heading">
            Find your
            <br />
            next shortcut.
          </h2>
        </div>
        {!unavailable && tools.length > 0 && (
          <div className={styles.search}>
            <label htmlFor="new-tool-search">What’s on your to-do list?</label>
            <Input
              id="new-tool-search"
              type="search"
              size="lg"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleCount(6);
              }}
              placeholder="Search a tool or task…"
              leadingIcon={<Search />}
              className={styles.searchInput}
            />
            {suggestions.length > 0 && (
              <div className={styles.suggestions}>
                <span>Try</span>
                {suggestions.map((term) => (
                  <Button
                    key={term}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setQuery(term);
                      setCategory("all");
                      setVisibleCount(6);
                    }}
                  >
                    {term}
                    <ArrowUpRight aria-hidden="true" />
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {unavailable || tools.length === 0 ? (
        <div className={styles.empty}>
          <h3>{unavailable ? "The collection is taking a moment." : "Start with what you want to do."}</h3>
          <p>
            {unavailable
              ? "We couldn’t load the tools right now. Try reloading, or explore a category below."
              : "Explore our spaces for code, files, and everyday paperwork."}
          </p>
          <div className={styles.recovery}>
            {unavailable && (
              <Button variant="outline" size="md" onClick={() => window.location.reload()}>
                Reload collection
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
          onValueChange={(value) => {
            setCategory(value as Category);
            setVisibleCount(6);
          }}
          className={styles.tabs}
        >
          <div className={styles.toolbar}>
            <TabsList aria-label="Tool categories" className={styles.categories}>
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
                    {item.label}
                    <span className={styles.categoryCount} aria-hidden="true">
                      {count}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <span className={styles.collectionNote}>A little less busywork.</span>
          </div>
          <div className={styles.resultsLine}>
            <p role="status" aria-live="polite">
              {query.trim()
                ? `${matches.length} ${matches.length === 1 ? "result" : "results"} for “${query.trim()}”`
                : category === "all"
                  ? "A few from every collection. Pick a task and jump in."
                  : `${matches.length} ${CATEGORY_LABELS[category].toLowerCase()} tools to make light work of it.`}
            </p>
            {(query || category !== "all") && (
              <Button variant="link" size="sm" onClick={resetFilters} className={styles.clear}>
                Clear filters
              </Button>
            )}
          </div>
          <TabsContent value={category} className={styles.content}>
            {matches.length > 0 ? (
              <div className={styles.grid}>
                {visibleTools.map((tool, index) => (
                  <motion.div
                    key={tool.toolId}
                    initial={false}
                    animate={{ opacity: 1 }}
                    whileInView={reduceMotion ? undefined : { y: [12, 0] }}
                    viewport={{ once: true, amount: 0.1 }}
                    transition={{ duration: 0.35, delay: Math.min(index % 9, 5) * 0.025 }}
                    className={styles.cardWrap}
                  >
                    <ToolCard
                      href={tool.href}
                      title={tool.name}
                      description={tool.description}
                      icon={<ToolIcon icon={tool.icon} />}
                      status={<span className={styles.cardCategory}>{CATEGORY_LABELS[tool.app]}</span>}
                      action={
                        <>
                          <span>Open tool</span>
                          <ArrowUpRight aria-hidden="true" />
                        </>
                      }
                      className={styles.card}
                    />
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <Search aria-hidden="true" className={styles.emptyIcon} />
                <h3>No shortcut found. Yet.</h3>
                <p>Try a shorter search or explore another category.</p>
                <Button variant="outline" size="md" onClick={resetFilters}>
                  Show all tools
                </Button>
              </div>
            )}
            {matches.length > visibleTools.length && (
              <div className={styles.more}>
                <p>
                  Showing {visibleTools.length} of {matches.length} tools
                </p>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setVisibleCount((count) => count + 6)}
                  className={styles.moreButton}
                >
                  Show {Math.min(6, matches.length - visibleTools.length)} more
                  <ArrowDown aria-hidden="true" />
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
