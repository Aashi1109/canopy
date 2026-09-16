import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ZodError } from "zod";
import { ArrowRight, BookOpen, Search } from "lucide-react";
import { Button, Card, Caption, EmptyState, H1, H2, Input, Label, Overline, P, TextLink } from "@smarttools/ui";
import { BlogValidationError, blogImageUrl } from "@/lib/blog/document";
import { listPublishedBlogPosts, listPublishedBlogTaxonomy } from "@/lib/blog/queries";
import { BlogByline } from "./components/BlogTeaser";
import { BlogStories } from "./components/BlogStories";
import { BlogPageContainer } from "@/components/blog/BlogPageContainer";
import { blogListingHref, parseBlogFilters, type BlogFilters } from "./lib/filters";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  return {
    title: "SmartTools Blog — Less busywork. More know-how.",
    description: "Practical guides for documents, data, and everyday work from SmartTools.",
    alternates: { canonical: "/blog", types: { "application/rss+xml": "/blog/feed.xml" } },
    ...(Object.values(params).some(Boolean) ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function BlogPage({ searchParams }: Props) {
  let filters: BlogFilters;
  try { filters = parseBlogFilters(await searchParams); }
  catch (error) { if (error instanceof ZodError) notFound(); throw error; }
  const { categoryCursor, ...postFilters } = filters;
  const [posts, categories] = await Promise.all([
    listPublishedBlogPosts(postFilters),
    listPublishedBlogTaxonomy("category", { cursor: categoryCursor }),
  ]).catch(error => { if (error instanceof BlogValidationError || error instanceof ZodError) notFound(); throw error; });
  const filtered = Boolean(filters.search || filters.category || filters.tag);
  const featured = !filtered && !filters.cursor ? posts.items[0] : undefined;
  const activeCategory = categories.items.find(category => category.slug === filters.category)?.name ?? posts.items[0]?.category.label ?? filters.category;
  const StoriesHeading = filters.search ? H1 : H2;
  const topicDescriptions: Record<string, string> = {
    business: "Get paid with less back-and-forth",
    technology: "Make sense of messy data",
    design: "Make your files work harder",
  };

  return <BlogPageContainer className={`flex flex-col gap-7 py-8 lg:gap-8 ${filters.search ? "lg:py-12" : "lg:pt-10 lg:pb-12"}`}>
    {!filters.search && <header className="order-0 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center lg:gap-14">
      <div className="space-y-2"><Overline className="font-sans text-xs font-normal leading-normal tracking-normal text-accent-text">The SmartTools blog</Overline><H1 className="font-sans text-[38px] font-semibold leading-[1.12] tracking-tight sm:text-[44px]">Less busywork. More know-how.</H1></div>
      <div className="space-y-2"><P className="text-[19px] leading-normal lg:text-[17px]">Practical guides for the work between the work.</P><P className="text-sm text-muted-foreground"><span className="lg:hidden">Documents, data, and everyday shortcuts.</span><span className="hidden lg:inline">Ideas, insights, and practical guides.</span></P></div>
    </header>}

    <section aria-label="Find articles" className="order-2 flex min-w-0 flex-col gap-3 lg:order-1 lg:flex-row lg:items-end lg:gap-8">
      <nav aria-label="Blog categories" className="flex min-w-0 flex-1 flex-wrap items-center gap-1 border-b border-border">
        <Button asChild variant="ghost" className={`rounded-none px-2 ${!filters.category ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}><a aria-current={!filters.category ? "page" : undefined} href={blogListingHref(filters, { category: undefined, cursor: undefined })}>All stories</a></Button>
        {categories.items.slice(0, 3).map(category => <Button asChild key={category.id} variant="ghost" className={`max-w-full rounded-none px-2 ${category.slug === filters.category ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}><a className="truncate" aria-current={category.slug === filters.category ? "page" : undefined} href={blogListingHref(filters, { category: category.slug, cursor: undefined })}>{category.name}</a></Button>)}
        {(categories.items.length > 3 || categories.nextCursor || categoryCursor) && <details className="relative w-full lg:w-auto">
          <summary className="cursor-pointer rounded-md p-3 text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">More topics</summary>
          <Card className="z-10 mt-2 max-h-80 w-full gap-2 overflow-auto p-4 lg:absolute lg:right-0 lg:top-full lg:w-64">
            {categories.items.slice(3).map(category => <TextLink key={category.id} href={blogListingHref(filters, { category: category.slug, cursor: undefined })}>{category.name}</TextLink>)}
            {categoryCursor && <TextLink href={blogListingHref(filters, { categoryCursor: undefined })}>First topics</TextLink>}
            {categories.nextCursor && <TextLink href={blogListingHref(filters, { categoryCursor: categories.nextCursor })}>More topics →</TextLink>}
          </Card>
        </details>}
      </nav>
      <form action="/blog" method="get" role="search" className={`shrink-0 ${filters.search ? "lg:w-[300px]" : "lg:w-80"}`}>
        {filters.category && <input type="hidden" name="category" value={filters.category} />}
        {filters.tag && <input type="hidden" name="tag" value={filters.tag} />}
        <Label htmlFor="blog-search" className={`mb-2 block text-xs font-normal ${filters.search ? "" : "lg:sr-only"}`}>Search the blog</Label>
        <div className="relative"><Input className="pr-12" id="blog-search" name="search" type="search" defaultValue={filters.search} maxLength={200} placeholder="Search articles…" />
          <Button className="absolute right-1 top-1 h-9 w-9" type="submit" size="icon" variant="ghost" aria-label="Search articles"><Search aria-hidden="true" /></Button>
        </div>
      </form>
    </section>

    {featured && <Card className={`order-1 gap-6 rounded-xl border-0 bg-muted p-5 shadow-none lg:order-2 lg:gap-10 lg:rounded-lg lg:p-6 ${featured.coverImage ? "lg:grid lg:grid-cols-[minmax(0,560fr)_minmax(0,632fr)] lg:items-center" : ""}`}>
      {featured.coverImage && <img className="aspect-[62/41] w-full rounded-lg object-cover lg:aspect-auto lg:h-65" src={blogImageUrl(featured.coverImage, { cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() })} alt={featured.coverImage.alt} width={featured.coverImage.width} height={featured.coverImage.height} fetchPriority="high" />}
      <div className="min-w-0 space-y-5 lg:space-y-4"><Overline className="font-sans text-xs font-normal leading-normal tracking-normal text-accent-text">Latest story / {featured.category.label}</Overline>
        <H2 className="break-words font-sans text-[30px] leading-[1.12] lg:text-[34px]"><TextLink className="text-foreground no-underline hover:underline" href={`/blog/${featured.slug}`}>{featured.title}</TextLink></H2>
        <P className="break-words text-[17px] leading-normal text-muted-foreground lg:text-base">{featured.excerpt}</P><BlogByline post={featured} />
        <Button asChild><a href={`/blog/${featured.slug}`}>Read the guide <ArrowRight aria-hidden="true" /></a></Button>
      </div>
    </Card>}

    <BlogStories key={blogListingHref(postFilters)} initialPage={posts} filters={postFilters} featuredId={featured?.id}
      searchCoverUrl={filters.search && posts.items[0]?.coverImage ? blogImageUrl(posts.items[0].coverImage, { cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() }) : undefined}
      intro={<>
<div className={`flex flex-col gap-2 ${filters.search ? "mb-8" : "mb-7 lg:mb-0 lg:flex-row lg:items-center lg:justify-between lg:border-b lg:border-border lg:pb-4"}`}>
          <StoriesHeading id="blog-stories-heading" className={`break-words font-sans text-[28px] leading-normal ${filters.search ? "" : "font-normal lg:text-[26px] lg:font-semibold"}`}>{filters.search ? `Results for “${filters.search}”` : filtered ? "Filtered articles" : <><span className="lg:hidden">The latest</span><span className="hidden lg:inline">Latest articles</span></>}</StoriesHeading>
          {!filters.search && <Caption className="font-sans text-sm text-muted-foreground lg:text-[13px]"><span className="lg:hidden">Good answers. No extra noise.</span><span className="hidden lg:inline">Newest first</span></Caption>}
        </div>
        {filtered && <div className="my-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {filters.category && <span>Topic: {activeCategory}</span>}{filters.tag && <span>Tag: {filters.tag}</span>}
          {filters.search && <TextLink href={blogListingHref(filters, { search: undefined, cursor: undefined })}>Clear search</TextLink>}
          <TextLink href="/blog">Reset filters</TextLink>
        </div>}
      </>}
      emptyState={<EmptyState className="my-6" icon={<BookOpen />} title={filters.search || filters.cursor ? "No stories found" : "Stories are on the way"}
          description={filters.search ? `No matches for “${filters.search}”. Try another keyword or browse all stories.` : filtered ? "There are no published stories in this category yet. Explore the rest of the blog." : filters.cursor ? "You’ve reached the end. Return to the newest stories." : "We’re preparing practical guides for your everyday work. Check back soon."}
          action={<Button asChild><a href={filters.search ? blogListingHref(filters, { search: undefined, cursor: undefined }) : filtered || filters.cursor ? "/blog" : "/"}>{filters.search ? "Clear search" : filtered || filters.cursor ? "Browse all stories" : "Explore tools"}</a></Button>} />}
      topics={!filters.search && categories.items.length > 0 ? <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1"><Card className="gap-1 rounded-lg border-0 bg-transparent p-0 shadow-none lg:bg-muted lg:p-6"><H2 className="font-sans text-2xl font-normal leading-normal lg:text-xl lg:font-semibold"><span className="lg:hidden">Start with what you need to do</span><span className="hidden lg:inline">Explore topics</span></H2>
        {categories.items.map(category => <div key={category.id} className="flex flex-col gap-1 border-b border-border py-[18px] lg:py-4">
          {topicDescriptions[category.slug] && <P className="text-lg leading-normal lg:order-2 lg:text-sm lg:text-muted-foreground">{topicDescriptions[category.slug]}</P>}
          <TextLink className="break-words py-1 text-base font-semibold no-underline hover:underline" href={blogListingHref({}, { category: category.slug })}>{category.name} →</TextLink>
        </div>)}
        {categoryCursor && <TextLink href={blogListingHref(filters, { categoryCursor: undefined })}>First topics</TextLink>}
        {categories.nextCursor && <TextLink href={blogListingHref(filters, { categoryCursor: categories.nextCursor })}>More topics →</TextLink>}
        <TextLink className="text-sm" href="/blog/feed.xml">Subscribe via RSS</TextLink>
      </Card></aside> : null}
    />
  </BlogPageContainer>;
}
