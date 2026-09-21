/**
 * Per-tool SEO metadata, generalised from the one hand-written
 * `generateMetadata` the repo had.
 *
 * `metadataBase` stays where it is (the app layouts), so the relative URLs
 * below resolve to absolute ones, and the layout `title.template` still
 * decorates `title` — which is why `title` here is the bare tool title and the
 * Open Graph title, which templates do not touch, carries the suffix itself.
 */

import type { Metadata, ResolvingMetadata } from "next";

import { resolveToolPage, type CatalogTool } from "./catalog";
import type { ToolApp } from "./categories";
import { toolFaviconHref } from "./icons";

function toolMetadataFor(tool: CatalogTool, parent: Awaited<ResolvingMetadata>): Metadata {
  return {
    title: tool.seoTitle,
    description: tool.seoDescription,
    keywords: [...tool.keywords],
    alternates: { canonical: tool.href },
    icons: { icon: toolFaviconHref(tool.icon) },
    openGraph: {
      title: `${tool.seoTitle} | SmartTools`,
      description: tool.seoDescription,
      type: "website",
      url: tool.href,
      images: parent.openGraph?.images,
    },
  };
}

export type ToolMetadataArgs = { params: Promise<{ slug: string }> };

/** Builds the `generateMetadata` export for an app's `[slug]` route. */
export function toolMetadata(app: ToolApp): (args: ToolMetadataArgs, parent: ResolvingMetadata) => Promise<Metadata> {
  return async function generateMetadata({ params }: ToolMetadataArgs, parent: ResolvingMetadata): Promise<Metadata> {
    const { slug } = await params;
    const tool = await resolveToolPage(app, slug);
    if (!tool) return { title: "Tool not found", robots: { index: false } };
    return toolMetadataFor(tool, await parent);
  };
}
