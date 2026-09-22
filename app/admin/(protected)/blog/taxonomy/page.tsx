import { appHref, getSubdomainOrigin, internalSubdomainPath } from "@/lib/routing/subdomains.ts";
import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { BackButton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/index.tsx";
import { requirePagePermission } from "@/lib/admin/access";
import { listBlogTaxonomy } from "@/lib/blog/queries";
import { BlogTaxonomy } from "../components/BlogTaxonomy";

export default async function BlogTaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; cursor?: string; page?: string; returnTo?: string }>;
}) {
  const session = await requirePagePermission("blog", "edit");
  const { kind = "category", page, returnTo } = await searchParams;
  const pageNumber = z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).catch(1).parse(page);
  if (kind !== "category" && kind !== "tag") notFound();
  const adminOrigin = getSubdomainOrigin("admin");
  const returnPath =
    typeof returnTo === "string" && adminOrigin && returnTo.startsWith(`${adminOrigin}/`)
      ? returnTo.slice(adminOrigin.length)
      : returnTo;
  const editorHref =
    typeof returnPath === "string" && /^\/(?:admin\/)?blog\/[a-zA-Z0-9_-]{1,100}$/.test(returnPath)
      ? appHref(internalSubdomainPath("admin", returnPath))
      : undefined;
  function taxonomyHref(nextKind: string, nextPage = 1) {
    return appHref(
      `/admin/blog/taxonomy?${new URLSearchParams({ kind: nextKind, ...(editorHref ? { returnTo: editorHref } : {}), ...(nextPage > 1 ? { page: String(nextPage) } : {}) })}`,
    );
  }
  const terms = await listBlogTaxonomy(session.user.id, kind, { page: pageNumber });
  return (
    <Tabs value={kind} className="h-full min-h-0 min-w-0 gap-5">
      <div className="flex shrink-0 items-start gap-2">
        <BackButton
          href={editorHref ?? appHref("/admin/blog")}
          label={editorHref ? "Back to editor" : "Back to posts"}
          className="items-start pt-2"
        />
        <AdminPageHeader
          className="mb-0 min-w-0"
          title="Categories & tags"
          description="Manage the topics and labels used across your posts."
        />
      </div>
      <TabsList aria-label="Taxonomy type" className="w-full shrink-0">
        <TabsTrigger asChild value="category" className="flex-none">
          <Link href={taxonomyHref("category")}>Categories</Link>
        </TabsTrigger>
        <TabsTrigger asChild value="tag" className="flex-none">
          <Link href={taxonomyHref("tag")}>Tags</Link>
        </TabsTrigger>
      </TabsList>
      <TabsContent value={kind} className="flex min-h-0 flex-col">
        <BlogTaxonomy
          key={kind}
          kind={kind}
          terms={terms.items}
          returnTo={editorHref}
          pagination={{ page: terms.page, pageCount: terms.pageCount, total: terms.total, href: taxonomyHref(kind) }}
        />
      </TabsContent>
    </Tabs>
  );
}
