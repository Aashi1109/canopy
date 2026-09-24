import { CatalogHero } from "@/components/canopy/CatalogHero";
import { CatalogListing } from "@/components/canopy/CatalogListing";
import { CanopyFooter } from "@/components/canopy/CanopyFooter";
import { ToolIcon } from "@/components/ToolIcon";
import { getTools, type CatalogTool } from "@/lib/tool-framework/catalog";
import { searchTools } from "@/lib/tool-catalog/index";
import { categoriesForApp, resolveCategoryKey, TOOL_CATEGORIES } from "@/lib/tool-framework/categories";
import { getOptionalSession } from "@/lib/auth/session.ts";
import {
  Caption,
  H2,
  Metric,
  Muted,
  Strong,
  TextLink,
  AccountNavigation,
  AppContainer,
  Button,
  Card,
  CatalogCard,
  EmptyState,
  IconTile,
  Input,
  ProductHeader,
  SectionHeading,
  StatusBadge,
  buttonVariants,
} from "@/components/ui/index.tsx";
import { LayoutGrid, LockKeyhole, Search, ShieldCheck, Zap } from "lucide-react";
import { headers } from "next/headers";

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function ToolCard({ tool }: { tool: CatalogTool }) {
  return (
    <CatalogCard
      action="Open tool →"
      description={tool.description}
      href={`/media/${tool.slug}`}
      icon={<ToolIcon icon={tool.icon} />}
      status={<StatusBadge variant="success">Browser only</StatusBadge>}
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
  const category = resolveCategoryKey(requestedCategory, "media");
  const [tools, session] = await Promise.all([getTools("media"), getOptionalSession(requestHeaders)]);
  const categoryLabel = category ? TOOL_CATEGORIES[category].label : "";
  const filteredTools = searchTools(
    tools.filter((tool) => !category || tool.category === category),
    query,
  );
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ProductHeader
        account={{ returnTo: "/media", user: session?.user ?? null }}
        actions={<AccountNavigation returnTo="/media" user={session?.user ?? null} />}
        href="/media"
        name="Media Tools"
      />

      <main>
        <CatalogHero suite="media" />
        <section aria-label="Find a media tool" className="bg-muted/50">
          <AppContainer className="py-6">
            <form
              className="mx-auto flex w-full max-w-2xl gap-2 rounded-2xl bg-card p-2 shadow-lg"
              method="get"
              role="search"
            >
              <div className="relative min-w-0 flex-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label="Search media tools"
                  className="border-0 pl-10 shadow-none focus-visible:ring-0"
                  defaultValue={query}
                  name="q"
                  placeholder="Search image and PDF tools…"
                  type="search"
                />
              </div>
              <Button type="submit" variant="default">
                Search
              </Button>
            </form>
          </AppContainer>
        </section>

        <section aria-label="Media Tools facts" className="border-b border-border bg-card">
          <AppContainer className="grid grid-cols-2 divide-x divide-y divide-border py-6 sm:grid-cols-4 sm:divide-y-0">
            {[
              [`${tools.length}`, "Enabled tools"],
              ["100%", "On-device"],
              ["1", "Shared worker runner"],
              ["0", "File uploads"],
            ].map(([value, label]) => (
              <div className="px-4 py-3 text-center" key={label}>
                <Metric className="block text-primary">{value}</Metric>
                <Caption className="mt-1 block text-muted-foreground">{label}</Caption>
              </div>
            ))}
          </AppContainer>
        </section>

        <CatalogListing category={category} className="pt-6 pb-14 sm:pb-16" query={query}>
          <AppContainer>
            <SectionHeading
              action={
                query || category ? (
                  <a className={buttonVariants({ size: "sm", variant: "outline" })} href="/media">
                    Clear filters
                  </a>
                ) : undefined
              }
              description={
                query
                  ? `Matching “${query}”${categoryLabel ? ` in ${categoryLabel}` : ""}.`
                  : category
                    ? `Enabled tools in ${categoryLabel}.`
                    : "Choose one focused workflow. Every operation stays in this browser."
              }
              title={query || category ? "Search results" : "All media tools"}
            />
            {filteredTools.length ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTools.map((tool) => (
                  <ToolCard key={tool.toolId} tool={tool} />
                ))}
              </div>
            ) : (
              <EmptyState
                action={
                  <a className={buttonVariants()} href="/media">
                    Browse all tools
                  </a>
                }
                description="Try another search or category. Disabled tools are intentionally hidden."
                title="No enabled tools found"
              />
            )}
          </AppContainer>
        </CatalogListing>

        <section className="border-y border-border bg-muted/50 py-14 sm:py-16">
          <AppContainer>
            <SectionHeading description="Jump directly to the file operation you need." title="Browse by category" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categoriesForApp("media").map((key) => {
                const count = tools.filter((tool) => tool.category === key).length;
                return (
                  <TextLink
                    className="no-underline text-foreground group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm outline-none transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    href={`/media?category=${encodeURIComponent(key)}`}
                    key={key}
                  >
                    <IconTile className="rounded-xl" size="sm">
                      <LayoutGrid aria-hidden="true" className="size-5" />
                    </IconTile>
                    <span className="min-w-0">
                      <Strong className="block group-hover:text-primary">{TOOL_CATEGORIES[key].label}</Strong>
                      <Caption className="mt-1 block text-muted-foreground">{TOOL_CATEGORIES[key].description}</Caption>
                      <Caption className="mt-2 block text-primary">{count} enabled</Caption>
                    </span>
                  </TextLink>
                );
              })}
            </div>
          </AppContainer>
        </section>

        <section className="py-14 sm:py-16">
          <AppContainer className="grid gap-6 lg:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: "Processed locally",
                description: "Files and previews never leave your device or enter application logs.",
              },
              {
                icon: Zap,
                title: "UI stays responsive",
                description: "Image and PDF work runs sequentially outside the page's UI thread.",
              },
              {
                icon: LockKeyhole,
                title: "No hidden storage",
                description: "No server API, IndexedDB, local storage, or service worker keeps your files.",
              },
            ].map(({ description, icon: Icon, title }) => (
              <Card className="gap-0 rounded-2xl shadow-none" key={title} role="article">
                <Icon aria-hidden="true" className="size-6 text-primary" />
                <H2 className="mt-4">{title}</H2>
                <Muted className="mt-2 text-muted-foreground">{description}</Muted>
              </Card>
            ))}
          </AppContainer>
        </section>
      </main>

      <CanopyFooter />
    </div>
  );
}
