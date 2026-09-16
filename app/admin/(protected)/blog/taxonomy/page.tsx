import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@smarttools/ui";
import { requirePagePermission } from "@/lib/admin/access";
import { listBlogTaxonomy } from "@/lib/blog/queries";
import { BlogTaxonomy } from "../components/BlogTaxonomy";

export default async function BlogTaxonomyPage({ searchParams }: { searchParams: Promise<{ kind?: string; cursor?: string; returnTo?: string }> }) {
  const session = await requirePagePermission("blog", "edit");
  const { kind = "category", cursor, returnTo } = await searchParams;
  if (kind !== "category" && kind !== "tag") notFound();
  const editorHref = typeof returnTo === "string" && /^\/admin\/blog\/[a-zA-Z0-9_-]{1,100}$/.test(returnTo) ? returnTo : undefined;
  function taxonomyHref(nextKind: string, nextCursor?: string) {
    return `/admin/blog/taxonomy?${new URLSearchParams({ kind: nextKind, ...(editorHref ? { returnTo: editorHref } : {}), ...(nextCursor ? { cursor: nextCursor } : {}) })}`;
  }
  const terms = await listBlogTaxonomy(session.user.id, kind, { cursor });
  return <div className="mx-auto max-w-5xl space-y-6">
    <Button asChild variant="ghost"><Link href={editorHref ?? "/admin/blog"}><ArrowLeft aria-hidden="true" />{editorHref ? "Back to editor" : "Posts"}</Link></Button>
    <div><h1 className="text-3xl font-semibold">Categories & tags</h1><p className="mt-2 text-muted-foreground">Blog topics are independent of SmartTools workspaces.</p></div>
    <nav aria-label="Taxonomy type" className="flex gap-2"><Button asChild variant={kind === "category" ? "secondary" : "ghost"}><Link href={taxonomyHref("category")} aria-current={kind === "category" ? "page" : undefined}>Categories</Link></Button><Button asChild variant={kind === "tag" ? "secondary" : "ghost"}><Link href={taxonomyHref("tag")} aria-current={kind === "tag" ? "page" : undefined}>Tags</Link></Button></nav>
    <BlogTaxonomy key={kind} kind={kind} terms={terms.items} returnTo={editorHref} />
    <nav aria-label="Taxonomy pages" className="flex justify-end gap-3">{cursor && <Button asChild size="sm" variant="outline"><Link href={taxonomyHref(kind)}>First page</Link></Button>}{terms.nextCursor && <Button asChild size="sm" variant="outline"><Link href={taxonomyHref(kind, terms.nextCursor)}>Next</Link></Button>}</nav>
  </div>;
}
