import { headers } from "next/headers";
import Image from "next/image";
import { getOptionalSession } from "@/lib/auth/session";
import { getTools } from "@/lib/tool-framework/catalog";
import { searchTools } from "@/lib/tool-catalog";
import { CanopyFooter } from "@/components/canopy/CanopyFooter";
import { CatalogListing } from "@/components/canopy/CatalogListing";
import { CatalogToolCard } from "@/components/canopy/CatalogToolCard";
import { FamilyToolSearch } from "@/components/ui/components/GlobalToolSearch";
import {
  AccountNavigation,
  AppContainer,
  Button,
  Display,
  EmptyState,
  Input,
  Lead,
  Overline,
  ProductHeader,
  SectionHeading,
  StatusBadge,
} from "@/components/ui/index.tsx";

export default async function DownloadersPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const params = await searchParams;
  const query = (Array.isArray(params.q) ? params.q[0] : (params.q ?? "")).trim().slice(0, 80);
  const [tools, session] = await Promise.all([getTools("downloaders"), getOptionalSession(await headers())]);
  const filtered = searchTools(tools, query);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ProductHeader
        href="/downloaders"
        name="Downloaders"
        account={{ returnTo: "/downloaders", user: session?.user ?? null }}
        actions={<AccountNavigation returnTo="/downloaders" user={session?.user ?? null} />}
      />
      <main>
        <section className="bg-muted/50 py-10 sm:py-12">
          <AppContainer className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <Overline className="text-primary">Downloaders</Overline>
              <Display className="mt-3 font-semibold leading-[1.05] tracking-[-1.8px] md:text-[54px]">
                Your videos.
                <br />
                <span className="text-primary">Ready to go.</span>
              </Display>
              <Lead className="mt-4 max-w-2xl text-muted-foreground">
                Save public videos from your favorite platforms.
              </Lead>
              <p className="mt-3 text-sm text-muted-foreground">
                Processed online. Save only what you own or have permission to use. Private and protected videos are not
                supported.
              </p>
              <FamilyToolSearch family="downloaders" initialQuery={query}>
                <form method="get" role="search" className="mt-6 flex max-w-xl gap-2">
                  <Input
                    type="search"
                    name="q"
                    defaultValue={query}
                    aria-label="Search downloaders"
                    placeholder="Search by platform…"
                    size="md"
                  />
                  <Button type="submit" size="md">
                    Search
                  </Button>
                </form>
              </FamilyToolSearch>
            </div>
            <Image
              src="/downloaders/hero.webp"
              alt=""
              width={1058}
              height={753}
              sizes="(min-width: 1024px) 529px, 320px"
              className="mx-auto h-auto w-full max-w-xs lg:max-w-[529px]"
            />
          </AppContainer>
        </section>
        <CatalogListing category="" query={query} className="py-8 sm:py-10">
          <AppContainer>
            <SectionHeading
              title={query ? "Search results" : "Choose your platform"}
              description={
                query
                  ? `Downloaders matching “${query}”.`
                  : "Each platform uses the same straightforward link-to-download flow."
              }
            />
            {filtered.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((tool) => (
                  <CatalogToolCard
                    key={tool.toolId}
                    tool={tool}
                    status={<StatusBadge variant="info">Online service</StatusBadge>}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={query ? "No matching downloaders" : "No downloaders are published yet"}
                description={
                  query
                    ? "Try another platform name or clear your search."
                    : "Downloaders appear here when enabled in the tool catalog."
                }
                action={
                  query ? (
                    <Button asChild variant="secondary">
                      <a href="/downloaders">Clear search</a>
                    </Button>
                  ) : undefined
                }
              />
            )}
          </AppContainer>
        </CatalogListing>
      </main>
      <CanopyFooter />
    </div>
  );
}
