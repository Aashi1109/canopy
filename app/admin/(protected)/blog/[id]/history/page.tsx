import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { hasPermission } from "@smarttools/authorization";
import { getUserAuthorization } from "@smarttools/control-plane";
import { AlertBanner, Button } from "@smarttools/ui";
import { requirePagePermission } from "@/lib/admin/access";
import { getBlogPost, getBlogRevision, listBlogRevisions } from "@/lib/blog/queries";
import { BlogRevisionList } from "../../components/BlogRevisionList";
import { blogImageUrl, renderBlogDocument } from "@/lib/blog/document";
import styles from "../../components/blog-management.module.css";

export default async function BlogHistoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cursor?: string; revision?: string }> }) {
  const session = await requirePagePermission("blog", "view");
  const { id } = await params;
  const { cursor, revision } = await searchParams;
  if (revision && !/^[a-zA-Z0-9_-]{1,100}$/.test(revision)) notFound();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) notFound();
  const [post, revisions, authorization] = await Promise.all([getBlogPost(session.user.id, id), listBlogRevisions(session.user.id, id, cursor), getUserAuthorization(session.user.id)]);
  if (!post) notFound();
  const compared = revision ? await getBlogRevision(session.user.id, id, revision) : null;
  if (revision && !compared) notFound();
  const previewHtml = (document: typeof post.draftDocument) => renderBlogDocument(document, { cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() }).html.replace(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, '<span>$2 <span class="text-sm text-muted-foreground">($1)</span></span>');
  return <div className="h-full min-w-0 space-y-6 overflow-y-auto p-5 md:p-10">
    <header className="flex flex-wrap items-center gap-4"><Button asChild variant="ghost"><Link href={`/admin/blog/${id}`}><ArrowLeft aria-hidden="true" />Back to editor</Link></Button><h1 className="text-[30px] font-semibold leading-normal">{compared ? "Compare revisions" : "Revision history"}</h1></header>
    <p className="break-words text-lg font-medium">{post.draftDocument.title || "Untitled post"}</p>
    {compared && <>
      <AlertBanner variant="info" title="Compare before restoring">Both saved versions are preserved. Unsaved editor changes are not shown here. Restoring replaces the whole draft, including its settings and cover; it never publishes a revision.</AlertBanner>
      <div className={styles.comparison}>
        {[{ label: `Revision ${compared.revisionNumber}`, document: compared.document }, { label: "Current saved draft", document: post.draftDocument }].map(({ label, document }) => <section key={label} className={styles.comparisonPanel}>
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground">{label}</h2><h3>{document.title || "Untitled post"}</h3><p className="mb-5 text-sm text-muted-foreground">{document.excerpt}</p>
          <dl className="mb-6 grid gap-3 border-y border-border py-4 text-sm">
            {[["Byline", document.authorName || "Not set"], ["Category", document.category ? `${document.category.label} (${document.category.id})` : "None"], ["Tags", document.tags.map(tag => `${tag.label} (${tag.id})`).join(", ") || "None"], ["SEO title", document.seoTitle ?? "Uses article title"], ["SEO description", document.seoDescription ?? "Uses article excerpt"], ["Related tool IDs", document.relatedToolIds.join(", ") || "None"]].map(([name, value]) => <div key={name}><dt className="font-medium">{name}</dt><dd className="break-words text-muted-foreground">{value}</dd></div>)}
          </dl>
          {document.coverImage ? <figure className="mb-6 space-y-2"><img className="h-auto max-w-full rounded-md" src={blogImageUrl(document.coverImage, { cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() })} alt={document.coverImage.alt} width={document.coverImage.width} height={document.coverImage.height} /><figcaption className="break-words text-xs text-muted-foreground">Cover: {document.coverImage.publicId} · Version {document.coverImage.version} · {document.coverImage.width} × {document.coverImage.height} · {document.coverImage.format}<br />Alt text: {document.coverImage.alt || "Not set"}<br />Caption: {document.coverImage.caption || "None"}</figcaption></figure> : <p className="mb-6 text-sm text-muted-foreground">No cover image</p>}
          <h4 className="mb-4 font-semibold">Article body</h4><article className="space-y-4 [&_p]:my-3 [&_h2]:text-xl [&_ul]:list-disc [&_ul]:pl-5 [&_pre]:overflow-x-auto" dangerouslySetInnerHTML={{ __html: previewHtml(document) }} />
        </section>)}
      </div>
      <Button asChild variant="outline"><Link href={`/admin/blog/${id}/history`}>Close comparison</Link></Button>
    </>}
    <div><h2 className="mb-2 text-xl font-semibold">Saved revisions</h2><p className="mb-6 text-sm text-muted-foreground">Preview or compare a version before restoring it. The public article stays unchanged.</p>
      <div className="rounded-lg border border-border"><BlogRevisionList comparedRevisionId={compared?.id} revisions={compared && !revisions.items.some(item => item.id === compared.id) ? [{ ...compared, title: compared.document.title }, ...revisions.items] : revisions.items} postId={id} version={post.version} publishedRevisionId={post.publishedRevisionId} canRestore={!post.trashedAt && hasPermission(authorization.access, "blog", "edit")} /></div>
      <nav aria-label="Revision pages" className="mt-5 flex justify-end gap-3">{cursor && <Button asChild variant="outline" size="sm"><Link href={`/admin/blog/${id}/history`}>Latest revisions</Link></Button>}{revisions.nextCursor && <Button asChild variant="outline" size="sm"><Link href={`/admin/blog/${id}/history?${new URLSearchParams({ cursor: revisions.nextCursor })}`}>Older revisions</Link></Button>}</nav>
    </div>
  </div>;
}
