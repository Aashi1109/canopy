import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@smarttools/ui";
import { requirePagePermission } from "@/lib/admin/access";
import { getBlogPost, getBlogRevision } from "@/lib/blog/queries";
import { BlogArticle } from "@/components/blog/BlogArticle";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BlogPreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ revision?: string | string[]; viewport?: string | string[] }> }) {
  const session = await requirePagePermission("blog", "view");
  const { id } = await params;
  const { revision, viewport } = await searchParams;
  if (viewport !== undefined && viewport !== "desktop" && viewport !== "mobile") notFound();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || (revision !== undefined && (typeof revision !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(revision)))) notFound();
  const source = revision ? await getBlogRevision(session.user.id, id, revision) : await getBlogPost(session.user.id, id);
  if (!source) notFound();
  const document = "document" in source ? source.document : source.draftDocument;
  const previewHref = (width: "desktop" | "mobile") => {
    const query = new URLSearchParams({ viewport: width });
    if (typeof revision === "string") query.set("revision", revision);
    return `/admin/blog/${id}/preview?${query}`;
  };
  return <div className="flex h-full flex-col bg-background">
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-muted p-5 md:flex-nowrap md:bg-background md:px-7 md:py-4">
      <Button asChild size="sm" variant="ghost"><Link href={`/admin/blog/${id}`}><ArrowLeft aria-hidden="true" /><span className="md:hidden">Edit</span><span className="hidden md:inline">Back to editor</span></Link></Button>
      <p className="order-first min-w-0 basis-full break-words text-sm font-semibold md:order-none md:flex-1 md:basis-auto md:text-base">{document.title}</p>
      <div aria-label="Preview width" className="hidden gap-3 md:flex">
        <Button asChild size="sm" variant={viewport !== "mobile" ? "default" : "outline"}><Link aria-current={viewport !== "mobile" ? "page" : undefined} href={previewHref("desktop")} scroll={false}>Desktop</Link></Button>
        <Button asChild size="sm" variant={viewport === "mobile" ? "default" : "outline"}><Link aria-current={viewport === "mobile" ? "page" : undefined} href={previewHref("mobile")} scroll={false}>Mobile</Link></Button>
      </div>
      <Button asChild size="sm" variant="outline"><Link href={`/admin/blog/${id}?review=1`}>Review &amp; publish</Link></Button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={viewport === "mobile" ? "mx-auto w-full max-w-[390px]" : "mx-auto w-full max-w-[1440px]"}><BlogArticle document={document} /></div>
      <footer className="border-t border-border bg-muted px-5 py-3 text-xs text-muted-foreground md:px-7">Private preview · {revision ? "Historical revision" : "Saved draft"} · Links inactive</footer>
    </div>
  </div>;
}
