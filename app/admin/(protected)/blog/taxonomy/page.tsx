import { appHref, getSubdomainOrigin, internalSubdomainPath } from "@/lib/routing/subdomains.ts";
import { z } from "zod";
import { notFound } from "next/navigation";
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
    <BlogTaxonomy
      key={kind}
      kind={kind}
      terms={terms.items}
      backHref={editorHref ?? appHref("/admin/blog")}
      taxonomyHrefs={{ category: taxonomyHref("category"), tag: taxonomyHref("tag") }}
      returnTo={editorHref}
      pagination={{ page: terms.page, pageCount: terms.pageCount, total: terms.total, href: taxonomyHref(kind) }}
    />
  );
}
