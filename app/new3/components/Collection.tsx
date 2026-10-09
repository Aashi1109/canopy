"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowUpRight, Search } from "lucide-react";
import { Button, ToolCard } from "@/components/ui";
import { Input } from "@/components/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/components/tabs";
import { ToolIcon } from "@/components/ToolIcon";
import { searchTools } from "@/lib/tool-catalog/index";
import type { PublicTool } from "@/lib/tool-framework/catalog";
import styles from "../new3.module.css";

type CollectionTool = Pick<PublicTool, "toolId" | "name" | "description" | "href" | "app" | "icon" | "keywords">;
type Category = "all" | CollectionTool["app"];
const CATEGORIES = [
  { id: "all", name: "Everything" },
  { id: "devtools", name: "Code & data" },
  { id: "media", name: "Images & files" },
  { id: "paperwork", name: "Paperwork" },
] as const;
const CATEGORY_NAMES = { devtools: "Developer", media: "Media", paperwork: "Paperwork" };

export function Collection({ tools, unavailable }: { tools: readonly CollectionTool[]; unavailable: boolean }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [limit, setLimit] = useState(8);
  const reduced = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const nextFocusRef = useRef<number | null>(null);
  const searchable = useMemo(() => tools.map((tool) => ({ ...tool, category: CATEGORY_NAMES[tool.app] })), [tools]);
  const searched = useMemo(() => searchTools(searchable, query), [searchable, query]);
  const matches = category === "all" ? searched : searched.filter((tool) => tool.app === category);
  const visible = matches.slice(0, limit);
  useEffect(() => {
    if (nextFocusRef.current === null) return;
    listRef.current?.children[nextFocusRef.current]?.querySelector("a")?.focus();
    nextFocusRef.current = null;
  }, [limit]);

  function reset() {
    setQuery("");
    setCategory("all");
    setLimit(8);
  }

  return (
    <section id="collection" className={styles.collection} aria-labelledby="collection-heading">
      <motion.div
        className={styles.collectionHeading}
        initial={reduced ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: reduced ? 0 : 0.6 }}
      >
        <div>
          <p className={styles.eyebrow}>01 / THE COLLECTION</p>
          <h2 id="collection-heading">
            A tool for that.
            <br />
            <em>And that, too.</em>
          </h2>
        </div>
        <div className={styles.search}>
          <label htmlFor="new3-search">What would you like to do?</label>
          <Input
            id="new3-search"
            type="search"
            size="lg"
            leadingIcon={<Search aria-hidden="true" />}
            placeholder="Try JSON, resize, or invoice"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(8);
            }}
            className={styles.searchInput}
          />
        </div>
      </motion.div>
      {unavailable || !tools.length ? (
        <div className={styles.empty}>
          <h3>{unavailable ? "The collection needs another moment." : "Start with a collection."}</h3>
          <p>
            {unavailable
              ? "Try loading the tools again, or explore a category directly."
              : "Explore code, media, and paperwork tools below."}
          </p>
          <div>
            {unavailable && (
              <Button variant="outline" onClick={() => window.location.reload()}>
                Try again
              </Button>
            )}
            {CATEGORIES.filter((item) => item.id !== "all").map((item) => (
              <Button asChild variant="ghost" key={item.id}>
                <a href={`/${item.id}`}>
                  {item.name}
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
            setLimit(8);
          }}
          className={styles.collectionTabs}
        >
          <div className={styles.collectionToolbar}>
            <TabsList aria-label="Browse tool collections" className={styles.collectionCategories}>
              {CATEGORIES.map((item) => (
                <TabsTrigger key={item.id} value={item.id} className={styles.collectionCategory}>
                  {item.name}
                  <span>
                    {item.id === "all" ? searched.length : searched.filter((tool) => tool.app === item.id).length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            <p role="status" aria-live="polite" className={styles.resultCount}>
              {matches.length} {matches.length === 1 ? "tool" : "tools"}
              {query ? " found" : " at your fingertips"}
            </p>
          </div>
          <TabsContent value={category}>
            {matches.length ? (
              <div className={styles.toolList} ref={listRef}>
                {visible.map((tool) => (
                  <ToolCard
                    key={tool.toolId}
                    href={tool.href}
                    title={tool.name}
                    description={tool.description}
                    icon={<ToolIcon icon={tool.icon} />}
                    action={
                      <>
                        <span>
                          Open tool<span className="sr-only">: {tool.name}</span>
                        </span>
                        <ArrowUpRight aria-hidden="true" />
                      </>
                    }
                    className={styles.toolRow}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <h3>No tools found for “{query.trim()}”.</h3>
                <p>Try a shorter search or explore the full collection.</p>
                <Button variant="outline" onClick={reset}>
                  Show all tools
                </Button>
              </div>
            )}
            <div className={styles.collectionBottom}>
              <span>
                {query || category !== "all" ? (
                  <Button variant="link" onClick={reset}>
                    Clear filters
                  </Button>
                ) : (
                  "A little help goes a long way."
                )}
              </span>
              {matches.length > visible.length && (
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => {
                    nextFocusRef.current = visible.length;
                    setLimit((value) => value + 8);
                  }}
                >
                  Discover {Math.min(8, matches.length - visible.length)} more
                  <ArrowDown aria-hidden="true" />
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
