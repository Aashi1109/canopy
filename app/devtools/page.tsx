import { CanopyFooter } from "@/components/canopy/CanopyFooter";
import { ToolIcon } from "@/components/ToolIcon";
import {
  categoriesForApp,
  FEATURED_TOOL_IDS,
  TOOL_CATEGORIES,
  type CategoryKey,
} from "@/lib/tool-framework/categories";
import { getTools, type CatalogTool } from "@/lib/tool-framework/catalog";
import { getOptionalSession } from "@canopy/auth/session";
import { getToolIcons, type ToolIconRow } from "@canopy/database";
import {
  Caption,
  Display,
  H2,
  Lead,
  Muted,
  Overline,
  Strong,
  Text,
  TextLink,
  AccountNavigation,
  AppContainer,
  Button,
  CatalogCard,
  EmptyState,
  IconTile,
  Input,
  InlineGuidance,
  ProductHeader,
  SectionHeading,
  buttonVariants,
} from "@canopy/ui";
import { ArrowLeft, ArrowRight, ArrowUpRight, LayoutGrid, LockKeyhole, Search, ShieldCheck } from "lucide-react";
import { headers } from "next/headers";
import { CategoryFilter } from "./components/CategoryFilter";

const SECTION_HEADING_CLASS = "mb-8 items-end";

type IconRows = Readonly<Record<string, ToolIconRow>>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function isCategory(value: string): value is CategoryKey {
  return Object.hasOwn(TOOL_CATEGORIES, value);
}

function ToolCard({ icons, tool }: { icons: IconRows; tool: CatalogTool }) {
  return (
    <CatalogCard
      action={
        <>
          Open tool
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </>
      }
      className="min-h-48 rounded-[1.25rem] p-5 shadow-none duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg [&>span:last-child]:inline-flex [&>span:last-child]:items-center [&>span:last-child]:gap-1.5"
      description={tool.description}
      href={`/devtools/${tool.slug}`}
      icon={<ToolIcon name={tool.name} row={icons[tool.toolId] ?? null} toolId={tool.toolId} />}
      title={tool.name}
    />
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requestHeaders = await headers();
  const params = await searchParams;
  const query = first(params.q).trim().slice(0, 80);
  const requestedCategory = first(params.category).slice(0, 80);
  const [tools, icons, session] = await Promise.all([
    getTools("devtools"),
    getToolIcons(),
    getOptionalSession(requestHeaders),
  ]);
  const category = isCategory(requestedCategory) ? requestedCategory : "";
  const normalizedQuery = query.toLocaleLowerCase();
  const filteredTools = tools.filter(
    (tool) =>
      (!category || tool.category === category) &&
      (!normalizedQuery ||
        `${tool.name} ${tool.description} ${tool.keywords.join(" ")}`.toLocaleLowerCase().includes(normalizedQuery)),
  );
  // Featured ordering is per-deployment data, not code. Until it has a home
  // beside `sort_order`, `FEATURED_TOOL_IDS` is empty and these sections
  // simply do not render.
  const featuredTools = FEATURED_TOOL_IDS.flatMap((toolId) => tools.filter((tool) => tool.toolId === toolId));
  const availableCategories = categoriesForApp("devtools")
    .map((key) => ({
      count: tools.filter((tool) => tool.category === key).length,
      description: TOOL_CATEGORIES[key].description,
      key,
      label: TOOL_CATEGORIES[key].label,
    }))
    .filter(({ count }) => count > 0);
  const hasFilter = Boolean(query || category);
  const showAllTools = !hasFilter && (first(params.view) === "all" || featuredTools.length === 0);
  const categoryLabel = category ? TOOL_CATEGORIES[category].label : "";
  const searchForm = (
    <form
      className="flex w-full items-center gap-2 rounded-2xl border border-input bg-background p-1.5 shadow-sm transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10"
      method="get"
      role="search"
    >
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Search developer tools"
          className="h-12 border-0 bg-transparent pl-11 shadow-none"
          defaultValue={query}
          name="q"
          placeholder="Search JSON, CSV, JWT…"
          type="search"
        />
      </div>
      <Button className="h-12 rounded-xl px-5" type="submit">
        Search
      </Button>
    </form>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ProductHeader
        account={{ returnTo: "/devtools", user: session?.user ?? null }}
        actions={<AccountNavigation returnTo="/devtools" user={session?.user ?? null} />}
        className="sticky top-0 z-50 bg-card/90 supports-[backdrop-filter]:bg-card/85 supports-[backdrop-filter]:backdrop-blur-xl"
        href="/devtools"
        name="Devtools"
      />

      <main>
        {hasFilter || showAllTools ? (
          <section className="border-b border-border bg-card">
            <AppContainer className="grid gap-6 py-8 sm:py-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(26rem,1.2fr)] lg:items-end">
              <div>
                <Overline className="block text-primary">Devtools catalog</Overline>
                <Display className="mt-2">Find the right tool.</Display>
              </div>
              {searchForm}
            </AppContainer>
          </section>
        ) : (
          <section className="overflow-hidden border-b border-border bg-card">
            <AppContainer className="py-12 sm:py-16 lg:py-20">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1.12fr)_minmax(26rem,0.88fr)] lg:items-end lg:gap-16">
                <div>
                  <Overline className="block text-primary">{tools.length} focused tools. No sign-up.</Overline>
                  <Display className="mt-5 max-w-4xl">
                    The useful side of <span className="text-primary">your browser.</span>
                  </Display>
                </div>
                <div className="lg:pb-1">
                  <Muted className="max-w-xl text-muted-foreground">
                    Format, convert, inspect, and generate working data without accounts, uploads, or waiting.
                  </Muted>
                  <div className="mt-7">{searchForm}</div>
                  <InlineGuidance className="mt-4" icon={<ShieldCheck aria-hidden="true" />}>
                    Core tools process your content locally in this browser.
                  </InlineGuidance>
                </div>
              </div>

              <nav
                aria-label="Quick tools"
                className="mt-12 overflow-hidden rounded-2xl border border-border bg-border lg:mt-16"
              >
                <div className="flex min-h-12 items-center justify-between gap-4 bg-background px-4">
                  <Overline className="block text-muted-foreground">Popular now</Overline>
                  <TextLink
                    className="inline-flex min-h-11 items-center gap-1.5 text-primary outline-none hover:underline focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    href="/devtools?view=all"
                  >
                    All tools
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </TextLink>
                </div>
                <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {featuredTools.slice(0, 6).map((tool, index) => (
                    <TextLink
                      className="no-underline group flex min-h-24 flex-col justify-between bg-card p-4 text-card-foreground outline-none transition-colors hover:bg-accent focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      href={`/devtools/${tool.slug}`}
                      key={tool.toolId}
                    >
                      <Caption className="text-muted-foreground">{String(index + 1).padStart(2, "0")}</Caption>
                      <Text className="flex items-end justify-between gap-3">
                        {tool.name}
                        <ArrowUpRight
                          aria-hidden="true"
                          className="size-4 shrink-0 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                        />
                      </Text>
                    </TextLink>
                  ))}
                </div>
              </nav>
            </AppContainer>
          </section>
        )}

        {hasFilter || showAllTools ? (
          <section className="py-12 sm:py-16">
            <AppContainer>
              <TextLink
                className="mb-5 inline-flex min-h-11 items-center gap-2 text-muted-foreground outline-none hover:text-foreground focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                href={category && !query ? "/devtools?view=all" : "/devtools"}
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                {showAllTools ? "Back to Devtools" : category && !query ? "All tools" : "Clear search"}
              </TextLink>
              <SectionHeading
                action={
                  showAllTools || category ? (
                    <CategoryFilter
                      categories={availableCategories.map(({ key, label }) => ({
                        label,
                        value: key,
                      }))}
                      value={category}
                    />
                  ) : null
                }
                className={`${SECTION_HEADING_CLASS} flex-col items-stretch sm:flex-row sm:items-end`}
                description={
                  showAllTools && !category && !query
                    ? "Browse every available developer tool in one place."
                    : query
                      ? `Matching “${query}”${categoryLabel ? ` in ${categoryLabel}` : ""}.`
                      : `Tools in ${categoryLabel}.`
                }
                title={
                  showAllTools && !category && !query
                    ? "All Tools"
                    : category && !query
                      ? categoryLabel
                      : "Search Results"
                }
              />
              {filteredTools.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredTools.map((tool) => (
                    <ToolCard icons={icons} key={tool.toolId} tool={tool} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  action={
                    <a className={buttonVariants()} href="/devtools">
                      {showAllTools ? "Back" : "Browse all tools"}
                    </a>
                  }
                  description={
                    showAllTools
                      ? "There are no developer tools available right now."
                      : "Try another search or category. More tools are being added one by one."
                  }
                  title="No available tools found"
                />
              )}
            </AppContainer>
          </section>
        ) : (
          <>
            <section className="py-14 sm:py-20" id="popular-tools">
              <AppContainer>
                <SectionHeading
                  action={
                    <a
                      className={buttonVariants({
                        className: "h-11",
                        variant: "outline",
                      })}
                      href="/devtools?view=all"
                    >
                      View all tools
                    </a>
                  }
                  className={SECTION_HEADING_CLASS}
                  description="A short list of dependable utilities for common developer work."
                  eyebrow="Start here"
                  title="Popular Tools"
                />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {featuredTools.map((tool) => (
                    <ToolCard icons={icons} key={tool.toolId} tool={tool} />
                  ))}
                </div>
              </AppContainer>
            </section>

            <section className="border-y border-border bg-card py-14 sm:py-20">
              <AppContainer>
                <SectionHeading
                  className={SECTION_HEADING_CLASS}
                  description="Go straight to the kind of work you need to do."
                  eyebrow="Tool index"
                  title="Browse by Category"
                />
                <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
                  {availableCategories.map(({ count, description, key, label }) => (
                    <TextLink
                      className="no-underline group flex min-h-28 items-start gap-4 bg-card p-5 text-card-foreground outline-none transition-colors hover:bg-accent focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset lg:last:col-span-2"
                      href={`/devtools?category=${encodeURIComponent(key)}`}
                      key={key}
                    >
                      <IconTile className="rounded-xl group-hover:bg-background" size="sm">
                        <LayoutGrid aria-hidden="true" className="size-5" />
                      </IconTile>
                      <span className="min-w-0 flex-1">
                        <Strong className="block">{label}</Strong>
                        <Text className="mt-1 block text-muted-foreground">{description}</Text>
                        <Caption className="mt-2 block text-primary">
                          {count} {count === 1 ? "tool" : "tools"}
                        </Caption>
                      </span>
                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
                      />
                    </TextLink>
                  ))}
                </div>
              </AppContainer>
            </section>

            <section className="py-14 sm:py-20">
              <AppContainer>
                <div className="flex flex-col gap-8 overflow-hidden rounded-[1.75rem] bg-card-foreground px-6 py-8 text-card sm:px-10 sm:py-10 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex max-w-3xl items-start gap-5">
                    <IconTile className="size-12 rounded-2xl bg-primary text-primary-foreground">
                      <LockKeyhole aria-hidden="true" className="size-6" />
                    </IconTile>
                    <div>
                      <Overline className="block text-primary">Private by default</Overline>
                      <H2 className="mt-2">Your working data stays yours.</H2>
                      <Lead className="mt-3 max-w-2xl text-card/70">
                        Core formatting and conversion happens locally in your browser. No file upload or account is
                        required.
                      </Lead>
                    </div>
                  </div>
                  <a className={buttonVariants({ size: "lg" })} href="/devtools?view=all">
                    Browse all {tools.length} tools
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </a>
                </div>
              </AppContainer>
            </section>
          </>
        )}
      </main>

      <CanopyFooter />
    </div>
  );
}
