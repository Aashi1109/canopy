import type { Metadata } from "next";
import Link from "next/link";
import { Monitor, Smartphone } from "lucide-react";
import { notFound } from "next/navigation";
import {
  BackButton,
  Button,
  ButtonGroup,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/index.tsx";
import { requirePagePermission } from "@/lib/admin/access";
import { getBlogPost, getBlogRevision } from "@/lib/blog/queries";
import { BlogArticle } from "@/components/blog/BlogArticle";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BlogPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revision?: string | string[]; viewport?: string | string[] }>;
}) {
  const session = await requirePagePermission("blog", "view");
  const { id } = await params;
  const { revision, viewport } = await searchParams;
  if (viewport !== undefined && viewport !== "desktop" && viewport !== "mobile") notFound();
  if (
    !/^[a-zA-Z0-9_-]{1,100}$/.test(id) ||
    (revision !== undefined && (typeof revision !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(revision)))
  )
    notFound();
  const source = revision
    ? await getBlogRevision(session.user.id, id, revision)
    : await getBlogPost(session.user.id, id);
  if (!source) notFound();
  const document = "document" in source ? source.document : source.draftDocument;
  const previewHref = (width: "desktop" | "mobile") => {
    const query = new URLSearchParams({ viewport: width });
    if (typeof revision === "string") query.set("revision", revision);
    return `/admin/blog/${id}/preview?${query}`;
  };
  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-3 bg-muted p-5 md:flex-nowrap md:bg-background md:px-7 md:py-4">
        <BackButton href={`/admin/blog/${id}`} label="Back to editor" />
        <p className="order-first min-w-0 basis-full break-words text-sm font-semibold md:order-none md:flex-1 md:basis-auto md:text-base">
          {document.title}
        </p>
        <TooltipProvider>
          <ButtonGroup aria-label="Preview width" className="hidden md:flex">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild size="icon-sm" variant={viewport !== "mobile" ? "default" : "outline"}>
                  <Link
                    aria-label="Desktop preview"
                    aria-current={viewport !== "mobile" ? "page" : undefined}
                    href={previewHref("desktop")}
                    scroll={false}
                  >
                    <Monitor aria-hidden="true" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Desktop preview</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild size="icon-sm" variant={viewport === "mobile" ? "default" : "outline"}>
                  <Link
                    aria-label="Mobile preview"
                    aria-current={viewport === "mobile" ? "page" : undefined}
                    href={previewHref("mobile")}
                    scroll={false}
                  >
                    <Smartphone aria-hidden="true" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mobile preview</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </TooltipProvider>
        <Button asChild size="sm" variant="outline">
          <Link href={`/admin/blog/${id}?review=1`}>Review &amp; publish</Link>
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={viewport === "mobile" ? "mx-auto w-full max-w-[390px]" : "mx-auto w-full max-w-[1440px]"}>
          <BlogArticle document={document} />
        </div>
      </div>
    </div>
  );
}
