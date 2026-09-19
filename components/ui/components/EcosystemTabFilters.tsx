"use client";
import { Caption, Strong } from "./typography.tsx";

import { ArrowUpRight, ChevronDown, ChevronRight, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils.ts";

type ToolIcon = { kind: "svg"; svg: string } | { kind: "url"; url: string };
type ToolPreview = { href: string; icon: ToolIcon; name: string; toolId: string };
type CategoryPreview = { count: number; href: string; label: string };
type Ecosystem = {
  categories: readonly CategoryPreview[];
  count: number;
  href: string;
  id: string;
  label: string;
  tools: readonly ToolPreview[];
};

const FALLBACK_GROUPS: readonly Ecosystem[] = [
  { categories: [], count: 0, href: "/paperwork", id: "documents", label: "Documents", tools: [] },
  { categories: [], count: 0, href: "/devtools", id: "developer", label: "Developer", tools: [] },
  { categories: [], count: 0, href: "/media", id: "media", label: "Media", tools: [] },
];

export function useEcosystemGroups(enabled = true) {
  const [groups, setGroups] = useState<readonly Ecosystem[]>(FALLBACK_GROUPS);

  useEffect(() => {
    if (!enabled) return;
    fetch("/api/tools/ecosystem")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load categories");
        return response.json() as Promise<{ groups: Ecosystem[] }>;
      })
      .then(({ groups: nextGroups }) => setGroups(nextGroups))
      .catch(() => setGroups(FALLBACK_GROUPS));
  }, [enabled]);

  return groups;
}

export function EcosystemTabFilters({ currentHref, className }: { currentHref?: string; className?: string }) {
  const groups = useEcosystemGroups();
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <nav
      aria-label="Tool suites"
      className={cn(
        "relative hidden h-[46px] shrink-0 items-center gap-0.5 rounded-full border border-border bg-card p-[5px] font-caption text-xs font-semibold md:flex",
        className,
      )}
    >
      <a
        className="rounded-full px-[13px] py-2.5 text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
        href="/"
      >
        All tools
      </a>
      {groups.map((group) => (
        <span
          className="static xl:relative"
          key={group.id}
          onMouseEnter={() => setActiveId(group.id)}
          onMouseLeave={() => setActiveId(null)}
        >
          <a
            aria-expanded={activeId === group.id}
            aria-haspopup="menu"
            className="inline-flex items-center gap-1.5 rounded-full px-[13px] py-2.5 text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
            href={group.href}
            onFocus={() => setActiveId(group.id)}
          >
            {group.label} <ChevronDown aria-hidden="true" className="size-3" />
          </a>
          {activeId === group.id ? <EcosystemMenu group={group} onClose={() => setActiveId(null)} /> : null}
        </span>
      ))}
      <a
        aria-current={currentHref === "/blog" ? "page" : undefined}
        className="rounded-full px-[13px] py-2.5 text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-accent aria-[current=page]:text-primary"
        href="/blog"
      >
        Blog
      </a>
    </nav>
  );
}

function EcosystemMenu({ group, onClose }: { group: Ecosystem; onClose: () => void }) {
  const showsCategories = group.id !== "documents" && group.categories.length > 0;

  return (
    <div
      className="absolute top-full left-1/2 z-50 w-[390px] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden xl:top-[36px] xl:left-0 xl:translate-x-0 rounded-xl border border-border bg-card p-3 shadow-[0_16px_40px_rgb(17_18_20_/_14%)]"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onClose();
      }}
      role="menu"
    >
      <div className="flex items-start justify-between pb-2">
        <div>
          <Strong className="block text-foreground">{group.label} tools</Strong>
          <Caption className="mt-0.5 block text-muted-foreground">
            {showsCategories ? "Choose a category to see every tool." : "Create, complete, and export paperwork."}
          </Caption>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 font-caption text-overline font-normal text-muted-foreground">
          {group.count} tools
        </span>
      </div>
      {showsCategories ? (
        <CategoryList categories={group.categories} />
      ) : group.tools.length ? (
        <ToolPreviewList tools={group.tools} />
      ) : (
        <div className="flex min-h-20 items-center justify-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Loading tools
        </div>
      )}
      <a
        className="mt-2 flex items-center gap-1.5 font-caption text-caption font-semibold text-primary no-underline hover:underline"
        href={group.href}
      >
        View all {group.count} {group.label.toLowerCase()} tools{" "}
        <ArrowUpRight aria-hidden="true" className="size-3.5" />
      </a>
    </div>
  );
}

function ToolPreviewList({ tools }: { tools: readonly ToolPreview[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
      {tools.map((tool) => (
        <a
          className="group/preview flex min-h-9 min-w-0 items-center gap-2 rounded-md px-1.5 py-1 no-underline outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
          href={tool.href}
          key={tool.toolId}
          role="menuitem"
        >
          <PreviewIcon icon={tool.icon} />
          <Caption className="min-w-0 break-words text-foreground group-hover/preview:text-accent-foreground group-focus-visible/preview:text-accent-foreground">
            {tool.name}
          </Caption>
        </a>
      ))}
    </div>
  );
}

function CategoryList({ categories }: { categories: readonly CategoryPreview[] }) {
  const midpoint = Math.ceil(categories.length / 2);
  return (
    <div className="grid grid-cols-2 gap-x-3">
      {[categories.slice(0, midpoint), categories.slice(midpoint)].map((column, index) => (
        <div className="space-y-0.5" key={index}>
          {column.map((category) => (
            <a
              className="group/category flex min-h-7 items-center gap-1.5 rounded-md px-1 py-0.5 no-underline outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
              href={category.href}
              key={category.label}
              role="menuitem"
            >
              <Caption className="truncate text-muted-foreground group-hover/category:text-accent-foreground group-focus-visible/category:text-accent-foreground">
                {category.label}
              </Caption>
              <span className="ml-auto text-overline text-muted-foreground group-hover/category:text-accent-foreground group-focus-visible/category:text-accent-foreground">
                {category.count}
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-3 shrink-0 text-muted-foreground group-hover/category:text-accent-foreground group-focus-visible/category:text-accent-foreground"
              />
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}

export function PreviewIcon({ icon }: { icon: ToolIcon }) {
  return (
    <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-sm bg-accent">
      {icon.kind === "url" ? (
        <img alt="" className="size-full object-cover" crossOrigin="anonymous" src={icon.url} />
      ) : (
        <span className="size-full" dangerouslySetInnerHTML={{ __html: icon.svg }} />
      )}
    </span>
  );
}
